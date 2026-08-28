import { NextResponse } from "next/server";
import { homedir } from "os";
import { authenticateRequest, AuthenticationError, authenticationErrorResponse, assertCodingAccess } from "@/lib/auth/request-auth";

export async function GET(req: Request) {
  try {
    const principal = await authenticateRequest(req);
    try {
      assertCodingAccess(principal);
      return NextResponse.json({ home: homedir(), companyMode: principal.authType === "keycloak", codingWorkspace: true });
    } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      return NextResponse.json({ home: null, companyMode: true, codingWorkspace: false });
    }
  } catch (error) {
    if (error instanceof AuthenticationError) return authenticationErrorResponse(error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
