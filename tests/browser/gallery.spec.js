import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeHidden();
  await expect(page.locator('#viewport')).toHaveAttribute('data-species', 'Morpho menelaus');
  await expect(page.locator('#viewport')).toHaveAttribute('data-camera-distance', '8.700');
}

test('模型、标题、按钮和键盘同步；生成两种标本截图', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.screenshot({ path: testInfo.outputPath('morpho.png'), fullPage: true });
  const blueImage = await page.locator('canvas').screenshot();
  await page.locator('#next').click();
  await expect(page.locator('h2')).toHaveText('帝王蝶');
  await expect(page.locator('#viewport')).toHaveAttribute('data-species', 'Danaus plexippus');
  await expect(page.locator('.story')).toContainText('北美部分种群');
  const orangeImage = await page.locator('canvas').screenshot();
  expect(blueImage.equals(orangeImage)).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('monarch.png'), fullPage: true });
  await page.locator('#viewport').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('h2')).toHaveText('大蓝闪蝶');
  await page.locator('#previous').click();
  await expect(page.locator('h2')).toHaveText('帝王蝶');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('旋转、缩放、重置与扇翅暂停', async ({ page }) => {
  await ready(page);
  const viewer = page.locator('#viewport');
  const bounds = await viewer.boundingBox();
  const initial = await viewer.getAttribute('data-camera-position');
  await page.mouse.move(bounds.x + bounds.width * .45, bounds.y + bounds.height * .5);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .55, { steps: 12 });
  await page.mouse.up();
  await expect(viewer).not.toHaveAttribute('data-camera-position', initial);
  await page.locator('#zoom-in').click();
  await expect.poll(async () => Number(await viewer.getAttribute('data-camera-distance'))).toBeLessThan(8.7);
  await page.locator('#reset').click();
  await expect(viewer).toHaveAttribute('data-camera-position', initial);
  await page.locator('#motion').click();
  const animated = await viewer.getAttribute('data-wing-angle');
  await expect(viewer).not.toHaveAttribute('data-wing-angle', animated);
  await page.locator('#motion').click();
  const pausedAngle = await viewer.getAttribute('data-wing-angle');
  await page.waitForTimeout(200);
  await expect(viewer).toHaveAttribute('data-wing-angle', pausedAngle);
});

test('滚轮只缩放，Shift 滚轮只切换，文案区滚动不改变模型', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), '桌面鼠标滚轮测试');
  await page.setViewportSize({ width: 1100, height: 650 });
  await ready(page);
  const viewer = page.locator('#viewport');
  await viewer.hover({ position: { x: 400, y: 350 } });
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => Number(await viewer.getAttribute('data-camera-distance'))).toBeLessThan(8.7);
  await expect(page.locator('h2')).toHaveText('大蓝闪蝶');
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Shift');
  await expect(page.locator('h2')).toHaveText('帝王蝶');
  await expect(viewer).toHaveAttribute('data-camera-distance', '8.700');
  await page.locator('.information').hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.locator('.information').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(viewer).toHaveAttribute('data-camera-distance', '8.700');
  await page.locator('.information').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('h2')).toHaveText('帝王蝶');
});

test('手机尺寸触摸输入（CDP 仿真）：旋转、双指缩放、导航滑动和点击', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), '仅移动触摸上下文');
  await ready(page);
  const session = await page.context().newCDPSession(page);
  const viewer = page.locator('#viewport');
  const bounds = await viewer.boundingBox();
  const center = { x: bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const initial = await viewer.getAttribute('data-camera-position');
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x + 60, y: center.y + 20, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(viewer).not.toHaveAttribute('data-camera-position', initial);
  await page.locator('#reset').tap();
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: center.x - 30, y: center.y, id: 1 }, { x: center.x + 30, y: center.y, id: 2 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: center.x - 55, y: center.y, id: 1 }, { x: center.x + 55, y: center.y, id: 2 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Number(await viewer.getAttribute('data-camera-distance'))).toBeLessThan(8.7);
  const rail = await page.locator('.exhibit-nav').boundingBox();
  const horizontal = rail.x + rail.width / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: horizontal, y: rail.y + rail.height - 10, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: horizontal, y: rail.y + 10, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('h2')).toHaveText('帝王蝶');
  await page.locator('#previous').tap();
  await expect(page.locator('h2')).toHaveText('大蓝闪蝶');
  await page.screenshot({ path: testInfo.outputPath('mobile-touch.png'), fullPage: true });
  await page.locator('.information').scrollIntoViewIfNeeded();
  const initialScroll = await page.evaluate(() => scrollY);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 650, id: 1 }] });
  for (let step = 1; step <= 6; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160, y: 650 - step * 40, id: 1 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(initialScroll);
  await expect(page.locator('h2')).toHaveText('大蓝闪蝶');
});

