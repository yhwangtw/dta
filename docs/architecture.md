# DTA Agent Platform Architecture

## Product boundary

Digital Transformation Agent (DTA) is a Meeting-first department Agent platform and human control plane. It owns the department's domain Agents, evidence, artifacts, review state, and execution history. A company Orchestrator may call it through a stable HTTP contract or A2A, but does not need to know which internal runtime performs the reasoning loop.

```text
Company Orchestrator / Web / TUI / CLI / REST
                 |
        Agent Contract or A2A v1
                 |
       Agent Registry + Run Supervisor
          /                    \
 Meeting Agent     PM Agent     Configured department Agents
          \                    /
           Generic AgentRuntime
                    |
              PiAgentRuntime
                    |
          existing RPC/session runtime
             /        |        \
         tools       n8n     artifact store
                               /       \
                            local     MinIO
```

Web, TUI, and batch CLI are clients of this platform, not the domain boundary.
They can be replaced independently without replacing Meeting Agent, PM Agent,
the external APIs, or the runtime adapters. Native `dta pi` is the explicit
developer exception: it enters Pi Coding Agent directly and does not claim to
activate DTA domain policy.

## Existing infrastructure retained

The refactor deliberately keeps the proven infrastructure:

- `lib/rpc-manager.ts`: Pi session lifecycle and command transport.
- `GET /api/agent/[id]/events`: existing Pi-compatible SSE for the current UI.
- conversation navigation, Markdown, tool cards, attention states, scheduling, files, Git, and artifacts.
- Pi-compatible session IDs and JSONL handling for internal compatibility.

The generic layer is additive. Pi-specific objects are not returned by the public Agent Contract or A2A routes.

## Generic Agent layer

| Layer | Main files | Responsibility |
|---|---|---|
| Identity | `lib/agents/agent-types.ts` | `AgentType`, `AgentMetadata`, generic events/actions |
| Catalog | `lib/agents/agent-registry.ts` | enabled Agents and canonical metadata |
| Runtime API | `lib/runtime/agent-runtime.ts` | runtime-neutral create/send/state/subscribe contract |
| Pi adapter | `lib/runtime/pi-agent-runtime.ts` | translates the contract to existing RPC sessions |
| Execution | `lib/agents/agent-execution-service.ts` | creates domain sessions without UI coupling |
| Run lifecycle | `lib/agent-run-supervisor.ts` | queue, concurrency, normalized events, results |
| Public contract | `lib/agents/agent-contract*.ts` | validates requests and returns framework-neutral responses |

Every generic run can carry `runId`, `agentId`, `userId`, `projectId`, and `conversationId`. Existing Pi session IDs remain internal execution identifiers.

### Mounted department Agent registry

`DTA_AGENT_MANIFEST_PATH` points to a versioned JSON manifest mounted at runtime. Manifest v2 adds input/output JSON Schemas, allowed artifact types, review policy, required Keycloak roles, provider/model/token/timeout policy, evaluation fixtures, Agent Card skills, and an explicit n8n workflow allowlist without rebuilding the image. REST and A2A contract input is checked before enqueue; `publish_department_result` checks output and artifact types. Provider/model allowlists are also enforced by the underlying Pi session before a prompt or model change, while the generic run supervisor enforces the timeout and the company-gateway contract enforces the token cap. DTA persists revisions and withholds actions/workflows until approval. `DTA_ENABLED_AGENTS` remains the deployment allowlist. REST, A2A, workspace creation, and workflow routes enforce `allowedRoles`; unauthenticated Agent Card discovery omits role-scoped Agents, while the authenticated catalog never returns private system prompts or workflow policy. See `config/agents.example.json`.

## Meeting Agent

Meeting Agent accepts chat, documents, audio, or video. Media processing is staged and auditable:

```text
upload -> source artifact -> persistent bounded media job
                           -> audio extraction/transcription
                           -> video keyframes/vision
                           -> aligned meeting context
                           -> Meeting Agent reasoning/tool loop
                           -> structured result + Markdown/JSON artifacts
                           -> human review
```

The MeetingResult 2.0 record contains summary, decisions, action items, and requirements. Every extracted item carries a stable ID, evidence references, bounded source-grounding confidence, and `needsConfirmation`. `publish_meeting_result` validates evidence artifact ownership and is the only publication path. A published revision defaults to `needs_review`; only `approved` revisions enter Meeting Knowledge or release downstream actions.

