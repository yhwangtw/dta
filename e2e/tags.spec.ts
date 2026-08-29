import { test, expect, type Page } from "@playwright/test";

const MAIN_SESSION_ID = "aaaa1111-2222-3333-4444-555566667777";
const MAIN = `/?session=${MAIN_SESSION_ID}`;

function mainSessionRow(page: Page) {
  return page.locator(`[data-session-row="${MAIN_SESSION_ID}"]`);
}

async function openMain(page: Page) {
  await page.goto(MAIN);
  await expect(mainSessionRow(page)).toBeVisible({ timeout: 20_000 });
}

async function addTag(page: Page, tag: string) {
  await mainSessionRow(page).click({ button: "right" });
  // Menu entries are role=menuitem, not button
  await page.getByRole("menuitem", { name: "Add tag" }).click();
  const input = page.locator("input[placeholder*='tag']");
  await input.waitFor();
  await input.fill(tag); // fill, not type — typing races the focus timeout
  await page.keyboard.press("Enter");
}

// Fixtures are regenerated per run, but tags.json persists within one run —
// each test cleans up after itself via the chips it asserts on.
test.describe("session tags", () => {
  test("add → chip appears immediately with a remove control", async ({ page }) => {
    await openMain(page);
    await addTag(page, "chiptest");
    // The chip must appear on the session item without a reload (this used to
    // break: the client map was keyed two different ways at once).
    const chip = page.locator("[class*=tagChip]", { hasText: "#chiptest" }).first();
    await expect(chip).toBeVisible();
    const remove = chip.getByRole("button", { name: "Remove #chiptest" });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(page.locator("[class*=tagChip]", { hasText: "#chiptest" })).toHaveCount(0);
  });

  test("context menu lists current tags and removes them", async ({ page }) => {
    await openMain(page);
    await addTag(page, "menutest");
    await expect(page.locator("[class*=tagChip]", { hasText: "#menutest" }).first()).toBeVisible();

    await mainSessionRow(page).click({ button: "right" });
    const menu = page.getByRole("menu");
    const menuRemove = menu.getByRole("button", { name: "Remove #menutest" });
    await expect(menuRemove).toBeVisible();
    await menuRemove.click();
    await page.keyboard.press("Escape");
    await expect(page.locator("[class*=tagChip]", { hasText: "#menutest" })).toHaveCount(0);
  });

  test("tag filter chips filter the session list", async ({ page }) => {
    await openMain(page);
    await addTag(page, "filtertest");
    // TagFilter row appears; clicking it filters to the tagged session
    const filterChip = page.locator("button", { hasText: "filtertest" }).first();
    await expect(filterChip).toBeVisible();
    await filterChip.click();
    await expect(mainSessionRow(page)).toBeVisible();
    await expect(page.getByText("失敗的執行")).toHaveCount(0);
    // Clear the filter, clean up via the item chip
    await filterChip.click();
    await expect(page.getByText("失敗的執行").first()).toBeVisible();
    const remove = page.locator("[class*=tagChip]", { hasText: "#filtertest" }).first()
      .getByRole("button", { name: "Remove #filtertest" });
    await remove.click();
    await expect(page.locator("[class*=tagChip]", { hasText: "#filtertest" })).toHaveCount(0);
  });
});
