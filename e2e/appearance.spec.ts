import { test, expect, type Page } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";

async function openMain(page: Page) {
  await page.goto(MAIN);
  await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("appearance", () => {
  test("picker panel: five skins, live apply, theme toggle, dismissal", async ({ page }) => {
    await openMain(page);
    await page.getByRole("button", { name: "Appearance" }).click();
    const dialog = page.getByRole("dialog", { name: "Appearance" });
    await expect(dialog).toBeVisible();

    const rows = dialog.getByRole("button").filter({ hasText: /Terminal|Industrial|Aurora|Editorial|Glass/ });
    await expect(rows).toHaveCount(5);

    await dialog.getByRole("button", { name: /Glass/ }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-skin")))
      .toBe("glass");
    await expect(dialog).toBeVisible(); // stays open for live preview

    await dialog.getByRole("button", { name: "Dark" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("skin + theme survive a reload via the no-flash init script", async ({ page }) => {
    await openMain(page);
    await page.evaluate(() => {
      localStorage.setItem("pi-skin", "glass");
      localStorage.setItem("pi-theme", "dark");
    });
    await page.reload();
    await expect(page.getByText("專案架構分析").first()).toBeVisible({ timeout: 20_000 });
    const state = await page.evaluate(() => ({
      skin: document.documentElement.getAttribute("data-skin"),
      dark: document.documentElement.classList.contains("dark"),
    }));
    expect(state).toEqual({ skin: "glass", dark: true });
  });

  test("default is editorial light", async ({ page }) => {
    await openMain(page);
    const state = await page.evaluate(() => ({
      skin: document.documentElement.getAttribute("data-skin"),
      dark: document.documentElement.classList.contains("dark"),
    }));
    expect(state.skin).toBe("editorial");
  });
});
