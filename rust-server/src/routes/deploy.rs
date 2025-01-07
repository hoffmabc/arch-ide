use anyhow::anyhow;
use axum::{extract::Path, response::IntoResponse};
use tokio::io;
use serde::Deserialize;

use crate::{error::Result, program};

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
    tracing::info!("Program binary retrieved successfully");
    Ok(binary)
}