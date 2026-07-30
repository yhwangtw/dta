import { test, expect, type Page } from "@playwright/test";

// The dddd… fixture session ran /tgd-map, /tgd-define, /tgd-plan.
const TGD = "/?session=dddd1111-2222-3333-4444-555566667777";

async function open(page: Page) {
  await page.goto(TGD);
  await expect(page.getByText("tGD 流程測試").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("tGD pipeline", () => {
  test("reflects which phases have run and drives the composer", async ({ page }) => {
    await open(page);

    // All seven phases render
    await expect(page.locator('[class*="TgdPipeline_phase"]')).toHaveCount(7);

    // Plan is the current phase (last /tgd-* run)
    const current = page.locator('[aria-current="step"]');
    await expect(current).toHaveText(/Plan/);

    // Map + Define are marked done (2 completed phases)
    await expect(page.locator('button[class*="TgdPipeline_done"]')).toHaveCount(2);

    // The tracked feature (from the tGD dir) is shown
    await expect(page.locator('[class*="TgdPipeline_feature"]')).toHaveText("user-login");

    // Clicking a phase drops its command into the composer
    await page.locator('[class*="TgdPipeline_mobileSummary"]').click();
    await page.getByRole("button", { name: /Verify/ }).first().click();
    await expect(page.locator("textarea").last()).toHaveValue("/tgd-verify ");
  });

  test("marks phases done from on-disk artifacts even without running the commands", async ({ page }) => {
    // This session (架構分析) never typed a /tgd-* command, but its project has a
    // sibling tGD dir with CONTEXT.md + the user-login feature's PRD/SPEC/TASKS,
    // so map/define/plan are done purely from disk and develop is next.
    await page.goto("/?session=aaaa1111-2222-3333-4444-555566667777");
    await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });

    await expect(page.locator('[class*="TgdPipeline_feature"]')).toHaveText("user-login");
    await expect(page.locator('button[class*="TgdPipeline_done"]')).toHaveCount(3);
    await expect(page.locator('[aria-current="step"]')).toHaveText(/Develop/);
  });
});
