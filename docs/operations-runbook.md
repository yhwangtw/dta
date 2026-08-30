# DTA Operations Runbook

This runbook covers the first supported company topology: one DTA pod, one
durable `/data` volume, MinIO artifacts, company LLM/media gateways, n8n, and
optional Postgres/Redis conversation memory. Active Pi sessions and the run
event bus are still process-local, so the supported replica count is exactly
one.

## Release and deployment gate

1. Select an immutable GitHub release, Docker Hub manifest digest, and matching
   OCI Helm chart version.
2. Verify the chart renders `docker.io/yhwangtn/dta@sha256:...`, not a moving
   tag. If the company mirrors the image, record the mirror digest after its
   security scan.
3. Render the final company values and review the Secret references,
   NetworkPolicy, Ingress, PVC, ServiceMonitor, retention, and backup resources.
4. Deploy with `helm upgrade --install --atomic`; wait for `/ready` rather than
   overriding a readiness failure.
5. Run `dta pilot-check --live` with two short-lived Keycloak identities. Keep
   the redacted report in the change record.

The release workflow publishes amd64/arm64 images, an SBOM and provenance,
stamps the verified image digest into the chart, and reads both registries back.
Company adapter readiness still requires the live pilot.

## Health and metrics

- `/health`: process liveness only.
- `/ready`: selected adapter and configuration readiness.
- `/metrics`: Prometheus text; protect it with a token holding `dta-audit-read`
  or `dta-admin` when `DTA_METRICS_AUTH_REQUIRED=true`.

The optional Helm `ServiceMonitor` supports a bearer token stored in a
Kubernetes Secret. Use a current Keycloak service-account JWT with
`dta-audit-read` or `dta-admin` and rotate it before expiry. DTA accepts the
standard `Authorization` header for this internal client when the configured
proxy-injected header is absent. Useful alert inputs include:

- `dta_configuration_ready == 0`
- `dta_audit_chain_valid == 0`
- sustained increases in `dta_agent_run_finished_total{status!="completed"}`
- sustained increases in `dta_media_job_finished_total{status="failed"}`
- sustained increases in `dta_workflow_execution_total{status="failed"}`
- stuck `dta_media_jobs{status="processing"}` or
  `dta_workflow_executions{status="running"}`
- high latency from `dta_agent_run_duration_seconds` and
  `dta_media_job_duration_seconds`

Runtime counters reset with the process. Persisted status gauges are rebuilt
from `/data`, so dashboards should use Prometheus history for trends.

## Logs and audit

Set `DTA_STRUCTURED_LOGS=true` for JSON operational logs. The local audit file
is an append-only hash chain at `DTA_AUDIT_LOG_PATH`; `/metrics` reports whether
the chain verifies. `DTA_AUDIT_SINK_URL` can forward each event to a company
SIEM with the configured header/scheme and `DTA_AUDIT_SINK_API_KEY`.

The HTTP sink is best-effort. Keep `/data/audit` backed up and use an off-host,
immutable SIEM destination; the local hash chain detects mutation but does not
prevent volume loss.

## Media jobs

Meeting audio/video uploads create persistent job records. Web and CLI clients
wait for completion while the server exposes progress. A user can cancel an
active job or retry a failed/cancelled job until `DTA_MEDIA_JOB_MAX_ATTEMPTS` is
reached. A pod restart marks an in-progress media job failed and retryable; it
does not silently repeat provider calls.

Investigate the transcription/vision gateway, FFmpeg limits, scanner, and
artifact store before retrying a repeated failure. The current upload parser
and each provider request still buffer one bounded file, so large-scale or
multi-hour use should wait for chunked upload/transcription support.

## Retention and legal hold

Application retention is opt-in and starts in report-only mode:

```env
DTA_RETENTION_ENABLED=true
DTA_RETENTION_DRY_RUN=true
DTA_ARTIFACT_RETENTION_DAYS=365
DTA_RUN_RETENTION_DAYS=365
DTA_MEDIA_JOB_RETENTION_DAYS=30
DTA_WORKFLOW_RETENTION_DAYS=365
DTA_RETENTION_PROTECT_APPROVED=true
DTA_LEGAL_HOLD_RUN_IDS=run-id-1,run-id-2
```

Use the optional retention CronJob with a rotated Keycloak service token that
has `dta-admin`. Review at least one dry-run report and Records/Legal approval
before setting `DTA_RETENTION_DRY_RUN=false`.

The application can enumerate local artifacts, Agent/domain runs, media jobs,
n8n execution records, and local memory. It deliberately delegates these
boundaries:

- MinIO: apply a matching bucket lifecycle policy and legal-hold policy.
- Postgres/Redis memory: apply company database retention and backup policy.
- Pi JSONL sessions: coordinate session, owner metadata, tags, pins, schedules,
  and active runtime state; DTA does not unlink them during a retention sweep.

Approved results and their referenced Meeting evidence are protected by
default. Legal-hold run IDs also protect linked records and media jobs. A run
or media job that is still inside its own retention window protects every
referenced local artifact even when the artifact's independent age threshold
has passed, so a sweep does not create dangling evidence links.

## Backup

At minimum, back up:

- the `/data` PVC, including run/review records, session ownership, Pi JSONL,
  media job records, workflow execution records, and audit logs;
- the MinIO bucket and its versioning/lifecycle configuration;
- Postgres/Redis where selected;
- the mounted Agent manifest and the non-secret Helm values revision.

The Helm `backupCronJob` is only a secure hook. It mounts `/data` read-only and
requires a company-approved, digest-pinned backup image plus command and Secret
references. DTA does not ship cloud credentials or assume a backup product.

Perform restore drills outside production:

1. Stop DTA or scale the Deployment to zero so no process writes `/data`.
2. Restore the PVC snapshot and external stores to a consistent point.
3. Restore the exact image digest, chart version, Agent manifest, and runtime
   configuration used by that snapshot.
4. Start one replica, check `/ready`, verify the audit chain and representative
   run/artifact ownership, then run the live pilot with test identities.
5. Record recovery point and recovery time evidence before reopening traffic.

## Incident and rollback

- Configuration failure: inspect `/ready`, Secret injection, DNS/TLS, and the
  selected adapter endpoints. Do not disable authentication or scanning as a
  shortcut.
- Run or media failure: preserve the run/job ID, inspect structured logs and
  audit events, and retry only after confirming the operation is safe.
- n8n failure: verify review status, workflow allowlist, idempotency key, DTA
  scope headers, webhook credential, and downstream system permissions.
- Suspected cross-user access: remove traffic, preserve audit/SIEM evidence,
  rotate affected credentials, and rerun the A/B pilot matrix after remediation.
- Application regression: use `helm history` and `helm rollback`, restoring the
  PVC only when the data format changed and a tested restore is required.

Never increase replicas above one as an availability workaround. Horizontal
scaling requires distributed run ownership, session state, SSE replay, and
domain result persistence first.
