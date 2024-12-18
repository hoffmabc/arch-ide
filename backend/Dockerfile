# Use Node.js base image
FROM node:18-slim

# Install basic build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    git \
    pkg-config \
    libudev-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Solana CLI and cargo-build-sbf
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)" && \
    /root/.local/share/solana/install/active_release/bin/cargo-build-sbf --version
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and generate package-lock.json
RUN npm install && \
    npm install -g typescript

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
