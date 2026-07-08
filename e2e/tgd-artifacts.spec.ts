import { test, expect, type Page } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";

async function openMain(page: Page) {
  await page.goto(MAIN);
  await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("tGD artifacts panel", () => {
  test("lists the sibling <project>-tGD docs and opens one in the viewer", async ({ page }) => {
    await openMain(page);
    await page.getByRole("button", { name: "tGD artifacts" }).click();

    // Project-level docs + the feature dir (with its phase evidence)
    await expect(page.getByText("CONTEXT.md")).toBeVisible();
    await expect(page.getByText("TRACKING-PLAN.md")).toBeVisible();
    await expect(page.getByText("user-login")).toBeVisible();
    await expect(page.getByText("PRD.md")).toBeVisible();
    await expect(page.getByText("variant-a.html")).toBeVisible();
    // .scans infra dir is excluded
    await expect(page.getByText("index.txt")).toHaveCount(0);

    // Opening a doc renders it in the right panel
    await page.getByText("PRD.md").first().click();
    await expect(page.getByText("登入功能").first()).toBeVisible({ timeout: 10_000 });
  });
});
