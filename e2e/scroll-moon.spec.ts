import { expect, test } from "@playwright/test";

test("with a mouse the scrollbar gives way to a moon that rides the right edge", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/en");

  // No system bar eating into the frame.
  const widths = await page.evaluate(() => [document.documentElement.clientWidth, window.innerWidth]);
  expect(widths[0]).toBe(widths[1]);

  const indicator = page.locator(".scroll-moon");
  await expect(indicator).toHaveAttribute("aria-hidden", "true");
  await expect(indicator).toHaveCSS("opacity", "0");
  await expect(indicator).toHaveCSS("pointer-events", "none");

  // The keyboard still scrolls, and the moon wakes up and follows.
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(indicator).toHaveCSS("opacity", "1");

  const share = await page.evaluate(() => {
    const limit = document.documentElement.scrollHeight - window.innerHeight;
    return window.scrollY / limit;
  });
  const line = (await indicator.locator(".scroll-moon-line").boundingBox())!;
  await expect
    .poll(async () => {
      const moon = (await indicator.locator(".scroll-moon-thumb").boundingBox())!;
      return moon.y + moon.height / 2 - (line.y + share * line.height);
    })
    .toBeCloseTo(0, 0);

  // At rest it fades away again.
  await expect(indicator).toHaveCSS("opacity", "0", { timeout: 4_000 });
});

test("touch screens keep their own scrollbar and get no moon", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto("/en");
  await expect(page.locator(".scroll-moon")).toBeHidden();
  await context.close();
});
