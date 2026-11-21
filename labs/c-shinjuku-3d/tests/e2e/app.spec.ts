import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

interface Stats {
  triangles: number;
  calls: number;
  lines: number;
  geometries: number;
  frames: number;
  cameraDistance: number;
  cameraPolar: number;
  cameraTarget: [number, number, number];
  labelsShown: number;
  animating: boolean;
}

// keep in step with src/ui/scene/camera.ts
const MIN_POLAR = 0.22;
const MAX_POLAR = 1.32;
const MIN_DISTANCE = 12;

const stats = (page: Page) => page.evaluate(() => (window as unknown as { __SENKIRO_STATS__?: Stats }).__SENKIRO_STATS__ ?? null);

/** Opens the app and fails the test on any console error or uncaught exception. */
async function open(page: Page, query = 'lang=ja&theme=light') {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Trains keep the scene drawing; the tests that wait for it to come to rest switch them off.
  await page.goto(`/?${/(^|&)trains=/.test(query) ? query : `${query}&trains=off`}`);
  return errors;
}

async function waitForScene(page: Page): Promise<Stats> {
  await expect(page.locator('[data-testid="scene-3d"] canvas')).toBeVisible();
  await expect.poll(async () => (await stats(page))?.calls ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
  return (await stats(page))!;
}

/**
 * Waits until the view has come to rest: no camera move in progress and no new
 * frame for a moment (the scene renders on demand, so frames stop when it is still).
 */
async function settled(page: Page): Promise<Stats> {
  let last = -1;
  await expect
    .poll(
      async () => {
        const s = await stats(page);
        if (!s || s.animating) return false;
        const still = s.frames === last;
        last = s.frames;
        return still;
      },
      { timeout: 8_000, intervals: [250] },
    )
    .toBe(true);
  return (await stats(page))!;
}

/** In the 3D view the floor list is folded away until the pointer is over its button. */
async function openFloors(page: Page) {
  const toggle = page.getByTestId('floor-toggle');
  if ((await toggle.count()) > 0) await toggle.hover();
  await expect(page.getByTestId('floor-list')).toBeVisible();
}

async function pickFloor(page: Page, testId: string) {
  await openFloors(page);
  await page.getByTestId(testId).click();
}

async function canvasCentre(page: Page) {
  const box = (await page.locator('[data-testid="scene-3d"] canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('loading', () => {
  test('the canvas exists, something is drawn, and the console stays clean', async ({ page }) => {
    const errors = await open(page);
    const s = await waitForScene(page);
    expect(s.triangles).toBeGreaterThan(1000);
    expect(s.calls).toBeLessThan(40);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SENKIRO Lab · Shinjuku Station 3D');
    await expect(page.getByTestId('honesty')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('labels thin out with distance and come back when zooming in', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    const c = await canvasCentre(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, 2500);
    await expect.poll(async () => (await stats(page))!.labelsShown).toBeLessThan(40);
    const far = (await stats(page))!.labelsShown;
    await page.mouse.wheel(0, -4000);
    await expect.poll(async () => (await stats(page))!.labelsShown).toBeGreaterThan(far);
  });
});

test.describe('routes', () => {
  test('East Exit → Yamanote platform: steps, floors and counts — and no invented metres or minutes', async ({ page }) => {
    const errors = await open(page);
    const before = await waitForScene(page);
    await page.getByTestId('demo-1').click();
    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('cost-segments')).toHaveText('4');
    await expect(page.getByTestId('cost-levels')).toHaveText('2');
    await expect(page.getByTestId('cost-gates')).toHaveText('1');
    await expect(page.getByTestId('route-levels').locator('.chip')).toHaveText(['1F', 'B1F', '1F']);
    await expect(page.getByTestId('route-legs')).toContainText('中央東改札');
    await expect(page.getByTestId('route-legs')).toContainText('山手線');
    await expect(page.getByTestId('route-unknowns')).toContainText('不明');
    const text = await page.getByTestId('route-result').innerText();
    expect(text).not.toMatch(/\d+\s?(m|メートル|分|min)\b/);
    await expect.poll(async () => (await stats(page))!.triangles).toBeGreaterThan(before.triangles);
    expect(errors).toEqual([]);
  });

  test('elevators-only mode reproduces a lift-only chain and can be switched back', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    await page.getByTestId('demo-2').click();
    const rides = page.getByTestId('route-legs').locator('li.leg-vertical');
    await expect(rides).toHaveCount(4);
    for (const text of await rides.allInnerTexts()) expect(text).toContain('エレベーター');
    await expect(page.getByTestId('cost-levels')).toHaveText('5');
    await page.getByText('標準', { exact: true }).click();
    await expect(page.getByTestId('cost-levels')).not.toHaveText('5');
  });

  test('origin and destination are chosen by line name, and a route can be cleared', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    const to = page.getByTestId('route-to');
    // track numbers repeat between operators, so every platform is listed with its lines
    const yamanote = to.locator('option', { hasText: '山手線' });
    expect(await yamanote.count()).toBeGreaterThanOrEqual(2);
    // the Keio Line has two boarding platforms (tracks 1·2 and track 3) and the alighting-only one between them,
    // which says so in its name; the Keio New Line is a different line
    const keio = to.locator('optgroup').first().locator('option', { hasText: /京王線/ });
    await expect(keio).toHaveCount(3);
    await expect(keio.filter({ hasText: '降車専用' })).toHaveCount(1);
    await page.getByTestId('route-from').selectOption('sk:gate:jr-south-gate');
    await to.selectOption('sk:platform:jr-east-shinjuku-15-16');
    await expect(page.getByTestId('route-legs').locator('li').first()).toBeVisible();
    await page.getByTestId('route-clear').click();
    await expect(page.getByTestId('route-legs')).toHaveCount(0);
    await expect(page.getByTestId('step-nav')).toHaveCount(0);
  });

  test('a bus bay of Busta 新宿 can be picked as destination; a gate that cannot be left from inside is entered instead', async ({ page }) => {
    await page.goto('/?lang=ja&trains=off');
    await page.getByTestId('route-from').selectOption('sk:platform:jr-east-shinjuku-13-14');
    await page.getByTestId('route-to').selectOption('sk:entrance:busta-4f-bay-c8');
    await expect(page.getByTestId('route-result')).toBeVisible();
    await expect(page.getByTestId('route-levels')).toContainText('4F');
    await expect(page.getByTestId('cost-gates')).toContainText('1');
    await expect(page.getByTestId('route-legs')).toContainText('Cエリア');
    // 新宿西口 南側改札 as destination: nothing leads to its paid side from here, so the route goes in through it
    await page.getByTestId('route-to').selectOption('sk:gate:nishiguchi-gates-south');
    await expect(page.getByTestId('route-result')).toBeVisible();
    await expect(page.getByTestId('route-none')).toHaveCount(0);
    await expect(page.getByTestId('cost-gates')).toContainText('2');
    // the fourth demo route is the train-to-bus example: a JR platform, one named gate, a named bay
    await page.getByTestId('demo-4').click();
    await expect(page.getByTestId('route-to')).toHaveValue('sk:entrance:busta-4f-bay-c8');
    await expect(page.getByTestId('route-legs')).toContainText('甲州街道改札');
    await expect(page.getByTestId('cost-gates')).toContainText('1');
  });

  test('新宿三丁目 and 新宿西口 are destinations of their own, apart from 新宿', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    const to = page.getByTestId('route-to');
    // the Marunouchi Line has tracks 1·2 at both stations: two entries, and only the neighbour carries a station name
    const marunouchi = await to.locator('option', { hasText: '丸ノ内線' }).allInnerTexts();
    const marunouchiPlatforms = marunouchi.filter((x) => x.includes('番線'));
    expect(marunouchiPlatforms).toHaveLength(2);
    expect(marunouchiPlatforms.filter((x) => x.includes('新宿三丁目駅'))).toHaveLength(1);
    // every entry of the pickers is distinct
    const all = await to.locator('option').allInnerTexts();
    expect(all.filter((x, i) => all.indexOf(x) !== i)).toEqual([]);
    // the Oedo Line: 新宿 (tracks 6·7) and 新宿西口 (tracks 1·2) are two platforms of two stations
    const oedo = (await to.locator('option', { hasText: '都営大江戸線' }).allInnerTexts()).filter((x) => x.includes('番線'));
    expect(oedo).toHaveLength(2);
    expect(oedo.filter((x) => x.includes('新宿西口駅'))).toHaveLength(1);

    await page.getByTestId('route-from').selectOption('sk:gate:jr-south-gate');
    await to.selectOption('sk:platform:tokyo-metro-shinjuku-sanchome-3-4');
    await expect(page.getByTestId('route-legs').locator('li').first()).toBeVisible();
    await expect(page.getByTestId('route-legs')).toContainText('副都心線');
    // the walk between the two stations goes through the メトロプロムナード, a passage from a source: no warning
    await expect(page.getByTestId('route-legs')).toContainText('メトロプロムナード');
    await expect(page.getByTestId('route-legs').locator('.tag-warn')).toHaveCount(0);
    expect(await page.getByTestId('route-result').innerText()).not.toMatch(/\d+\s?(m|メートル|分|min)\b/);

    await to.selectOption('sk:platform:toei-shinjuku-nishiguchi-1-2');
    await expect(page.getByTestId('route-legs')).toContainText('新宿西口駅');
    await expect(page.getByTestId('route-legs').locator('.tag-warn')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('pressing a step flies the camera to it, shows only its floors, and can be undone', async ({ page }) => {
    const errors = await open(page);
    const home = await waitForScene(page);
    await page.getByTestId('demo-1').click();
    await expect(page.getByTestId('step-nav')).toBeVisible();

    // the gate step is on one floor
    await page.getByTestId('route-legs').locator('li').nth(2).locator('button').click();
    await expect(page.getByTestId('route-legs').locator('li').nth(2)).toHaveClass(/on/);
    await expect(page.getByTestId('step-text')).toContainText('中央東改札');
    const atGate = await settled(page);
    expect(atGate.cameraDistance).toBeLessThan(home.cameraDistance * 0.7);
    expect(atGate.cameraPolar).toBeGreaterThanOrEqual(MIN_POLAR);
    expect(atGate.cameraPolar).toBeLessThanOrEqual(MAX_POLAR);

    // next step with the arrow under the drawing
    await page.getByTestId('step-next').click();
    await expect(page.getByTestId('route-legs').locator('li').nth(3)).toHaveClass(/on/);
    const atRide = await settled(page);
    expect(atRide.cameraTarget).not.toEqual(atGate.cameraTarget);

    // Escape leaves the step; the whole route is shown again
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('route-legs').locator('li.on')).toHaveCount(0);
    await expect(page.getByTestId('floor-toggle')).toHaveAttribute('data-mode', 'all');
    expect(errors).toEqual([]);
  });

  test('a camera move can be interrupted by the user', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    await page.getByTestId('demo-3').click();
    await page.getByTestId('step-next').click();
    const c = await canvasCentre(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await expect.poll(async () => (await stats(page))!.animating).toBe(false);
    await page.mouse.up();
  });

  test('with camera animation off the view jumps', async ({ page }) => {
    await open(page, 'lang=ja&theme=light&motion=off');
    const home = await waitForScene(page);
    await page.getByTestId('demo-1').click();
    await page.getByTestId('step-next').click();
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeLessThan(home.cameraDistance);
    expect((await stats(page))!.animating).toBe(false);
  });
});

test.describe('floors', () => {
  test('floors are named by position, never by operator', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    const rail = page.getByRole('navigation', { name: '階' });
    await openFloors(page);
    const labels = await rail.locator('button[data-floor]').allInnerTexts();
    expect(labels.length).toBeGreaterThanOrEqual(8);
    expect(labels.every((l) => /^B?\d+F$/.test(l.trim()))).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.join(' ')).not.toMatch(/京王|JR|小田急/);
    for (const label of await page.locator('.label-level').allInnerTexts()) expect(label).toMatch(/^B?\d+F$/);
  });

  test('in 3D the floor list is folded into one button and opens on hover or focus', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    const toggle = page.getByTestId('floor-toggle');
    await expect(toggle).toHaveText(/全階/);
    await expect(page.getByTestId('floor-list')).toHaveCount(0);

    await toggle.hover();
    await expect(page.getByTestId('floor-list')).toBeVisible();
    await page.getByTestId('floor-B2F').click();
    await expect(toggle).toHaveText(/B2F/);
    await expect(toggle).toHaveAttribute('data-mode', 'floor');
    // moving away folds it again; the button keeps saying which floor is shown
    const c = await canvasCentre(page);
    await page.mouse.move(c.x, c.y);
    await expect(page.getByTestId('floor-list')).toHaveCount(0);
    await expect(toggle).toHaveText(/B2F/);

    // keyboard: focus opens it, Escape folds it
    await toggle.focus();
    await expect(page.getByTestId('floor-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('floor-list')).toHaveCount(0);
  });

  test('the side panel can be folded away to give the drawing the whole width', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    const canvas = page.locator('[data-testid="scene-3d"] canvas');
    const before = (await canvas.boundingBox())!.width;
    await page.getByTestId('demo-1').click();
    await page.getByTestId('panel-toggle').click();
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.getByTestId('panel-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(before + 300);
    // the route stays, and can still be walked through with the arrows under the drawing
    await expect(page.getByTestId('step-nav')).toBeVisible();
    await page.getByTestId('step-next').click();
    await expect(page.getByTestId('step-text')).toBeVisible();
    await settled(page);

    await page.getByTestId('panel-toggle').click();
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);
    await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThan(before + 2);
    expect(errors).toEqual([]);
  });

  test('one floor, all floors, and the floors of the route', async ({ page }) => {
    await open(page);
    const all = await waitForScene(page);
    await pickFloor(page, 'floor-B1F');
    await expect(page.getByTestId('floor-B1F')).toHaveAttribute('aria-pressed', 'true');
    const one = await settled(page);
    expect(one.cameraDistance).toBeLessThan(all.cameraDistance);
    await expect(page.getByTestId('floor-route')).toHaveCount(0);

    await page.getByTestId('demo-1').click();
    await expect(page.getByTestId('floor-toggle')).toHaveAttribute('data-mode', 'all');
    await pickFloor(page, 'floor-route');
    await expect(page.getByTestId('floor-route')).toHaveAttribute('aria-pressed', 'true');
    // the floors the route passes carry a marker
    await expect(page.getByTestId('floor-1F')).toHaveClass(/has-route/);
    await expect(page.getByTestId('floor-B1F')).toHaveClass(/has-route/);
    await expect(page.getByTestId('floor-2F')).not.toHaveClass(/has-route/);
  });
});

