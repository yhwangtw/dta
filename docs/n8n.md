# n8n integration

DTA uses n8n as its visual workflow and business-system integration layer. Pi remains the Agent runtime; n8n workflows are approved tools that receive normalized, review-gated Agent results.

## Runtime configuration

```env
DTA_WORKFLOW_PROVIDER=n8n
DTA_ENABLE_WORKFLOW_TOOLS=true
N8N_BASE_URL=https://n8n.company.example
N8N_EDITOR_URL=https://n8n.company.example
N8N_API_KEY=replace-at-deployment
N8N_AUTH_HEADER=Authorization
N8N_AUTH_SCHEME=Bearer
N8N_TIMEOUT_MS=30000
N8N_WORKFLOW_MAP_JSON={"meeting-create-jira":"/webhook/meeting-create-jira","meeting-notify-teams":"/webhook/meeting-notify-teams","meeting-update-knowledge-base":"/webhook/meeting-update-knowledge-base","pm-create-jira-epic":"/webhook/pm-create-jira-epic","pm-publish-prd":"/webhook/pm-publish-prd","pm-notify-team":"/webhook/pm-notify-team"}
```

`N8N_EDITOR_URL` is optional and only adds an authenticated UI link to the visual builder. `N8N_BASE_URL` is the trusted webhook origin. Workflow map entries must resolve to that same origin, and redirects are rejected so DTA credentials cannot be forwarded to an unexpected host.

Keep Jira, Teams, Confluence, and other business-system credentials inside n8n's credential store. DTA only receives the credential needed to invoke approved webhooks.

## Build a workflow in n8n

1. Start with a Webhook trigger using `POST`.
2. Validate the DTA authentication header configured above.
3. Read the versioned DTA envelope from the request body.
4. Use normal n8n nodes to transform the result and call Jira, Teams, Wiki, or another approved system.
5. Use a Respond to Webhook node and return a JSON object with a 2xx status.
6. Publish the workflow and add its webhook path to `N8N_WORKFLOW_MAP_JSON`.
7. Add the logical workflow ID to the Agent's `workflowAllowlist` in the mounted Agent manifest.

DTA sends these headers on every invocation:

- `X-DTA-Workflow-Id`
- `X-DTA-Execution-Id`
- `Idempotency-Key`
- `X-DTA-Run-Id`
- `X-DTA-User-Id`
- `X-DTA-Actor-Id`
- `X-DTA-Project-Id` (when present)
- `X-DTA-Conversation-Id` (when present)

n8n must authenticate the DTA webhook credential and treat these scope headers as server-generated authorization context. Reject a missing run/user scope for user-owned workflows, and do not trust a caller-supplied `userId` from an arbitrary payload. Workflows should pass the idempotency key into downstream systems when they support one, or persist it before causing a side effect.

## Request envelope

```json
{
  "schemaVersion": "1.0",
  "execution": {
    "id": "execution-uuid",
    "idempotencyKey": "meeting-run:meeting-create-jira:1",
    "requestedAt": "2026-08-25T00:00:00.000Z",
    "requestedBy": "keycloak-subject",
    "reason": "Explicitly executed from the DTA result control plane."
  },
  "workflow": { "id": "meeting-create-jira" },
  "agent": {
    "id": "meeting-agent",
    "type": "meeting",
    "displayName": "Meeting Agent"
  },
  "source": {
    "runId": "meeting-run-id",
    "userId": "user-id",
    "projectId": "project-id",
    "conversationId": "conversation-id",
    "updatedAt": "2026-08-25T00:00:00.000Z",
    "revision": 1,
    "reviewStatus": "approved"
  },
  "result": {},
  "artifacts": [],
  "actions": []
}
```

Meeting workflows are blocked until the current result revision is approved. The result panels expose the configured catalog, execute workflows explicitly, show their status, and reuse completed idempotent executions instead of silently creating duplicate work.

## DTA endpoints

- `GET /api/workflows?agentId=meeting-agent&sourceRunId=<run-id>` lists allowlisted workflows and their execution state.
- `POST /api/workflows/<workflow-id>/execute` dispatches a review-gated workflow. The JSON body accepts only `agentId`, `sourceRunId`, and `reason`; DTA constructs the trusted result payload itself.

The workflow catalog is configuration-driven. DTA does not discover or enable arbitrary workflows from the n8n instance.

## Local preview

Use the mock provider to verify the UI and payload without changing external systems:

```env
DTA_WORKFLOW_PROVIDER=mock
DTA_ENABLE_WORKFLOW_TOOLS=true
```

Mock execution is disabled in production.
