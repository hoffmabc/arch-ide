use std::{fs, path::Path, process::Command, sync::OnceLock, env};
use anyhow::anyhow;
use regex::Regex;
use tokio::sync::OnceCell;
use cloud_storage::Client;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use tracing::info;
use tokio::process::Command as TokioCommand;
use tokio::io::{BufReader, AsyncBufReadExt};
use std::process::Stdio;

const PROGRAMS_DIR: &str = "programs";
const MAX_FILE_AMOUNT: usize = 64;
const MAX_PATH_LENGTH: usize = 128;

fn use_gcs() -> bool {
    std::env::var("USE_GCS").is_ok()
}

static INIT: OnceCell<()> = OnceCell::const_new();
static GCS_CLIENT: OnceLock<Client> = OnceLock::new();

fn get_gcs_bucket() -> String {
    env::var("GCS_BUCKET").unwrap_or_else(|_| "arch-ide-build-artifacts".to_string())
}

const CARGO_TOML_TEMPLATE: &str = r#"[package]
name = "{}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
arch_program = "0.3.2"

# Core serialization/encoding
borsh = "=1.5.1"
base64 = { version = "=0.22.1", default-features = false, features = ["alloc"] }
hex = { version = "=0.4.3", default-features = false }
sha256 = { version = "=1.5.0", default-features = false }

# Error handling
thiserror = "=1.0.50"

# Serialization
serde = { version = "=1.0.198", features = ["derive"], default-features = false }

[profile.release]
overflow-checks = true
incremental = true
codegen-units = 256
opt-level = 1
lto = false
debug = false

[profile.release.build-override]
opt-level = 1
incremental = true
codegen-units = 256
"#;

pub async fn init() -> anyhow::Result<()> {
    INIT.get_or_try_init(|| async {
        let programs_dir = Path::new(PROGRAMS_DIR);
        if !programs_dir.exists() {
            fs::create_dir_all(programs_dir)?;
        }

        let cargo_toml = r#"[package]
name = "archpg"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
path = "default/src/lib.rs"

[profile.release]
overflow-checks = true
incremental = true

[dependencies]
arch_program = "0.3.2"

# Core serialization/encoding
borsh = { version = "1.5.1", features = ["derive"] }

# Utilities
base64 = { version = "0.22.1", default-features = false, features = ["alloc"] }
hex = { version = "0.4.3", default-features = false }
sha256 = { version = "1.5.0", default-features = false }

# Error handling
thiserror = "*"

# Logging
log = "0.4.17"

# Serialization
serde = { version = "1.0.136", features = ["derive"], default-features = false }

# Testing
[dev-dependencies]
proptest = "1.5.0""#;

        let manifest_path = programs_dir.join("Cargo.toml");
        if !manifest_path.exists() {
            fs::write(manifest_path, cargo_toml)?;
        }

        Ok::<(), anyhow::Error>(())
    }).await?;

    Ok(())
}

pub type Files = Vec<[String; 2]>;