test.describe('2D plan', () => {
  test('shows one floor at a time and keeps the route, the step and the floor when switching views', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('demo-1').click();
    await page.getByTestId('route-legs').locator('li').nth(2).locator('button').click();

    await page.getByTestId('view-2d').click();
    const plan = page.getByTestId('plan-2d');
    await expect(plan).toBeVisible();
    await expect(page.locator('[data-testid="plan-2d"] svg')).toHaveCount(1);
    await expect(plan).toHaveAttribute('data-floor', 'B1F'); // the floor of the step in focus
    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);
    await expect(page.getByTestId('route-legs').locator('li').nth(2)).toHaveClass(/on/);
    expect(await page.getByTestId('plan-route').locator('line').count()).toBeGreaterThan(1);
    await expect(page.getByTestId('floor-all')).toHaveCount(0); // no stacked "all floors" view in 2D

    await page.getByTestId('floor-1F').click();
    await expect(plan).toHaveAttribute('data-floor', '1F');
    await expect(plan.locator('.label-platform').first()).toBeVisible();

    await page.getByTestId('view-3d').click();
    await waitForScene(page);
    await expect(page.getByTestId('floor-toggle')).toHaveText(/1F/);
    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);
    expect(errors).toEqual([]);
  });

  test('the wheel zooms the plan and never scrolls the page; dragging moves it; double-click fits', async ({ page }) => {
    await open(page, 'lang=ja&theme=light&view=2d');
    // B1F is one piece: one view (a floor in parts has a view per panel, tested below)
    await page.getByTestId('floor-B1F').click();
    await expect(page.getByTestId('plan-2d')).toHaveAttribute('data-floor', 'B1F');
    const svg = page.locator('[data-testid="plan-2d"] svg');
    await expect(svg).toBeVisible();
    const viewBox = async () => (await svg.getAttribute('viewBox'))!.split(' ').map(Number);
    const home = await viewBox();
    const box = (await svg.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    await expect.poll(async () => (await viewBox())[2]!).toBeLessThan(home[2]! * 0.8);
    expect(await page.evaluate(() => window.scrollY + document.documentElement.scrollTop)).toBe(0);

    const zoomed = await viewBox();
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await expect.poll(async () => (await viewBox())[0]!).toBeLessThan(zoomed[0]!);

    await svg.dblclick({ position: { x: 20, y: box.height - 20 } });
    await expect.poll(async () => (await viewBox())[2]!).toBeCloseTo(home[2]!, 3);
  });

  test('the plan marks north, lays each floor horizontally, puts far-apart parts in titled panels that move on their own, and keeps a lone platform in proportion', async ({ page }) => {
    const errors = await open(page, 'lang=zh&theme=light&view=2d');
    const plan = page.getByTestId('plan-2d');
    await expect(page.getByTestId('plan-compass')).toHaveAttribute('data-north', 'left');
    await expect(page.getByTestId('plan-compass')).toHaveAttribute('aria-label', /左为北/);

    const pickPlanFloor = async (label: string) => {
      await page.getByTestId(`floor-${label}`).click();
      await expect(plan).toHaveAttribute('data-floor', label);
    };
    const viewBoxOf = async (svg: ReturnType<typeof plan.locator>) => (await svg.getAttribute('viewBox'))!.split(' ').map(Number);
    /** Drawing scale of the default view, px per schematic unit. */
    const scaleOf = async (svg: ReturnType<typeof plan.locator>) => (await svg.boundingBox())!.width / (await viewBoxOf(svg))[2]!;

    // 2F: Seibu and JR / Odakyu are not linked on this floor and lie far apart → two panels with titles;
    // the JR concourse runs east–west, so the floor is turned north-up
    await pickPlanFloor('2F');
    await expect(page.getByTestId('plan-compass')).toHaveAttribute('data-north', 'up');
    await expect(page.getByTestId('plan-compass')).toHaveAttribute('aria-label', /上为北/);
    const panels = plan.getByTestId('plan-panel');
    await expect(panels).toHaveCount(2);
    await expect(plan.getByTestId('plan-panel-head').filter({ hasText: '西武新宿站' })).toHaveCount(1);
    await expect(page.getByTestId('plan-blocks-note')).toContainText('不按比例');
    const boxes = [(await panels.nth(0).boundingBox())!, (await panels.nth(1).boundingBox())!].sort((a, b) => a.x - b.x);
    expect(boxes[0]!.x + boxes[0]!.width).toBeLessThan(boxes[1]!.x);
    const pb = (await plan.boundingBox())!;
    const mid = (boxes[0]!.x + boxes[1]!.x + boxes[1]!.width) / 2;
    expect(Math.abs(mid - (pb.x + pb.width / 2))).toBeLessThan(3);
    // nothing of the drawing under the floor list
    const list = (await page.getByTestId('floor-list').boundingBox())!;
    expect(boxes[0]!.x).toBeGreaterThan(list.x + list.width);
    // the panels share one default scale
    const svgs = [panels.nth(0).locator('svg'), panels.nth(1).locator('svg')];
    expect(await scaleOf(svgs[0]!)).toBeCloseTo(await scaleOf(svgs[1]!), 6);

    // each panel is a view of its own: dragging or zooming one leaves the other where it is
    const before = [await viewBoxOf(svgs[0]!), await viewBoxOf(svgs[1]!)];
    const b0 = (await svgs[0]!.boundingBox())!;
    await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
    await page.mouse.down();
    await page.mouse.move(b0.x + b0.width / 2 + 60, b0.y + b0.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await viewBoxOf(svgs[0]!))[2]!).toBeLessThan(before[0]![2]!);
    expect((await viewBoxOf(svgs[0]!))[0]).not.toBeCloseTo(before[0]![0]!, 3);
    expect(await viewBoxOf(svgs[1]!)).toEqual(before[1]);
    // "reset view" frames every panel again
    await page.getByTestId('reset-view').click();
    await expect.poll(async () => (await viewBoxOf(svgs[0]!))[2]!).toBeCloseTo(before[0]![2]!, 3);

    // B1F is linked throughout: one piece, no panels, no note
    await pickPlanFloor('B1F');
    await expect(panels).toHaveCount(0);
    await expect(page.getByTestId('plan-blocks-note')).toHaveCount(0);

    // B7F, a single platform, is drawn no larger than the Busta floors are
    await pickPlanFloor('4F');
    const busta = await scaleOf(plan.locator('svg').first());
    await pickPlanFloor('B7F');
    expect(await scaleOf(plan.locator('svg').first())).toBeLessThanOrEqual(busta * 1.01);
    expect(errors).toEqual([]);
  });
});

