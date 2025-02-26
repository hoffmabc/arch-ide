use anyhow::anyhow;
use axum::{extract::Path, response::IntoResponse};
use tokio::io;
use serde::Deserialize;
use axum::http::{header, HeaderValue, StatusCode};

use crate::{error::Result, program::{self, BinaryData}};

#[derive(Deserialize)]
pub struct DeployParams {
    uuid: String,
    program_name: String,
}

pub async fn deploy(Path((uuid, program_name)): Path<(String, String)>) -> Result<impl IntoResponse> {
    tracing::info!("Attempting to deploy program with UUID: {} and name: {}", uuid, program_name);
    let binary = program::get_binary(&uuid, &program_name)
        .await
        .map_err(|e| match e.kind() {
            io::ErrorKind::NotFound => anyhow!("Program is not built"),
            _ => e.into(),
        })
        .map_err(|e: anyhow::Error| crate::error::Error::from(e))?;

    // Log the actual size of the binary
    tracing::info!("Program binary retrieved successfully, size: {} bytes", binary.len());

    // Check if the binary starts with ELF magic bytes (should be 0x7F, 'E', 'L', 'F')
    if binary.len() >= 4 {
        tracing::info!("Binary starts with: {:?}", &binary[0..4]);
    } else {
        tracing::info!("Binary is too small: {} bytes", binary.len());
    }

    // Use our wrapper type instead of the raw response construction
    Ok(BinaryData(binary))
}