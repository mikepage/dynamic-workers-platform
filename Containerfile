FROM debian:13-slim AS fetch
ARG WORKERD_VERSION=v1.20261107.1
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl
# workerd ships as one gzipped binary per platform.
RUN case "$TARGETARCH" in arm64) a=arm64 ;; *) a=64 ;; esac \
 && curl -fsSL "https://github.com/cloudflare/workerd/releases/download/${WORKERD_VERSION}/workerd-linux-${a}.gz" \
    | gunzip > /workerd \
 && chmod +x /workerd

# Runtime: plain Debian plus the one binary. No Node, no build tools.
# workerd refuses to start without system CA certificates.
FROM debian:13-slim
COPY --from=fetch /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=fetch /workerd /usr/local/bin/workerd
WORKDIR /srv
EXPOSE 8080
# --experimental: Worker Loader is experimental in workerd.
CMD ["workerd", "serve", "--watch", "--experimental", "config.capnp"]
