import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

type CanvasSample = {
  ok: boolean;
  reason: string;
  variance?: number;
  colorBuckets?: number;
};

async function sampleCanvas(page: import('@playwright/test').Page): Promise<CanvasSample> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  if (!box || box.width < 32 || box.height < 32) {
    return { ok: false, reason: 'canvas-too-small' };
  }

  const buffer = await canvas.screenshot();
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  let alphaPixels = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));

  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) alphaPixels += 1;
    buckets.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 6}`);
  }

  const variance = max - min;
  return {
    ok: alphaPixels > 256 && (variance > 8 || buckets.size > 3),
    reason: 'sampled',
    variance,
    colorBuckets: buckets.size,
  };
}

async function resumeAfterLevelUp(page: import('@playwright/test').Page): Promise<void> {
  const mode = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.mode);
  if (mode !== 'level-up') return;
  const firstChoice = page.locator('#overlay-body button').first();
  await expect(firstChoice).toBeVisible();
  await firstChoice.click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'playing', undefined, { timeout: 3000 });
}

test('renders a nonblank interactive game canvas', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.getByRole('button', { name: /射手步枪/ }).click();
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.mode === 'playing');
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window.__THREE_GAME_DIAGNOSTICS__?.projectiles ?? 0) + (window.__THREE_GAME_DIAGNOSTICS__?.scheduledShots ?? 0),
      ),
    )
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.lowestEnemyHealthRatioSeen ?? 1), { timeout: 15000 })
    .toBeLessThan(0.98);

  const sample = await sampleCanvas(page);
  expect(sample, JSON.stringify(sample)).toMatchObject({ ok: true });
  await resumeAfterLevelUp(page);

  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? 0);

  if (testInfo.project.name.includes('mobile')) {
    const stick = page.locator('#touch-stick');
    await expect(stick).toBeVisible();
    const box = await stick.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.05, { steps: 6 });
      await page.waitForTimeout(450);
      await page.mouse.up();
    }
  } else {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyW');
  }

  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? 0))
    .toBeLessThan(before - 0.3);
  await resumeAfterLevelUp(page);

  const staminaBeforeRoll = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.stamina ?? 100);
  await page.keyboard.press('Space');
  await resumeAfterLevelUp(page);
  if ((await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.stamina ?? 100)) >= staminaBeforeRoll - 1) {
    await page.keyboard.press('Space');
  }
  await expect
    .poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.stamina ?? 100))
    .toBeLessThan(staminaBeforeRoll - 10);

  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-game`, {
    body: screenshot,
    contentType: 'image/png',
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
