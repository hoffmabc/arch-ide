FROM ubuntu:22.04 as development

ARG DEBIAN_FRONTEND="noninteractive"
ENV HOME="/root"
ENV PATH="/root/.cargo/bin:${PATH}"
ENV RUSTUP_HOME="/root/.rustup"
ENV CARGO_HOME="/root/.cargo"

# Install build deps and development tools
RUN apt-get update -qq && apt-get upgrade -qq && \
    apt-get install -qq apt-utils && \
    dpkg --add-architecture i386 && \
    apt-get update -qq && \
    apt-get install -qq \
    build-essential \
    curl \
    pkg-config \
    libssl-dev \
    libudev-dev \
    gcc-multilib \
    libc6-dev-i386 \
    git \
    vim

# Install Rust with specific toolchain and verify installation
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.81.0 && \
    echo 'source "$HOME/.cargo/env"' >> ~/.bashrc && \
    /bin/bash -c "source $HOME/.cargo/env && \
    cargo --version && \
    rustc --version"

# Install Solana
ARG SOLANA_VERSION="1.18.26"
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"
ENV PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

WORKDIR /app

# Verify installations
RUN echo "Verifying installations..." && \
    cargo --version && \
    rustc --version && \
    solana --version

# Base layer with OS and tools
FROM ubuntu:22.04 as base

# Install common dependencies
RUN apt-get update -qq && \
    apt-get install -qq apt-utils && \
    dpkg --add-architecture i386 && \
    apt-get update -qq && \
    apt-get install -qq \
    build-essential curl pkg-config libssl-dev \
    libudev-dev gcc-multilib libc6-dev-i386 git vim

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Install Rust toolchain
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.81.0
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Solana
ARG SOLANA_VERSION="1.18.26"
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Create a separate stage for dependencies
FROM base as cargo-deps
WORKDIR /app
COPY Cargo.toml ./
RUN touch Cargo.lock
COPY Cargo.lock ./
# Create minimal src directory with dummy main.rs
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
# Fetch all dependencies
RUN cargo fetch

# Development image with cached dependencies
FROM base as dev-cached
WORKDIR /app
# Development-specific setup would go here

# Builder stage - uses the cached dependencies
FROM cargo-deps as builder
WORKDIR /app
COPY Cargo.toml ./
RUN touch Cargo.lock
COPY Cargo.lock ./
# Copy the actual source code
COPY src ./src
COPY programs ./programs
# Build the release binary
RUN cargo build --release
# Fetch all dependencies
RUN cargo fetch

# Production stage - final lightweight image
FROM base as production
WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/target/release/arch-server /usr/local/bin/
COPY programs programs

# Create necessary directories
RUN mkdir -p /app/programs/target/deploy && \
    # Fix permissions
    chown -R appuser:appuser /app && \
    chmod +x /usr/local/bin/arch-server

# Set environment variables
ENV PORT=8080
ENV RUST_LOG=info

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port
EXPOSE ${PORT}

# Switch to non-root user
USER appuser

# Update command to use full path
CMD ["/usr/local/bin/arch-server"]
