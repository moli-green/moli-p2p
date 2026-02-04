# Build Stage
FROM rust:1.80-slim-bookworm as builder

WORKDIR /app
COPY . .

# Install build dependencies if needed (e.g. for openssl)
RUN apt-get update && apt-get install -y pkg-config libssl-dev

RUN cargo build --release

# Runtime Stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/server /usr/local/bin/server

ENV RUST_LOG=info
EXPOSE 9090

CMD ["server"]
