import { expect, test } from "@playwright/test";

const EIGHT = ["01-pumpkin-spice-latte", "02-cider-donuts", "03-cinnamon-rolls", "04-pumpkin-pie", "05-pumpkin-butter", "07-plaid-blanket", "10-amber-candle", "16-cauldron"];

for (const size of [
  { width: 1536, height: 864 },
  { width: 390, height: 844 },
]) {
  test(`a full wheelbarrow scrolls its list under the wheel and keeps the order button in sight at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.addInitScript((ids) => {
      localStorage.setItem("moonpatch-wheelbarrow", JSON.stringify({ state: { lines: ids.map((id) => ({ id, qty: 1 })), visitDay: null }, version: 1 }));
    }, EIGHT);
    await page.goto("/en/barn");
    await page.keyboard.press("Shift");

    await page.getByRole("button", { name: "8 in your wheelbarrow" }).click();
    const basket = page.getByRole("dialog", { name: "Your wheelbarrow" });
    await expect(basket).toBeVisible();

    const list = basket.locator(".basket-body");
    await expect(list).toHaveAttribute("data-scrolls", "");
    const checkout = basket.getByRole("button", { name: "Checkout" });
    await expect(checkout).toBeInViewport({ ratio: 1 });

    // A real wheel over the list, with the page's smooth scroll stopped beneath the dialog.
    const box = await list.boundingBox();
    if (!box) throw new Error("the list has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = await list.evaluate((el) => el.scrollTop);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);

    await expect(checkout).toBeInViewport({ ratio: 1 });
    await checkout.click();
    // No day picked yet: the order asks for one, which proves the click reached the button.
    await expect(basket.getByText("Pick a day", { exact: false })).toBeVisible();
  });
}
