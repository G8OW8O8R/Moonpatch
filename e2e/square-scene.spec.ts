import { expect, test } from "@playwright/test";

test("the signpost and the board belong to the scene: invisible targets over them, paint and light without any glow", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto("/en#square");
  const canvas = page.locator("canvas[data-gate-canvas]");
  await expect(canvas).toHaveAttribute("data-gate-canvas", /^(webgl|fallback)$/, { timeout: 15_000 });
  await expect(page.locator(".square-props")).not.toHaveAttribute("inert");

  const signpost = page.getByRole("navigation", { name: "Signpost" });
  const barn = signpost.getByRole("link", { name: "Barn" });
  const board = page.getByRole("button", { name: /Notice board/ });

  if ((await canvas.getAttribute("data-gate-canvas")) === "webgl") {
    // The scene paints the props; the page only holds their targets, exactly over them, with nothing to see.
    await expect(page.locator(".square-props img")).toHaveCount(0);
    await expect(barn.locator(".sr-only")).toHaveText("Barn");
  }

  // Pointer and keyboard both reach every target.
  await barn.hover();
  await expect(barn).toHaveCSS("cursor", "pointer");
  await board.hover();
  await board.focus();
  await expect(board).toBeFocused();

  // No light is faked in the stylesheet: no lantern glow, no blurred halo around the square's words.
  await expect(page.locator(".notice-lantern")).toHaveCount(0);
  for (const words of [page.locator(".tagline"), page.locator(".square-hint")]) {
    const shadow = await words.evaluate((el) => getComputedStyle(el).textShadow);
    const blurs = [...shadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/g)].map((m) => Number(m[3]));
    expect(Math.max(0, ...blurs)).toBeLessThanOrEqual(2);
  }

  // Without WebGL the square is plain HTML: the props in the dusk light baked for them, the same painted capitals.
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, reducedMotion: "reduce" });
  const plain = await context.newPage();
  await plain.goto("/en#square");
  await expect(plain.locator("canvas[data-gate-canvas]")).toHaveAttribute("data-gate-canvas", "fallback");
  await expect(plain.locator(".sign-post img.prop-dusk")).toHaveAttribute("src", "/img/square/post-dusk.webp");
  const label = plain.locator(".arm-label").first();
  await expect(label).toHaveCSS("text-transform", "uppercase");
  await expect(label).toHaveCSS("mix-blend-mode", "multiply");
  expect(await label.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Fraunces/i);
  await expect(plain.locator(".square-grain")).toHaveCount(1);
  await context.close();
});
