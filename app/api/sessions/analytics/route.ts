import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveSessionPath, listAllSessions } from "@/lib/session-reader";
import { addUsage, emptyUsage, type AssistantUsage } from "@/lib/usage-aggregation";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { accessibleSessionIds } from "@/lib/auth/session-access";

export const dynamic = "force-dynamic";

interface SessionAnalytics {
  id: string;
  name?: string;
  cwd: string;
  created: string;
  modified: string;
  messageCount: number;
  modelChanges: Array<{ provider: string; modelId: string; timestamp: string }>;
  usage: {
    total: AssistantUsage;
    byModel: Record<string, AssistantUsage>;
  };
  compactions: number;
}

export async function GET(request: Request) {
  try {
    const principal = await authenticateRequest(request);
    const allowed = accessibleSessionIds(principal);
    const sessions = (await listAllSessions()).filter((session) => !allowed || allowed.has(session.id));
    const perSession: SessionAnalytics[] = [];
    const monthly: Record<string, { cost: number; tokens: number; sessions: Set<string>; messages: number }> = {};
    const byModel: Record<string, { cost: number; input: number; output: number; sessions: Set<string> }> = {};
    const byProvider: Record<string, { cost: number; sessions: Set<string> }> = {};

    let totalCost = 0;
    let totalTokens = 0;
    let totalMessages = 0;

    for (const s of sessions) {
      const filePath = await resolveSessionPath(s.id);
      if (!filePath || !existsSync(filePath)) continue;

      let sm: ReturnType<typeof SessionManager.open>;
      try { sm = SessionManager.open(filePath); } catch { continue; }

      const entries = sm.getEntries() as Array<{ type: string; timestamp: string; provider?: string; modelId?: string; message?: { role: string; usage?: AssistantUsage; model?: string; provider?: string } }>;
      const total = emptyUsage();
      const perModel: Record<string, AssistantUsage> = {};
      const modelChanges: SessionAnalytics["modelChanges"] = [];
      let compactions = 0;

      for (const e of entries) {
        if (e.type === "model_change" && e.provider && e.modelId) {
          modelChanges.push({ provider: e.provider, modelId: e.modelId, timestamp: e.timestamp });
        } else if (e.type === "compaction") {
          compactions++;
        } else if (e.type === "message" && e.message?.role === "assistant" && e.message.usage) {
          const u = e.message.usage;
          addUsage(total, u);
          const modelKey = `${e.message.provider ?? "?"}/${e.message.model ?? "?"}`;
          if (!perModel[modelKey]) perModel[modelKey] = emptyUsage();
          addUsage(perModel[modelKey], u);
        }
      }

      const sessionCost = total.cost.total;
      const sessionTokens = total.input + total.output + total.cacheRead + total.cacheWrite;
      totalCost += sessionCost;
      totalTokens += sessionTokens;
      totalMessages += s.messageCount;

      // Monthly bucket
      const monthKey = s.modified.slice(0, 7); // YYYY-MM
      if (!monthly[monthKey]) monthly[monthKey] = { cost: 0, tokens: 0, sessions: new Set(), messages: 0 };
      monthly[monthKey].cost += sessionCost;
      monthly[monthKey].tokens += sessionTokens;
      monthly[monthKey].sessions.add(s.id);
      monthly[monthKey].messages += s.messageCount;

      // By model / provider
      for (const [modelKey, u] of Object.entries(perModel)) {
        if (!byModel[modelKey]) byModel[modelKey] = { cost: 0, input: 0, output: 0, sessions: new Set() };
        byModel[modelKey].cost += u.cost.total;
        byModel[modelKey].input += u.input;
        byModel[modelKey].output += u.output;
        byModel[modelKey].sessions.add(s.id);
        const provider = modelKey.split("/")[0];
        if (!byProvider[provider]) byProvider[provider] = { cost: 0, sessions: new Set() };
        byProvider[provider].cost += u.cost.total;
        byProvider[provider].sessions.add(s.id);
      }

      perSession.push({
        id: s.id,
        name: s.name,
        cwd: s.cwd,
        created: s.created,
        modified: s.modified,
        messageCount: s.messageCount,
        modelChanges,
        usage: { total, byModel: perModel },
        compactions,
      });
    }

    // Serialize (Set -> count) for JSON
    const summary = {
      totalCost,
      totalTokens,
      totalMessages,
      sessionCount: sessions.length,
      monthly: Object.entries(monthly)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, v]) => ({ month, cost: v.cost, tokens: v.tokens, sessions: v.sessions.size, messages: v.messages })),
      byModel: Object.entries(byModel)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([model, v]) => ({ model, cost: v.cost, input: v.input, output: v.output, sessions: v.sessions.size })),
      byProvider: Object.entries(byProvider)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([provider, v]) => ({ provider, cost: v.cost, sessions: v.sessions.size })),
    };

    return NextResponse.json({ summary, perSession });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
