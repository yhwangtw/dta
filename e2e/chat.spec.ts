import { test, expect, type Page } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";
const FAILED = "/?session=eeee1111-2222-3333-4444-555566667777";

const scroller = (page: Page) => page.locator("div.flex-1.overflow-y-auto").first();

async function openMain(page: Page) {
  await page.goto(MAIN);
  // Sidebar session name — transcript text can be content-visibility-skipped
  // when offscreen, which Playwright reports as "hidden".
  await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Show full message/ }).first()).toBeAttached({ timeout: 10_000 });
}

test.describe("chat transcript", () => {
  test("long history collapses behind a preview; latest turn stays expanded", async ({ page }) => {
    await openMain(page);
    const expand = page.getByRole("button", { name: /Show full message/ });
    await expect(expand.first()).toBeAttached();

    // Expand ↔ collapse round-trip
    await expand.first().scrollIntoViewIfNeeded();
    await expect(expand.first()).toBeVisible();
    const before = await expand.count();
    await expand.first().click();
    const collapse = page.getByRole("button", { name: /Collapse message/ });
    await expect(collapse.first()).toBeVisible();
    await collapse.first().click();
    await expect(expand).toHaveCount(before);

    // The latest message never collapses
    const lastCollapsed = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".msg-item")];
      const last = items[items.length - 1];
      return (last?.textContent ?? "").includes("Show full message");
    });
    expect(lastCollapsed).toBe(false);
  });

  test("⌥↑ / ⌥↓ walk between user turns", async ({ page }) => {
    await openMain(page);
    const el = scroller(page);
    await el.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await page.waitForTimeout(300);
    const atBottom = await el.evaluate((node) => node.scrollTop);

    await page.keyboard.press("Alt+ArrowUp");
    await page.waitForTimeout(700);
    const up1 = await el.evaluate((node) => node.scrollTop);
    await page.keyboard.press("Alt+ArrowUp");
    await page.waitForTimeout(700);
    const up2 = await el.evaluate((node) => node.scrollTop);
    expect(up1).toBeLessThan(atBottom);
    expect(up2).toBeLessThan(up1);

    await page.keyboard.press("Alt+ArrowDown");
    await page.waitForTimeout(700);
    const down = await el.evaluate((node) => node.scrollTop);
    expect(down).toBeGreaterThan(up2);
  });

  test("⌘F jump auto-expands a collapsed match", async ({ page }) => {
    await openMain(page);
    // A phrase that only lives deep inside the collapsed long message
    await page.keyboard.press("Control+f");
    await page.keyboard.type("第 7 段詳細說明");
    await page.waitForTimeout(400);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Collapse message/ }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("failed run shows the error card and a Retry action", async ({ page }) => {
    await page.goto(FAILED);
    await expect(page.getByText(/429 rate_limit_error/)).toBeAttached({ timeout: 20_000 });
    const retry = page.getByRole("button", { name: "Retry last run" });
    await expect(retry).toBeVisible();
    // Clicking must not crash the app (offline CI has no model — the send
    // itself may fail with a toast, which is fine).
    await retry.click();
    await page.waitForTimeout(1_500);
    await expect(page.getByPlaceholder("Message…")).toBeVisible();
  });

  test("always-follow toggle persists via the palette", async ({ page }) => {
    await openMain(page);
    for (const round of ["on", "off"] as const) {
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(300);
      await page.keyboard.type("always-follow");
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const stored = await page.evaluate(() => localStorage.getItem("pi-follow-stream"));
      expect(stored).toBe(round === "on" ? "1" : null);
    }
  });
});
