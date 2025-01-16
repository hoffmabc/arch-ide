# Use the official Rust image as a builder
FROM rust:1.75 as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create a new empty shell project
WORKDIR /usr/src/app
COPY . .

# Build the application
RUN cargo build --release

# Create the runtime image
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Rust and cargo-build-sbf
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy necessary files from builder
COPY --from=builder /usr/src/app/target/release/arch-server /usr/local/bin/
COPY --from=builder /usr/src/app/crates /app/crates
COPY --from=builder /usr/src/app/programs /app/programs

# Create necessary directories
RUN mkdir -p /app/programs/target/deploy

# Set the working directory
WORKDIR /app

# Expose the port the app runs on
EXPOSE 8080

# Command to run the application
CMD ["arch-server"]
