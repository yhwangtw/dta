import { describe, expect, it } from "vitest";
import { assertArtifactAccess, assertArtifactDeleteAccess } from "../integrations/storage/artifact-access";
import type { Artifact } from "../integrations/storage/artifact-store";
import type { RequestPrincipal } from "../auth/request-auth";

function artifact(metadata?: Record<string, unknown>): Artifact {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    type: "meeting_minutes",
    title: "Minutes",
    mimeType: "text/markdown",
    size: 1,
    createdAt: new Date(0).toISOString(),
    data: new Uint8Array([1]),
    metadata,
  };
}

function principal(id: string, roles: string[] = []): RequestPrincipal {
  return { id, roles, authType: "keycloak" };
}

describe("artifact ownership", () => {
  it("allows the owner and hides another user's artifact", () => {
    expect(() => assertArtifactAccess(principal("user-1"), artifact({ userId: "user-1" }))).not.toThrow();
    expect(() => assertArtifactAccess(principal("user-2"), artifact({ userId: "user-1" }))).toThrow("not found");
  });

  it("requires an explicit role for deletion in Keycloak mode", () => {
    expect(() => assertArtifactDeleteAccess(principal("user-1"), artifact({ userId: "user-1" }))).toThrow("permission");
    expect(() => assertArtifactDeleteAccess(principal("user-1", ["dta-artifact-delete"]), artifact({ userId: "user-1" }))).not.toThrow();
  });

  it("allows operational cross-user readers without exposing unowned artifacts to regular users", () => {
    expect(() => assertArtifactAccess(principal("operator", ["dta-run-read-all"]), artifact({ userId: "user-1" }))).not.toThrow();
    expect(() => assertArtifactAccess(principal("user-1"), artifact())).toThrow("not found");
  });
});