pub async fn build(
    uuid: &str,
    program_name: &str,
    files: &Files,
) -> anyhow::Result<(String, String)> {
    println!("Starting build for program: {}", program_name);

    // Check file count
    if files.len() > MAX_FILE_AMOUNT {
        return Err(anyhow!("Exceeded maximum file amount({MAX_FILE_AMOUNT})"));
    }

    // Check file paths
    static ALLOWED_REGEX: OnceLock<Regex> = OnceLock::new();
    let allowed_regex = ALLOWED_REGEX.get_or_init(|| Regex::new(r"^/src/[\w/-]+\.rs$").unwrap());
    let is_valid = files.iter().all(|[path, _]| {
        allowed_regex.is_match(path)
            && path.len() <= MAX_PATH_LENGTH
            && !path.contains("..")
            && !path.contains("//")
    });
    if !is_valid {
        return Err(anyhow!("Invalid path"));
    }

    // Get or create program directory using UUID
    let program_path = Path::new(PROGRAMS_DIR).join(uuid);
    println!("Program directory: {:?}", program_path);

    // Ensure the program directory and its subdirectories exist
    fs::create_dir_all(&program_path)?;
    fs::create_dir_all(program_path.join("src"))?;
    fs::create_dir_all(program_path.join("target/deploy"))?;

    // Write source files
    println!("Writing source files...");
    for [path, content] in files {
        let relative_path = path.trim_start_matches('/');
        let file_path = program_path.join(relative_path);
        println!("Writing file: {:?}", file_path);

        let parent = file_path.parent().expect("Should have parent");
        fs::create_dir_all(parent)?;
        fs::write(&file_path, content)?;
    }

    // Create program-specific Cargo.toml with sanitized name
    println!("Creating Cargo.toml...");
    let safe_program_name = program_name.replace(|c: char| !c.is_alphanumeric(), "_");
    let cargo_toml = CARGO_TOML_TEMPLATE.replace("{}", &safe_program_name);
    let manifest_path = program_path.join("Cargo.toml");

    // Debug output for Cargo.toml creation
    println!("Writing Cargo.toml to: {:?}", manifest_path);
    println!("Cargo.toml contents:\n{}", cargo_toml);

    // Write Cargo.toml and verify it exists
    fs::write(&manifest_path, &cargo_toml)?;
    if !manifest_path.exists() {
        return Err(anyhow!("Failed to create Cargo.toml file"));
    }

    // Set up shared target directory
    println!("Setting up shared target directory...");
    let programs_dir = Path::new(PROGRAMS_DIR);
    let target_dir = programs_dir.join("target");
    fs::create_dir_all(&target_dir)?;
    let shared_target = target_dir.canonicalize()?;
    println!("Using shared target directory: {:?}", shared_target);

    // Clean up any existing Cargo.lock
    let lock_file = program_path.join("Cargo.lock");
    if lock_file.exists() {
        println!("Removing existing Cargo.lock file...");
        fs::remove_file(&lock_file)?;
    } else {
        println!("No existing Cargo.lock file found.");
    }

    // Check Cargo version to determine if we need the lockfile bump flag
    let cargo_version_output = Command::new("cargo")
        .arg("--version")
        .output()?;
    let cargo_version = String::from_utf8_lossy(&cargo_version_output.stdout);
    println!("Detected Cargo version: {}", cargo_version);
    let needs_lockfile_bump = cargo_version.contains("1.75");
    if needs_lockfile_bump {
        println!("Cargo version requires lockfile bump.");
    } else {
        println!("Cargo version does not require lockfile bump.");
    }

    // Create string bindings to ensure paths live long enough
    let manifest_path_str = manifest_path
        .canonicalize()
        .unwrap_or(manifest_path.clone())
        .to_str()
        .expect("Manifest path should be UTF-8")
        .to_string();

    let deploy_dir_str = program_path
        .join("target/deploy")
        .canonicalize()
        .unwrap_or_else(|_| program_path.join("target/deploy"))
        .to_str()
        .expect("Deploy directory path should be UTF-8")
        .to_string();

    let shared_target_str = shared_target
        .to_str()
        .expect("Shared target directory path should be UTF-8")
        .to_string();

    println!("Using absolute paths:");
    println!("Manifest path: {}", manifest_path_str);
    println!("Deploy dir: {}", deploy_dir_str);
    println!("Shared target: {}", shared_target_str);

    // Build the args vector conditionally
    let mut build_args = vec![
        "build-sbf",
        "--manifest-path",
        &manifest_path_str,
        "--sbf-out-dir",
        &deploy_dir_str,
    ];
    // if needs_lockfile_bump {
        println!("Adding lockfile bump flag to build args.");
        build_args.extend(["--", "-Znext-lockfile-bump"]);
    // }

    println!("Executing build command with args: {:?}", build_args);

    let mut child = TokioCommand::new("cargo-build-sbf")
        .args(&build_args)
        .env("CARGO_TARGET_DIR", &shared_target_str)
        .env("CARGO_BUILD_INCREMENTAL", "true")
        .env("CARGO_PROFILE_RELEASE_INCREMENTAL", "true")
        .env("CARGO_PROFILE_RELEASE_CODEGEN_UNITS", "256")
        .env("RUST_LOG", "debug")
        .env("RUST_BACKTRACE", "1")
        .current_dir(&program_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let mut stdout_lines = String::new();
    let mut stderr_lines = String::new();

    // Handle stdout
    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            println!("stdout: {}", line);
            stdout_lines.push_str(&line);
            stdout_lines.push('\n');
        }
    }

    // Handle stderr
    if let Some(stderr) = child.stderr.take() {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            println!("stderr: {}", line);
            stderr_lines.push_str(&line);
            stderr_lines.push('\n');
        }
    }

    // Wait for the command to complete
    let status = child.wait().await?;
    let build_succeeded = stdout_lines.contains("Finished release") || stderr_lines.contains("Finished release");

    if !status.success() && !build_succeeded {
        return Err(anyhow!("Build failed with status: {}", status));
    }

    println!("Build command executed successfully.");

    // Use stdout_lines and stderr_lines instead of the previous output variables
    let stdout = stdout_lines;
    let stderr = stderr_lines;

    // Check if binary was created using safe program name
    let binary_path = program_path
        .join("target/deploy")
        .join(format!("{}.so", safe_program_name));
    println!("Checking for binary at: {:?}", binary_path);

    // After successful build, upload to GCS
    if binary_path.exists() {
        println!("Binary file created successfully");
        if use_gcs() {
            let binary_data = fs::read(&binary_path)?;
            let uuid = uuid.to_string();
            let safe_program_name = safe_program_name.clone();
            let binary_data = binary_data.to_vec();
            tokio::spawn(async move {
                if let Err(e) = upload_to_gcs(&uuid, &safe_program_name, &binary_data).await {
                    eprintln!("Failed to upload binary to GCS: {}", e);
                }
            });
        }
    } else {
        println!("Warning: Binary file not found at expected location");
    }

    Ok((stderr, safe_program_name))
}

