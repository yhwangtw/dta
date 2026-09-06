# DTA deployment

The primary company deployment is the self-contained Docker image plus the versioned Helm OCI chart. Both are published to Docker Hub, so the company operator does not need this source repository:

- image: `yhwangtn/dta@sha256:<verified-digest>`
- chart: `oci://registry-1.docker.io/yhwangtn/dta-agent-platform`

Use an approved immutable digest, not `latest`. The company may mirror that digest into an internal registry and change only runtime configuration, Secret references, the mounted Agent manifest, and storage bindings.

## Company Kubernetes

Start with the [Helm chart guide](./helm/dta-agent-platform/README.md). Hardened Kustomize examples remain under [`deploy/kubernetes`](./kubernetes/) for environments that do not permit Helm.

```bash
export DTA_CHART=oci://registry-1.docker.io/yhwangtn/dta-agent-platform
export DTA_CHART_VERSION=YYYY.M.D

helm pull "$DTA_CHART" --version "$DTA_CHART_VERSION" --untar
cp dta-agent-platform/values.company-example.yaml /secure/path/dta-values.yaml

helm template dta "$DTA_CHART" \
  --version "$DTA_CHART_VERSION" \
  --namespace dta \
  -f /secure/path/dta-values.yaml

helm upgrade --install dta "$DTA_CHART" \
  --version "$DTA_CHART_VERSION" \
  --namespace dta \
  --create-namespace \
  --atomic \
  --timeout 10m \
  -f /secure/path/dta-values.yaml
```

Before deployment:

1. Pin the company-approved image digest and chart version independently.
2. Configure Keycloak, the company LLM gateway, MinIO, Postgres/Redis, n8n, transcription, vision, and upload scanning only through values, environment variables, mounted files, or external Secrets.
3. Have Vault, External Secrets, or the platform team create the referenced Kubernetes Secret.
4. Keep `replicaCount: 1`; Pi sessions and active run supervision are still process-local.
5. Render and review the chart before the atomic upgrade.
6. Run `dta pilot-check --live` with short-lived test tokens after installation.

The chart defaults to non-root execution, a read-only root filesystem, dropped capabilities, no privilege escalation, no ServiceAccount token, and separate startup/readiness/liveness probes.

## Docker smoke run

```bash
docker run --rm -p 30141:30141 \
  -e DTA_AUTH_MODE=none \
  -e DTA_ARTIFACT_STORE=local \
  -e DTA_MEMORY_STORE=local \
  -e DTA_WORKFLOW_PROVIDER=none \
  -e DTA_TRANSCRIPTION_PROVIDER=none \
  -e DTA_VISION_PROVIDER=none \
  -v dta-data:/data \
  yhwangtn/dta@sha256:<verified-digest>
```

This local smoke profile deliberately disables company integrations. It is not the company acceptance configuration.

## Optional non-container host

For a non-container host, build once with `npm ci && npm run build`, then adapt the included systemd or launchd example. Run DTA as an unprivileged, dedicated user and keep only its data directory and approved workspaces writable. Company production should prefer the image so Node.js, Next.js, Pi, Git, and FFmpeg versions remain controlled by CI.

The source installer creates a private recovery bundle when local commits or working-tree changes exist and asks before replacing them with `origin/main`. Automated installations stop unless `DTA_SETUP_FORCE_SYNC=1` is supplied. Use `DTA_SETUP_OFFLINE=1` to keep an intentionally offline checkout.

```bash
cd /path/to/dta
bash setup.sh
```

## Authentication boundaries

Company mode uses Keycloak:

```bash
DTA_AUTH_MODE=keycloak
KEYCLOAK_ISSUER=https://keycloak.company.example/realms/company
KEYCLOAK_AUDIENCE=dta
```

Put the browser behind the company's Keycloak-aware ingress or authentication proxy. DTA validates bearer tokens and resource ownership; it does not implement the company's login screen.

For a lightweight localhost/private-network deployment with `DTA_AUTH_MODE=none`, the inherited shared-password gate remains available:

```bash
PIWEB_ACCESS_PASSWORD='pick-a-long-passphrase'
PIWEB_SESSION_SECRET='paste-a-random-value-from-openssl-rand-hex-32'
```

Generate the session secret with `openssl rand -hex 32` and keep it stable across restarts. This gate is compatibility functionality, not a replacement for Keycloak, network policy, or OS isolation.

The embedded Safety Guard confirms high-impact commands, protected-file access, dependency installation, and external mutations. It is an application authorization layer, not an OS sandbox. Tools, MCP servers, extensions, and Coding Agent operations inherit the server account's permissions.

## Managed Update Center

The inherited Runtime settings can compare releases and run operator-managed update actions. Buttons remain disabled until explicit helper commands are configured:

```bash
PIWEB_RELEASE_REPOSITORY='yhwangtw/dta'
PIWEB_UPDATE_BACKUP_DIR='/var/lib/dta/update-backups'
PIWEB_UPDATE_COMMAND_JSON='["/usr/local/libexec/dta-update"]'
PIWEB_RESTART_COMMAND_JSON='["/usr/local/libexec/dta-restart"]'
PIWEB_ROLLBACK_COMMAND_JSON='["/usr/local/libexec/dta-rollback"]'
```

Each command is a JSON argv array whose first item is an absolute executable path. DTA launches it directly without shell interpolation. Keep helpers outside any Agent-writable workspace. The helper should download and validate a release in a staging directory, stop the service, replace it atomically, then restart. Never run `next build` against the checkout of a running Next.js server.

For Kubernetes, prefer the normal GitOps/Helm rollout instead of in-container self-update.

## Network access

- Prefer company Ingress plus Keycloak and NetworkPolicy.
- For a private personal host, Tailscale is safer than exposing port 30141.
- Cloudflare Tunnel requires an Access policy; a bare tunnel exposes an Agent with file/shell capabilities.
- SSH port forwarding is suitable for temporary operator access.

Do not forward port 30141 directly to the public internet, run an unauthenticated tunnel, mount the Docker socket, mount the host root filesystem, or run DTA as root.

## References

- [Architecture and production limitations](../docs/architecture.md)
- [Build-once/runtime-configuration guide](../docs/deployment.md)
- [Company pilot readiness](../docs/company-pilot-readiness.md)
- [Operations, alerts, retention, backup, and incident runbook](../docs/operations-runbook.md)
- [Local environment template](../.env.example)
