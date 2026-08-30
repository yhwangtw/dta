import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import {
  formatPilotReadinessMarkdown,
  formatPilotReadinessReport,
  PILOT_WORKFLOW_ID,
  runCompanyPilotReadiness,
} from "./dta-pilot-readiness.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const BOOLEAN_OPTIONS = new Set([
  "approve",
  "changes",
  "dev",
  "help",
  "json",
  "live",
  "no-stream",
  "no-wait",
  "quiet",
  "reject",
  "request-changes",
]);
const REPEAT_OPTIONS = new Set(["attach", "file"]);

const ANSI = {
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  purple: "\u001b[38;5;99m",
  green: "\u001b[38;5;35m",
  amber: "\u001b[38;5;178m",
  red: "\u001b[38;5;160m",
  cyan: "\u001b[38;5;37m",
  reset: "\u001b[0m",
  clear: "\u001b[2J\u001b[H",
};

export class CliUsageError extends Error {}

function color(enabled, value, text) {
  return enabled ? `${value}${text}${ANSI.reset}` : text;
}

function kebabToCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseOptions(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (argument === "-h") {
      options.help = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const separator = argument.indexOf("=");
    const rawName = argument.slice(2, separator === -1 ? undefined : separator);
    const name = kebabToCamel(rawName);
    if (BOOLEAN_OPTIONS.has(rawName)) {
      options[name] = true;
      continue;
    }
    const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
    if (value === undefined || value === "") throw new CliUsageError(`Missing value for --${rawName}`);
    if (REPEAT_OPTIONS.has(rawName)) {
      options[name] = [...(options[name] ?? []), value];
    } else {
      options[name] = value;
    }
  }
  return { options, positionals };
}

