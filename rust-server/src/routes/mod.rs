mod build;
mod deploy;
mod rpc_proxy;

pub use build::*;
pub use deploy::*;
pub use rpc_proxy::*;

use axum::response::IntoResponse;

pub async fn health() -> impl IntoResponse {
    "OK"
}