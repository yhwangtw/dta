# DTA Agent Platform Helm Chart

This chart deploys the server-side Digital Transformation Agent with the same
security and runtime boundaries as `deploy/kubernetes/`. It supports the Web,
CLI/TUI, external Agent Contract, A2A, Meeting Agent, PM Agent, and configured
n8n workflows through one server-side runtime.

## Prerequisites

- Kubernetes 1.27 or newer
- Helm 3
- A `ReadWriteOnce` storage class or an existing PVC for `/data`
- A Kubernetes Secret created by Vault, External Secrets, or the platform team
- Company endpoints for Keycloak, LLM, MinIO, Postgres, n8n, transcription,
  vision, and upload scanning as required by the selected adapters

The chart enforces `replicaCount: 1`. Pi runtime sessions and active run
supervision are process-local, so multiple replicas are not safe yet.

## Install from Docker Hub OCI

Company deployment does not require this source repository. Select an immutable
OCI chart version, pull its packaged company example, and keep the customized
copy outside the extracted chart directory. Release `v2026.08.28` maps to chart
version `2026.8.28`; suffixes such as `-1` are retained.

```bash
export DTA_CHART=oci://registry-1.docker.io/yhwangtn/dta-agent-platform
export DTA_CHART_VERSION=2026.8.28

helm pull "$DTA_CHART" --version "$DTA_CHART_VERSION" --untar
cp dta-agent-platform/values.company-example.yaml /secure/path/dta-values.yaml
```

Have the secret controller create `dta-agent-platform-secrets` with the keys
selected under `secret.env` in `values.yaml`. Required production keys are:

- `LLM_API_KEY`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `POSTGRES_URL`

Optional adapters use `N8N_API_KEY`, `DTA_TRANSCRIPTION_API_KEY`,
`DTA_VISION_API_KEY`, `REDIS_URL`, `DTA_UPLOAD_SCANNER_API_KEY`, and
`PIWEB_SESSION_SECRET`.

Render the exact remote chart and review it before installing:

```bash
helm show chart "$DTA_CHART" --version "$DTA_CHART_VERSION"
helm template dta "$DTA_CHART" \
  --version "$DTA_CHART_VERSION" \
  --namespace dta \
  -f /secure/path/dta-values.yaml
```

Install or upgrade:

```bash
helm upgrade --install dta "$DTA_CHART" \
  --version "$DTA_CHART_VERSION" \
  --namespace dta \
  --create-namespace \
  --atomic \
  --timeout 10m \
  -f /secure/path/dta-values.yaml
```

Do not pass production secrets through `--set`; shell history and CI logs may
retain them. Keep `secret.create: false` and inject an existing Secret instead.

For chart development in a source checkout, lint and render the local path:

```bash
helm lint deploy/helm/dta-agent-platform
helm template dta deploy/helm/dta-agent-platform \
  --namespace dta \
  -f deploy/helm/dta-agent-platform/values.company-example.yaml
```

## Verify

```bash
kubectl rollout status deployment/dta-dta-agent-platform -n dta
kubectl port-forward service/dta-dta-agent-platform 30141:80 -n dta
curl http://127.0.0.1:30141/health
curl http://127.0.0.1:30141/ready
curl http://127.0.0.1:30141/.well-known/agent-card.json
```

`/health` is liveness. `/ready` reports missing or invalid selected adapters.
Do not bypass a readiness failure in production.

## Important values

| Value | Purpose |
| --- | --- |
| `image.repository` / `image.digest` | Docker Hub repository and immutable release digest |
| `config.env` | Non-secret DTA adapter and policy configuration |
| `secret.existingSecret` | Vault/External Secrets-managed credentials |
| `agentManifest` | Read-only department Agent definitions mounted at `/etc/dta/agents.json` |
| `persistence.data` | Durable local run, review, audit, and Pi session state |
| `persistence.workspace` | Optional durable Agent workspace; defaults to `emptyDir` |
| `ingress` | Company TLS and Keycloak-aware ingress/auth proxy |
| `extraEnv*` / `extraVolume*` | Platform-specific extensions without editing templates |

The checked-in company example uses the public `yhwangtn/dta` Docker Hub image
and pins its verified multi-architecture digest. If a later company mirror is
introduced, retain that digest when the registry performs an exact OCI copy;
otherwise scan and record the mirror's new digest before deployment.

## Security defaults

- non-root UID/GID 1000
- read-only root filesystem
- `RuntimeDefault` seccomp
- all Linux capabilities dropped
- privilege escalation disabled
- ServiceAccount token not mounted
- ClusterIP service and disabled Ingress by default
- writable paths restricted to `/data`, `/workspace`, `/tmp`, and Next cache
- external Secret by default; no placeholder Secret is created

The optional PodDisruptionBudget is disabled because `minAvailable: 1` on the
single supported replica can prevent voluntary node maintenance. Coordinate a
maintenance window or enable it deliberately when that tradeoff is desired.

## Upgrade and rollback

```bash
helm upgrade dta "$DTA_CHART" \
  --version "$DTA_CHART_VERSION" \
  --namespace dta \
  --atomic \
  --timeout 10m \
  -f /secure/path/dta-values.yaml

helm history dta -n dta
helm rollback dta <revision> -n dta --wait
```

Back up the `/data` PVC before upgrades that change persistence or session
formats. MinIO protects exported artifacts, but local run and review state also
lives under `/data`.
