import { expect, test } from "@playwright/test";

const PLATE_RATIO = 2576 / 1438;

test.describe("gate poster", () => {
  test("the front door picks the visitor's language", async ({ browser }) => {
    for (const [locale, expected] of [
      ["pl-PL", "/pl"],
      ["en-US", "/en"],
      ["de-DE", "/en"],
    ] as const) {
      // The browser derives Accept-Language from its locale.
      const context = await browser.newContext({ locale });
      const page = await context.newPage();
      await page.goto("/");
      expect(new URL(page.url()).pathname).toBe(expected);
      await context.close();
    }
  });

  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    test(`fills ${viewport.width}×${viewport.height} without stretching and is the largest paint`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/en");

      const poster = page.locator("main picture img");
      await expect(poster).toBeVisible();
      await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

      // Edge to edge; at most the one-pixel seam at the bottom that keeps it measurable.
      const box = await poster.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.x).toBe(0);
      expect(box?.y).toBe(0);
      expect(box?.width).toBe(viewport.width);
      expect(viewport.height - (box?.height ?? 0)).toBeLessThanOrEqual(1);

      const fit = await poster.evaluate((img: HTMLImageElement) => ({
        objectFit: getComputedStyle(img).objectFit,
        ratio: img.naturalWidth / img.naturalHeight,
        source: img.currentSrc,
      }));
      expect(fit.objectFit).toBe("cover");
      expect(Math.abs(fit.ratio / PLATE_RATIO - 1)).toBeLessThan(0.005);
      expect(fit.source).toMatch(/\/img\/plates\/gate-\d+\.(avif|webp)$/);

      const lcp = await page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            new PerformanceObserver((list) => {
              const last = list.getEntries().at(-1) as (PerformanceEntry & { element?: Element | null }) | undefined;
              resolve(last?.element?.tagName ?? "none");
            }).observe({ type: "largest-contentful-paint", buffered: true });
          }),
      );
      expect(lcp).toBe("IMG");

      for (const label of ["EN", "PL"]) {
        await expect(page.getByRole("navigation").getByRole("link", { name: new RegExp(`^${label}`) })).toBeInViewport({
          ratio: 1,
        });
      }
    });
  }

  test("announces both languages and switches between them", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    for (const [hreflang, path] of [
      ["en", "/en"],
      ["pl", "/pl"],
      ["x-default", "/en"],
    ]) {
      const href = await page.locator(`link[rel="alternate"][hreflang="${hreflang}"]`).getAttribute("href");
      expect(new URL(href ?? "").pathname).toBe(path);
    }

    await page.getByRole("link", { name: /^PL/ }).click();
    await expect(page).toHaveURL(/\/pl$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
    await expect(page.getByRole("link", { name: /^PL/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Moonpatch Farm");
  });
});
