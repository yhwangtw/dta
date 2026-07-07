import { test, expect } from "@playwright/test";

// Exercises the snapshot lib end-to-end through the real APIs: capture a
// restore point, mutate a file, restore, and confirm the working tree is
// reverted precisely. The demo fixture is a real git repo.
const SESSION = "aaaa1111-2222-3333-4444-555566667777";
const CWD = process.env.E2E_PROJECT_CWD!;
const FILE_URL = `/api/files${CWD}/src/index.ts`;
const READ_URL = `${FILE_URL}?type=read`;

test.describe("file snapshots", () => {
  test("create restore point → mutate a file → restore reverts it", async ({ request }) => {
    // Original content
    const before = await (await request.get(READ_URL)).json() as { content: string };
    expect(before.content).toBeTruthy();

    // Capture a restore point
    const snapRes = await request.post("/api/git/snapshots", {
      data: { cwd: CWD, sessionId: SESSION, label: "before mutate" },
    });
    expect(snapRes.ok()).toBeTruthy();
    const { snapshot } = await snapRes.json() as { snapshot: { id: string } };
    expect(snapshot?.id).toBeTruthy();

    // It shows up in the list
    const listed = await (await request.get(`/api/git/snapshots?cwd=${encodeURIComponent(CWD)}&sessionId=${SESSION}`)).json() as { snapshots: { id: string }[] };
    expect(listed.snapshots.some((s) => s.id === snapshot.id)).toBeTruthy();

    // Mutate the file
    const mutated = `${before.content}\n// CORRUPTED BY TEST\n`;
    const putRes = await request.put(FILE_URL, { data: { content: mutated } });
    expect(putRes.ok()).toBeTruthy();
    const afterMutate = await (await request.get(READ_URL)).json() as { content: string };
    expect(afterMutate.content).toContain("CORRUPTED BY TEST");

    // Restore to the snapshot
    const restoreRes = await request.post("/api/git/snapshots/restore", {
      data: { cwd: CWD, sessionId: SESSION, id: snapshot.id },
    });
    expect(restoreRes.ok()).toBeTruthy();
    const restore = await restoreRes.json() as { ok: boolean; restored: number };
    expect(restore.ok).toBeTruthy();
    expect(restore.restored).toBeGreaterThanOrEqual(1);

    // File is back to the pre-mutation content
    const afterRestore = await (await request.get(READ_URL)).json() as { content: string };
    expect(afterRestore.content).not.toContain("CORRUPTED BY TEST");
    expect(afterRestore.content).toBe(before.content);
  });
});
