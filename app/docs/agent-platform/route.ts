import { loadDtaConfig } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const base = loadDtaConfig().publicBaseUrl;
  const markdown = `# Digital Transformation Agent API

DTA exposes Meeting Agent and PM Agent without exposing its internal runtime.

## Agent Contract

- \`POST ${base}/api/agents/meeting/run\`
- \`POST ${base}/api/agents/pm/run\`
- \`GET ${base}/api/agent-runs/{runId}\`
- \`GET ${base}/api/agent-runs/{runId}/events\`

## A2A v1

- \`GET ${base}/.well-known/agent-card.json\`
- \`POST ${base}/a2a/v1/message:send\`
- \`POST ${base}/a2a/v1/message:stream\`
- \`GET ${base}/a2a/v1/tasks/{taskId}\`

Meeting media is uploaded as multipart form data to \`POST ${base}/api/meeting-agent/extract\`. Pass returned artifact references through JSON/A2A data parts. Meeting-to-PM handoff actions are released only after the Meeting result is approved.
`;
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
