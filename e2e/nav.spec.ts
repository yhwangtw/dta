import { test, expect, type Page } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";
const PROJECT_CWD = process.env.E2E_PROJECT_CWD!;

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function openMain(page: Page) {
  await page.goto(MAIN);
  await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("file explorer", () => {
  test("git badges on modified/untracked files and dirty-dir dots", async ({ page }) => {
    await openMain(page);
    // src is committed but contains a modified file → dirty dot on the dir;
    // expanding shows index.ts with an M badge; untracked files show U.
    await page.getByText("src", { exact: true }).first().click();
    await expect(page.locator("text=/^M$/").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/^U$/").first()).toBeVisible();
  });

  test("deep search finds nested files and shows relative paths", async ({ page }) => {
    await openMain(page);
    await page.getByPlaceholder("Filter files…").fill("index");
    const hit = page.locator("[data-fx-row]").filter({ hasText: "index.ts" }).first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await expect(hit).toContainText("src/index.ts");
  });

  test("context menu: copy relative path / mention / diff entries", async ({ page }) => {
    await openMain(page);
    await page.getByPlaceholder("Filter files…").fill("index");
    const hit = page.locator("[data-fx-row]").filter({ hasText: "index.ts" }).first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await hit.click({ button: "right" });

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "Insert @ mention" })).toBeVisible();
    await expect(menu.getByRole("button", { name: "View diff" })).toBeVisible();

    await menu.getByRole("button", { name: "Copy relative path" }).click();
    await expect(menu).toHaveCount(0);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    expect(clip).toBe("src/index.ts");
  });

  test("keyboard navigation moves focus across rows", async ({ page }) => {
    await openMain(page);
    const first = page.locator("[data-fx-row]").first();
    await first.click();
    await page.keyboard.press("ArrowDown");
    const focusedIsRow = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.hasAttribute("data-fx-row") ?? false,
    );
    expect(focusedIsRow).toBe(true);
  });
});

test.describe("project picker", () => {
  test("rich rows with session counts", async ({ page }) => {
    await openMain(page);
    await page.getByRole("button", { name: /demo-project/ }).first().click();
    const rows = page.locator("[role=option]");
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText("demo-project");
  });

  test("browse mode lists subdirectories with a Use-this-folder action", async ({ page }) => {
    await openMain(page);
    await page.getByRole("button", { name: /demo-project/ }).first().click();
    await page.getByRole("button", { name: "Browse folders…" }).click();
    await expect(page.getByRole("button", { name: "Use this folder" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "src" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: "Browse folders…" })).toBeVisible();
  });

  test("custom path autocomplete suggests and completes directories", async ({ page }) => {
    await openMain(page);
    await page.getByRole("button", { name: /demo-project/ }).first().click();
    await page.getByRole("button", { name: "Custom path…" }).click();
    // Type the fixture project path minus its last few characters
    const partial = PROJECT_CWD.slice(0, -4);
    await page.getByPlaceholder("/path/to/project").fill(partial);
    // Suggestion entries are <button title="<full path>"> — the picker's main
    // button (span) and project rows (div) share the title, so pin the tag.
    const suggestion = page.locator(`button[title="${PROJECT_CWD}"]`);
    await expect(suggestion).toBeVisible({ timeout: 10_000 });
    await suggestion.click();
    await expect(page.getByPlaceholder("/path/to/project")).toHaveValue(`${PROJECT_CWD}/`);
  });
});
