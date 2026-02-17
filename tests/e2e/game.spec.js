import { test, expect } from "@playwright/test";

test("boots and updates HUD during play", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/UBERPONG/);

  const canvas = page.locator("#gameCanvas");
  await expect(canvas).toBeVisible();

  await page.click("#startBtn");

  await page.waitForFunction(() => {
    const el = document.getElementById("tempoValue");
    return el && Number(el.textContent) > 0;
  });

  await page.waitForFunction(() => {
    const el = document.getElementById("uberFill");
    if (!el) return false;
    const width = parseFloat(getComputedStyle(el).width || "0");
    return width > 0;
  });
});

test("AI mode updates HUD state", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#opponentSelect", "ai");
  await page.waitForFunction(() => {
    const el = document.getElementById("aiState");
    return el && el.textContent === "ON";
  });
});
