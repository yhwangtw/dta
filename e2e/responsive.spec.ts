import { expect, test, type Page } from "@playwright/test";

const MAIN = "/?session=aaaa1111-2222-3333-4444-555566667777";

async function openSession(page: Page) {
  await page.goto(MAIN);
  await expect(page.getByRole("textbox", { name: "Message…" })).toBeVisible({
    timeout: 20_000,
  });
}

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
}

test.describe("responsive shell", () => {
  for (const viewport of [
    { width: 320, height: 800 },
    { width: 768, height: 900 },
    { width: 1024, height: 800 },
    { width: 1440, height: 900 },
  ]) {
    test(`AC-RWD-1: ${viewport.width}px keeps the chat usable without page overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openSession(page);

      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Message…" })).toBeVisible();
      await expectNoPageOverflow(page);
    });
  }

  for (const modal of [
    {
      button: "Models (⇧⌘M)",
      name: "Models",
      dialog: "models-config-dialog",
      nav: "models-config-nav",
      detail: "models-config-detail",
    },
    {
      button: "Skills (⌘/)",
      name: "Skills",
      dialog: "skills-config-dialog",
      nav: "skills-config-nav",
      detail: "skills-config-detail",
    },
  ]) {
    test(`AC-RWD-2: ${modal.name} becomes a full-width single-column dialog at 320px`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await openSession(page);
      await page.evaluate(() => localStorage.setItem("pi-font-size", "xlarge"));
      await page.reload();
      await expect(page.getByRole("textbox", { name: "Message…" })).toBeVisible();

      await page.getByRole("button", { name: modal.button, exact: true }).click();
      const dialog = page.getByTestId(modal.dialog);
      const nav = page.getByTestId(modal.nav);
      const detail = page.getByTestId(modal.detail);
      await expect(dialog).toHaveAttribute("role", "dialog");
      await expect(dialog).toHaveAttribute("aria-modal", "true");

      const [dialogBox, navBox, detailBox] = await Promise.all([
        dialog.boundingBox(),
        nav.boundingBox(),
        detail.boundingBox(),
      ]);
      expect(dialogBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(detailBox).not.toBeNull();
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(320);
      expect(navBox!.width).toBeGreaterThanOrEqual(300);
      expect(detailBox!.width).toBeGreaterThanOrEqual(300);
      expect(detailBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height - 1);
      await expectNoPageOverflow(page);
    });
  }

  test("AC-RWD-3: coarse-pointer controls provide 44px touch targets", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 320, height: 800 },
    });
    const page = await context.newPage();
    await openSession(page);

    for (const control of [
      page.getByRole("button", { name: "Sessions", exact: true }),
      page.getByRole("button", { name: "Attach image", exact: true }),
      page.getByRole("button", { name: "Show file panel", exact: true }),
    ]) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }

    await context.close();
  });

  test("AC-RWD-4: AppShell consumes safe-area inset variables", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openSession(page);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--safe-area-top", "11px");
      document.documentElement.style.setProperty("--safe-area-right", "12px");
      document.documentElement.style.setProperty("--safe-area-bottom", "13px");
      document.documentElement.style.setProperty("--safe-area-left", "14px");
    });

    await expect(page.getByTestId("app-shell")).toHaveCSS("padding", "11px 12px 13px 14px");
    await expectNoPageOverflow(page);
  });

  test("AC-RWD-5: opening a file on mobile dismisses Explorer and keeps the viewer in the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openSession(page);

    await page.getByRole("button", { name: "Explorer", exact: true }).click();
    const sidebar = page.locator(".sidebar-container");
    await expect(sidebar).toHaveClass(/sidebar-open/);
    await expect(page.getByText("README.md", { exact: true })).toBeVisible();

    await page.getByText("README.md", { exact: true }).click();

    const viewer = page.locator(".right-panel-container");
    await expect(sidebar).toHaveClass(/sidebar-closed/);
    await expect(viewer).toHaveClass(/right-panel-open/);
    await expect(page.getByText("E2E fixture.", { exact: true })).toBeVisible();

    const viewerBox = await viewer.boundingBox();
    expect(viewerBox).not.toBeNull();
    expect(viewerBox!.x).toBeGreaterThanOrEqual(44);
    expect(viewerBox!.x + viewerBox!.width).toBeLessThanOrEqual(320);
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "Explorer", exact: true }).click();
    await expect(sidebar).toHaveClass(/sidebar-open/);
    await expect(sidebar.getByText("README.md", { exact: true })).toBeVisible();
  });

  test("AC-RWD-6: mobile composer preserves typing space and keeps Send visible", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openSession(page);

    const shell = page.getByTestId("composer-shell");
    const inputRow = page.getByTestId("composer-input-row");
    const toolbar = page.getByTestId("composer-toolbar");
    const textarea = page.getByRole("textbox", { name: "Message…" });
    const send = page.getByRole("button", { name: "Send", exact: true });

    await expect(shell).toBeVisible();
    await expect(send).toBeVisible();
    await expect(inputRow.getByRole("textbox", { name: "Message…" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Send", exact: true })).toBeVisible();

    const [shellBox, textareaBox, sendBox] = await Promise.all([
      shell.boundingBox(),
      textarea.boundingBox(),
      send.boundingBox(),
    ]);
    expect(shellBox).not.toBeNull();
    expect(textareaBox).not.toBeNull();
    expect(sendBox).not.toBeNull();
    expect(textareaBox!.width).toBeGreaterThanOrEqual(200);
    expect(textareaBox!.width).toBeGreaterThanOrEqual(shellBox!.width * 0.75);
    expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(320);
    await expectNoPageOverflow(page);
  });

  test("AC-RWD-7: reasoning controls use Traditional Chinese without simplified Chinese", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("pi-locale", "zh"));
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(MAIN);
    await expect(page.getByRole("textbox", { name: "輸入訊息…" })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "切換推理層級" }).click();
    await expect(page.getByText("沿用 Pi 預設值", { exact: true })).toBeVisible();
    await expect(page.getByText("低強度推理", { exact: true })).toBeVisible();
    await expect(page.getByText("最高強度推理", { exact: true })).toBeVisible();
    await expect(page.getByText(/切换|默认|关闭|强度|设置/)).toHaveCount(0);
  });
});
