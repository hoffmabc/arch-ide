mod build;
mod deploy;

pub use build::*;
pub use deploy::*;

use axum::response::IntoResponse;

pub async fn health() -> impl IntoResponse {
    "OK"
}