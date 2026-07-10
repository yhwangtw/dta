import { test, expect } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";

test.describe("git worktrees", () => {
  test("switcher nests the linked worktree under its project; picking switches cwd", async ({ page }) => {
    await page.goto(MAIN);
    await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });

    // Open the project switcher
    await page.getByTestId("project-switcher-trigger").click();

    // The linked worktree renders nested with its branch chip
    const wtRow = page.getByTestId("worktree-row");
    await expect(wtRow).toBeVisible({ timeout: 10_000 });
    await expect(wtRow).toContainText("demo-project-wt");
    await expect(wtRow).toContainText("feature-wt");

    // Picking it switches the selected cwd to the worktree
    await wtRow.click();
    await expect(page.getByTestId("project-switcher")).toHaveCount(0);
    await expect(page.getByTestId("project-switcher-trigger")).toContainText("demo-project-wt");
  });
});