When requirements are detected, Meeting Agent creates a generic `handoff` recommendation for PM Agent. DTA does not execute the PM implementation inside Meeting Agent. The recommendation is withheld from external Agent Contract/A2A responses until the meeting revision is approved.

## PM Agent

PM Agent uses the same runtime with a dedicated system prompt and publication tool. It produces artifact references for URD, PRD, user stories, acceptance criteria, design context, and task plans. PM results have revision/review history like Meeting results; actions and workflows remain blocked until the current revision is approved.

## Configured Department Agents

Manifest-mounted Agents share the same run supervisor and Pi runtime but use a
governed `publish_department_result` tool. The tool validates the configured
output schema, restricts document types, persists structured JSON and document
artifacts, records review history, and applies the Agent workflow allowlist.
This keeps the platform extensible without turning prompts into an ungoverned
agent marketplace.

## External HTTP contract

```text
POST /api/agents/meeting/run
POST /api/agents/pm/run
GET  /api/agents
GET  /api/agent-runs/{runId}
GET  /api/agent-runs/{runId}/events
```

The POST body uses `requestId`, optional user/project/conversation IDs, `task`, `input`, and `context`. `requestId` is idempotent per authenticated user and Agent, so two users cannot receive each other's deduplicated run. SSE emits normalized run, status, tool, artifact, waiting, completion, and failure events.

## A2A v1 surface

```text
GET  /.well-known/agent-card.json
POST /a2a/v1/message:send
POST /a2a/v1/message:stream
GET  /a2a/v1/tasks
GET  /a2a/v1/tasks/{id}
POST /a2a/v1/tasks/{id}:cancel
GET or POST /a2a/v1/tasks/{id}:subscribe
```

The Agent Card advertises Meeting and PM skills and the configured Keycloak OpenID Connect security scheme. A2A objects are translated to the generic run model. Requests must send `A2A-Version: 1.0` (or the equivalent query parameter); missing versions are interpreted as legacy 0.3 and rejected by this 1.0-only interface. List Tasks uses authorization-scoped cursor pagination and omits artifacts unless `includeArtifacts=true`. Errors use the A2A `google.rpc.Status` JSON envelope. Remote URL and inline raw file parts are rejected to prevent server-side request forgery and unbounded JSON uploads; callers should upload media with `POST /api/meeting-agent/extract` and pass the returned artifact references.

## Authentication and authorization

`DTA_AUTH_MODE=keycloak` validates RS256 access tokens using Keycloak issuer discovery/JWKS, audience, time claims, subject, and configured realm/client roles. A reverse proxy may forward a token through `DTA_AUTH_TOKEN_HEADER`.

- `KEYCLOAK_REQUIRED_ROLES`: roles required for all external Agent/A2A calls.
- `DTA_CODING_REQUIRED_ROLES`: roles allowed to use Coding Agent, Pi extensions, schedules, File, Git, and repository APIs; defaults to `dta-coding-access`.
- `DTA_REVIEW_REQUIRED_ROLES`: roles allowed to approve or reject Meeting results.
- `dta-act-as-user`: permits a service principal to submit for another user.
- `dta-run-read-all`: permits reading runs owned by other users.
- `dta-artifact-delete`: permits an owner to delete artifacts through the API.
- `dta-audit-read`: permits reading the audit event stream.
- `dta-admin`: grants DTA operational administration.

Artifacts carry owner/run scope. Downloads are checked against the authenticated principal, and unknown legacy ownership is hidden unless the caller has an operational cross-user role. Meeting review also checks both reviewer role and run ownership. A configured upload scanner fails closed before a file enters the artifact store. Process-local rate limiting provides a second line of defense; company ingress limits remain recommended.

Pi session ownership is persisted under `DTA_DATA_DIR/metadata/sessions.json`. Every `/api/sessions/**` route, the legacy `/api/agent/**` command/state routes, and the SSE stream resolve that mapping before returning data. Tags, pins, archives, prompts, notification read-state, Web Push subscriptions, and schedules are user-scoped. A Meeting/PM principal cannot enable shell or coding tools through the generic command route. The deployed-image pilot statically covers every HTTP handler and performs a two-user live matrix over sessions, metadata, run/SSE, workflows, review, and personal state.

