ARG NODE_IMAGE=node:22.23.2-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache ca-certificates git gcompat
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
RUN apk upgrade --no-cache \
  && apk add --no-cache bash ca-certificates ffmpeg git gcompat \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && mkdir -p /data /workspace \
  && chown -R node:node /data /workspace /app
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts/dta-agent.mjs ./scripts/dta-agent.mjs
# Next.js standalone tracing does not include Pi's non-JavaScript runtime assets.
# Copy only the assets and built-in documentation Pi resolves at runtime; avoid
# copying Pi's nested development dependency tree into the production image.
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/dist/core/export-html ./node_modules/@earendil-works/pi-coding-agent/dist/core/export-html
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/assets ./node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/assets
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme ./node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/README.md /app/node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md ./node_modules/@earendil-works/pi-coding-agent/
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/docs ./node_modules/@earendil-works/pi-coding-agent/docs
COPY --from=builder --chown=node:node /app/node_modules/@earendil-works/pi-coding-agent/examples ./node_modules/@earendil-works/pi-coding-agent/examples
USER node
EXPOSE 30141
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:30141/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
