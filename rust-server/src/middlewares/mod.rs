use axum::{response::IntoResponse, middleware::Next};
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
};

pub fn compression() -> CompressionLayer {
    CompressionLayer::new()
}

pub fn cors(client_url: String) -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
}

pub fn payload_limit(limit: usize) -> RequestBodyLimitLayer {
    RequestBodyLimitLayer::new(limit * 1024 * 1024) // Convert MB to bytes
}

pub async fn log(req: axum::http::Request<axum::body::Body>, next: Next) -> impl IntoResponse {
    use tracing::info;
    info!("{} {}", req.method(), req.uri());
    next.run(req).await
}