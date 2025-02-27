# Base development image
FROM ubuntu:22.04 as development

ARG DEBIAN_FRONTEND="noninteractive"
ENV HOME="/root"

# Install build deps and development tools
RUN apt-get update -qq && apt-get upgrade -qq && apt-get install -qq \
    build-essential \
    curl \
    pkg-config \
    libssl-dev \
    libudev-dev \
    gcc-multilib \
    libc6-dev-i386 \
    git \
    vim

# Install Rust with specific toolchain
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.81.0
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Solana
ARG SOLANA_VERSION="1.18.26"
RUN sh -c "$(curl -sSfL https://release.solana.com/v${SOLANA_VERSION}/install)"
ENV PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

WORKDIR /app

# Production build stage
FROM development as builder

COPY . .
RUN cargo build --release

# Production runtime
FROM development as production

WORKDIR /app
COPY --from=builder /app/target/release/arch-server /usr/local/bin/
COPY programs programs

RUN mkdir -p /app/programs/target/deploy

ENV PORT=8080
ENV RUST_LOG=info

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

CMD ["arch-server"]