function ensureKnownOptions(options, allowed) {
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) throw new CliUsageError(`Unsupported option: --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
}

function commonAllowed(...extra) {
  return new Set(["baseUrl", "help", "json", "token", ...extra]);
}

export function parseCommandLine(argv) {
  const input = [...argv];
  let command = input.shift();
  if (command === "help") {
    return { command: "help", topic: input[0], options: {}, positionals: input.slice(1) };
  }
  if (!command || command === "--help" || command === "-h") {
    return { command: "help", options: {}, positionals: [] };
  }
  if (command === "--version" || command === "-V" || command === "version") {
    return { command: "version", options: {}, positionals: [] };
  }
  if (command === "meeting" || command === "pm") {
    input.unshift(command);
    command = "run";
  }
  if (command === "chat") command = "tui";
  if (command === "coding") command = "pi";
  if (command === "web") command = "serve";
  if (command === "pi") return { command, passthrough: input, options: {}, positionals: [] };

  const parsed = parseOptions(input);
  if (parsed.options.help) return { command: "help", topic: command, ...parsed };
  return { command, ...parsed };
}

export function usage(topic) {
  const heading = "Digital Transformation Agent — one core, multiple entry points";
  const common = `

Common options:
  --base-url URL       DTA server (DTA_BASE_URL or http://127.0.0.1:30141)
  --token TOKEN         Keycloak bearer token (prefer DTA_ACCESS_TOKEN)
  --json                Machine-readable output where supported`;
  const sections = {
    run: `Usage:
  dta run meeting --task "Generate meeting minutes" --transcript notes.txt
  dta run meeting --task "Analyze this recording" --file meeting.mp4
  dta run pm --task "Create a PRD" --input requirement.json

Options:
  --task TEXT           Required Agent task
  --transcript FILE     UTF-8 transcript added to input.transcript
  --input FILE          JSON object merged into Agent input
  --file FILE           Upload a Meeting source; repeatable
  --conversation ID     Conversation memory scope
  --project ID          Project scope
  --user ID             Acting user scope; server policies still apply
  --request-id ID       Idempotency key (default: generated UUID)
  --no-stream           Poll instead of showing normalized SSE events
  --no-wait             Return after the run is accepted
  --interval MS         Poll interval (250–60000, default: 1500)${common}`,
    tui: `Usage:
  dta tui [meeting|pm]
  dta chat [meeting|pm]

Interactive commands:
  /agent meeting|pm     Switch domain Agent
  /new [conversation]   Start a fresh conversation scope
  /attach PATH          Upload a Meeting source for the next message
  /sessions             List recent domain runs
  /result RUN_ID        Show a structured result
  /review RUN_ID        Review a Meeting result
  /help                 Show interactive help
  /quit                 Exit${common}`,
    sessions: `Usage:
  dta sessions [--agent meeting|pm] [--status STATUS] [--limit 20]
  dta runs [same options]${common}`,
    review: `Usage:
  dta review RUN_ID --approve [--comment TEXT]
  dta review RUN_ID --request-changes --comment TEXT
  dta review RUN_ID --reject --comment TEXT

Without a decision, an interactive terminal prompts for one.${common}`,
    serve: `Usage:
  dta serve [--port 30141] [--hostname 0.0.0.0]
  dta serve --dev

Starts the same DTA server used by Web, CLI, TUI, REST, and A2A.`,
    pi: `Usage:
  dta pi [Pi CLI arguments]
  dta coding [Pi CLI arguments]

Launches the native Pi Coding Agent terminal. This developer entry point is
separate from DTA Meeting/PM Agents and intentionally exposes Pi behavior.`,
    "pilot-check": `Usage:
  dta pilot-check [--base-url URL] [--token TOKEN]
  dta pilot-check --live --secondary-token TOKEN --report pilot-report.json

Preflight verifies DTA health/readiness, Keycloak discovery and token handling,
and the selected company adapters without creating data or calling the model.

--live additionally performs a MinIO artifact round trip, a real Meeting Agent
LLM run over normalized SSE, User A/User B isolation, Meeting approval, and the
review-gated ${PILOT_WORKFLOW_ID} n8n probe with an idempotent replay.

Options:
  --live               Run the full company pilot verification
  --secondary-token    A second Keycloak user's token (or DTA_SECONDARY_ACCESS_TOKEN)
  --workflow ID        Dedicated no-side-effect n8n probe workflow
  --timeout MS         Live run timeout, 10000–900000 (default: 180000)
  --report FILE        Write a redacted JSON report, or Markdown for a .md path
  --quiet              Do not print per-check progress${common}`,
  };
  if (topic && sections[topic]) return `${heading}\n\n${sections[topic]}`;
  return `${heading}

Usage:
  dta serve                         Start the DTA Web/API server
  dta tui [meeting|pm]              Interactive terminal Agent experience
  dta run meeting|pm [options]      One-shot/batch Agent run
  dta sessions [options]            List domain conversations and runs
  dta review RUN_ID [options]       Human review for Meeting results
  dta agents                        List enabled public Agents
  dta health                        Check liveness and readiness
  dta pilot-check [--live]          Produce company pilot readiness evidence
  dta pi [args]                     Native Pi Coding Agent CLI

Compatibility:
  dta meeting --task "..."          Alias for dta run meeting
  npm run agent -- meeting ...      Existing source-checkout command

Run dta help <command> for details.${common}`;
}

function errorMessage(payload, status) {
  const error = payload?.error;
  if (typeof error === "string") return error;
  if (error && typeof error.message === "string") return error.message;
  return `DTA returned HTTP ${status}`;
}

async function responseJson(response) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`DTA returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  if (!response.ok) throw new Error(`DTA returned HTTP ${response.status}: ${errorMessage(body, response.status)}`);
  return body;
}

export class SseDecoder {
  constructor() {
    this.buffer = "";
  }

  push(chunk) {
    this.buffer += chunk;
    const events = [];
    let match;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const parsed = this.parseBlock(block);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  finish() {
    const parsed = this.parseBlock(this.buffer);
    this.buffer = "";
    return parsed ? [parsed] : [];
  }

  parseBlock(block) {
    if (!block.trim() || block.trimStart().startsWith(":")) return null;
    let id;
    let event = "message";
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1 ? "" : line.slice(separator + 1).replace(/^ /, "");
      if (field === "id") id = value;
      else if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length === 0) return null;
    const raw = data.join("\n");
    let payload = raw;
    try { payload = JSON.parse(raw); } catch { /* retain text payload */ }
    return { id, event, data: payload };
  }
}

export class DtaClient {
  constructor({ baseUrl, token, fetchImpl = fetch }) {
    this.baseUrl = String(baseUrl || "http://127.0.0.1:30141").replace(/\/+$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  headers(json = false) {
    return {
      Accept: "application/json",
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async get(path) {
    return responseJson(await this.fetchImpl(`${this.baseUrl}${path}`, { headers: this.headers() }));
  }

  async post(path, body) {
    return responseJson(await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
    }));
  }

  run(agent, request) {
    return this.post(`/api/agents/${encodeURIComponent(agent)}/run`, request);
  }

  getRun(runId) {
    return this.get(`/api/agent-runs/${encodeURIComponent(runId)}`);
  }

  listRuns({ limit = 20, status, query } = {}) {
    const search = new URLSearchParams({ limit: String(limit) });
    if (status) search.set("status", status);
    if (query) search.set("q", query);
    return this.get(`/api/agent-runs?${search}`);
  }

  listAgents() {
    return this.get("/api/agents");
  }

  review(runId, decision, comment) {
    return this.post(`/api/meeting-agent/runs/${encodeURIComponent(runId)}/review`, {
      decision,
      ...(comment ? { comment } : {}),
    });
  }

  async uploadMeetingFiles(paths, { projectId, conversationId } = {}) {
    const form = new FormData();
    if (projectId) form.append("projectId", projectId);
    if (conversationId) form.append("conversationId", conversationId);
    for (const path of paths) {
      const data = await readFile(path);
      form.append("files", new File([data], basename(path), { type: mimeTypeForPath(path) }));
    }
    const response = await this.fetchImpl(`${this.baseUrl}/api/meeting-agent/extract`, {
      method: "POST",
      headers: this.headers(),
      body: form,
    });
    const payload = await responseJson(response);
    if (!Array.isArray(payload.results)) return payload;
    const results = [];
    for (const item of payload.results) {
      if (!item?.jobId) {
        results.push(item);
        continue;
      }
      results.push(await this.waitForMeetingMediaJob(item.jobId));
    }
    return { ...payload, results };
  }

  async waitForMeetingMediaJob(jobId, timeoutMs = 30 * 60_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const payload = await this.get(`/api/meeting-agent/media-jobs/${encodeURIComponent(jobId)}`);
      const job = payload.job;
      if (!job) throw new Error(`Meeting media job ${jobId} was not returned`);
      if (job.status === "completed" && job.result) return job.result;
      if (job.status === "failed" || job.status === "cancelled") {
        return job.result ?? { name: job.name || jobId, size: job.size || 0, ok: false, jobId, error: job.error || "Meeting media processing failed" };
      }
      await sleep(1000);
    }
    throw new Error(`Meeting media job ${jobId} timed out`);
  }

  async *streamRun(runId) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/agent-runs/${encodeURIComponent(runId)}/events`, {
      headers: { ...this.headers(), Accept: "text/event-stream" },
    });
    if (!response.ok || !response.body) throw new Error(`Unable to stream DTA run (${response.status})`);
    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    const sse = new SseDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const event of sse.push(textDecoder.decode(value, { stream: true }))) yield event;
      }
      for (const event of sse.push(textDecoder.decode())) yield event;
      for (const event of sse.finish()) yield event;
    } finally {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
  }
}

function mimeTypeForPath(path) {
  const extension = path.toLocaleLowerCase().split(".").pop();
  return ({
    txt: "text/plain", md: "text/markdown", markdown: "text/markdown", csv: "text/csv",
    json: "application/json", jsonl: "application/x-ndjson", srt: "application/x-subrip",
    vtt: "text/vtt", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
    flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/opus",
    mp4: "video/mp4", m4v: "video/x-m4v", webm: "video/webm", mov: "video/quicktime",
  })[extension] || "application/octet-stream";
}

function configForOptions(options) {
  return {
    baseUrl: options.baseUrl || process.env.DTA_BASE_URL || "http://127.0.0.1:30141",
    token: options.token || process.env.DTA_ACCESS_TOKEN,
  };
}

function clientForOptions(options, overrides = {}) {
  return new DtaClient({ ...configForOptions(options), ...overrides });
}

function validateAgent(agent) {
  if (agent !== "meeting" && agent !== "pm") throw new CliUsageError("Agent must be meeting or pm");
  return agent;
}

function parseInterval(value) {
  const interval = Number.parseInt(value || "1500", 10);
  if (!Number.isInteger(interval) || interval < 250 || interval > 60_000) {
    throw new CliUsageError("--interval must be between 250 and 60000");
  }
  return interval;
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function eventSummary(event) {
  const data = event?.data;
  if (!data || typeof data !== "object") return String(data ?? event?.event ?? "event");
  switch (data.type || event.event) {
    case "run_started": return `Run started · ${data.runId ?? ""}`.trim();
    case "status": return data.message || "Agent is working";
    case "tool_started": return `Tool started · ${data.tool}`;
    case "tool_completed": return `Tool completed · ${data.tool}`;
    case "artifact_created": return `Artifact created · ${data.artifactType ?? "artifact"}`;
    case "waiting_for_input": return `Waiting for input · ${data.prompt ?? ""}`.trim();
    case "completed": return "Agent run completed";
    case "failed": return `Agent run failed · ${data.error ?? "unknown error"}`;
    default: return data.message || String(data.type || event.event || "event");
  }
}

async function waitForRun(client, initial, { interval, stream, onEvent }) {
  let result = initial;
  if (result.status !== "running") return result;
  if (stream) {
    try {
      for await (const event of client.streamRun(result.runId)) {
        onEvent?.(event);
        const type = event?.data?.type || event.event;
        if (type === "completed" || type === "failed" || type === "waiting_for_input") break;
      }
      result = await client.getRun(result.runId);
    } catch (error) {
      onEvent?.({ event: "status", data: { type: "status", message: `Event stream unavailable; polling (${error.message})` } });
    }
  }
  while (result.status === "running") {
    await sleep(interval);
    result = await client.getRun(result.runId);
  }
  return result;
}

function attachmentInput(results) {
  return results.filter((item) => item?.ok).map((item) => ({
    name: item.name,
    kind: item.kind,
    ...(item.content ? { content: item.content } : {}),
    ...(item.artifactId ? { artifactId: item.artifactId } : {}),
    ...(item.transcriptArtifactId ? { transcriptArtifactId: item.transcriptArtifactId } : {}),
    ...(item.audioArtifactId ? { audioArtifactId: item.audioArtifactId } : {}),
    ...(item.visualAnalysisArtifactId ? { visualAnalysisArtifactId: item.visualAnalysisArtifactId } : {}),
    ...(item.timelineArtifactId ? { timelineArtifactId: item.timelineArtifactId } : {}),
    ...(item.jobId ? { jobId: item.jobId } : {}),
    ...(item.warnings?.length ? { warnings: item.warnings } : {}),
  }));
}

async function buildRunInput(client, agent, options) {
  let input = {};
  if (options.input) {
    const parsed = JSON.parse(await readFile(options.input, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CliUsageError("--input must contain a JSON object");
    }
    input = parsed;
  }
  if (options.transcript) input.transcript = await readFile(options.transcript, "utf8");
  if (options.title) input.title = options.title;
  if (options.language) input.outputLanguage = options.language;
  const files = [...(options.file ?? []), ...(options.attach ?? [])];
  if (files.length > 0) {
    if (agent !== "meeting") throw new CliUsageError("--file/--attach are currently supported by Meeting Agent only");
    const uploaded = await client.uploadMeetingFiles(files, {
      projectId: options.project,
      conversationId: options.conversation || options.conversationId,
    });
    const failed = uploaded.results?.filter((item) => !item.ok) ?? [];
    if (failed.length > 0) throw new Error(failed.map((item) => `${item.name}: ${item.error}`).join(" · "));
    input.attachments = [...(Array.isArray(input.attachments) ? input.attachments : []), ...attachmentInput(uploaded.results ?? [])];
  }
  return input;
}

async function runAgentCommand(parsed, io) {
  ensureKnownOptions(parsed.options, commonAllowed(
    "attach", "conversation", "conversationId", "file", "input", "interval", "language",
    "noStream", "noWait", "project", "requestId", "task", "title", "transcript", "user",
  ));
  const agent = validateAgent(parsed.positionals[0] || parsed.options.agent);
  if (parsed.positionals.length > 1) throw new CliUsageError("Unexpected positional arguments for run");
  if (!parsed.options.task) throw new CliUsageError("--task is required");
  const client = clientForOptions(parsed.options);
  const input = await buildRunInput(client, agent, parsed.options);
  let result = await client.run(agent, {
    requestId: parsed.options.requestId || randomUUID(),
    task: parsed.options.task,
    ...(parsed.options.user ? { userId: parsed.options.user } : {}),
    ...(parsed.options.project ? { projectId: parsed.options.project } : {}),
    ...(parsed.options.conversation || parsed.options.conversationId
      ? { conversationId: parsed.options.conversation || parsed.options.conversationId }
      : {}),
    ...(Object.keys(input).length ? { input } : {}),
  });
  if (!parsed.options.noWait) {
    const progress = (event) => io.stderr.write(`${color(io.stderr.isTTY, ANSI.dim, "DTA")} ${eventSummary(event)}\n`);
    result = await waitForRun(client, result, {
      interval: parseInterval(parsed.options.interval),
      stream: !parsed.options.noStream,
      onEvent: progress,
    });
  }
  io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "failed") io.setExitCode(1);
}

function clipped(value, width) {
  const text = String(value ?? "").replace(/\s+/g, " ");
  return text.length <= width ? text.padEnd(width) : `${text.slice(0, Math.max(1, width - 1))}…`;
}

function filterRuns(runs, agent) {
  if (!agent) return runs.filter((run) => run.agentMetadata && run.agentMetadata.agentType !== "coding");
  return runs.filter((run) => run.agentMetadata?.agentType === agent || run.agentMetadata?.agentId === `${agent}-agent`);
}

export function formatRuns(runs, { colorEnabled = false } = {}) {
  if (!runs.length) return "No DTA Agent runs found.";
  const header = `${clipped("STATUS", 18)} ${clipped("AGENT", 13)} ${clipped("CONVERSATION", 20)} ${clipped("CREATED", 17)} NAME`;
  const divider = "─".repeat(Math.min(110, header.length + 25));
  const rows = runs.map((run) => {
    const statusText = clipped(run.status, 18);
    const status = run.status === "completed" ? color(colorEnabled, ANSI.green, statusText)
      : run.status === "failed" ? color(colorEnabled, ANSI.red, statusText)
        : run.status === "waiting_for_input" ? color(colorEnabled, ANSI.amber, statusText)
          : color(colorEnabled, ANSI.cyan, statusText);
    const created = run.createdAt ? new Date(run.createdAt).toISOString().slice(0, 16).replace("T", " ") : "";
    return `${status} ${clipped(run.agentMetadata?.agentType || "agent", 13)} ${clipped(run.agentMetadata?.conversationId || run.id, 20)} ${clipped(created, 17)} ${run.name || "Untitled"}`;
  });
  return [header, divider, ...rows].join("\n");
}

async function sessionsCommand(parsed, io) {
  ensureKnownOptions(parsed.options, commonAllowed("agent", "limit", "query", "status"));
  const limit = Number.parseInt(parsed.options.limit || "20", 10);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new CliUsageError("--limit must be between 1 and 200");
  if (parsed.options.agent) validateAgent(parsed.options.agent);
  const response = await clientForOptions(parsed.options).listRuns({
    limit,
    status: parsed.options.status,
    query: parsed.options.query,
  });
  const runs = filterRuns(response.runs ?? [], parsed.options.agent);
  if (parsed.options.json) io.stdout.write(`${JSON.stringify({ ...response, runs }, null, 2)}\n`);
  else io.stdout.write(`${formatRuns(runs, { colorEnabled: io.stdout.isTTY })}\n`);
}

function decisionFromOptions(options, positional) {
  const selected = [options.approve, options.changes || options.requestChanges, options.reject].filter(Boolean).length;
  if (selected > 1) throw new CliUsageError("Choose only one review decision");
  if (options.approve) return "approved";
  if (options.changes || options.requestChanges) return "changes_requested";
  if (options.reject) return "rejected";
  if (["approved", "approve"].includes(positional)) return "approved";
  if (["changes", "changes_requested", "request_changes"].includes(positional)) return "changes_requested";
  if (["reject", "rejected"].includes(positional)) return "rejected";
  return undefined;
}

async function promptForReview(io, currentDecision, currentComment) {
  if (!io.stdin.isTTY || !io.stdout.isTTY) throw new CliUsageError("A review decision is required in non-interactive mode");
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    let decision = currentDecision;
    if (!decision) {
      const answer = (await rl.question("Decision [a]pprove, [c]hanges, [r]eject: ")).trim().toLowerCase();
      decision = decisionFromOptions({}, answer === "a" ? "approve" : answer === "c" ? "changes" : answer === "r" ? "reject" : answer);
    }
    if (!decision) throw new CliUsageError("Unknown review decision");
    let comment = currentComment;
    if (!comment && decision !== "approved") comment = (await rl.question("Review comment (required): ")).trim();
    return { decision, comment };
  } finally {
    rl.close();
  }
}

async function reviewCommand(parsed, io) {
  ensureKnownOptions(parsed.options, commonAllowed("approve", "changes", "comment", "reject", "requestChanges"));
  const runId = parsed.positionals[0];
  if (!runId) throw new CliUsageError("RUN_ID is required");
  if (parsed.positionals.length > 2) throw new CliUsageError("Unexpected positional arguments for review");
  let decision = decisionFromOptions(parsed.options, parsed.positionals[1]);
  let comment = parsed.options.comment;
  if (!decision || (!comment && decision !== "approved")) {
    ({ decision, comment } = await promptForReview(io, decision, comment));
  }
  if (!comment && decision !== "approved") throw new CliUsageError("--comment is required when requesting changes or rejecting");
  const response = await clientForOptions(parsed.options).review(runId, decision, comment);
  if (parsed.options.json) io.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  else io.stdout.write(`Meeting result ${runId} → ${response.meetingRun?.reviewStatus || decision} (revision ${response.meetingRun?.revision ?? "?"})\n`);
}

function renderList(title, items, renderItem) {
  if (!items?.length) return [];
  return [title, ...items.map((item, index) => `  ${index + 1}. ${renderItem(item)}`)];
}

export function formatAgentResponse(response, { colorEnabled = false } = {}) {
  const lines = [];
  const statusColor = response.status === "completed" ? ANSI.green : response.status === "failed" ? ANSI.red : ANSI.amber;
  lines.push(`${color(colorEnabled, ANSI.bold, "DTA result")} · ${color(colorEnabled, statusColor, response.status)} · ${response.runId}`);
  if (response.review) lines.push(`Review: ${response.review.status} · revision ${response.review.revision}`);
  const result = response.result;
  if (result && typeof result === "object") {
    if (result.title) lines.push(`\n${color(colorEnabled, ANSI.bold, result.title)}`);
    if (result.summary) lines.push(`\n${result.summary}`);
    if (result.requirementSummary) lines.push(`\n${result.requirementSummary}`);
    lines.push(...renderList("\nDecisions", result.decisions, (item) => `${item.text}${item.owner ? ` · ${item.owner}` : ""}`));
    lines.push(...renderList("\nAction items", result.actionItems, (item) => `${item.title}${item.owner ? ` · ${item.owner}` : ""}${item.dueDate ? ` · ${item.dueDate}` : ""}`));
    lines.push(...renderList("\nRequirements", result.requirements, (item) => `${item.title}${item.description ? ` — ${item.description}` : ""}`));
    lines.push(...renderList("\nPM artifacts", result.artifacts, (item) => `${item.type || "artifact"} · ${item.title || item.artifactId}`));
  }
  lines.push(...renderList("\nArtifacts", response.artifacts, (item) => `${item.type || item.mimeType || "artifact"} · ${item.title || item.id}`));
  lines.push(...renderList("\nRecommended actions", response.actions, (item) => `${item.type}${item.target ? ` → ${item.target}` : ""}${item.reason ? ` · ${item.reason}` : ""}`));
  if (response.error) lines.push(`\n${color(colorEnabled, ANSI.red, `${response.error.code}: ${response.error.message}`)}`);
  return lines.join("\n");
}

function tuiHelp() {
  return `Commands:
  /agent meeting|pm       switch Agent
  /new [conversation-id]  start a new conversation scope
  /attach PATH            upload a source for the next Meeting message
  /attachments            show queued attachments
  /sessions               show recent Agent runs
  /result RUN_ID          fetch a structured result
  /review RUN_ID [a|c|r]  approve, request changes, or reject
  /clear                  clear the terminal
  /help                   show this help
  /quit                   exit`;
}

function tuiBanner(agent, conversationId, io) {
  const width = Math.max(56, Math.min(io.stdout.columns || 88, 110));
  const title = ` DTA · ${agent.toUpperCase()} AGENT `;
  const top = `╭${"─".repeat(Math.max(0, width - 2))}╮`;
  const middle = `│${title}${" ".repeat(Math.max(0, width - title.length - 2))}│`;
  const scope = ` Conversation · ${conversationId} `;
  const scopeLine = `│${scope}${" ".repeat(Math.max(0, width - scope.length - 2))}│`;
  const bottom = `╰${"─".repeat(Math.max(0, width - 2))}╯`;
  return color(io.stdout.isTTY, ANSI.purple, [top, middle, scopeLine, bottom].join("\n"));
}

async function tuiReview(client, words, io, lastRunId) {
  const runId = words.shift() || lastRunId;
  if (!runId) throw new CliUsageError("Use /review RUN_ID [a|c|r]");
  const raw = words.shift();
  let decision = raw === "a" ? "approved" : raw === "c" ? "changes_requested" : raw === "r" ? "rejected" : decisionFromOptions({}, raw);
  let comment = words.join(" ").trim();
  if (!decision || (!comment && decision !== "approved")) {
    ({ decision, comment } = await promptForReview(io, decision, comment));
  }
  const response = await client.review(runId, decision, comment);
  io.stdout.write(`Review saved · ${response.meetingRun.reviewStatus} · revision ${response.meetingRun.revision}\n`);
}

async function tuiCommand(parsed, io) {
  ensureKnownOptions(parsed.options, commonAllowed("agent", "conversation", "conversationId", "project", "user"));
  if (!io.stdin.isTTY || !io.stdout.isTTY) throw new CliUsageError("dta tui requires an interactive terminal; use dta run for scripts");
  let agent = validateAgent(parsed.positionals[0] || parsed.options.agent || "meeting");
  if (parsed.positionals.length > 1) throw new CliUsageError("Unexpected positional arguments for tui");
  let conversationId = parsed.options.conversation || parsed.options.conversationId || `cli-${randomUUID()}`;
  let attachments = [];
  let lastRunId;
  const client = clientForOptions(parsed.options);
  await client.listAgents();
  io.stdout.write(`${ANSI.clear}${tuiBanner(agent, conversationId, io)}\n`);
  io.stdout.write(`${color(true, ANSI.dim, "Type a message or /help. Ctrl+C exits.")}\n\n`);
  const rl = createInterface({ input: io.stdin, output: io.stdout, terminal: true, historySize: 100 });
  let closed = false;
  rl.on("SIGINT", () => {
    closed = true;
    rl.close();
  });
  try {
    while (!closed) {
      let line;
      try { line = (await rl.question(`${color(true, ANSI.purple, `${agent} ›`)} `)).trim(); }
      catch { break; }
      if (!line) continue;
      if (line.startsWith("/")) {
        const [command, ...words] = line.slice(1).match(/(?:[^\s"]+|"[^"]*")+/g)?.map((word) => word.replace(/^"|"$/g, "")) ?? [];
        try {
          if (command === "quit" || command === "exit" || command === "q") break;
          if (command === "help" || command === "?") io.stdout.write(`${tuiHelp()}\n`);
          else if (command === "clear") io.stdout.write(`${ANSI.clear}${tuiBanner(agent, conversationId, io)}\n`);
          else if (command === "agent") {
            agent = validateAgent(words[0]);
            attachments = [];
            io.stdout.write(`Active Agent → ${agent}\n`);
          } else if (command === "new") {
            conversationId = words[0] || `cli-${randomUUID()}`;
            attachments = [];
            lastRunId = undefined;
            io.stdout.write(`${tuiBanner(agent, conversationId, io)}\n`);
          } else if (command === "attach") {
            if (agent !== "meeting") throw new CliUsageError("Attachments are currently supported by Meeting Agent only");
            if (!words.length) throw new CliUsageError("Use /attach PATH");
            io.stdout.write(`Uploading ${words.join(", ")}…\n`);
            const uploaded = await client.uploadMeetingFiles(words, { projectId: parsed.options.project, conversationId });
            const failed = uploaded.results?.filter((item) => !item.ok) ?? [];
            if (failed.length) throw new Error(failed.map((item) => `${item.name}: ${item.error}`).join(" · "));
            attachments.push(...attachmentInput(uploaded.results ?? []));
            io.stdout.write(`Queued ${uploaded.results?.length ?? 0} source(s) for the next message.\n`);
          } else if (command === "attachments") {
            io.stdout.write(attachments.length ? `${attachments.map((item, index) => `${index + 1}. ${item.name} · ${item.kind}`).join("\n")}\n` : "No queued attachments.\n");
          } else if (command === "sessions" || command === "runs") {
            const response = await client.listRuns({ limit: 12 });
            io.stdout.write(`${formatRuns(filterRuns(response.runs ?? [], agent), { colorEnabled: true })}\n`);
          } else if (command === "result") {
            const runId = words[0] || lastRunId;
            if (!runId) throw new CliUsageError("Use /result RUN_ID");
            io.stdout.write(`${formatAgentResponse(await client.getRun(runId), { colorEnabled: true })}\n`);
          } else if (command === "review") {
            await tuiReview(client, words, io, lastRunId);
          } else {
            throw new CliUsageError(`Unknown command: /${command}`);
          }
        } catch (error) {
          io.stderr.write(`${color(true, ANSI.red, error.message)}\n`);
        }
        continue;
      }

      try {
        let response = await client.run(agent, {
          requestId: randomUUID(),
          task: line,
          conversationId,
          ...(parsed.options.project ? { projectId: parsed.options.project } : {}),
          ...(parsed.options.user ? { userId: parsed.options.user } : {}),
          ...(attachments.length ? { input: { attachments } } : {}),
        });
        attachments = [];
        lastRunId = response.runId;
        response = await waitForRun(client, response, {
          interval: 1000,
          stream: true,
          onEvent: (event) => io.stderr.write(`${color(true, ANSI.dim, "  ·")} ${eventSummary(event)}\n`),
        });
        io.stdout.write(`\n${formatAgentResponse(response, { colorEnabled: true })}\n\n`);
      } catch (error) {
        io.stderr.write(`${color(true, ANSI.red, error.message)}\n`);
      }
    }
  } finally {
    rl.close();
    io.stdout.write("\nDTA terminal closed.\n");
  }
}

async function agentsCommand(parsed, io) {
  ensureKnownOptions(parsed.options, commonAllowed());
  const response = await clientForOptions(parsed.options).listAgents();
  if (parsed.options.json) io.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
  else {
    for (const agent of response.agents ?? []) {
      if (agent.internal) continue;
      io.stdout.write(`${agent.id}\t${agent.displayName}\t${agent.description || ""}\n`);
    }
  }
}

async function healthCommand(parsed, io) {
  ensureKnownOptions(parsed.options, commonAllowed());
  const client = clientForOptions(parsed.options);
  const [health, ready] = await Promise.all([client.get("/health"), client.get("/ready").catch((error) => ({ status: "not_ready", error: error.message }))]);
  const result = { health, ready };
  if (parsed.options.json) io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else io.stdout.write(`DTA ${health.status || "unknown"} · readiness ${ready.status || "unknown"} · ${client.baseUrl}\n`);
}

function pilotTimeout(value) {
  const timeout = Number.parseInt(value || "180000", 10);
  if (!Number.isInteger(timeout) || timeout < 10_000 || timeout > 900_000) {
    throw new CliUsageError("--timeout must be between 10000 and 900000");
  }
  return timeout;
}

async function pilotCheckCommand(parsed, io) {
  ensureKnownOptions(parsed.options, commonAllowed("live", "quiet", "report", "secondaryToken", "timeout", "workflow"));
  if (parsed.positionals.length) throw new CliUsageError("pilot-check does not accept positional arguments");
  const config = configForOptions(parsed.options);
  const secondaryToken = parsed.options.secondaryToken || process.env.DTA_SECONDARY_ACCESS_TOKEN;
  const workflowId = parsed.options.workflow || process.env.DTA_PILOT_WORKFLOW || PILOT_WORKFLOW_ID;
  const report = await runCompanyPilotReadiness({
    baseUrl: config.baseUrl,
    primaryToken: config.token,
    secondaryToken,
    live: parsed.options.live,
    workflowId,
    timeoutMs: pilotTimeout(parsed.options.timeout),
    onProgress: parsed.options.quiet ? undefined : (check) => {
      const status = check.status === "passed" ? "PASS" : check.status === "failed" ? "FAIL" : "SKIP";
      io.stderr.write(`${status} ${check.name} · ${check.message}\n`);
    },
  });

  if (parsed.options.report) {
    const reportPath = resolve(process.cwd(), parsed.options.report);
    await mkdir(dirname(reportPath), { recursive: true });
    const content = reportPath.toLowerCase().endsWith(".md")
      ? formatPilotReadinessMarkdown(report)
      : `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(reportPath, content, { encoding: "utf8", mode: 0o600 });
    if (!parsed.options.json) io.stderr.write(`Report written to ${reportPath}\n`);
  }

  io.stdout.write(parsed.options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatPilotReadinessReport(report)}\n`);
  if (report.status === "failed") io.setExitCode(1);
  else if (report.status === "incomplete") io.setExitCode(2);
}

async function fileExists(path) {
  try { await access(path, fsConstants.R_OK); return true; }
  catch { return false; }
}

function spawnAndWait(command, args, options = {}) {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", rejectChild);
    child.once("exit", (code, signal) => resolveChild({ code: code ?? (signal ? 1 : 0), signal }));
  });
}

async function serveCommand(parsed, io) {
  ensureKnownOptions(parsed.options, new Set(["dev", "help", "hostname", "port"]));
  const port = String(parsed.options.port || process.env.PORT || "30141");
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new CliUsageError("--port must be between 1 and 65535");
  const hostname = parsed.options.hostname || process.env.HOSTNAME || "0.0.0.0";
  const imageServer = resolve(PROJECT_ROOT, "server.js");
  let command = process.execPath;
  let args;
  if (!parsed.options.dev && await fileExists(imageServer)) {
    args = [imageServer];
  } else {
    const nextCli = resolve(PROJECT_ROOT, "node_modules/next/dist/bin/next");
    if (!await fileExists(nextCli)) throw new Error("Next.js runtime is not installed");
    if (!parsed.options.dev && !await fileExists(resolve(PROJECT_ROOT, ".next/BUILD_ID"))) {
      throw new Error("Production build not found. Run npm run build first, or use dta serve --dev.");
    }
    args = [nextCli, parsed.options.dev ? "dev" : "start", "-p", port, "-H", hostname];
  }
  io.stderr.write(`Starting DTA on http://${hostname === "0.0.0.0" ? "127.0.0.1" : hostname}:${port}\n`);
  const result = await spawnAndWait(command, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: port, HOSTNAME: hostname },
  });
  if (result.code) io.setExitCode(result.code);
}

