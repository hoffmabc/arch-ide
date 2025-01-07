use std::{fs, path::Path, process::Command, sync::OnceLock};
use anyhow::anyhow;
use regex::Regex;
use tokio::sync::OnceCell;

const PROGRAMS_DIR: &str = "programs";
const MAX_FILE_AMOUNT: usize = 64;
const MAX_PATH_LENGTH: usize = 128;

static INIT: OnceCell<()> = OnceCell::const_new();

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

    // Create program directory with its own Cargo.toml
    let program_path = Path::new(PROGRAMS_DIR).join(uuid);
    fs::create_dir_all(&program_path)?;
    fs::create_dir_all(program_path.join("src"))?;

    // Create program-specific Cargo.toml with the user's program name
    let cargo_toml = format!(r#"[package]
name = "{}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]
path = "src/lib.rs"

[dependencies]
arch_program = {{ path = "../../crates/program" }}
borsh = {{ version = "1.5.1", features = ["derive"] }}
base64 = {{ version = "0.22.1", default-features = false, features = ["alloc"] }}
hex = {{ version = "0.4.3", default-features = false }}
sha256 = {{ version = "1.5.0", default-features = false }}
thiserror = "*"
log = "0.4.17"
serde = {{ version = "1.0.136", features = ["derive"], default-features = false }}"#,
        program_name);

    fs::write(program_path.join("Cargo.toml"), cargo_toml)?;

    // Write source files
    for [path, content] in files {
        let relative_path = path.trim_start_matches('/');
        let item_path = program_path.join(relative_path);

        let parent_path = item_path.parent().expect("Should have parent");
        fs::create_dir_all(parent_path)?;
        fs::write(item_path, content)?;
    }

    // Build the program
    let output = Command::new("cargo-build-sbf")
        .args([
            "--manifest-path",
            program_path.join("Cargo.toml").to_str().expect("Manifest path should be UTF-8"),
            "--sbf-out-dir",
            program_path.join("target/deploy").to_str()
                .ok_or_else(|| anyhow!("{program_path:?} is not valid UTF-8"))?,
            "--offline",
        ])
        .output()?;

    let stderr = String::from_utf8(output.stderr)?;
    Ok((stderr, program_name.to_string()))
}

pub async fn get_binary(uuid: &str, program_name: &str) -> std::io::Result<Vec<u8>> {
    // Construct the path to the binary file
    let program_path = Path::new(PROGRAMS_DIR)
        .join(uuid)
        .join("target/sbf-solana-solana/release")
        .join(format!("{}.so", program_name));
    println!("Attempting to read binary from path: {:?}", program_path);

    // Attempt to read the file
    fs::read(program_path)
}