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

    // Clicking a phase drops its command into the composer
    await page.getByRole("button", { name: /Verify/ }).first().click();
    await expect(page.locator("textarea").last()).toHaveValue("/tgd-verify ");
  });
});
