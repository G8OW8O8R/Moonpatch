import { type Page, expect, test } from "@playwright/test";

const VIEWPORT = { width: 1536, height: 864 };

/** Seeded, so a failing spot can be found again. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** From the very first frame of every document: the scroll and the header's scene, once per painted frame. */
const recordFrames = () => {
  const frames: { y: number; header: string | null }[] = [];
  (window as unknown as { __frames: typeof frames }).__frames = frames;
  const sample = () => {
    frames.push({ y: Math.round(window.scrollY), header: document.querySelector("main section")?.getAttribute("data-header") ?? null });
    if (frames.length < 600) requestAnimationFrame(() => setTimeout(sample, 0));
  };
  requestAnimationFrame(() => setTimeout(sample, 0));
};

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: { y: number; header: string | null }[] }).__frames);

/** Restarts the record in the same document (a move inside the site keeps the page's scripts). */
const restartFrames = (page: Page) => page.evaluate(recordFrames);

const sectionTop = (page: Page) => page.locator("main section").first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);

const scrollInto = (page: Page, screens: number) =>
  page.evaluate((screens) => {
    const el = document.querySelector("main section")!;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + screens * window.innerHeight, behavior: "instant" });
  }, screens);

const sceneReady = (page: Page) =>
  expect(page.locator("canvas[data-gate-canvas]")).toHaveAttribute("data-gate-canvas", /^(webgl|fallback)$/, { timeout: 15_000 });

/** Watches for anything the page reports as wrong. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

test.describe("where the front page starts", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.addInitScript(recordFrames);
  });

  test("a reload anywhere in the scene starts on the closed gate, from the first frame on", async ({ page }) => {
    test.setTimeout(180_000);
    const problems = watchConsole(page);
    await page.goto("/en");
    await sceneReady(page);
    const random = seeded(20261013);

    for (let i = 0; i < 20; i++) {
      // Anywhere in the section: the opening, the ride, dusk, the push-in.
      const spot = random() * 2.75;
      await scrollInto(page, spot);
      await page.waitForTimeout(100 + random() * 900);
      await page.reload();
      await sceneReady(page);
      await page.waitForTimeout(300);

      const seen = await frames(page);
      expect(seen.length, `spot ${spot.toFixed(2)}`).toBeGreaterThan(5);
      // Before the scene is parsed there is no header to read yet, but the page is already at the top.
      for (const frame of seen) {
        expect(frame.y, `spot ${spot.toFixed(2)}`).toBe(0);
        if (frame.header !== null) expect(frame.header, `spot ${spot.toFixed(2)}`).toBe("ink");
      }
      await expect(page).toHaveURL(/\/en$/);
      await expect(page.locator("img.gate-poster")).toBeVisible();
      await expect(page.locator(".square-props")).toHaveAttribute("inert");
    }
    expect(problems).toEqual([]);
  });

  test("back from a building, the square is at dusk on the very spot it was left, with no ride", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/pl");
    await sceneReady(page);
    const top = await sectionTop(page);
    await scrollInto(page, 2.4);
    const section = page.locator("main section").first();
    await expect(section).toHaveAttribute("data-header", "paper");
    await expect(page.locator(".square-props")).not.toHaveAttribute("inert");
    const left = await page.evaluate(() => Math.round(window.scrollY));
    expect(left).toBe(Math.round(top + 2.4 * VIEWPORT.height));

    const cafe = page.getByRole("navigation", { name: "Drogowskaz" }).getByRole("link", { name: "Kawiarnia" });
    const back = page.getByRole("link", { name: "Wróć na plac" });

    // By the way back on the building's page, then by the browser's back button.
    for (const via of ["link", "browser"] as const) {
      await cafe.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/pl\/kawiarnia$/);
      await expect(back).toBeVisible();
      await restartFrames(page);
      if (via === "link") await back.click();
      else await page.goBack();

      await expect(page).toHaveURL(/\/pl$/);
      await expect(section).toHaveAttribute("data-header", "paper");
      await expect(page.locator(".square-props")).not.toHaveAttribute("inert");
      await page.waitForTimeout(600);
      // Every frame of the square shows dusk on the same spot: the gate never comes back, the ride never plays.
      const square = (await frames(page)).filter((frame) => frame.header !== null);
      expect(square.length, via).toBeGreaterThan(5);
      for (const frame of square) expect(frame, via).toEqual({ y: left, header: "paper" });
    }

    // Arriving at the building's own address, the way back still leads to the square at dusk.
    await page.goto("/pl/kawiarnia");
    await back.click();
    await expect(page).toHaveURL(/\/pl$/);
    await expect(section).toHaveAttribute("data-header", "paper");
    expect(problems).toEqual([]);
  });

  test("closing the notice board leaves the square where it was", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/en");
    await sceneReady(page);
    await scrollInto(page, 2);
    const section = page.locator("main section").first();
    await expect(section).toHaveAttribute("data-header", "paper");
    await expect(page.locator(".square-props")).not.toHaveAttribute("inert");
    const left = await page.evaluate(() => Math.round(window.scrollY));
    const board = page.getByRole("button", { name: /Notice board/ });
    const dialog = page.getByRole("dialog", { name: "Notice board" });

    for (const via of ["escape", "close", "browser"] as const) {
      await board.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/en\/visit$/);
      await expect(dialog).toBeVisible();
      if (via === "escape") await page.keyboard.press("Escape");
      else if (via === "close") await dialog.getByRole("button", { name: "Back to the square" }).click();
      else await page.goBack();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/en$/);
      await expect(section).toHaveAttribute("data-header", "paper");
      expect(await page.evaluate(() => Math.round(window.scrollY)), via).toBe(left);
    }

    // On the board's own address, closing it shows the square at dusk.
    await page.goto("/en/visit");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/en$/);
    await expect(section).toHaveAttribute("data-header", "paper");
    expect(problems).toEqual([]);
  });

  test("the console stays clean on the front door, the square, the board and a building", async ({ page }) => {
    const problems = watchConsole(page);
    for (const path of ["/", "/pl", "/en/visit", "/pl/kawiarnia"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path !== "/pl/kawiarnia") await sceneReady(page);
    }
    expect(problems).toEqual([]);
  });
});
