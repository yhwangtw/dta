import { test, expect } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";

test.describe("git worktrees", () => {
  test("picker nests the linked worktree under the selected project; picking switches cwd", async ({ page }) => {
    await page.goto(MAIN);
    await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });

    // Open the project picker
    await page.locator('[class*="CwdPicker_mainButton"]').first().click();

    // The linked worktree renders nested with its branch chip
    const wtRow = page.getByTestId("worktree-row");
    await expect(wtRow).toBeVisible();
    await expect(wtRow).toContainText("demo-project-wt");
    await expect(wtRow).toContainText("feature-wt");

    // Picking it switches the selected cwd to the worktree
    await wtRow.click();
    await expect(page.locator('[class*="CwdPicker_mainButton"]').first()).toContainText("demo-project-wt");
  });
});
