import { expect, test } from "@playwright/test";

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

  for (const { viewport, plate, ratio } of [
    { viewport: { width: 1536, height: 864 }, plate: "gate", ratio: 2576 / 1438 },
    { viewport: { width: 1920, height: 1080 }, plate: "gate", ratio: 2576 / 1438 },
    { viewport: { width: 390, height: 844 }, plate: "gate-tall", ratio: 2552 / 4577 },
  ]) {
    test(`fills ${viewport.width}×${viewport.height} with ${plate} without stretching`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/en");

      const poster = page.locator("main picture img");
      await expect(poster).toBeVisible();
      await expect
        .poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
        .toBeGreaterThan(0);

      expect(await poster.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });

      const fit = await poster.evaluate((img: HTMLImageElement) => ({
        objectFit: getComputedStyle(img).objectFit,
        ratio: img.naturalWidth / img.naturalHeight,
        source: img.currentSrc,
        priority: img.getAttribute("fetchpriority"),
      }));
      expect(fit.objectFit).toBe("cover");
      expect(Math.abs(fit.ratio / ratio - 1)).toBeLessThan(0.005);
      expect(new URL(fit.source).pathname).toMatch(new RegExp(`^/img/plates/${plate}-\\d+\\.(avif|webp)$`));
      expect(fit.priority).toBe("high");

      // The poster is requested from the head, ahead of scripts and fonts.
      const preloaded = await page
        .locator('link[rel="preload"][as="image"][fetchpriority="high"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute("imagesrcset") ?? ""));
      expect(preloaded.some((srcset) => srcset.includes(`/img/plates/${plate}-`))).toBe(true);

      for (const label of ["EN", "PL"]) {
        await expect(
          page.getByRole("navigation").getByRole("link", { name: new RegExp(`^${label}`) }),
        ).toBeInViewport({ ratio: 1 });
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
