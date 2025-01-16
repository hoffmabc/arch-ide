use axum::{response::IntoResponse, middleware::Next};
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    limit::RequestBodyLimitLayer,
};
use http::{Method, header};

pub fn compression() -> CompressionLayer {
    CompressionLayer::new()
}

pub fn cors(client_url: String) -> CorsLayer {
    CorsLayer::new()
        .allow_origin([client_url.parse().unwrap()])
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
        ])
}

pub fn payload_limit(limit: usize) -> RequestBodyLimitLayer {
    RequestBodyLimitLayer::new(limit * 1024 * 1024) // Convert MB to bytes
}

pub async fn log(req: axum::http::Request<axum::body::Body>, next: Next) -> impl IntoResponse {
    use tracing::info;
    info!("{} {}", req.method(), req.uri());
    next.run(req).await
}