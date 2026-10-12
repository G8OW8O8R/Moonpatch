import { expect, test } from "@playwright/test";

const INK = "rgb(43, 33, 28)";

test("scrolling opens the gate and rides onto the square, with the header in ink all the way", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/en");

  const section = page.locator("main section").first();
  const canvas = page.locator("canvas[data-gate-canvas]");
  await expect(section).toHaveAttribute("data-header", "ink");
  // About two and a half screens of scroll.
  const height = await section.evaluate((el) => el.getBoundingClientRect().height);
  expect(height / 864).toBeCloseTo(2.5, 1);

  // The scene settles on WebGL, or on the poster fallback where WebGL cannot keep up.
  await expect(canvas).toHaveAttribute("data-gate-canvas", /^(webgl|fallback)$/, { timeout: 15_000 });
  const mode = await canvas.getAttribute("data-gate-canvas");

  for (const share of [0.2, 0.6, 1]) {
    await page.evaluate((share) => {
      const el = document.querySelector("main section")!;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + share * (el.clientHeight - window.innerHeight), behavior: "instant" });
    }, share);
    await expect(page.locator("header")).toHaveCSS("color", INK);
  }

  // The stage stays pinned to the screen for the whole ride.
  const stage = await section.locator("> div").first().boundingBox();
  expect(stage).toEqual({ x: 0, y: 0, width: 1536, height: 864 });

  if (mode === "webgl") {
    await expect(canvas).toBeVisible();
  } else {
    // Without WebGL the poster fades to the square halfway down.
    await expect(page.locator('img[src*="square-golden"]')).toHaveCSS("opacity", "1");
  }
});
