# Company Pilot Readiness

`dta pilot-check` verifies the deployed DTA image through its public HTTP/SSE
surfaces. It does not inspect source files, and every connection setting remains
runtime configuration. The generated report is suitable for a pilot change
record because it records passed, failed, and skipped checks without storing an
access token or adapter credential.

## What it proves

Preflight mode performs no data writes and no paid model request:

- DTA liveness and readiness
- current RS256 Keycloak access token
- Keycloak discovery metadata and matching JWKS signing key
- DTA accepts the token and rejects an unauthenticated API request
- Meeting Agent is enabled
- an administrator-only, redacted readback confirms that Keycloak, the company
  LLM gateway, MinIO, and n8n are the selected adapters

Live mode adds:

- a small upload/download/delete round trip through the configured artifact
  store and upload scanner
- User B receives `404` for User A's artifact, Agent run, and SSE stream
- a real Meeting Agent run through the configured company LLM
- normalized authenticated SSE reaches a terminal event
- the result contains a summary, decisions, action items, and requirements
- the Meeting review gate is explicitly approved
- the no-side-effect `meeting-pilot-readiness` n8n workflow validates DTA scope
  headers and returns `{ "ok": true, "dtaProbe": true }`
- executing the workflow twice with the same idempotency key reuses the first
  completed execution

The temporary artifact is deleted at the end. The pilot Meeting run, review,
n8n execution, and audit events remain as deployment evidence.

## Required identities

Use short-lived Keycloak access tokens from two different users:

- Primary pilot operator: `dta-user`, `dta-reviewer`, `dta-admin`, and
  `dta-artifact-delete`.
- Secondary user: `dta-user` only. Its token must have a different `sub`.

The test deliberately fails or reports `INCOMPLETE` when the secondary token is
missing. It never treats a skipped ownership check as a pass.

## Prepare the n8n probe

1. Import [`deploy/n8n/dta-pilot-readiness.json`](../deploy/n8n/dta-pilot-readiness.json)
   into the company n8n instance.
2. Protect the Webhook with the approved DTA webhook credential or the company
   authentication proxy. Do not leave the production webhook anonymous.
3. Activate the workflow. It validates the DTA workflow, execution,
   idempotency, run, user, and actor headers and performs no Jira, Teams, or
   Wiki action.
4. Configure DTA:

```env
DTA_WORKFLOW_PROVIDER=n8n
DTA_ENABLE_WORKFLOW_TOOLS=true
N8N_BASE_URL=https://n8n.company.example
N8N_WORKFLOW_MAP_JSON={"meeting-pilot-readiness":"/webhook/dta-pilot-readiness"}
```

The normal business workflows may remain unconfigured until their individual
security and side-effect reviews are complete.

## Run preflight

The production image contains the `dta` executable. It can be used as a
one-shot verification container without cloning Git or installing Node.js:

```bash
export DTA_IMAGE=yhwangtn/dta:vYYYY.MM.DD
export DTA_BASE_URL=https://dta.company.example
read -r -s DTA_ACCESS_TOKEN
export DTA_ACCESS_TOKEN

docker run --rm --entrypoint dta \
  -e DTA_BASE_URL \
  -e DTA_ACCESS_TOKEN \
  "$DTA_IMAGE" \
  pilot-check
```

If the company only permits Kubernetes pulls, run the same image as a temporary
operator Pod/Job and set `command: ["dta"]` with
`args: ["pilot-check"]`. Inject the short-lived access token through an
ephemeral Secret and delete that Secret after the check. When
`DTA_AUTH_TOKEN_HEADER=x-forwarded-access-token`, point `DTA_BASE_URL` at the
Keycloak-aware Ingress so it validates the Bearer token and overwrites the
forwarded header; a direct ClusterIP request intentionally bypasses that step.

## Run the live suite and save evidence

```bash
read -r -s DTA_SECONDARY_ACCESS_TOKEN
export DTA_SECONDARY_ACCESS_TOKEN
mkdir -p "$PWD/pilot-evidence"

docker run --rm --entrypoint dta \
  -e DTA_BASE_URL \
  -e DTA_ACCESS_TOKEN \
  -e DTA_SECONDARY_ACCESS_TOKEN \
  -v "$PWD/pilot-evidence:/reports" \
  "$DTA_IMAGE" \
  pilot-check --live --report /reports/dta-pilot-report.json
```

Use `--report /reports/dta-pilot-report.md` for a Markdown change record and
`--json` for machine-readable stdout. The live timeout defaults to three
minutes and can be changed with `--timeout 600000`.

Exit codes:

- `0`: all required checks passed
- `1`: one or more required checks failed
- `2`: the suite is incomplete because required evidence was skipped

## Interpreting failures

| Check | Most likely boundary |
| --- | --- |
| Keycloak discovery/JWKS | issuer, DNS/TLS, signing-key rotation, network egress |
| Unauthenticated API rejection | ingress auth policy or direct service exposure |
| Company adapter selection | Helm values, Secret injection, or disabled workflow tools |
| MinIO artifact round trip | bucket policy, TLS trust, SigV4 region, scanner, or credentials |
| Meeting Agent run | company LLM endpoint/model/auth or Pi runtime provider registration |
| Normalized SSE | ingress buffering/timeout, token forwarding, or run ownership |
| Cross-user isolation | Keycloak subjects, ownership metadata, or operational overprivilege |
| n8n scope/idempotency | workflow activation, webhook credential, DTA header validation, or response contract |

Do not accept a report containing `SKIP` for a required live check as production
evidence. Fix the boundary and rerun the same image and configuration.
