# Build Once, Configure at Runtime

The DTA image contains Node.js 22, Next.js, npm dependencies, the Pi runtime dependencies, Git, and FFmpeg. Company Kubernetes does not install these separately. The same image is promoted across environments; only ConfigMaps, Secrets, mounted storage, and network endpoints change.

The release workflow publishes `linux/amd64` and `linux/arm64` images to `ghcr.io/yhwangtw/dta`, generates a CycloneDX SBOM, blocks High/Critical CVEs, and creates Sigstore-backed GitHub attestations before the GitHub Release is created. A company registry may mirror that verified digest; connection settings are still injected only when the container starts.

## Build and verify the image

```bash
docker build --pull -t dta-agent-platform:local .
docker run --rm -p 30141:30141 \
  -e DTA_AUTH_MODE=none \
  -e DTA_ARTIFACT_STORE=local \
  -v dta-data:/data \
  dta-agent-platform:local
```

Build for the Kubernetes node architecture, not only the developer laptop. For a typical x86_64 company cluster, publish an amd64 image from Apple Silicon with:

```bash
docker buildx build --pull --platform linux/amd64 \
  -t registry.example.com/dta-agent-platform:<version> \
  --push .
```

For a mixed cluster, publish a multi-architecture manifest with `--platform linux/amd64,linux/arm64`. Keep the application image and configuration identical across architectures; only the image build target changes.

Verify:

```bash
curl http://127.0.0.1:30141/health
curl http://127.0.0.1:30141/ready
curl http://127.0.0.1:30141/.well-known/agent-card.json
```

The UI is optional. Any shell with Node.js 22 can use the bundled HTTP client:

```bash
DTA_BASE_URL=http://127.0.0.1:30141 \
  npm run agent -- meeting --task "Generate meeting minutes" --transcript ./notes.txt
```

For Keycloak-protected environments, pass the access token through `DTA_ACCESS_TOKEN`; the CLI does not persist it.

`/health` is a liveness endpoint. `/ready` returns HTTP 503 when a selected adapter is missing required configuration; optional disabled media capabilities are warnings and do not make local mode unready.

## Runtime profiles

### Outside the company

```env
DTA_AUTH_MODE=none
DTA_ARTIFACT_STORE=local
DTA_WORKFLOW_PROVIDER=mock
DTA_ENABLE_WORKFLOW_TOOLS=false
DTA_TRANSCRIPTION_PROVIDER=none
DTA_VISION_PROVIDER=none
DTA_MEMORY_STORE=local
DTA_UPLOAD_SCANNER=none
```

Leave `LLM_BASE_URL` and `LLM_MODEL` empty to use the existing local Pi model configuration.

### Inside the company

```env
DTA_AUTH_MODE=keycloak
KEYCLOAK_ISSUER=https://keycloak.example.com/realms/company
KEYCLOAK_AUDIENCE=dta-agent-platform

LLM_BASE_URL=https://llm-gateway.example.com/v1
LLM_MODEL=company-model

DTA_ARTIFACT_STORE=minio
MINIO_ENDPOINT=https://minio.example.com
MINIO_BUCKET=dta-artifacts

DTA_MEMORY_STORE=postgres

DTA_UPLOAD_SCANNER=http
DTA_UPLOAD_SCANNER_URL=https://malware-scanner.example.com/scan

DTA_WORKFLOW_PROVIDER=n8n
N8N_BASE_URL=https://n8n.example.com
```

API keys and storage credentials come from Secrets, never the ConfigMap or image. See `.env.example` for the complete list.

## Add department Agents through configuration

Mount a version 1 manifest and point DTA at it:

```env
DTA_AGENT_MANIFEST_PATH=/etc/dta/agents.json
DTA_ENABLED_AGENTS=meeting-agent,pm-agent,knowledge-agent
```

The manifest format is demonstrated by `config/agents.example.json`. Each entry supplies an ID ending in `-agent`, display name, description, private system prompt, public A2A skills, and optional workflow allowlist. DTA validates the file during readiness; an invalid or missing configured manifest returns HTTP 503. The Kubernetes example mounts `agents.json` from its ConfigMap, so changing department Agents does not modify the image.

## Keycloak preparation