async function piCommand(parsed, io) {
  const piCli = resolve(PROJECT_ROOT, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
  if (!await fileExists(piCli)) throw new Error("Native Pi CLI is not present in this DTA installation");
  if (!parsed.passthrough.includes("--version") && !parsed.passthrough.includes("--help")) {
    io.stderr.write(`${color(io.stderr.isTTY, ANSI.amber, "Developer mode:")} native Pi Coding Agent; Meeting/PM policies are not active.\n`);
  }
  const result = await spawnAndWait(process.execPath, [piCli, ...parsed.passthrough], { cwd: process.cwd(), env: process.env });
  if (result.code) io.setExitCode(result.code);
}

async function versionCommand(io) {
  const pkg = JSON.parse(await readFile(resolve(PROJECT_ROOT, "package.json"), "utf8"));
  io.stdout.write(`dta ${pkg.version}\n`);
}

export function defaultIo() {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    setExitCode(code) { process.exitCode = code; },
  };
}

export async function runCli(argv, io = defaultIo()) {
  const parsed = parseCommandLine(argv);
  if (parsed.command === "help") {
    const topic = parsed.topic || parsed.positionals?.[0];
    io.stdout.write(`${usage(topic)}\n`);
    return;
  }
  if (parsed.command === "version") return versionCommand(io);
  if (parsed.command === "run") return runAgentCommand(parsed, io);
  if (parsed.command === "tui") return tuiCommand(parsed, io);
  if (parsed.command === "sessions" || parsed.command === "runs") return sessionsCommand(parsed, io);
  if (parsed.command === "review") return reviewCommand(parsed, io);
  if (parsed.command === "serve") return serveCommand(parsed, io);
  if (parsed.command === "agents") return agentsCommand(parsed, io);
  if (parsed.command === "health") return healthCommand(parsed, io);
  if (parsed.command === "pilot-check" || parsed.command === "pilot") return pilotCheckCommand(parsed, io);
  if (parsed.command === "pi") return piCommand(parsed, io);
  throw new CliUsageError(`Unknown command: ${parsed.command}`);
}

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  try {
    await runCli(argv, io);
  } catch (error) {
    io.stderr.write(`${error instanceof CliUsageError ? "Error" : "DTA error"}: ${error.message}\n`);
    if (error instanceof CliUsageError) io.stderr.write("Run dta --help for usage.\n");
    io.setExitCode(error instanceof CliUsageError ? 2 : 1);
  }
}
