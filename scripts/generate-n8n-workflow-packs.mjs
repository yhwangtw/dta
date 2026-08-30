#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const packs = [
  {
    id: "meeting-create-jira",
    name: "DTA Meeting — Create Jira Follow-up",
    url: "={{ $env.JIRA_BASE_URL + '/rest/api/3/issue' }}",
    auth: "={{ 'Bearer ' + $env.JIRA_API_TOKEN }}",
    build: "const e = $json.envelope; const action = e.result?.actionItems?.[0]; if (!action) throw new Error('No meeting action item is available'); return [{ json: { ...$json, payload: { fields: { project: { key: $env.JIRA_PROJECT_KEY }, issuetype: { name: 'Task' }, summary: action.title, description: action.description || e.result?.summary || '', assignee: action.owner ? { name: action.owner } : undefined, duedate: action.dueDate || undefined } } } }];",
  },
  {
    id: "meeting-notify-teams",
    name: "DTA Meeting — Notify Teams",
    url: "={{ $env.TEAMS_WEBHOOK_URL }}",
    build: "const e = $json.envelope; const title = e.result?.title || 'Meeting update'; const actions = (e.result?.actionItems || []).map((a) => `• ${a.title}${a.owner ? ` — ${a.owner}` : ''}`).join('\\n'); return [{ json: { ...$json, payload: { text: `**${title}**\\n\\n${e.result?.summary || ''}${actions ? `\\n\\n${actions}` : ''}` } } }];",
  },
  {
    id: "meeting-update-knowledge-base",
    name: "DTA Meeting — Update Knowledge Base",
    url: "={{ $env.KNOWLEDGE_BASE_WEBHOOK_URL }}",
    auth: "={{ 'Bearer ' + $env.KNOWLEDGE_BASE_API_TOKEN }}",
    build: "const e = $json.envelope; return [{ json: { ...$json, payload: { source: 'dta', kind: 'meeting', runId: e.source.runId, revision: e.source.revision, title: e.result?.title || 'Meeting minutes', result: e.result, artifacts: e.artifacts } } }];",
  },
  {
    id: "pm-create-jira-epic",
    name: "DTA PM — Create Jira Epic",
    url: "={{ $env.JIRA_BASE_URL + '/rest/api/3/issue' }}",
    auth: "={{ 'Bearer ' + $env.JIRA_API_TOKEN }}",
    build: "const e = $json.envelope; return [{ json: { ...$json, payload: { fields: { project: { key: $env.JIRA_PROJECT_KEY }, issuetype: { name: 'Epic' }, summary: e.result?.requirementSummary?.slice(0, 240) || 'DTA product requirement', description: `DTA source run: ${e.source.runId}` } } } }];",
  },
  {
    id: "pm-publish-prd",
    name: "DTA PM — Publish PRD",
    url: "={{ $env.KNOWLEDGE_BASE_WEBHOOK_URL }}",
    auth: "={{ 'Bearer ' + $env.KNOWLEDGE_BASE_API_TOKEN }}",
    build: "const e = $json.envelope; const prd = (e.artifacts || []).find((a) => a.type === 'prd'); if (!prd) throw new Error('No PRD artifact is available'); return [{ json: { ...$json, payload: { source: 'dta', kind: 'prd', runId: e.source.runId, revision: e.source.revision, requirementSummary: e.result?.requirementSummary, artifact: prd } } }];",
  },
  {
    id: "pm-notify-team",
    name: "DTA PM — Notify Team",
    url: "={{ $env.TEAMS_WEBHOOK_URL }}",
    build: "const e = $json.envelope; return [{ json: { ...$json, payload: { text: `**PM package approved**\\n\\n${e.result?.requirementSummary || ''}\\n\\nArtifacts: ${(e.artifacts || []).map((a) => a.title).join(', ')}` } } }];",
  },
];

