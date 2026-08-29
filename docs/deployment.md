# Build Once, Configure at Runtime

The DTA image contains Node.js 22, Next.js, npm dependencies, the Pi runtime dependencies, Git, and FFmpeg. Company Kubernetes does not install these separately. The same image is promoted across environments; only ConfigMaps, Secrets, mounted storage, and network endpoints change.

The release workflow publishes the same `linux/amd64` and `linux/arm64` image digest to `ghcr.io/yhwangtw/dta` and `docker.io/yhwangtn/dta`, plus the deployment chart to `oci://registry-1.docker.io/yhwangtn/dta-agent-platform`. It verifies both image registries, pulls and renders the published chart, generates a CycloneDX SBOM, blocks High/Critical CVEs, and creates Sigstore-backed GitHub attestations before the GitHub Release is created. Repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are required for release; connection settings are still injected only when the container starts.

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

The UI is optional. The production image installs the `dta` executable, while a
source checkout exposes the same commands through `npm run dta --`:

```bash
DTA_BASE_URL=http://127.0.0.1:30141 \
  dta run meeting --task "Generate meeting minutes" --transcript ./notes.txt

dta tui meeting
dta sessions --agent meeting
dta pilot-check
```

For Keycloak-protected environments, pass the access token through `DTA_ACCESS_TOKEN`; the CLI does not persist it.
The CLI/TUI can upload Meeting text, DOCX, audio, and video through the same
bounded extraction endpoint as the Web UI. `dta pi` remains a separate native
Coding Agent developer entry point. See [`docs/cli.md`](./cli.md).

After the company adapters are configured, use `dta pilot-check` for a
non-mutating preflight and `dta pilot-check --live` to prove the real Keycloak,
MinIO, company LLM, normalized SSE, cross-user ownership, review gate, and n8n
idempotency path. The live suite requires tokens from two different Keycloak
users and a dedicated no-side-effect n8n probe. See
[Company Pilot Readiness](./company-pilot-readiness.md).

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
DTA_CODING_REQUIRED_ROLES=dta-coding-access

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
N8N_EDITOR_URL=https://n8n.example.com
```

See [n8n integration](./n8n.md) for the webhook contract, workflow allowlists, approval gate, idempotency headers, and local mock mode.

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
2. Add department roles such as `dta-user` and `dta-reviewer`. Assign `dta-coding-access` only to developers who need Coding/File/Git surfaces.
3. Give the company Orchestrator `dta-act-as-user` only if it is allowed to submit work for users named in requests.
4. Give operational readers `dta-run-read-all` only when cross-user run access is intended.
5. Give `dta-artifact-delete`, `dta-audit-read`, and `dta-admin` only to the corresponding operational groups.
6. Set the exact realm issuer URL in `KEYCLOAK_ISSUER`; optionally pin `KEYCLOAK_JWKS_URL`.
7. Put the browser UI behind the company's Keycloak-aware ingress/auth proxy. DTA's Keycloak adapter validates API tokens but does not render a browser login flow.
8. If the proxy forwards a token in `x-forwarded-access-token`, set `DTA_AUTH_TOKEN_HEADER` to that name, configure the proxy to overwrite—not append—the header, and prevent untrusted clients from reaching the ClusterIP directly. Apply the same injection to SSE paths because browser `EventSource` cannot attach a Bearer header. For direct service-to-service calls, keep the standard `Authorization: Bearer ...` mode.

## Kubernetes

The company deployment needs Docker Hub access, Helm 3, `kubectl`, and cluster
credentials; it does not need a Git clone, Node.js, npm, or Pi installed on the
operator machine. The production chart is published as a Docker Hub OCI
artifact. It pins the verified multi-architecture image digest, validates the
single-replica limit, references an externally managed Secret by default, and
exposes all company endpoints through values rather than image changes.

1. Select the matching immutable chart version. Release `v2026.08.28` uses
   chart version `2026.8.28`; a release suffix is retained, for example
   `v2026.08.28-1` becomes `2026.8.28-1`.
2. Pull the chart once to obtain its company values template, then copy that
   template to a secure working directory:

```bash
export DTA_CHART=oci://registry-1.docker.io/yhwangtn/dta-agent-platform
export DTA_CHART_VERSION=2026.8.28

helm pull "$DTA_CHART" --version "$DTA_CHART_VERSION" --untar
cp dta-agent-platform/values.company-example.yaml /secure/path/dta-values.yaml
```

3. Replace every example endpoint, hostname, storage class, and registry in
   `/secure/path/dta-values.yaml`. Keep the checked-in image digest unless the
   company mirrors the image and has verified the mirror digest.
4. Have Vault, External Secrets, or the platform secret controller create
   `dta-agent-platform-secrets`. Do not place production secret values in the
   values file.
5. Render the same remote chart, review the output, and deploy atomically:

```bash
helm show chart "$DTA_CHART" --version "$DTA_CHART_VERSION"
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

For local chart development, the source path
`deploy/helm/dta-agent-platform/` remains usable. Production deployment should
pin an OCI chart version and the image digest instead of deploying a moving
branch or image tag.

See the [chart README](../deploy/helm/dta-agent-platform/README.md) for values,
security defaults, verification, upgrade, and rollback instructions.

The original Kustomize example remains in `deploy/kubernetes/` for environments
that do not permit Helm:

1. Copy and edit `configmap.yaml`, `ingress.yaml`, storage class/PVC, and image name.
2. Create `dta-agent-platform-secrets` with the keys shown in
   `secret.example.yaml`. Do not apply the example values.
3. Apply the non-secret resources:

```bash
kubectl apply -k deploy/kubernetes
kubectl rollout status deployment/dta-agent-platform
kubectl get pods,service,ingress
```

Both deployment paths enforce one replica, non-root UID/GID, `RuntimeDefault`
seccomp, no service-account token, no privilege escalation, a read-only root
filesystem, and all Linux capabilities dropped. Writable paths are limited to
`/data`, `/workspace`, `/tmp`, and the Next cache. Startup, readiness, and
liveness probes are separate; service-link injection is disabled and pod
termination receives 60 seconds for graceful shutdown.

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
  -> Docker build with a pinned official Node 22 Debian builder
  -> Minimal pinned Wolfi runtime with Node 22, Git, and FFmpeg
  -> SBOM/CVE scan
  -> approved registry
  -> Kubernetes deployment
```

Do not suppress CVEs. Rebuild against the current maintained base image and update the lockfile/dependency when a finding has a fix. Scan both OS and npm layers. Secrets must not be build arguments, copied `.env` files, image layers, or labels.

The final runtime stage uses a digest-pinned Wolfi base and exact package versions for Node.js, Bash, Git, and FFmpeg. npm, npx, Yarn, and Corepack are not installed in the runtime stage. Company deployment changes therefore happen through the published image plus runtime configuration, not by installing packages inside a running container. The builder and runtime both use glibc-compatible distributions so traced native Node modules are not copied across incompatible C libraries.

To pull the company-approved Docker Hub image by immutable digest and inspect
the matching Helm chart:

```bash
docker pull yhwangtn/dta@sha256:<verified-digest>
docker buildx imagetools inspect yhwangtn/dta:<version>
helm show chart oci://registry-1.docker.io/yhwangtn/dta-agent-platform \
  --version <chart-version>
```

GHCR remains the GitHub-attested source copy:

```bash
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
