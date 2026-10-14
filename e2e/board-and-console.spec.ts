import { type Page, expect, test } from "@playwright/test";
import { boardLayoutProblems } from "./board-layout";
import { isBrowserNote } from "./browser-notes";

/** Everything the page says to the console that is not plain information. */
function listen(page: Page) {
  const said: string[] = [];
  page.on("console", (message) => {
    if ((message.type() === "error" || message.type() === "warning") && !isBrowserNote(message.text())) said.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    if (!isBrowserNote(error.message)) said.push(`pageerror: ${error.message}`);
  });
  return said;
}

const settle = async (page: Page) => {
  await expect(page.locator("canvas[data-gate-canvas], main")).not.toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
};

test.describe("a clean console", () => {
  for (const path of ["/", "/pl", "/en/visit", "/pl/kawiarnia"]) {
    test(`on ${path}`, async ({ page }) => {
      const said = listen(page);
      await page.goto(path);
      await settle(page);
      expect(said).toEqual([]);
    });
  }

  test("on the way back from a building", async ({ page }) => {
    const said = listen(page);
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.goto("/pl#square");
    await settle(page);
    await page.getByRole("navigation", { name: "Drogowskaz" }).getByRole("link", { name: "Kawiarnia" }).click();
    await expect(page).toHaveURL(/\/pl\/kawiarnia$/);
    await settle(page);
    await page.getByRole("link", { name: "Wróć na plac" }).click();
    await expect(page).toHaveURL(/\/pl(#square)?$/);
    // Back on the square, it is there at once: drawn by the scene, or as its own picture while the scene loads.
    const plate = page.locator(".square-plates img.square-dusk");
    if (await plate.count()) await expect(plate).toHaveJSProperty("complete", true);
    else await expect(page.locator("canvas[data-gate-canvas]")).toHaveAttribute("data-gate-canvas", "webgl");
    await settle(page);
    expect(said).toEqual([]);
  });
});

test("the opened board reads cleanly in both languages and at every size", async ({ browser }) => {
  for (const [width, height] of [
    [1536, 864],
    [1920, 1080],
    [390, 844],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 640, hasTouch: width < 640 });
    const page = await context.newPage();
    for (const path of ["/en/visit", "/pl/odwiedz-nas"]) {
      await page.goto(path);
      // The cards and the square behind them are in the page's first HTML, before any script.
      await expect(page.locator(".notice-board")).toBeVisible();
      await expect(page.locator(".visit-backdrop")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await boardLayoutProblems(page), `${path} at ${width}×${height}`).toEqual([]);
    }
    await context.close();
  }
});
