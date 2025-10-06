use axum::{response::IntoResponse, middleware::Next};
use tower_http::{
    compression::CompressionLayer,
    cors::{CorsLayer, Any},
    limit::RequestBodyLimitLayer,
};
use http::{Method, header};

pub fn compression() -> CompressionLayer {
    CompressionLayer::new()
}

pub fn cors(_client_url: String) -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::CACHE_CONTROL,
            header::PRAGMA,
        ])
        .expose_headers([
            header::CONTENT_TYPE,
            header::CACHE_CONTROL,
            header::PRAGMA,
            header::EXPIRES,
        ])
        .max_age(std::time::Duration::from_secs(86400)) // 24 hours cache
}

pub fn payload_limit(limit: usize) -> RequestBodyLimitLayer {
    RequestBodyLimitLayer::new(limit * 1024 * 1024) // Convert MB to bytes
}

pub async fn log(req: axum::http::Request<axum::body::Body>, next: Next) -> impl IntoResponse {
    use tracing::info;
    info!("{} {}", req.method(), req.uri());
    next.run(req).await
}