1. Create or select a confidential/service client whose access tokens carry audience `dta-agent-platform`.
2. Add department roles such as `dta-user` and `dta-reviewer`.
3. Give the company Orchestrator `dta-act-as-user` only if it is allowed to submit work for users named in requests.
4. Give operational readers `dta-run-read-all` only when cross-user run access is intended.
5. Give `dta-artifact-delete`, `dta-audit-read`, and `dta-admin` only to the corresponding operational groups.
6. Set the exact realm issuer URL in `KEYCLOAK_ISSUER`; optionally pin `KEYCLOAK_JWKS_URL`.
7. Put the browser UI behind the company's Keycloak-aware ingress/auth proxy. DTA's Keycloak adapter validates API tokens but does not render a browser login flow.
8. If the proxy forwards a token in `x-forwarded-access-token`, set `DTA_AUTH_TOKEN_HEADER` to that name, configure the proxy to overwrite—not append—the header, and prevent untrusted clients from reaching the ClusterIP directly. For direct service-to-service calls, keep the standard `Authorization: Bearer ...` mode.

## Kubernetes

Examples are in `deploy/kubernetes/`.

1. Copy and edit `configmap.yaml`, `ingress.yaml`, storage class/PVC, and image name.
2. Have Vault, External Secrets, or the platform secret controller create `dta-agent-platform-secrets` with the keys shown in `secret.example.yaml`. Do not apply the example values.
3. Apply the non-secret resources:

```bash
kubectl apply -k deploy/kubernetes
kubectl rollout status deployment/dta-agent-platform
kubectl get pods,service,ingress
```

The sample enforces one replica, non-root UID/GID, `RuntimeDefault` seccomp, no service-account token, no privilege escalation, a read-only root filesystem, and all Linux capabilities dropped. It mounts writable volumes only at `/data`, `/workspace`, `/tmp`, and the Next cache.

The sample also mounts `/etc/dta/agents.json` read-only. `POSTGRES_URL`, media/model keys, MinIO credentials, n8n credentials, and the upload-scanner key come from Secret references. For MinIO, configure a bucket lifecycle rule matching `DTA_ARTIFACT_RETENTION_DAYS`; application-side retention intentionally does not list production buckets.

## Vault and secret injection

The application only reads environment variables. The company path remains:

```text
Vault / External Secrets
          -> Kubernetes Secret
          -> container env
          -> DTA adapters
```

Do not mount a Vault token, Docker socket, host root filesystem, or privileged sidecar into the DTA pod.

## Image security and release flow

```text
Git commit
  -> locked npm install and tests
  -> Docker build from the pinned official Node 22 Alpine 3.23 base
  -> SBOM/CVE scan
  -> approved registry
  -> Kubernetes deployment
```

Do not suppress CVEs. Rebuild against the current maintained base image and update the lockfile/dependency when a finding has a fix. Scan both OS and npm layers. Secrets must not be build arguments, copied `.env` files, image layers, or labels.

The final runtime stage keeps Node.js, Bash, Git, and FFmpeg, but removes npm, npx, Yarn, and Corepack after the application build. Company deployment changes therefore happen through the published image plus runtime configuration, not by installing packages inside a running container.

To pull a released image before mirroring it:

```bash
docker pull ghcr.io/yhwangtw/dta:<version>
docker buildx imagetools inspect ghcr.io/yhwangtw/dta:<version>
gh attestation verify oci://ghcr.io/yhwangtw/dta:<version> --repo yhwangtw/dta
```

## Operations

- Start with `replicas: 1`; `Recreate` prevents two pods from owning process-local sessions concurrently.
- Back up the `/data` volume. MinIO protects artifacts, but local run/review/session state still lives on this volume.
- Treat `/ready` errors as configuration failures and `/health` failures as process failures.
- Keep n8n tools disabled until each workflow's permissions, idempotency, and human approval rules are reviewed.
- Scrape `/metrics` with a Keycloak token holding `dta-audit-read` or `dta-admin` when `DTA_METRICS_AUTH_REQUIRED=true`.
- Ship the append-only hash-chained audit JSONL to the company SIEM. The local chain detects modification but is not a substitute for off-host immutable retention.
- Use outbound network policy/egress controls for the LLM gateway, Keycloak, MinIO, Postgres/Redis, upload scanner, and n8n endpoints.
