FROM ubuntu:22.04 as rust

ARG DEBIAN_FRONTEND="noninteractive"
ENV HOME="/root"

# Install build deps
RUN apt-get update -qq && apt-get upgrade -qq && apt-get install -qq \
    build-essential curl pkg-config libssl-dev libudev-dev gcc-multilib libc6-dev-i386

# Install Rust
RUN sh -c "$(curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs)" -- -y --default-toolchain 1.75.0
ENV PATH="${HOME}/.cargo/bin:${PATH}"

# Build server binary
FROM rust as build

WORKDIR /build
COPY Cargo.* .
COPY src src
RUN cargo build --release

# Start server
FROM rust

ARG SOLANA_VERSION="1.18.26"

# Install Solana
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"
ENV PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

# Set the workdir
WORKDIR /app

# Copy programs dir
COPY programs programs

# Create necessary directories
RUN mkdir -p /app/programs/target/deploy

# Copy server binary
COPY --from=build /build/target/release/arch-server /usr/local/bin/

EXPOSE 8080

CMD ["arch-server"]
