import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#viewport')).toHaveAttribute('data-species', 'Morpho menelaus');
}

test('飞行状态：暂停继续、Esc、观察面、换种、reduce、隐藏及恢复交互', async ({ page }) => {
  await ready(page);
  const viewport = page.locator('#viewport');
  await page.locator('#motion').click();
  await expect(viewport).toHaveAttribute('data-flight-mode', 'flight');
  await page.waitForTimeout(1200);
  await page.locator('#motion').click();
  const frozen = await viewport.getAttribute('data-camera-position');
  await page.waitForTimeout(250);
  await expect(viewport).toHaveAttribute('data-camera-position', frozen);
  await page.locator('#motion').click();
  await expect(viewport).not.toHaveAttribute('data-camera-position', frozen);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(viewport).toHaveAttribute('data-flight-paused', 'true');
  await expect(page.locator('#flight-status')).toContainText('减少动态');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#motion').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenTime = Number(await viewport.getAttribute('data-flight-time'));
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(80);
  expect(Number(await viewport.getAttribute('data-flight-time')) - hiddenTime).toBeLessThan(.3);
  const protocol = await page.context().newCDPSession(page);
  await protocol.send('Page.setWebLifecycleState', { state: 'frozen' });
  await page.waitForTimeout(600);
  await protocol.send('Page.setWebLifecycleState', { state: 'active' });
  await protocol.detach();
  await page.keyboard.press('Escape');
  await expect(viewport).toHaveAttribute('data-flight-mode', 'atlas');
  await expect(viewport).toHaveAttribute('data-camera-position', '0.000,0.000,8.700');
  await expect(viewport).toHaveAttribute('data-model-position', '0,0,0');
  await page.locator('#zoom-in').click();
  await expect.poll(async () => Number(await viewport.getAttribute('data-camera-distance'))).toBeLessThan(8.7);
  const bounds = await viewport.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .4, bounds.y + bounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .6, { steps: 8 });
  await page.mouse.up();
  await expect(viewport).toHaveAttribute('data-view', 'oblique');
  for (const button of ['view-ventral', 'view-side', 'reset', 'exit-flight']) {
    await page.locator('#motion').click();
    await page.waitForTimeout(150);
    await page.locator(`#${button}`).click();
    await expect(viewport).toHaveAttribute('data-flight-mode', 'atlas');
    await expect(viewport).toHaveAttribute('data-wing-angle', '0.00000');
  }
  await page.locator('#motion').click();
  await page.locator('#next').click();
  await expect(viewport).toHaveAttribute('data-species', 'Danaus plexippus');
  await expect(viewport).toHaveAttribute('data-flight-mode', 'atlas');
  await expect(page.locator('#motion')).toHaveText('飞行观赏');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.locator('#motion').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#exit-flight')).toBeInViewport();
  const viewerBounds = await viewport.boundingBox();
  for (const selector of ['.tools', '.view-tools', '#flight-status']) {
    const bounds = await page.locator(selector).boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(viewerBounds.y + viewerBounds.height);
  }
  await page.locator('.information').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(viewport).toHaveAttribute('data-flight-mode', 'flight');
});

test('两物种完整连续镜头：视频、关键帧及有限坐标', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const directory = resolve('evidence/flight', process.env.FLIGHT_STAGE || 'first', testInfo.project.name);
  mkdirSync(directory, { recursive: true });
  const context = await browser.newContext({ ...testInfo.project.use, baseURL: testInfo.project.use.baseURL,
    recordVideo: { dir: directory, size: { width: 960, height: 720 } } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.evaluate(() => {
    window.flightFrames = [];
    const sample = timestamp => {
      const state = document.querySelector('#viewport').dataset;
      if (state.flightMode === 'flight') window.flightFrames.push({ timestamp, species: state.species, elapsed: Number(state.flightTime), camera: state.cameraPosition, position: state.modelPosition, angle: Number(state.wingAngle) });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const viewport = page.locator('#viewport');
  const timeline = [];
  for (const [index, name] of ['morpho', 'monarch'].entries()) {
    if (index) await page.locator('#next').click();
    await expect(viewport).toHaveAttribute('data-species', index ? 'Danaus plexippus' : 'Morpho menelaus');
    await page.locator('#motion').click();
    for (let frame = 0; frame <= 26; frame++) {
      await expect.poll(async () => Number(await viewport.getAttribute('data-flight-time')), { timeout: 10000 }).toBeGreaterThanOrEqual(frame);
      const state = await viewport.evaluate(element => ({ ...element.dataset }));
      for (const key of ['modelPosition', 'cameraPosition']) expect(state[key].split(',').map(Number).every(Number.isFinite)).toBe(true);
      timeline.push({ name, frame, ...state });
      await viewport.screenshot({ path: `${directory}/${name}-${String(frame).padStart(2, '0')}.png` });
    }
    await page.screenshot({ path: `${directory}/${name}-full.png`, fullPage: true });
    await page.locator('#exit-flight').click();
    await expect(viewport).toHaveAttribute('data-flight-mode', 'atlas');
  }
  writeFileSync(`${directory}/timeline.json`, JSON.stringify({ timeline, errors }, null, 2));
  const frames = await page.evaluate(() => window.flightFrames);
  expect(frames.length).toBeGreaterThan(500);
  for (const frame of frames) expect([frame.elapsed, frame.angle, ...frame.camera.split(',').map(Number), ...frame.position.split(',').map(Number)].every(Number.isFinite)).toBe(true);
  writeFileSync(`${directory}/frame-samples.json`, JSON.stringify(frames));
  expect(errors).toEqual([]);
  await context.close();
  await page.video().saveAs(`${directory}/continuous.webm`);
});
