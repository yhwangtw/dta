import { test, expect, type Page } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";

async function openReadme(page: Page) {
  await page.goto(MAIN);
  await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
  await page.getByText("README.md").first().click();
  await expect(page.locator(".right-panel-container.right-panel-open")).toBeVisible({ timeout: 10_000 });
}

test.describe("file viewer", () => {
  test("splitter drags the panel width, persists, and resets on double-click", async ({ page }) => {
    await openReadme(page);
    const panel = page.locator(".right-panel-container");
    // Wait for the open animation (width transition) to settle before measuring
    // the thin resize handle, or its box is a moving target and the drag misses.
    await expect
      .poll(async () => {
        const w = await panel.evaluate((el) => Math.round(el.getBoundingClientRect().width));
        await page.waitForTimeout(120);
        const w2 = await panel.evaluate((el) => Math.round(el.getBoundingClientRect().width));
        return w === w2 ? w : -1;
      })
      .toBeGreaterThan(0);
    const before = await panel.evaluate((el) => el.getBoundingClientRect().width);

    const resizer = page.locator(".right-panel-resizer");
    const box = (await resizer.boundingBox())!;
    // Distinct intermediate moves — a real drag emits many mousemove events,
    // and only a moved drag persists the width (see useRightPanelWidth).
    await page.mouse.move(box.x + 4, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y + 300);
    await page.mouse.move(box.x - 110, box.y + 300);
    await page.mouse.move(box.x - 180, box.y + 300);
    await page.mouse.up();
    await expect
      .poll(() => panel.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(before + 120);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("pi-right-width")))
      .toBeTruthy();

    await resizer.dblclick();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("pi-right-width")))
      .toBeNull();
  });

  test("in-file find highlights matches; :N jumps to a line", async ({ page }) => {
    await openReadme(page);
    // README opens in markdown preview — switch to the raw source view
    await page.getByRole("button", { name: "Raw", exact: true }).click();
    const find = page.locator("input[placeholder='find / :line']");
    await find.fill("Demo");
    await expect(page.locator("[data-active-line]").first()).toBeAttached();
    await find.fill(":3");
    await expect(page.locator("[data-active-line]").first()).toBeAttached();
  });

  test("large files fall back to plain rendering with working go-to-line", async ({ page }) => {
    await page.goto(MAIN);
    await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
    await page.getByText("big-file.ts").first().click();
    // Plain mode by default: toolbar badge present, zero Prism tokens
    await expect(page.getByText("plain·large")).toBeVisible({ timeout: 15_000 });
    expect(await page.locator(".right-panel-container span[class*='token']").count()).toBe(0);
    // go-to-line still exact
    await page.locator("input[placeholder='find / :line']").fill(":1500");
    await expect(page.locator("[data-active-line]").first()).toBeVisible();
    await expect(page.locator("[data-active-line]").first()).toContainText("item1498");
  });

  test("edit → save writes the file to disk", async ({ page }) => {
    await openReadme(page);
    await page.getByRole("button", { name: "Raw", exact: true }).click();
    await page.getByRole("button", { name: "edit", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "File editor" });
    await expect(editor).toBeVisible();
    expect(await editor.inputValue()).toContain("Demo");

    await editor.fill("# Demo project\n\nsaved-from-viewer\n");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    const onDisk = await page.evaluate(async (cwd: string) => {
      const encoded = `${cwd}/README.md`.replace(/^\//, "");
      const res = await fetch(`/api/files/${encoded}?type=read`);
      const d = await res.json();
      return d.content as string;
    }, process.env.E2E_PROJECT_CWD!);
    expect(onDisk).toContain("saved-from-viewer");
  });
});
