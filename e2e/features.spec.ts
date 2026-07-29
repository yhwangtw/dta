import { test, expect, type Page } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";
const TOOLS = "/?session=ffff1111-2222-3333-4444-555566667777";

async function openMain(page: Page) {
  await page.goto(MAIN);
  await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("message bookmarks", () => {
  test("star toggles and persists across reload", async ({ page }) => {
    await openMain(page);
    const first = page.locator(".msg-item").first();
    await first.scrollIntoViewIfNeeded();
    await first.hover();
    const star = first.locator('button[title="Bookmark this message"]');
    await star.click();
    await expect(first.locator('button[title="Remove bookmark"]')).toHaveCount(1);

    await page.reload();
    await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
    const afterReload = page.locator(".msg-item").first();
    await afterReload.scrollIntoViewIfNeeded();
    await expect(afterReload.locator('button[title="Remove bookmark"]')).toHaveCount(1);

    // Clean up so other specs see a fresh state
    await afterReload.hover();
    await afterReload.locator('button[title="Remove bookmark"]').click();
    await expect(afterReload.locator('button[title="Bookmark this message"]')).toBeAttached();
  });
});

test.describe("session archive", () => {
  test("archive hides the session; show-archived reveals; unarchive restores", async ({ page }) => {
    await openMain(page);
    // Archive the error session so the main one stays selectable
    await page.getByText("失敗的執行").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await expect(page.getByText("失敗的執行")).toHaveCount(0);

    // The toggle reports the count and reveals the archived session
    const toggle = page.locator("button", { hasText: "Show archived" }).first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByText("失敗的執行").first()).toBeVisible();

    // Unarchive from the context menu — item stays (list shows everything now)
    await page.getByText("失敗的執行").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Unarchive" }).click();
    await expect(page.locator("button", { hasText: "Show archived" })).toHaveCount(0);
    await expect(page.getByText("失敗的執行").first()).toBeVisible();
  });
});

test.describe("tool-call diff view", () => {
  test("edit tool renders a real diff; write tool renders all-added content", async ({ page }) => {
    await page.goto(TOOLS);
    await expect(page.getByText("工具呼叫測試").first()).toBeVisible({ timeout: 20_000 });

    // Tool calls are summarized per turn; expand the work log before opening
    // the individual edit/write disclosures.
    await page.locator('section[aria-label="Work log"] > button').first().click();

    // Expand the edit tool call → old/new rendered as removed/added lines
    await page.locator("button", { has: page.getByText("edit", { exact: true }) }).first().click();
    await expect(page.locator("[class*=diffLineRemoved]", { hasText: "answer = 42" }).first()).toBeVisible();
    await expect(page.locator("[class*=diffLineAdded]", { hasText: "answer = 100" }).first()).toBeVisible();
    await expect(page.getByText("src/index.ts").first()).toBeVisible();

    // Expand the write tool call → written content shows as added lines
    await page.locator("button", { has: page.getByText("write", { exact: true }) }).first().click();
    await expect(page.locator("[class*=diffLineAdded]", { hasText: "function clamp" }).first()).toBeVisible();
  });
});
