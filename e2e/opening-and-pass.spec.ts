import { expect, test } from "@playwright/test";

const stage = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.dataset.intro ?? "none");

test("the opening plays once in full, is skipped by a key, is short on a later visit and absent with reduced motion", async ({ page, browser }) => {
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  expect(await stage(page)).toMatch(/^(first|leaving|skip|done)$/);
  // The gate and its words are in the page underneath from the start.
  await expect(page.getByRole("heading", { level: 1, name: "Moonpatch Farm" })).toBeAttached();
  await expect(page.locator("img.gate-poster")).toBeAttached();
  await page.keyboard.press("Shift");
  await expect.poll(() => stage(page), { timeout: 3000 }).toBe("done");
  await expect(page.locator(".intro")).toBeHidden();

  await page.reload({ waitUntil: "domcontentloaded" });
  const started = Date.now();
  await expect.poll(() => stage(page), { timeout: 3000 }).toBe("done");
  expect(Date.now() - started).toBeLessThan(1500);

  const calm = await browser.newContext({ reducedMotion: "reduce" });
  const still = await calm.newPage();
  await still.goto("/en");
  expect(await stage(still)).toBe("none");
  await expect(still.locator(".intro")).toBeHidden();
  await calm.close();
});

// The way to the pass is walked from the keyboard (the dialogs hold and hand on the focus).
test("a latte kept for the visit comes out as a Farm Pass that can be saved", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/en/cafe");
  await page.locator('.seed[data-product="01-pumpkin-spice-latte"]').click();
  await page.getByRole("button", { name: "Save for my visit" }).click();
  await expect(page.getByRole("button", { name: "1 in your wheelbarrow" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "1 in your wheelbarrow" }).focus();
  await page.keyboard.press("Enter");
  const basket = page.getByRole("dialog", { name: "Your wheelbarrow" });
  await expect(basket).toBeVisible();
  await expect(basket.getByRole("heading", { name: "Waiting at the farm" })).toBeVisible();
  await basket.getByRole("radio").first().focus();
  await page.keyboard.press("Space");
  await expect(basket.getByRole("radio").first()).toBeChecked();
  await basket.getByRole("button", { name: "Checkout" }).focus();
  await page.keyboard.press("Enter");

  const pass = page.getByRole("dialog", { name: "Farm Pass" });
  await expect(pass).toBeVisible();
  await expect(pass).toContainText("Pumpkin Spice Latte");
  const download = page.waitForEvent("download");
  await pass.getByRole("button", { name: "Save ticket" }).focus();
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toMatch(/^moonpatch-farm-pass.*\.png$/);
});

test("search engines find both languages, the products, and a wrong turn answered in its own language", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/pl/kawiarnia</loc>");
  expect(sitemap).toMatch(/hreflang="x-default" href="[^"]+\/en\/cafe"/);
  expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");

  await page.goto("/pl/stodola");
  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? "{}") as { "@graph"?: { offers: { priceCurrency: string } }[] };
  expect(data["@graph"]?.length).toBe(6);
  expect(data["@graph"]?.[0]?.offers.priceCurrency).toBe("PLN");
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", /\/en\/barn$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/img\/og\/barn\.jpg$/);

  const lost = await page.goto("/pl/nigdzie");
  expect(lost?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("heading", { level: 1, name: "Ta ścieżka prowadzi donikąd." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Wróć do bramy" })).toHaveAttribute("href", "/pl");
});
