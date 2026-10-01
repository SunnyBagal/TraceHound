# TraceHound repair sandbox (decisions 026, 036). Both bases are pinned by multi-arch index digest.
#   git + curl + ca-certs: official buildpack-deps:bookworm-scm
#   bun 1.4.2:            binary copied from the official oven/bun:1.4.2 image
#   TypeScript 5.9.3:     installed globally at build time (in /opt/bun), so runs can use --network none
#   user:                 everything runs as the unprivileged user `sandbox` (uid/gid 1000); it owns
#                         /work, /scratch and its home, and nothing else
# Build: docker build -f harness/sandbox.Dockerfile -t tracehound-sandbox:bun1.4.2-ts5.9.3-2 harness
FROM oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS bun

FROM buildpack-deps:bookworm-scm@sha256:b42f74a50a22540b839042134919504ff7c51e7cf8d751b79d0f94c56566cb92
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx \
 && BUN_INSTALL=/opt/bun bun add -g typescript@5.9.3 \
 && printf '#!/bin/sh\nexec bun /opt/bun/install/global/node_modules/typescript/bin/tsc "$@"\n' > /usr/local/bin/tsc \
 && chmod +x /usr/local/bin/tsc \
 && git config --system user.name tracehound-sandbox \
 && git config --system user.email sandbox@tracehound.invalid \
 && git config --system --add safe.directory '*' \
 && groupadd --gid 1000 sandbox \
 && useradd --uid 1000 --gid 1000 --create-home --shell /bin/sh sandbox \
 && mkdir /work /scratch \
 && chown sandbox:sandbox /work /scratch
ENV BUN_INSTALL=/home/sandbox/.bun PATH=/usr/local/bin:/usr/bin:/bin:/home/sandbox/.bun/bin
USER sandbox
WORKDIR /work
LABEL org.opencontainers.image.title="tracehound-sandbox" tracehound.bun="1.4.2" tracehound.typescript="5.9.3" tracehound.user="sandbox:1000"
