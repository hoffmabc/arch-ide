use tracing::Level;
use tracing_subscriber::{fmt, EnvFilter};

pub fn init_logging(verbose: bool) {
    let env_filter = if verbose {
        EnvFilter::from_default_env().add_directive(Level::DEBUG.into())
    } else {
        EnvFilter::from_default_env()
            .add_directive(Level::INFO.into())
            .add_directive("tower_http=warn".parse().unwrap())
    };

    fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .with_thread_ids(true)
        .with_thread_names(true)
        .with_file(true)
        .with_line_number(true)
        .init();
}