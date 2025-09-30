mod config;
mod error;
mod log;
mod middlewares;
mod program;
mod routes;

use std::net::{Ipv4Addr, SocketAddr};

use anyhow::Result;
use axum::{
    middleware,
    routing::{get, post},
    Router,
};
use tokio::net::TcpListener;
use tracing::{info, error};
use socket2::{Socket, Domain, Type};

use self::{config::Config, log::init_logging, middlewares::*, routes::*};

#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::from_env();
    init_logging(config.verbose);
    info!("Config loaded: {config:#?}");

    program::init().await.map_err(|e| {
        error!("Failed to initialize program directory: {}", e);
        e
    })?;
    info!("Program directory initialized");

    let app = Router::new()
        .route("/health", get(health))
        .route("/build", post(build))
        .route("/deploy/:uuid/:program_name", get(deploy))
        // Comment out this line
        // .layer(compression())
        .layer(payload_limit(config.payload_limit))
        .layer(cors(config.client_url))
        .layer(middleware::from_fn(log));

    let addr = SocketAddr::from((Ipv4Addr::UNSPECIFIED, config.port));
    info!("Attempting to bind to {addr}");

    // Create socket with SO_REUSEADDR and SO_REUSEPORT to allow quick rebinding
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)?;
    socket.set_reuse_address(true)?;
    #[cfg(unix)]
    socket.set_reuse_port(true)?;
    socket.bind(&addr.into())?;
    socket.listen(128)?;
    socket.set_nonblocking(true)?;

    let listener = TcpListener::from_std(socket.into())?;
    info!("Successfully bound to {addr}");

    info!("Starting server...");
    axum::serve(listener, app).await.map_err(|e| {
        error!("Server error: {}", e);
        e
    })?;

    Ok(())
}