test.describe('camera', () => {
  test('"reset view" brings the camera back after rotating and zooming', async ({ page }) => {
    await open(page);
    const home = await waitForScene(page);
    const c = await canvasCentre(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 180, c.y + 60, { steps: 6 });
    await page.mouse.up();
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -1000);
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeLessThan(home.cameraDistance * 0.9);
    await page.getByTestId('reset-view').click();
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeGreaterThan(home.cameraDistance * 0.95);
    const back = await settled(page);
    expect(back.cameraDistance).toBeCloseTo(home.cameraDistance, 1);
    expect(back.cameraPolar).toBeCloseTo(home.cameraPolar, 3);
    expect(Math.hypot(...back.cameraTarget.map((v, i) => v - home.cameraTarget[i]!))).toBeLessThan(0.01);
  });

  test('the middle button (and the right button) drag the whole model; the left button only turns it', async ({ page }) => {
    await open(page);
    const home = await waitForScene(page);
    const c = await canvasCentre(page);
    const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

    await page.mouse.move(c.x, c.y);
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(c.x + 140, c.y, { steps: 6 });
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(400);
    expect(dist((await stats(page))!.cameraTarget, home.cameraTarget)).toBeLessThan(0.01);

    for (const button of ['middle', 'right'] as const) {
      const before = (await stats(page))!.cameraTarget;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down({ button });
      await page.mouse.move(c.x + 160, c.y + 60, { steps: 6 });
      await page.mouse.up({ button });
      await expect.poll(async () => dist((await stats(page))!.cameraTarget, before), { message: `${button} drag` }).toBeGreaterThan(3);
    }
  });

  test('pitch, distance and position are limited: the camera cannot get under a floor or lose the model', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    await page.getByRole('application').focus();
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await stats(page))!.cameraPolar).toBeGreaterThan(1.2);
    expect((await settled(page)).cameraPolar).toBeLessThanOrEqual(MAX_POLAR + 1e-3);
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await stats(page))!.cameraPolar).toBeLessThan(0.3);
    expect((await settled(page)).cameraPolar).toBeGreaterThanOrEqual(MIN_POLAR - 1e-3);
    for (let i = 0; i < 40; i++) await page.keyboard.press('+');
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeLessThan(MIN_DISTANCE + 1);
    expect((await settled(page)).cameraDistance).toBeGreaterThanOrEqual(MIN_DISTANCE - 1e-3);

    // dragging the model far away stops at the edge of the allowed region
    const c = await canvasCentre(page);
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(c.x - 250, c.y);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(c.x + 250, c.y, { steps: 4 });
      await page.mouse.up({ button: 'middle' });
    }
    const t = (await settled(page)).cameraTarget;
    expect(Math.hypot(t[0], t[2])).toBeLessThan(120);
  });

  test('the canvas takes keyboard focus and the arrow keys turn the model', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    await page.getByRole('application').focus();
    await expect(page.getByRole('application')).toBeFocused();
    const before = (await stats(page))!.frames;
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await stats(page))!.frames).toBeGreaterThan(before);
    await page.keyboard.press('0');
    await settled(page);
  });

  test('labels do not block the camera: scrolling over one still zooms', async ({ page }) => {
    await open(page);
    const home = await waitForScene(page);
    const label = page.locator('.label-platform').first();
    await expect(label).toBeVisible();
    const box = (await label.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    await expect.poll(async () => (await stats(page))!.cameraDistance).toBeLessThan(home.cameraDistance * 0.95);
  });
});

