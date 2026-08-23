ARG NODE_IMAGE=node:22.23.2-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436
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

FROM ${NODE_IMAGE} AS runtime
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
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg git \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data /workspace \
  && chown -R node:node /data /workspace /app
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts/dta-agent.mjs ./scripts/dta-agent.mjs
USER node
EXPOSE 30141
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:30141/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
