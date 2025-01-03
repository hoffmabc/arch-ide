use actix_web::{web, App, HttpResponse, HttpServer};
use serde::{Deserialize, Serialize};
use std::process::Command;
use tempfile::TempDir;
use std::fs;

#[derive(Deserialize)]
struct CompileRequest {
    program_code: String,
}

#[derive(Serialize)]
struct CompileResponse {
    success: bool,
    message: String,
    binary: Option<String>,
}

async fn compile_program(req: web::Json<CompileRequest>) -> HttpResponse {
    // Create temporary directory
    let temp_dir = match TempDir::new() {
        Ok(dir) => dir,
        Err(e) => return HttpResponse::InternalServerError().json(CompileResponse {
            success: false,
            message: format!("Failed to create temp directory: {}", e),
            binary: None,
        }),
    };

    // Write program code to file
    let program_path = temp_dir.path().join("program.rs");
    if let Err(e) = fs::write(&program_path, &req.program_code) {
        return HttpResponse::InternalServerError().json(CompileResponse {
            success: false,
            message: format!("Failed to write program file: {}", e),
            binary: None,
        });
    }

    // Compile program
    let output = Command::new("cargo-build-sbf")
        .arg("--manifest-path")
        .arg(program_path)
        .output();

    match output {
        Ok(output) => {
            if output.status.success() {
                // Read compiled binary
                let binary_path = temp_dir.path().join("target/deploy/program.so");
                match fs::read(&binary_path) {
                    Ok(binary) => HttpResponse::Ok().json(CompileResponse {
                        success: true,
                        message: "Compilation successful".to_string(),
                        binary: Some(base64::encode(&binary)),
                    }),
                    Err(e) => HttpResponse::InternalServerError().json(CompileResponse {
                        success: false,
                        message: format!("Failed to read compiled binary: {}", e),
                        binary: None,
                    }),
                }
            } else {
                HttpResponse::BadRequest().json(CompileResponse {
                    success: false,
                    message: String::from_utf8_lossy(&output.stderr).to_string(),
                    binary: None,
                })
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(CompileResponse {
            success: false,
            message: format!("Compilation failed: {}", e),
            binary: None,
        }),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/compile", web::post().to(compile_program))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}