test.describe('facility card', () => {
  test('a platform card is written for passengers: lines, directions, no internal data', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    // whichever platform label is on screen: clicking it opens that platform's card
    const label = page.locator('.label-platform:visible').first();
    await expect(label).toBeVisible();
    const numbers = (await label.locator('.label-text').innerText()).trim();
    const box = (await label.boundingBox())!;
    await page.mouse.click(box.x + 12, box.y + box.height / 2);
    const card = page.getByTestId('inspector');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { level: 2 })).toHaveText(`${numbers}番線`);
    expect(await card.getByTestId('card-tracks').locator('> li').count()).toBeGreaterThanOrEqual(2);
    await expect(card.locator('.line-name').first()).toContainText('線');
    await expect(card.locator('.svc-towards').first()).toContainText('方面');
    await expect(card.locator('.line-mark').first()).toBeVisible();
    // provenance is one plain line, not a dump of identifiers
    await expect(card.getByTestId('card-source')).toContainText('2026-08');
    const text = await card.innerText();
    expect(text).not.toMatch(/sk:|src:|manual-verified|synthetic|dataNature/);

    // from the card straight into a route
    await card.getByTestId('card-to').click();
    await expect(page.getByTestId('route-to')).toHaveValue(/^sk:platform:/);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('gates and lifts have cards; halls and corridors do not', async ({ page }) => {
    await open(page, 'lang=ja&theme=light&view=2d');
    const plan = page.getByTestId('plan-2d');
    await page.getByTestId('floor-B1F').click();
    await expect(plan).toHaveAttribute('data-floor', 'B1F');

    await plan.locator('.label-gate', { hasText: '東改札' }).first().waitFor();
    await plan.locator('g.pick', { has: page.locator('title', { hasText: /^東改札$/ }) }).first().click({ force: true });
    const card = page.getByTestId('inspector');
    await expect(card.getByRole('heading', { level: 2 })).toHaveText('東改札');
    await expect(card).toContainText('改札外');
    await expect(card).toContainText('段差なし');

    await plan.locator('g.pick', { has: page.locator('title', { hasText: 'エレベーター' }) }).first().click({ force: true });
    await expect(card).toContainText('結ぶ階');

    // a click on a hall closes the card and opens none
    await plan.locator('g[data-area="sk:area:jr-b1f-north-concourse"] rect').first().click({ position: { x: 5, y: 5 }, force: true });
    await expect(card).toHaveCount(0);
  });
});

