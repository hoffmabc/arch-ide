use anyhow::anyhow;
use axum::{extract::{Json, Path, State}, response::IntoResponse, http::StatusCode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{build_tracker::BuildTracker, error::Result, program::{self, Files}};

#[derive(Deserialize)]
pub struct BuildRequest {
    program_name: String,
    files: Files,
    uuid: Option<String>,
}

#[derive(Serialize)]
struct BuildResponse {
    uuid: String,
    program_name: String,
    status: String,
}

#[derive(Serialize)]
struct BuildStatusResponse {
    uuid: String,
    program_name: String,
    status: String,
    stderr: Option<String>,
    started_at: String,
    completed_at: Option<String>,
}

pub async fn build(
    State(tracker): State<BuildTracker>,
    Json(payload): Json<BuildRequest>,
) -> Result<impl IntoResponse> {
    let uuid = match payload.uuid {
        Some(uuid) => {
            Uuid::try_parse(&uuid)
                .map(|_| uuid)
                .map_err(|_| anyhow!("Invalid UUID"))?
        },
        None => Uuid::new_v4().to_string(),
    };

    let files = payload.files;
    let program_name = payload.program_name.clone();
    let uuid_clone = uuid.clone();
    let tracker_clone = tracker.clone();

    // Start tracking the build
    tracker.start_build(uuid.clone(), program_name.clone()).await;

    // Spawn the build task in the background
    tokio::spawn(async move {
        let result = program::build(&uuid_clone, &program_name, &files).await;

        match result {
            Ok((stderr, final_program_name)) => {
                // Check if build actually succeeded by looking for compilation success indicators
                let build_succeeded = stderr.contains("Finished") &&
                                     (stderr.contains("release") || stderr.contains("`release`")) &&
                                     !stderr.contains("error: could not compile");
                tracker_clone.complete_build(&uuid_clone, stderr, final_program_name, build_succeeded).await;
            },
            Err(e) => {
                let error_msg = format!("Build failed: {}", e);
                tracker_clone.complete_build(&uuid_clone, error_msg, program_name, false).await;
            }
        }
    });

    Ok(Json(BuildResponse {
        uuid,
        program_name: payload.program_name,
        status: "building".to_string(),
    }))
}

pub async fn build_status(
    State(tracker): State<BuildTracker>,
    Path(uuid): Path<String>,
) -> Result<impl IntoResponse> {
    match tracker.get_build(&uuid).await {
        Some(info) => Ok((
            StatusCode::OK,
            Json(BuildStatusResponse {
                uuid: info.uuid,
                program_name: info.program_name,
                status: format!("{:?}", info.status).to_lowercase(),
                stderr: info.stderr,
                started_at: info.started_at.to_rfc3339(),
                completed_at: info.completed_at.map(|dt| dt.to_rfc3339()),
            }),
        )),
        None => Ok((
            StatusCode::NOT_FOUND,
            Json(BuildStatusResponse {
                uuid: uuid.clone(),
                program_name: "unknown".to_string(),
                status: "not_found".to_string(),
                stderr: Some("Build not found".to_string()),
                started_at: chrono::Utc::now().to_rfc3339(),
                completed_at: None,
            }),
        )),
    }
}