Legacy Pi sessions and schedules without ownership metadata are deliberately hidden from ordinary Keycloak users. Unowned schedules are not started automatically in Keycloak mode; an administrator must migrate or recreate them with an owner.

This is API protection, not a browser login implementation. In company deployment, protect the web UI with the company's Keycloak-aware ingress/auth proxy. Native browser `EventSource` cannot add an Authorization header, so the proxy must authenticate its browser cookie and overwrite `DTA_AUTH_TOKEN_HEADER` (for example `x-forwarded-access-token`) on both normal API requests and SSE requests. The DTA Service must not be directly reachable from untrusted networks.

## Configurable adapters

All environment-specific addresses and secrets are runtime configuration:

- LLM gateway: `LLM_*`; registered into the internal Pi model runtime without persisting the API key.
- authentication: `DTA_AUTH_*`, `KEYCLOAK_*`.
- artifacts: `DTA_ARTIFACT_STORE=local|minio`, `MINIO_*`.
- memory: `DTA_MEMORY_STORE=local|postgres|redis`, connection URL, TTL, and entry cap.
- workflows: `DTA_WORKFLOW_PROVIDER=none|mock|n8n`, `N8N_*`.
- transcription/vision: `DTA_TRANSCRIPTION_*`, `DTA_VISION_*`.
- governance: audit log, Prometheus metrics, upload scanner, rate limit, and retention policy.
- department catalog: mounted Agent manifest plus deployment allowlist.
- policy: enabled Agents, review roles, review requirement, workflow-tool enablement.
- paths: `DTA_DATA_DIR`, `DTA_AGENT_WORKSPACE`, `PI_CODING_AGENT_DIR`.

Secrets are read only from environment variables. The application has no direct Vault dependency.

## Persistence model

- Artifacts: local filesystem or MinIO through `ArtifactStore`.
- Conversation memory: local file, Postgres, or Redis `MemoryStore`, namespaced by user/project/conversation, capped and expired by configuration.
- Run/session ownership metadata: local persistent file state below `DTA_DATA_DIR`; event replay remains process-local.
- Meeting, PM, and configured Department Agent structured records: local DTA data directory.
- media jobs, workflow executions, and the local audit chain: local DTA data directory.

Postgres and Redis memory adapters are implemented. They do not yet replace the local run supervisor, Pi session ownership, Meeting/PM/Department record files, or SSE event bus, so the first production topology still remains one replica with a persistent volume.

## Current production limitations

1. Run supervision, Pi session ownership metadata, SSE replay, and Meeting/PM/Department result records are not distributed across replicas; use `replicas: 1`. Selecting Postgres/Redis memory does not remove this limit.
2. Active Pi runs are interrupted on pod restart and are not automatically replayed. Media job records survive, but an in-progress job is marked failed for an explicit bounded retry.
3. Local run/review records require a persistent volume even when artifacts use MinIO.
4. MinIO signing is covered by mocked contract tests but still needs an integration test against the company's MinIO policy/TLS setup.
5. A2A remote URL/raw media parts are not fetched; use DTA upload/reference flows.
6. Browser Keycloak login is delegated to the company ingress/auth proxy. DTA validates API tokens, run ownership, artifact ownership, and operational roles but does not implement a full IAM administration UI.
7. n8n workflow tools are disabled by default; enable them only after side-effect and credential policies are approved.
8. The bundled CLI and interactive TUI are HTTP/SSE clients, not second runtimes. They need a running DTA server. Meeting file uploads use the same bounded extraction endpoint as the Web UI; native `dta pi` is deliberately a separate developer-only Coding Agent mode.
9. Application rate limits and active-run concurrency are process-local. Enforce distributed quotas at the company gateway if DTA is later scaled beyond one replica.
10. Automatic retention can enumerate only the local artifact store. Production MinIO deployments must apply the equivalent bucket lifecycle/legal-hold policy. External memory and Pi JSONL session cleanup are delegated; local approved results and referenced Meeting evidence are protected by default.
11. Media uploads and provider calls are bounded but still buffer one file; chunked upload/transcription and distributed media workers are not implemented.
