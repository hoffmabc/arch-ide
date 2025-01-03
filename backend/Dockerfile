FROM ubuntu:22.04 AS rust

ARG DEBIAN_FRONTEND="noninteractive"
ENV HOME="/root"

# Install build dependencies
RUN apt-get update -qq && apt-get upgrade -qq && apt-get install -qq \
    build-essential \
    curl \
    pkg-config \
    libssl-dev \
    libudev-dev \
    gcc-multilib \
    libc6-dev-i386

# Install Rust with specific version
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.72.0
ENV PATH="${HOME}/.cargo/bin:${PATH}"

# Install Solana with newer version that includes newer Rust
ARG SOLANA_VERSION="1.18.0"
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"
ENV PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

# Set up working directory
WORKDIR /app

# Copy program files and crates
COPY programs programs
COPY crates crates

# Build the default program
RUN cargo-build-sbf --manifest-path programs/Cargo.toml

# Copy server files
COPY . .

# Build server
RUN cargo build --release

# Expose port
EXPOSE 8080

# Start server
CMD ["./target/release/backend"]
