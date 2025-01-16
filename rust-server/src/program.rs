use std::{fs, path::Path, process::Command, sync::OnceLock};
use anyhow::anyhow;
use regex::Regex;
use tokio::sync::OnceCell;

const PROGRAMS_DIR: &str = "programs";
const MAX_FILE_AMOUNT: usize = 64;
const MAX_PATH_LENGTH: usize = 128;

static INIT: OnceCell<()> = OnceCell::const_new();

const CARGO_TOML_TEMPLATE: &str = r#"[package]
name = "{}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
arch_program = { path = "../../crates/program" }

# Core serialization/encoding
borsh = { version = "1.5.1", features = ["derive"] }

# Utilities
base64 = { version = "0.22.1", default-features = false, features = ["alloc"] }
hex = { version = "0.4.3", default-features = false }
sha256 = { version = "1.5.0", default-features = false }

# Error handling
thiserror = "*"

# Serialization
serde = { version = "1.0.136", features = ["derive"], default-features = false }

[profile.release]
overflow-checks = true
incremental = true
codegen-units = 256
opt-level = 2
lto = false

[profile.release.build-override]
opt-level = 3
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
arch_program = { path = "../crates/program" }

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

pub fn build(
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
    let cargo_toml = CARGO_TOML_TEMPLATE
        .replace("{}", &safe_program_name);
    let manifest_path = program_path.join("Cargo.toml");
    fs::write(&manifest_path, &cargo_toml)?;
    println!("Cargo.toml contents:\n{}", cargo_toml);

    // Set up shared target directory
    println!("Setting up shared target directory...");
    let programs_dir = Path::new(PROGRAMS_DIR);
    let target_dir = programs_dir.join("target");
    fs::create_dir_all(&target_dir)?;
    let shared_target = target_dir.canonicalize()?;
    println!("Using shared target directory: {:?}", shared_target);

    // Build using cargo-build-sbf
    println!("Starting cargo-build-sbf...");
    let manifest_path = program_path.join("Cargo.toml").canonicalize()?;
    println!("Manifest path: {:?}", manifest_path);
    let deploy_dir = program_path.join("target/deploy").canonicalize()?;
    println!("Deploy directory: {:?}", deploy_dir);

    let manifest_path_str = manifest_path.to_str().expect("Manifest path should be UTF-8");
    let deploy_dir_str = deploy_dir.to_str().expect("Deploy directory path should be UTF-8");
    let shared_target_str = shared_target.to_str().expect("Shared target directory path should be UTF-8");

    println!("Using manifest path: {:?}", manifest_path_str);
    println!("Using deploy directory: {:?}", deploy_dir_str);
    println!("Using shared target directory: {:?}", shared_target_str);

    let output = Command::new("cargo-build-sbf")
        .args([
            "build-sbf",
            "--manifest-path",
            manifest_path_str,
            "--sbf-out-dir",
            deploy_dir_str,
        ])
        .env("CARGO_TARGET_DIR", shared_target_str)
        .env("CARGO_BUILD_INCREMENTAL", "true")
        .env("CARGO_PROFILE_RELEASE_INCREMENTAL", "true")
        .env("CARGO_PROFILE_RELEASE_CODEGEN_UNITS", "256")
        .output()?;

    // Process output
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8(output.stderr)?;

    println!("Build stdout:\n{}", stdout);
    println!("Build stderr:\n{}", stderr);

    // Check if binary was created using safe program name
    let binary_path = program_path
        .join("target/deploy")
        .join(format!("{}.so", safe_program_name));
    println!("Checking for binary at: {:?}", binary_path);

    if binary_path.exists() {
        println!("Binary file created successfully");
    } else {
        println!("Warning: Binary file not found at expected location");
    }

    Ok((stderr, safe_program_name))
}

pub async fn get_binary(uuid: &str, program_name: &str) -> std::io::Result<Vec<u8>> {
    let safe_program_name = program_name.replace(|c: char| !c.is_alphanumeric(), "_");
    let program_path = Path::new(PROGRAMS_DIR)
        .join(uuid)
        .join("target/deploy")
        .join(format!("{}.so", safe_program_name));
    println!("Attempting to read binary from path: {:?}", program_path);

    fs::read(program_path)
}