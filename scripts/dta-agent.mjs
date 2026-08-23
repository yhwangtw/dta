#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  npm run agent -- meeting --task "Generate minutes" [--transcript notes.txt]
  npm run agent -- pm --task "Create a PRD" [--input input.json]

Options:
  --base-url URL       DTA server (default: DTA_BASE_URL or http://127.0.0.1:30141)
  --request-id ID      Idempotency key (default: generated UUID)
  --conversation ID    Conversation memory scope
  --project ID         Project scope
  --user ID            User ID; Keycloak policies still apply
  --input FILE          JSON object merged into input
  --transcript FILE     UTF-8 transcript added as input.transcript
  --token TOKEN         Bearer token (prefer DTA_ACCESS_TOKEN environment variable)
  --no-wait             Return immediately after the run is accepted
  --interval MS         Poll interval while waiting (default: 1500)
`);
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const [agent, ...rest] = argv;
  if (!agent || agent === "--help" || agent === "-h") usage();
  if (agent !== "meeting" && agent !== "pm") usage("Agent must be meeting or pm");
  const result = { agent, wait: true };
  for (let index = 0; index < rest.length; index++) {
    const name = rest[index];
    if (name === "--no-wait") { result.wait = false; continue; }
    if (!name.startsWith("--")) usage(`Unexpected argument: ${name}`);
    const value = rest[++index];
    if (!value) usage(`Missing value for ${name}`);
    result[name.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  if (!result.task) usage("--task is required");
  return result;
}

async function responseJson(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`DTA returned HTTP ${response.status}: ${text.slice(0, 500)}`); }
  if (!response.ok) throw new Error(`DTA returned HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = String(args.baseUrl || process.env.DTA_BASE_URL || "http://127.0.0.1:30141").replace(/\/+$/, "");
const token = args.token || process.env.DTA_ACCESS_TOKEN;
const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
let input = {};
if (args.input) {
  const parsed = JSON.parse(await readFile(args.input, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) usage("--input must contain a JSON object");
  input = parsed;
}
if (args.transcript) input.transcript = await readFile(args.transcript, "utf8");

let result = await responseJson(await fetch(`${baseUrl}/api/agents/${args.agent}/run`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    requestId: args.requestId || randomUUID(),
    task: args.task,
    ...(args.user ? { userId: args.user } : {}),
    ...(args.project ? { projectId: args.project } : {}),
    ...(args.conversation ? { conversationId: args.conversation } : {}),
    ...(Object.keys(input).length ? { input } : {}),
  }),
}));

if (args.wait) {
  const interval = Number.parseInt(args.interval || "1500", 10);
  if (!Number.isInteger(interval) || interval < 250 || interval > 60_000) usage("--interval must be between 250 and 60000");
  while (result.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, interval));
    result = await responseJson(await fetch(`${baseUrl}/api/agent-runs/${encodeURIComponent(result.runId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }));
  }
}

console.log(JSON.stringify(result, null, 2));
if (result.status === "failed") process.exitCode = 1;
