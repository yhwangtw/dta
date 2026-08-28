import type { PushSubscription } from "web-push";
import { getVapidConfig, pushEnrollmentAllowed, pushSubscriptionCount, removePushSubscription, savePushSubscription } from "@/lib/web-push";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse } from "@/lib/auth/request-auth";

export const dynamic = "force-dynamic";
function denied(request: Request): Response | null { return pushEnrollmentAllowed(request) ? null : Response.json({ error: "Web Push enrollment requires localhost or the app access gate" }, { status: 403 }); }

export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    if (principal.authType === "local") { const blocked = denied(request); if (blocked) return blocked; }
    return Response.json({ supported: true, publicKey: getVapidConfig().publicKey, subscriptions: pushSubscriptionCount(principal.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    if (principal.authType === "local") { const blocked = denied(request); if (blocked) return blocked; }
    const subscription = await request.json() as PushSubscription;
    if (!subscription.endpoint?.startsWith("https://") || !subscription.keys?.auth || !subscription.keys?.p256dh) return Response.json({ error: "Invalid push subscription" }, { status: 400 });
    return Response.json({ subscriptions: savePushSubscription(principal.id, subscription) }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    const principal = await authenticateRequest(request);
    if (principal.authType === "local") { const blocked = denied(request); if (blocked) return blocked; }
    const { endpoint } = await request.json() as { endpoint?: string };
    if (!endpoint) return Response.json({ error: "endpoint required" }, { status: 400 });
    return Response.json({ subscriptions: removePushSubscription(principal.id, endpoint) });
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
