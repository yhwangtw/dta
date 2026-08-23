import { expect, test, type Page } from "@playwright/test";

const MEETING_SESSION = "11112222-3333-4444-8555-666677778888";
const PM_SESSION = "99990000-aaaa-4bbb-8ccc-ddddeeeeffff";

async function installSpeechRecognition(page: Page) {
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      maxAlternatives = 1;
      onstart: ((event: Event) => void) | null = null;
      onend: ((event: Event) => void) | null = null;
      onresult: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      start() {
        this.onstart?.(new Event("start"));
        queueMicrotask(() => {
          const result = { isFinal: true, length: 1, 0: { transcript: "Direct microphone meeting evidence." } };
          this.onresult?.({ resultIndex: 0, results: { length: 1, 0: result } } as unknown as Event);
        });
      }

      stop() { this.onend?.(new Event("end")); }
      abort() { this.onend?.(new Event("end")); }
    }

    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
  });
}

test.describe("DTA domain agents", () => {
  test("Meeting and PM entry dialogs stay usable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installSpeechRecognition(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Turn every meeting/ })).toBeVisible();
    await page.getByRole("button", { name: "Create meeting minutes", exact: true }).click();

    const meetingDialog = page.getByTestId("meeting-agent-dialog");
    await expect(meetingDialog).toBeVisible();
    await expect(meetingDialog.getByText("DTA Meeting Space", { exact: true })).toBeVisible();

    const meetingBox = await meetingDialog.boundingBox();
    expect(meetingBox).not.toBeNull();
    expect(meetingBox!.x).toBeGreaterThanOrEqual(0);
    expect(meetingBox!.x + meetingBox!.width).toBeLessThanOrEqual(390);
    expect(meetingBox!.y).toBeGreaterThanOrEqual(0);
    expect(meetingBox!.y + meetingBox!.height).toBeLessThanOrEqual(844);

    await meetingDialog.getByRole("button", { name: "Speak to type", exact: true }).click();
    await expect(meetingDialog.locator("#meeting-agent-source")).toHaveValue(/Direct microphone meeting evidence/);

    await meetingDialog.locator('input[type="file"]').setInputFiles({
      name: "meeting-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Decision: require approval before PM handoff."),
    });
    await expect(meetingDialog.getByText("meeting-notes.txt", { exact: true })).toBeVisible();
    await expect(meetingDialog.getByRole("button", { name: "Generate meeting minutes", exact: true })).toBeEnabled();

    const meetingForm = meetingDialog.locator("form");
    const scrollMetrics = await meetingForm.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    expect(scrollMetrics.overflowY).toMatch(/auto|scroll/);
    await meetingForm.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(meetingDialog.getByRole("button", { name: "Generate meeting minutes", exact: true })).toBeVisible();
    await meetingDialog.getByRole("button", { name: "Close", exact: true }).click();

    await page.getByRole("button", { name: /PM Agent/ }).click();
    const pmDialog = page.getByTestId("pm-agent-dialog");
    await expect(pmDialog).toBeVisible();
    await expect(pmDialog.getByText("DTA PM Space", { exact: true })).toBeVisible();
    await pmDialog.getByLabel("Approved requirement").fill("Only approved meeting requirements may enter PM planning.");
    await expect(pmDialog.getByRole("button", { name: "Generate PM artifacts", exact: true })).toBeEnabled();

    const pmBox = await pmDialog.boundingBox();
    expect(pmBox).not.toBeNull();
    expect(pmBox!.x).toBeGreaterThanOrEqual(0);
    expect(pmBox!.x + pmBox!.width).toBeLessThanOrEqual(390);
    expect(pmBox!.y).toBeGreaterThanOrEqual(0);
    expect(pmBox!.y + pmBox!.height).toBeLessThanOrEqual(844);
  });

  test("human approval releases the Meeting-to-PM handoff and knowledge record", async ({ page }) => {
    await page.goto(`/?session=${MEETING_SESSION}`);
    const result = page.getByTestId("meeting-result-panel");
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result.getByText("DTA Weekly Meeting", { exact: true })).toBeVisible();
    await expect(result.getByText("PM Agent", { exact: true })).toBeVisible();

    const approve = result.getByRole("button", { name: "Approve result", exact: true });
    if (await approve.count()) await approve.click();
    await expect(result.getByRole("heading", { name: "Approved", exact: true })).toBeVisible();
    await expect(result.getByText("Ready for orchestrator", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Meeting knowledge", exact: true }).click();
    const knowledge = page.getByTestId("meeting-knowledge");
    await expect(knowledge).toBeVisible();
    await expect(knowledge.getByText("DTA Weekly Meeting", { exact: true })).toBeVisible();
    await expect(knowledge.getByText("The team approved a governed Meeting-to-PM handoff.", { exact: true })).toBeVisible();
  });

  test("PM Agent renders the complete product artifact set", async ({ page }) => {
    await page.goto(`/?session=${PM_SESSION}`);
    const result = page.getByTestId("pm-result-panel");
    await expect(result).toBeVisible({ timeout: 20_000 });
    await expect(result.getByText("Create an approval-gated Meeting-to-PM delivery flow.", { exact: true })).toBeVisible();
    for (const type of ["URD", "PRD", "USER_STORY", "ACCEPTANCE_CRITERIA", "DESIGN", "TASK_PLAN"]) {
      await expect(result.getByText(type, { exact: true })).toBeVisible();
    }
    await expect(result.getByText("pm-create-jira-epic", { exact: true })).toBeVisible();
  });

  test("publishes a framework-neutral Agent catalog and A2A Agent Card", async ({ request }) => {
    const catalogResponse = await request.get("/api/agents");
    expect(catalogResponse.ok()).toBe(true);
    const catalog = await catalogResponse.json() as { agents: Array<{ id: string; internal: boolean }> };
    expect(catalog.agents.map((agent) => agent.id)).toEqual(["meeting-agent", "pm-agent", "knowledge-agent"]);
    expect(catalog.agents.every((agent) => !agent.internal)).toBe(true);

    const cardResponse = await request.get("/.well-known/agent-card.json");
    expect(cardResponse.ok()).toBe(true);
    const card = await cardResponse.json() as { name: string; skills: Array<{ id: string }> };
    expect(card.name).toContain("Digital Transformation");
    expect(card.skills.map((skill) => skill.id)).toEqual(["meeting-minutes", "pm-analysis", "knowledge-brief"]);

    const missingVersion = await request.get("/a2a/v1/tasks");
    expect(missingVersion.status()).toBe(400);
    expect(await missingVersion.json()).toMatchObject({ error: { details: [{ reason: "VERSION_NOT_SUPPORTED" }] } });

    const a2aHeaders = { "A2A-Version": "1.0" };
    const tasksResponse = await request.get("/a2a/v1/tasks?pageSize=1", { headers: a2aHeaders });
    expect(tasksResponse.ok()).toBe(true);
    const firstPage = await tasksResponse.json() as { tasks: Array<{ id: string; artifacts?: unknown }>; nextPageToken: string; pageSize: number; totalSize: number };
    expect(firstPage.tasks.map((task) => task.id)).toEqual(["contract-pm-e2e"]);
    expect(firstPage.tasks[0]).not.toHaveProperty("artifacts");
    expect(firstPage).toMatchObject({ pageSize: 1, totalSize: 2 });
    expect(firstPage.nextPageToken).not.toBe("");

    const getTask = await request.get("/a2a/v1/tasks/contract-meeting-e2e", { headers: a2aHeaders });
    expect(await getTask.json()).toMatchObject({ id: "contract-meeting-e2e", status: { state: "TASK_STATE_COMPLETED" } });

    const terminalSubscription = await request.get("/a2a/v1/tasks/contract-meeting-e2e:subscribe", { headers: a2aHeaders });
    expect(terminalSubscription.status()).toBe(400);
    expect(await terminalSubscription.json()).toMatchObject({ error: { details: [{ reason: "UNSUPPORTED_OPERATION" }] } });
  });

  test("loads a department Agent from the mounted manifest without rebuilding the UI", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("button", { name: /Knowledge Agent/ });
    await expect(card).toBeVisible();
    await card.click();
    const dialog = page.getByTestId("department-agent-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Start Knowledge Agent", exact: true })).toBeVisible();
    await dialog.getByLabel("Task").fill("Create an approved knowledge brief.");
    await expect(dialog.getByRole("button", { name: "Start Agent", exact: true })).toBeEnabled();
  });
});