test.describe('language and theme', () => {
  test('Japanese, English and Chinese; light and dark', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    await page.getByTestId('lang').selectOption('en');
    await expect(page.getByTestId('reset-view')).toHaveText('Reset view');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByTestId('lang').selectOption('zh');
    await expect(page.getByTestId('reset-view')).toHaveText('重置视角');
    await page.getByTestId('theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(async () => (await stats(page))!.calls).toBeGreaterThan(0);
  });
});

test.describe('display options', () => {
  test('the edge of the paid area can be switched off and on again', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await pickFloor(page, 'floor-B1F');
    const withEdge = (await settled(page)).triangles;
    await page.getByTestId('tab-display').click();
    const toggle = page.getByTestId('fare-boundary');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect.poll(async () => (await stats(page))!.triangles).toBeLessThan(withEdge);
    await toggle.check();
    await expect.poll(async () => (await stats(page))!.triangles).toBe(withEdge);
    expect(errors).toEqual([]);
  });

  test('the legend says the Busta buses are an illustration, and where the services come from', async ({ page }) => {
    await open(page, 'lang=zh&theme=light');
    await waitForScene(page);
    await page.getByTestId('tab-display').click();
    const legend = page.locator('.legend');
    await expect(legend).toContainText('巴士（示意，不表示班次与目的地）');
    await expect(legend).toContainText('按楼层图位置');
    // the same services are drawn on the 2D plan of 4F
    await page.getByTestId('view-2d').click();
    await page.getByTestId('floor-4F').click();
    await expect(page.getByTestId('plan-2d')).toHaveAttribute('data-floor', '4F');
    await expect(page.getByTestId('plan-service')).toHaveCount(5);
  });
});