async fn upload_to_gcs(uuid: &str, program_name: &str, binary_data: &[u8]) -> anyhow::Result<()> {
    if !use_gcs() {
        return Ok(());
    }

    info!("Starting GCS upload for program {} with UUID {}", program_name, uuid);
    let client = GCS_CLIENT.get_or_init(|| {
        info!("Initializing GCS client");
        Client::default()
    });

    let bucket = get_gcs_bucket();
    let object_name = format!("binaries/{}/{}.so", uuid, program_name);
    info!("Uploading to GCS bucket {} with path {}", bucket, object_name);

    client.object().create(
        &bucket,
        binary_data.to_vec(),
        &object_name,
        "application/octet-stream",
    ).await?;

    info!("Successfully uploaded program binary to GCS");
    Ok(())
}

async fn download_from_gcs(uuid: &str, program_name: &str) -> anyhow::Result<Vec<u8>> {
    let client = GCS_CLIENT.get_or_init(|| {
        Client::default()
    });

    let bucket = get_gcs_bucket();
    let object_name = format!("binaries/{}/{}.so", uuid, program_name);
    let data = client.object().download(&bucket, &object_name).await?;

    Ok(data)
}

pub async fn get_binary(uuid: &str, program_name: &str) -> std::io::Result<Vec<u8>> {
    let safe_program_name = program_name.replace(|c: char| !c.is_alphanumeric(), "_");

    // First try to get from local filesystem
    let program_path = Path::new(PROGRAMS_DIR)
        .join(uuid)
        .join("target/deploy")
        .join(format!("{}.so", safe_program_name));

    if program_path.exists() {
        println!("Reading binary from local path: {:?}", program_path);
        fs::read(program_path).map_err(|e| {
            println!("Failed to read local binary: {}", e);
            e
        })
    } else {
        // If not found locally, try to get from GCS
        println!("Binary not found locally, attempting to fetch from GCS");
        download_from_gcs(uuid, &safe_program_name)
            .await
            .map_err(|e| {
                println!("Failed to download binary from GCS: {}", e);
                std::io::Error::new(std::io::ErrorKind::NotFound, e)
            })
    }
}