test('reduced-motion 默认静止，用户可主动开启', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  const viewer = page.locator('#viewport');
  await expect(page.locator('#motion')).toHaveText('飞行观赏');
  const angle = await viewer.getAttribute('data-wing-angle');
  await page.waitForTimeout(200);
  await expect(viewer).toHaveAttribute('data-wing-angle', angle);
  await page.locator('#motion').click();
  await expect(page.locator('#motion')).toHaveText('继续飞行');
  await expect(viewer).toHaveAttribute('data-wing-angle', angle);
  await page.locator('#motion').click();
  await expect(viewer).not.toHaveAttribute('data-wing-angle', angle);
});

test('WebGL 不可用仍显示提示和可切换科普', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.startsWith('webgl') ? null : original.call(this, type, ...args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#zoom-in')).toBeDisabled();
  await page.locator('#next').click();
  await expect(page.locator('h2')).toHaveText('帝王蝶');
  await page.screenshot({ path: testInfo.outputPath('webgl-fallback.png'), fullPage: true });
});

test('WebGL 上下文丢失后提供明确提示', async ({ page }) => {
  await ready(page);
  await page.locator('#viewport canvas').evaluate(canvas => {
    canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#reset')).toBeDisabled();
});

test('缩放上下限可控，反复切换后仍可重置', async ({ page }) => {
  await ready(page);
  const viewer = page.locator('#viewport');
  for (let index = 0; index < 8; index++) await page.locator('#zoom-in').click();
  await expect(viewer).toHaveAttribute('data-camera-distance', '3.800');
  for (let index = 0; index < 10; index++) await page.locator('#zoom-out').click();
  await expect(viewer).toHaveAttribute('data-camera-distance', '14.000');
  for (let index = 0; index < 6; index++) await page.locator('#next').click();
  await expect(viewer).toHaveAttribute('data-camera-distance', '8.700');
  await expect(viewer).toHaveAttribute('data-species', 'Morpho menelaus');
});

test('320px 窄屏无横向溢出，参考与待核对说明可阅读', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await ready(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.sources a').first()).toBeVisible();
  await expect(page.locator('footer')).toContainText('三维图谱');
  await page.locator('.morphology-notes summary').click();
  await expect(page.locator('.morphology-notes')).toContainText('尚无三维扫描验证');
  const before = await page.locator('#viewport').getAttribute('data-wing-angle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#motion')).toHaveText('飞行观赏');
  const paused = await page.locator('#viewport').getAttribute('data-wing-angle');
  await page.waitForTimeout(200);
  await expect(page.locator('#viewport')).toHaveAttribute('data-wing-angle', paused);
  expect(before).not.toBeNull();
});

test('精简布局与来源随物种同步，必要控件保留名称', async ({ page }) => {
  await ready(page);
  await expect(page.locator('header, .gallery-heading, .specimen-label, .interaction-hint, .disclaimer')).toHaveCount(0);
  await expect(page.getByText('关于这件展品')).toHaveCount(0);
  await expect(page.locator('.gallery')).not.toContainText('大蓝闪蝶');
  await expect(page.locator('.story')).toContainText('结构色');
  const wiki = page.locator('.sources a').first();
  await expect(wiki).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Morpho_menelaus');
  await expect(wiki).toHaveAccessibleName('Wikipedia：Morpho menelaus（新窗口）');
  await expect(page.locator('.sources a').last()).toHaveAttribute('href', 'https://doi.org/10.1098/rspb.1999.0794');
  await page.locator('#next').click();
  await expect(wiki).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Monarch_butterfly');
  await expect(wiki).toHaveAccessibleName('Wikipedia：Danaus plexippus（新窗口）');
  await expect(page.locator('.sources a').last()).toHaveAttribute('href', 'https://www.fws.gov/species/monarch-danaus-plexippus');
  await expect(page.locator('.story')).toContainText('并非所有帝王蝶种群都迁徙');
  for (const link of await page.locator('.sources a').all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  for (const name of ['上一种蝴蝶', '下一种蝴蝶', '放大', '缩小', '重置视角', '飞行观赏', '观察背面', '观察腹面', '观察侧面']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await page.locator('#viewport').focus();
  await page.keyboard.press('+');
  await expect.poll(async () => Number(await page.locator('#viewport').getAttribute('data-camera-distance'))).toBeLessThan(8.7);
  await page.keyboard.press('r');
  await expect(page.locator('#viewport')).toHaveAttribute('data-camera-distance', '8.700');
});

test('桌面和窄屏模型区域不与操作控件重叠', async ({ page }, testInfo) => {
  await ready(page);
  const sizes = testInfo.project.name.includes('mobile')
    ? [{ width: 390, height: 844 }, { width: 320, height: 700 }, { width: 650, height: 375 }]
    : [{ width: 1440, height: 1000 }, { width: 900, height: 650 }, { width: 651, height: 500 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const viewer = await page.locator('#viewport').boundingBox();
    expect(viewer.y).toBeLessThan(20);
    expect(viewer.height).toBeGreaterThan(250);
    for (const selector of ['.tools', '.view-tools', '.exhibit-nav']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds.x >= viewer.x + viewer.width || bounds.y >= viewer.y + viewer.height).toBe(true);
    }
    for (const button of await page.locator('.gallery button:visible').all()) {
      const bounds = await button.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
    }
  }
});

test('双面独立显示、观察操作与科普信息一致；归档背腹侧面', async ({ page }, testInfo) => {
  await ready(page);
  for (const [index, name] of ['morpho', 'monarch'].entries()) {
    if (index) await page.locator('#next').click();
    await expect(page.locator('#viewport')).toHaveAttribute('data-species', index ? 'Danaus plexippus' : 'Morpho menelaus');
    await expect(page.locator('#viewport')).toHaveAttribute('data-independent-surfaces', 'true');
    const images = [];
    for (const view of ['dorsal', 'ventral', 'side']) {
      await page.locator(`#view-${view}`).click();
      await expect(page.locator('#viewport')).toHaveAttribute('data-view', view);
      await expect(page.locator(`#view-${view}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#motion')).toHaveText('飞行观赏');
      await expect(page.locator('#surface-observation')).toContainText(view === 'dorsal' ? '背面' : view === 'ventral' ? '腹面' : '侧面');
      if (view === 'ventral' && !index) await expect(page.locator('#surface-observation')).toContainText('3 枚');
      if (view === 'dorsal' && index) await expect(page.locator('#surface-observation')).toContainText('雄性黑色性斑');
      images.push(await page.locator('canvas').screenshot({ path: testInfo.outputPath(`${name}-${view}.png`) }));
    }
    expect(images[0].equals(images[1])).toBe(false);
    expect(images[1].equals(images[2])).toBe(false);
    await page.locator('#reset').click();
    await expect(page.locator('#viewport')).toHaveAttribute('data-view', 'dorsal');
  }
});

test('快速切换不会让异步标本覆盖当前物种', async ({ page }) => {
  await page.route('**/specimens/monarch-*.jpg', async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
  await ready(page);
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#viewport')).toHaveAttribute('data-species', 'Morpho menelaus');
  await page.waitForTimeout(400);
  await expect(page.locator('#viewport')).toHaveAttribute('data-species', 'Morpho menelaus');
  await expect(page.locator('#viewport')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('h2')).toHaveText('大蓝闪蝶');
});

test('标本图片失败时说明原因，不展示错配模型，仍能阅读资料', async ({ page }) => {
  await page.route('**/specimens/*.jpg', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#fallback')).toContainText('标本图片暂时无法加载');
  await expect(page.locator('#view-ventral')).toBeDisabled();
  await page.locator('#next').click();
  await expect(page.locator('h2')).toHaveText('帝王蝶');
  await page.locator('.morphology-notes summary').click();
  await expect(page.locator('.morphology-notes')).toContainText('2011.0.171');
});

test('手动旋转半圈可见腹面，方向提示与相机同步', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await ready(page);
  const viewer = page.locator('#viewport');
  const bounds = await viewer.boundingBox();
  const start = { x: bounds.x + 40, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + bounds.height / (2 * .65), start.y, { steps: 24 });
  await page.mouse.up();
  await expect(viewer).toHaveAttribute('data-view', 'ventral');
  await expect(page.locator('#view-ventral')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#surface-observation')).toContainText('褐色底');
  await page.locator('.morphology-notes summary').click();
  await expect(page.locator('.morphology-notes')).toContainText('Didier Descouens');
  await expect(page.locator('.morphology-notes')).toContainText('CC BY-SA 4.0');
  await page.locator('#reset').click();
  await expect(viewer).toHaveAttribute('data-view', 'dorsal');
});
