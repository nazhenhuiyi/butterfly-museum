import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('身体专项：两物种整页和背腹侧斜近景', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const directory = resolve(process.env.BODY_EVIDENCE_ROOT || 'test-results/body', process.env.BODY_STAGE || 'after', testInfo.project.name);
  mkdirSync(directory, { recursive: true });
  const errors = [];
  const observations = [];
  const assetRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => assetRequests.push(request.url()));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const viewport = page.locator('#viewport');
  for (const [index, name] of ['morpho', 'monarch'].entries()) {
    if (index) await page.locator('#next').click();
    await expect(viewport).toHaveAttribute('data-species', index ? 'Danaus plexippus' : 'Morpho menelaus');
    await expect(page.locator('#fallback')).toBeHidden();
    await page.screenshot({ path: `${directory}/${name}-full.png`, fullPage: true });
    for (const view of ['dorsal', 'ventral', 'side', 'oblique']) {
      await page.locator(`#view-${view === 'oblique' ? 'ventral' : view}`).click();
      for (let step = 0; step < 10; step++) await page.locator('#zoom-in').click();
      if (view === 'oblique') {
        const bounds = await page.locator('canvas').boundingBox();
        await page.mouse.move(bounds.x + bounds.width * .50, bounds.y + bounds.height * .45);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width * .64, bounds.y + bounds.height * .48, { steps: 12 });
        await page.mouse.up();
      }
      await page.waitForTimeout(150);
      observations.push({ species: name, requestedView: view, ...await viewport.evaluate(element => ({
        view: element.dataset.view,
        distance: element.dataset.cameraDistance,
        camera: element.dataset.cameraPosition,
        pausedAngle: element.dataset.wingAngle
      })) });
      if (view !== 'oblique') await expect(viewport).toHaveAttribute('data-view', view);
      else await expect(viewport).toHaveAttribute('data-view', 'oblique');
      await page.locator('canvas').screenshot({ path: `${directory}/${name}-${view}.png` });
    }
    await page.locator('#reset').click();
    await expect(viewport).toHaveAttribute('data-camera-distance', '8.700');
    for (const selector of ['#zoom-in', '#zoom-out', '#reset', '#next', '#view-dorsal', '#view-ventral', '#view-side']) {
      await expect(page.locator(selector)).toBeInViewport();
      const reachable = await page.locator(selector).evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      });
      expect(reachable).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(assetRequests.every(url => url.startsWith(testInfo.project.use.baseURL || 'http://127.0.0.1:'))).toBe(true);
  writeFileSync(`${directory}/capture-log.json`, JSON.stringify({ observations, errors, assetRequests }, null, 2));
});