function id(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function validateCode(workflowId) {
  return [
    "const request = $input.first().json;",
    "const headers = request.headers ?? {};",
    "const envelope = request.body ?? {};",
    "const required = ['x-dta-workflow-id','x-dta-execution-id','idempotency-key','x-dta-run-id','x-dta-user-id','x-dta-actor-id'];",
    "const missing = required.filter((name) => typeof headers[name] !== 'string' || !headers[name].trim());",
    "if (missing.length) throw new Error(`Missing DTA scope headers: ${missing.join(', ')}`);",
    `if (headers['x-dta-workflow-id'] !== '${workflowId}') throw new Error('Unexpected DTA workflow id');`,
    "if (envelope.schemaVersion !== '1.0') throw new Error('Unsupported DTA envelope version');",
    "if (envelope.source?.runId !== headers['x-dta-run-id']) throw new Error('Run scope mismatch');",
    "if (envelope.source?.userId !== headers['x-dta-user-id']) throw new Error('User scope mismatch');",
    "if (envelope.execution?.id !== headers['x-dta-execution-id']) throw new Error('Execution scope mismatch');",
    "if (envelope.execution?.idempotencyKey !== headers['idempotency-key']) throw new Error('Idempotency scope mismatch');",
    "if (envelope.source?.reviewStatus !== 'approved') throw new Error('DTA result is not approved');",
    "return [{ json: { envelope, scope: { workflowId: headers['x-dta-workflow-id'], runId: headers['x-dta-run-id'], userId: headers['x-dta-user-id'], actorId: headers['x-dta-actor-id'], executionId: headers['x-dta-execution-id'], idempotencyKey: headers['idempotency-key'] } } }];",
  ].join("\n");
}

function workflow(pack) {
  const webhook = "DTA Webhook";
  const validate = "Validate DTA Scope";
  const build = "Build Integration Payload";
  const dispatch = "Dispatch Approved Action";
  const respond = "Return Execution Evidence";
  const headers = [{ name: "Idempotency-Key", value: "={{ $json.scope.idempotencyKey }}" }];
  if (pack.auth) headers.push({ name: "Authorization", value: pack.auth });
  return {
    name: pack.name,
    nodes: [
      { parameters: { httpMethod: "POST", path: pack.id, responseMode: "responseNode", options: {} }, id: id(`${pack.id}:webhook`), name: webhook, type: "n8n-nodes-base.webhook", typeVersion: 2, position: [-520, 0], webhookId: pack.id },
      { parameters: { jsCode: validateCode(pack.id) }, id: id(`${pack.id}:validate`), name: validate, type: "n8n-nodes-base.code", typeVersion: 2, position: [-300, 0] },
      { parameters: { jsCode: pack.build }, id: id(`${pack.id}:build`), name: build, type: "n8n-nodes-base.code", typeVersion: 2, position: [-80, 0] },
      { parameters: { method: "POST", url: pack.url, sendHeaders: true, headerParameters: { parameters: headers }, sendBody: true, contentType: "raw", rawContent: "={{ JSON.stringify($json.payload) }}", options: { timeout: 60000 } }, id: id(`${pack.id}:dispatch`), name: dispatch, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [140, 0] },
      { parameters: { respondWith: "json", responseBody: `={{ { ok: true, workflowId: '${pack.id}', executionId: $('Build Integration Payload').item.json.scope.executionId, targetStatus: $json.statusCode || 200 } }}`, options: {} }, id: id(`${pack.id}:respond`), name: respond, type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.4, position: [360, 0] },
    ],
    pinData: {},
    connections: {
      [webhook]: { main: [[{ node: validate, type: "main", index: 0 }]] },
      [validate]: { main: [[{ node: build, type: "main", index: 0 }]] },
      [build]: { main: [[{ node: dispatch, type: "main", index: 0 }]] },
      [dispatch]: { main: [[{ node: respond, type: "main", index: 0 }]] },
    },
    active: false,
    settings: { executionOrder: "v1" },
    versionId: id(`${pack.id}:version`),
    meta: { templateCredsSetupCompleted: false, dtaWorkflowSchemaVersion: "1.0" },
    tags: [],
  };
}

const output = resolve(process.cwd(), "deploy/n8n");
mkdirSync(output, { recursive: true });
for (const pack of packs) writeFileSync(resolve(output, `${pack.id}.json`), `${JSON.stringify(workflow(pack), null, 2)}\n`);
console.log(`Generated ${packs.length} inactive n8n workflow packs in ${output}`);