test.describe('honesty about data', () => {
  test('operations: example mode is labelled as synthetic; live data without the development proxy says so', async ({ page }) => {
    const errors = await open(page);
    await waitForScene(page);
    await page.getByTestId('tab-ops').click();
    await page.getByTestId('ops-example').check();
    await expect(page.getByTestId('sample-banner')).toBeVisible();
    await expect(page.getByTestId('ops-sample-box')).toBeVisible();
    await expect(page.getByTestId('ops-meta')).toContainText('2000');
    await expect(page.getByTestId('ops-lines').locator('li').first()).toContainText('サンプル');
    await expect(page.getByTestId('ops-board').locator('li').first()).toBeVisible();
    const text = await page.locator('#tabpanel').innerText();
    expect(text).not.toMatch(/src:|synthetic|dataNature/);

    // the platform card picks the status up
    await page.getByTestId('ops-board').locator('.track-n').first().click();
    await expect(page.getByTestId('inspector').locator('.status').first()).toBeVisible();
    await page.keyboard.press('Escape');

    // the tests run against the production build, where no proxy (and so no key) exists
    await page.getByTestId('ops-odpt').check();
    await expect(page.getByTestId('ops-unavailable')).toBeVisible();
    await expect(page.getByTestId('ops-unavailable')).toContainText('ODPT_CONSUMER_KEY');
    await expect(page.getByTestId('sample-banner')).toHaveCount(0);
    await expect(page.getByTestId('ops-lines')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('sources and what was left out are reachable', async ({ page }) => {
    await open(page);
    await waitForScene(page);
    await page.getByTestId('tab-info').click();
    await expect(page.getByTestId('sources').locator('li').first()).toBeVisible();
    await expect(page.locator('#tabpanel')).toContainText('実測');
    await page.getByText('モデル化していない接続').click();
    await expect(page.getByTestId('unconfirmed').locator('li').first()).toBeVisible();
    await page.getByTestId('help').click();
    await expect(page.getByTestId('help-dialog')).toContainText('中ボタン');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-dialog')).toHaveCount(0);
  });

  test('without WebGL the app falls back to the 2D plan and says so', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const errors = await open(page);
    await expect(page.getByTestId('no-3d')).toBeVisible();
    await expect(page.getByTestId('plan-2d')).toBeVisible();
    await expect(page.getByTestId('view-3d')).toBeDisabled();
    await expect(page.locator('canvas')).toHaveCount(0);
    // routing does not depend on the 3D view
    await page.getByTestId('demo-1').click();
    await expect(page.getByTestId('route-legs').locator('li')).toHaveCount(4);
    expect(errors).toEqual([]);
  });
});

test.describe('train simulation', () => {
  const trains = (page: Page) =>
    page.evaluate(() => (window as unknown as { __SENKIRO_TRAINS__?: { shown: number; instances: number; moving: number; seconds: number } }).__SENKIRO_TRAINS__ ?? null);

  test('says what it is: a timetable simulation on a real timetable, never a live position', async ({ page }) => {
    const errors = await open(page, 'lang=zh&theme=light&trains=on&simtime=12:01:40');
    await waitForScene(page);
    await expect(page.getByTestId('sim-badge')).toHaveText('时刻表模拟 · 非实时列车位置');
    // the committed Toei timetable replaces the demo fixture as a whole
    await expect(page.getByTestId('demo-badge')).toHaveCount(0);
    await expect(page.getByTestId('coverage-badge')).toContainText('都营新宿线');
    await expect(page.getByTestId('coverage-badge')).toContainText('都营大江户线');
    await expect(page.getByTestId('coverage-badge')).toContainText('其他线路没有可用的时刻表或不知道番线');
    await expect(page.getByTestId('sim-time')).toContainText('12:01:40');
    await page.getByTestId('tab-ops').click();
    await expect(page.getByTestId('train-data-note')).toContainText('toei-odpt.csv');
    await expect(page.getByTestId('train-sources')).toContainText('東京都交通局・公共交通オープンデータ協議会');
    await expect(page.getByTestId('train-sources')).toContainText('CC BY 4.0');
    await expect.poll(async () => (await trains(page))?.shown ?? 0).toBeGreaterThan(0);
    // one instanced mesh for every train: a single extra draw call
    const withTrains = (await stats(page))!.calls;
    await page.getByTestId('trains-toggle').click();
    await expect.poll(async () => (await stats(page))!.calls).toBe(withTrains - 1);
    expect(errors).toEqual([]);
  });

  test('a train card shows schedule, train number, vehicle status and source — and nothing the timetable does not give', async ({ page }) => {
    await open(page, 'lang=zh&theme=light&trains=on&simtime=12:01:40');
    await waitForScene(page);
    await page.getByTestId('sim-day').selectOption('weekday');
    await page.getByTestId('tab-ops').click();
    // weekday 12:01:40: one Oedo Line train is on display (ODPT, Toei train timetable)
    await page.getByTestId('train-filter-line').selectOption('sk:line:toei-oedo');
    await expect(page.getByTestId('train-row')).toHaveCount(1);
    await page.getByTestId('train-row').first().click();
    const card = page.getByTestId('train-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('都营大江户线');
    await expect(page.getByTestId('train-vehicle-status')).toHaveText('代表车型'); // the timetable gives no vehicle type
    await expect(page.getByTestId('train-live-state')).toHaveText('时刻表模拟');
    await expect(card).not.toContainText('无来源'); // the train number comes from the timetable
    await expect(card).toContainText('8 节 (据线路资料)'); // from a sourced fact about the line, not from the timetable
    await expect(card).toContainText('東京都交通局 列車時刻表');
    await expect(card).toContainText('CC BY 4.0');
    // hiding the train takes it off the display without touching the rest
    await page.getByTestId('train-hide').click();
    await expect(card).toBeHidden();
    await expect(page.getByTestId('train-row')).toHaveCount(0);
    await page.getByTestId('train-unhide').click();
    await expect(page.getByTestId('train-row')).toHaveCount(1);
  });

  test('the clock can be played, paused and scrubbed; nothing is shown when nothing is scheduled', async ({ page }) => {
    await open(page, 'lang=en&theme=light&trains=on&simtime=03:30:00');
    await waitForScene(page);
    await expect.poll(async () => (await trains(page))?.shown).toBe(0);
    await page.getByTestId('tab-ops').click();
    await expect(page.getByTestId('train-count')).toHaveText('0');

    await page.getByTestId('sim-scrub').fill(String(8 * 3600));
    await expect(page.getByTestId('sim-time')).toContainText('08:00:00');
    await expect.poll(async () => (await trains(page))?.shown ?? 0).toBeGreaterThan(0);

    await page.getByTestId('sim-rate-60').click();
    await expect.poll(async () => (await trains(page))?.seconds ?? 0, { timeout: 6_000 }).toBeGreaterThan(8 * 3600 + 60);
    await page.getByTestId('sim-play').click();
    // The readout is written by the render loop, so right after the click it still holds the last frame drawn
    // before the pause. Let a frame drawn after the pause land before taking the value that must then stand still.
    await page.waitForTimeout(800);
    const paused = (await trains(page))!.seconds;
    await page.waitForTimeout(600);
    expect((await trains(page))!.seconds).toBe(paused);

    await page.getByTestId('sim-now').click();
    await expect(page.getByTestId('sim-now')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a route can still be planned while trains run', async ({ page }) => {
    await open(page, 'lang=ja&theme=light&trains=on&simtime=12:01:40&simplay=1');
    await waitForScene(page);
    await page.getByTestId('demo-1').click();
    await expect(page.getByTestId('step-nav')).toBeVisible();
    await expect.poll(async () => (await trains(page))?.shown ?? 0).toBeGreaterThan(0);
  });
});

test.describe('performance', () => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    for (const withTrains of [false, true])
    test(`@perf frame rate, triangles and draw calls at ${viewport.width}×${viewport.height}${withTrains ? ', trains running' : ''}`, async ({ page, browser }) => {
      // software rendering in CI-like runs is slow, and with trains the scene never rests: allow more than the default 45 s
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const errors = await open(page, `lang=ja&theme=light&perf=1&motion=off${withTrains ? '&trains=on&simtime=12:00:00&simplay=1' : ''}`);
      await waitForScene(page);
      await page.getByTestId('demo-3').click();
      await page.waitForTimeout(500);

      await page.getByRole('application').focus();
      const seconds = 4;
      const measure = page.evaluate(
        (ms) =>
          new Promise<{ frames: number; p95: number; heapStart: number | null; heapEnd: number | null }>((resolve) => {
            const mem = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
            const times: number[] = [];
            const heapStart = mem();
            let last = performance.now();
            const start = last;
            const tick = (now: number) => {
              times.push(now - last);
              last = now;
              if (now - start < ms) requestAnimationFrame(tick);
              else {
                times.sort((a, b) => a - b);
                resolve({ frames: times.length, p95: times[Math.floor(times.length * 0.95)] ?? 0, heapStart, heapEnd: mem() });
              }
            };
            requestAnimationFrame(tick);
          }),
        seconds * 1000,
      );
      // orbit and switch floors while measuring
      for (let i = 0; i < seconds * 6; i++) {
        await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowUp');
        await page.waitForTimeout(100);
      }
      const m = await measure;
      const s = (await stats(page))!;
      const info = await page.evaluate(() => {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          renderer: gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
          dpr: window.devicePixelRatio,
          canvas: (() => {
            const el = document.querySelector('[data-testid="scene-3d"] canvas') as HTMLCanvasElement;
            return { width: el.width, height: el.height };
          })(),
        };
      });

      // switching views repeatedly must not leave geometries behind
      const geometriesBefore = s.geometries;
      for (let i = 0; i < 6; i++) {
        await pickFloor(page, i % 2 ? 'floor-all' : 'floor-B1F');
        await page.waitForTimeout(150);
      }
      await pickFloor(page, 'floor-all');
      await page.waitForTimeout(400);
      const geometriesAfter = (await stats(page))!.geometries;

      const result = {
        measuredAt: new Date().toISOString(),
        browser: `${browser.browserType().name()} ${browser.version()}`,
        headless: true,
        webglRenderer: info.renderer,
        viewport,
        canvasPixels: { ...info.canvas, dpr: info.dpr },
        scene: `all floors, demo route 3 highlighted, labels on, orbiting by keyboard, rendering every frame${withTrains ? ', timetable trains running from 12:00:00' : ', trains off'}`,
        trains: withTrains ? await page.evaluate(() => (window as unknown as { __SENKIRO_TRAINS__?: { shown: number; instances: number } }).__SENKIRO_TRAINS__ ?? null) : null,
        seconds,
        fps: Math.round((m.frames / seconds) * 10) / 10,
        p95FrameMs: Math.round(m.p95 * 10) / 10,
        triangles: s.triangles,
        drawCalls: s.calls,
        lineSegments: s.lines,
        geometries: { afterLoad: geometriesBefore, afterSixFloorSwitches: geometriesAfter },
        jsHeapMB: m.heapStart !== null && m.heapEnd !== null ? { start: Math.round(m.heapStart / 1e5) / 10, end: Math.round(m.heapEnd / 1e5) / 10 } : null,
      };
      mkdirSync('test-results', { recursive: true });
      writeFileSync(`test-results/perf-${viewport.width}x${viewport.height}${withTrains ? '-trains' : ''}.json`, `${JSON.stringify(result, null, 2)}\n`);
      console.log(`[perf] ${JSON.stringify(result)}`);

      expect(s.calls).toBeLessThan(40);
      expect(geometriesAfter).toBeLessThanOrEqual(geometriesBefore + 2);
      expect(m.frames).toBeGreaterThan(seconds); // it keeps rendering; the measured figure goes into REPORT.md
      expect(errors).toEqual([]);
    });
  }
});
