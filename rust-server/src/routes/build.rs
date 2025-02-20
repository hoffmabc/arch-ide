use anyhow::anyhow;
use axum::{extract::Json, response::IntoResponse};
use serde::{Deserialize, Serialize};
use tokio::task;
use uuid::Uuid;

use crate::{error::Result, program::{self, Files}};

#[derive(Deserialize)]
pub struct BuildRequest {
    program_name: String,
    files: Files,
    uuid: Option<String>,
}

#[derive(Serialize)]
struct BuildResponse {
    stderr: String,
    uuid: Option<String>,
    program_name: String,
}

pub async fn build(Json(payload): Json<BuildRequest>) -> Result<impl IntoResponse> {
    let (uuid, respond_with_uuid) = match payload.uuid {
        Some(uuid) => Uuid::try_parse(&uuid)
            .map(|_| (uuid, false))
            .map_err(|_| anyhow!("Invalid UUID"))?,
        None => (Uuid::new_v4().to_string(), true),
    };

    let files = payload.files;
    let program_name = payload.program_name;
    let uuid_clone = uuid.clone();

    let (stderr, program_name) = program::build(uuid_clone.as_str(), program_name.as_str(), &files).await?;

    Ok(Json(BuildResponse {
        stderr,
        uuid: if respond_with_uuid { Some(uuid) } else { None },
        program_name,
    }))
}