import { loadDtaConfig } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = loadDtaConfig();
  return Response.json({
    status: "ok",
    service: "dta-agent-platform",
    capabilities: {
      meetingTranscription: config.transcriptionProvider !== "none",
      meetingVision: config.visionProvider !== "none",
      mediaProcessing: config.mediaProcessor !== "none",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
