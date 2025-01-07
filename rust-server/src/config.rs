use std::env;

#[derive(Debug)]
pub struct Config {
    pub port: u16,
    pub client_url: String,
    pub verbose: bool,
    pub payload_limit: usize,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("PORT must be a number"),
            client_url: env::var("CLIENT_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            verbose: env::var("VERBOSE").is_ok(),
            payload_limit: env::var("PAYLOAD_LIMIT")
                .unwrap_or_else(|_| "10".to_string())
                .parse()
                .expect("PAYLOAD_LIMIT must be a number"),
        }
    }
}