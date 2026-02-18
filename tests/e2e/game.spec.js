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

  const songName = page.locator("#songName");
  await expect(songName).not.toHaveText("-");
  await expect(songName).toHaveText(
    /(Neon Drive|Laser Grid|Afterburner|Prism Rush|Arcade Pulse|Laser Skyline|Hyperdrive Glow|Neon Valkyrie|Circuit Bloom)/
  );
});

test("AI mode updates HUD state", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#opponentSelect", "ai");
  await page.waitForFunction(() => {
    const el = document.getElementById("aiState");
    return el && el.textContent === "ON";
  });
});

test("next track updates song label", async ({ page }) => {
  await page.goto("/");
  const songName = page.locator("#songName");
  const nextTrack = page.locator("#nextTrackBtn");

  await expect(songName).not.toHaveText("-");
  const before = await songName.textContent();
  let changed = false;
  for (let i = 0; i < 5; i += 1) {
    await nextTrack.click();
    const after = await songName.textContent();
    if (after && after !== before) {
      changed = true;
      break;
    }
  }
  expect(changed).toBe(true);
});
