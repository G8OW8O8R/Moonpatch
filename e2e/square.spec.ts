import { expect, test } from "@playwright/test";

const PAPER = "rgb(245, 240, 232)";

test("dusk on the square: the signpost leads to the buildings, the notice board opens and closes from the keyboard", async ({ page, browserName }) => {
  // WebKit here never steps onto links with the Tab key (a browser setting); it is given the focus instead.
  const tabsToLinks = browserName !== "webkit";
  await page.setViewportSize({ width: 1536, height: 864 });
  // The square's own address: the scene starts where it ends, at dusk.
  await page.goto("/en#square");
  await expect(page.locator("canvas[data-gate-canvas]")).toHaveAttribute("data-gate-canvas", /^(webgl|fallback)$/, { timeout: 15_000 });

  const section = page.locator("main section").first();
  await expect(section).toHaveAttribute("data-header", "paper");
  await expect(page.locator("header")).toHaveCSS("color", PAPER);
  await expect(page.getByText("Pick a door. Stay a while.")).toBeVisible();

  // The signpost is the way into the buildings, one link per arm.
  const signpost = page.getByRole("navigation", { name: "Signpost" });
  for (const [name, href] of [
    ["Café", "/en/cafe"],
    ["Barn", "/en/barn"],
    ["Haunt Shop", "/en/haunt"],
  ] as const) {
    const arm = signpost.getByRole("link", { name });
    await expect(arm).toHaveAttribute("href", href);
    await expect(arm).toBeInViewport({ ratio: 1 });
  }

  // From the keyboard: the signpost first, then the notice board (once the props stand on the square).
  await expect(page.locator(".square-props")).not.toHaveAttribute("inert");
  const board = page.getByRole("button", { name: /Notice board/ });
  if (tabsToLinks) {
    await page.getByRole("link", { name: "PL – Polski" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /in your wheelbarrow/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(signpost.getByRole("link", { name: "Café" })).toBeFocused();
    for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  } else {
    await page.getByRole("button", { name: /in your wheelbarrow/ }).focus();
    await page.keyboard.press("Tab");
  }
  await expect(board).toBeFocused();

  // The board opens on its own address, as a dialog that holds the focus.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/en\/visit$/);
  const dialog = page.getByRole("dialog", { name: "Notice board" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Open every weekend in October")).toBeVisible();
  await expect(dialog.getByText(/fictional farm, a concept site by GOVO DIGITAL/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "govodigital.com" })).toHaveAttribute("href", "https://www.govodigital.com");
  const close = dialog.getByRole("button", { name: "Back to the square" });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  // Esc goes back to the square, and the focus with it.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/en(#square)?$/);
  await expect(board).toBeFocused();

  // The board's address in Polish renders the board, open, on the server.
  const response = await page.request.get("/pl/odwiedz-nas");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Otwarte w każdy weekend października");
  expect(html).toContain("fikcyjna farma");
  expect(html).toContain('role="dialog"');

  // And each building has its own server-rendered page, with a Polish address.
  const cafe = await page.request.get("/pl/kawiarnia");
  expect(cafe.status()).toBe(200);
  expect(await cafe.text()).toContain("<h1");
});
