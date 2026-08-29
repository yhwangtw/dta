ARG NODE_IMAGE=node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
ARG RUNTIME_IMAGE=cgr.dev/chainguard/wolfi-base@sha256:19f7a7b40a11c435311e3784bd134c6b6f19677462440da48f96d5c84eefd669
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts/patch-pi-brace-expansion.mjs ./scripts/patch-pi-brace-expansion.mjs
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${RUNTIME_IMAGE} AS runtime
WORKDIR /app
ARG BUILD_VERSION=development
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED=unknown
LABEL org.opencontainers.image.title="Digital Transformation Agent" \
      org.opencontainers.image.description="Meeting-first DTA Agent runtime and human control plane" \
      org.opencontainers.image.source="https://github.com/yhwangtw/dta" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.created="${BUILD_CREATED}"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=30141 \
    DTA_DATA_DIR=/data \
    DTA_AGENT_WORKSPACE=/workspace \
    PI_CODING_AGENT_DIR=/data/pi
RUN apk update \
  && apk add --no-cache \
    bash=5.3-r12 \
    ca-certificates=20260611-r0 \
    ffmpeg-8.1=8.1.2-r2 \
    git=2.55.0-r4 \
    nodejs-22=22.23.2-r1 \
  && addgroup -S -g 1000 node \
  && adduser -S -D -H -u 1000 -G node node \
  && mkdir -p /data /workspace /usr/local/bin \
  && chown -R node:node /data /workspace /app
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts/dta.mjs /app/scripts/dta-core.mjs /app/scripts/dta-agent.mjs /app/scripts/dta-pilot-readiness.mjs ./scripts/
# Next.js standalone tracing does not include Pi's non-JavaScript runtime assets.
# Copy only the assets and built-in documentation Pi resolves at runtime; avoid
# copying Pi's nested development dependency tree into the production image.
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/dist/core/export-html ./node_modules/@earendil-works/pi-coding-agent/dist/core/export-html
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/assets ./node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/assets
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme ./node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/dist/cli.js ./node_modules/@earendil-works/pi-coding-agent/dist/cli.js
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/README.md /app/node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md ./node_modules/@earendil-works/pi-coding-agent/
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/docs ./node_modules/@earendil-works/pi-coding-agent/docs
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/examples ./node_modules/@earendil-works/pi-coding-agent/examples
RUN chmod 0555 /app/scripts/dta.mjs /app/scripts/dta-agent.mjs \
  && ln -s /app/scripts/dta.mjs /usr/local/bin/dta
USER node
EXPOSE 30141
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:30141/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
