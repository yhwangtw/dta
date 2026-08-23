# DTA Agent Platform Architecture

## Product boundary

Digital Transformation Agent (DTA) is a Meeting-first department Agent platform and human control plane. It owns the department's domain Agents, evidence, artifacts, review state, and execution history. A company Orchestrator may call it through a stable HTTP contract or A2A, but does not need to know which internal runtime performs the reasoning loop.

```text
Company Orchestrator / CLI / DTA Web UI
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

The browser UI is a client of this platform, not the domain boundary. It can be replaced later without replacing Meeting Agent, PM Agent, the external APIs, or the runtime adapters.

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

`DTA_AGENT_MANIFEST_PATH` points to a versioned JSON manifest mounted at runtime. It can add department Agent identity, system prompt, Agent Card skills, and an explicit n8n workflow allowlist without changing or rebuilding the image. `DTA_ENABLED_AGENTS` remains the deployment allowlist. The public catalog never returns private system prompts or workflow policy.

## Meeting Agent

Meeting Agent accepts chat, documents, audio, or video. Media processing is staged and auditable:

```text
upload -> source artifact -> audio extraction/transcription
                           -> video keyframes/vision
                           -> aligned meeting context
                           -> Meeting Agent reasoning/tool loop
                           -> structured result + Markdown/JSON artifacts
                           -> human review
```

The structured result contains summary, decisions, action items, and requirements. `publish_meeting_result` is the only publication path. A published revision defaults to `needs_review`; only `approved` revisions enter Meeting Knowledge.

When requirements are detected, Meeting Agent creates a generic `handoff` recommendation for PM Agent. DTA does not execute the PM implementation inside Meeting Agent. The recommendation is withheld from external Agent Contract/A2A responses until the meeting revision is approved.

## PM Agent

PM Agent uses the same runtime with a dedicated system prompt and publication tool. It produces artifact references for URD, PRD, user stories, acceptance criteria, design context, and task plans. It may return workflow or notification recommendations, but integrations remain adapter-driven.

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
- `DTA_REVIEW_REQUIRED_ROLES`: roles allowed to approve or reject Meeting results.
- `dta-act-as-user`: permits a service principal to submit for another user.
- `dta-run-read-all`: permits reading runs owned by other users.
- `dta-artifact-delete`: permits an owner to delete artifacts through the API.
- `dta-audit-read`: permits reading the audit event stream.
- `dta-admin`: grants DTA operational administration.

Artifacts carry owner/run scope. Downloads are checked against the authenticated principal, and unknown legacy ownership is hidden unless the caller has an operational cross-user role. Meeting review also checks both reviewer role and run ownership. A configured upload scanner fails closed before a file enters the artifact store. Process-local rate limiting provides a second line of defense; company ingress limits remain recommended.

This is API protection, not a browser login implementation. In company deployment, protect the web UI with the company's Keycloak-aware ingress/auth proxy. Full application SSO and enterprise RBAC remain outside the current scope.

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
- Run/session ownership and event replay: local process/file state.
- Meeting and PM structured records: local DTA data directory.

Postgres and Redis memory adapters are implemented. They do not yet replace the local run supervisor, Pi session ownership, Meeting/PM record files, or SSE event bus, so the first production topology still remains one replica with a persistent volume.

## Current production limitations

1. Run supervision, Pi session ownership, SSE replay, and Meeting/PM result records are not distributed; use `replicas: 1`. Selecting Postgres/Redis memory does not remove this limit.
2. Active Pi runs are interrupted on pod restart and are not automatically replayed.
3. Local run/review records require a persistent volume even when artifacts use MinIO.
4. MinIO signing is covered by mocked contract tests but still needs an integration test against the company's MinIO policy/TLS setup.
5. A2A remote URL/raw media parts are not fetched; use DTA upload/reference flows.
6. Browser Keycloak login is delegated to the company ingress/auth proxy. DTA validates API tokens, run ownership, artifact ownership, and operational roles but does not implement a full IAM administration UI.
7. n8n workflow tools are disabled by default; enable them only after side-effect and credential policies are approved.
8. The bundled `npm run agent -- meeting|pm` CLI is an HTTP client, not a second runtime. It needs a running DTA server and currently accepts transcript/text/JSON input rather than binary media upload.
9. Application rate limits and active-run concurrency are process-local. Enforce distributed quotas at the company gateway if DTA is later scaled beyond one replica.
10. Automatic retention can enumerate only the local artifact store. Production MinIO deployments must apply the equivalent bucket lifecycle policy; approved Meeting artifacts are protected by default in local retention.
