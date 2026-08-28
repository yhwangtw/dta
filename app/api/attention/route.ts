import { collectAttentionItems } from "@/lib/attention-center";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";
import { userStateKey } from "@/lib/auth/user-state";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(req);
    const serverTime = new Date();
    const items = await collectAttentionItems(principal, serverTime);
    return Response.json({ items, serverTime: serverTime.toISOString(), userScope: userStateKey(principal.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
