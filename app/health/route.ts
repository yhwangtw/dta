import { isDtaConfigurationReady, loadDtaConfig } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = loadDtaConfig();
  return Response.json({
    status: "ok",
    service: "dta-agent-platform",
    configurationReady: isDtaConfigurationReady(config),
    capabilities: {
      meetingTranscription: config.transcriptionProvider !== "none",
      meetingVision: config.visionProvider !== "none",
      mediaProcessing: config.mediaProcessor !== "none",
      uploadScanning: config.uploadScannerProvider !== "none",
      durableConversationMemory: config.memoryStoreProvider !== "local",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
