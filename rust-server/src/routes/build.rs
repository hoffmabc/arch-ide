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

    let (build_result, uuid) = task::spawn_blocking(move || {
        (program::build(&uuid, &payload.program_name, &payload.files), uuid)
    })
    .await
    .expect("`spawn_blocking` failure");

    let (stderr, program_name) = build_result?;

    Ok(Json(BuildResponse {
        stderr,
        uuid: if respond_with_uuid { Some(uuid) } else { None },
        program_name,
    }))
}