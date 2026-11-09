// Headless-Chrome smoke test + performance probe.
//
// Verifies the real page (no mocks): boot, touch drag, auto-fire, boss fight,
// pause/resume, game over and a sustained-frame-rate measurement. Screenshots
// land in verification/screenshots for visual review.
//
// Usage: node tests/smoke.mjs [--url http://localhost:8080/]

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  process.env.CHROME_PATH,
].filter(Boolean);

const SHOT_DIR = 'verification/screenshots';
const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (p && existsSync(p)) return p;
  throw new Error('Chrome/Edge not found; set CHROME_PATH');
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const urlArg = args.indexOf('--url');
  const port = 8137;
  let server = null;
  let url = 'http://localhost:' + port + '/';
  if (urlArg !== -1) {
    url = args[urlArg + 1];
  } else {
    server = spawn(process.execPath, ['scripts/serve.mjs', String(port)], { stdio: 'pipe' });
    const ok = await waitForServer(url);
    if (!ok) throw new Error('local server failed to start');
  }

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio', '--font-render-hinting=none'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => consoleErrors.push(`requestfailed ${req.url()} ${req.failure()?.errorText}`));

  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !!window.__game, { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 700));

  const boot = await page.evaluate(() => ({
    state: window.__game.state,
    worldW: window.__game.worldW,
    worldH: window.__game.worldH,
    bullets: window.__game.bullets.pool.length,
    fps: window.__game.fps,
  }));
  check('page boots into title state', boot.state === 'title', JSON.stringify(boot));
  check('lifecycle: pools allocated', boot.bullets === 1400, `pool=${boot.bullets}`);
  await page.screenshot({ path: `${SHOT_DIR}/01-title.png` });

  // --- Start via tap -------------------------------------------------------
  await page.touchscreen.tap(195, 500);
  await new Promise((r) => setTimeout(r, 900));
  const started = await page.evaluate(() => ({
    state: window.__game.state,
    stage: window.__game.stage,
    lives: window.__game.player.lives,
  }));
  check('tap starts the game', started.state === 'playing', JSON.stringify(started));

  // --- Touch drag moves the ship ------------------------------------------
  const before = await page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y }));
  await page.touchscreen.touchStart(200, 600);
  for (let i = 1; i <= 8; i++) {
    await page.touchscreen.touchMove(200 + i * 8, 600 - i * 6);
    await new Promise((r) => setTimeout(r, 16));
  }
  await page.touchscreen.touchEnd();
  await new Promise((r) => setTimeout(r, 300));
  const after = await page.evaluate(() => ({ x: window.__game.player.x, y: window.__game.player.y }));
  check(
    'touch drag moves the ship',
    Math.abs(after.x - before.x) + Math.abs(after.y - before.y) > 20,
    `from ${before.x.toFixed(1)},${before.y.toFixed(1)} to ${after.x.toFixed(1)},${after.y.toFixed(1)}`,
  );
  await page.screenshot({ path: `${SHOT_DIR}/02-play.png` });

  // --- Auto fire produces bullets -----------------------------------------
  const fire = await page.evaluate(() => ({ shots: window.__game.shots.live, power: window.__game.player.power }));
  check('auto-fire emits shots', fire.shots > 0, JSON.stringify(fire));

  // --- Fast-forward the stage director, then spawn the boss ----------------
  await page.evaluate(() => {
    const g = window.__game;
    g.player.invuln = 999; // keep the probe alive while we measure
    g.spawnBoss();
  });
  await new Promise((r) => setTimeout(r, 1600));
  await page.screenshot({ path: `${SHOT_DIR}/03-boss-entering.png` });

  // Let the boss run a while to build up a dense bullet field.
  await new Promise((r) => setTimeout(r, 3500));
  const bossState = await page.evaluate(() => ({
    boss: !!window.__game.boss,
    phase: window.__game.boss?.phaseIndex,
    hp: window.__game.boss?.hp,
    bullets: window.__game.bullets.live,
    fps: window.__game.fps,
    lasers: window.__game.lasers.count,
  }));
  check('boss spawns and fires', bossState.boss && bossState.bullets > 20, JSON.stringify(bossState));
  await page.screenshot({ path: `${SHOT_DIR}/04-boss-battle.png` });

  // --- Stress: measure sustained frame rate with a dense bullet field ------  
  await page.evaluate(() => {
    const g = window.__game;
    // Inject a worst-case wall of bullets around the field.
    for (let i = 0; i < 900; i++) {
      g.bullets.fire({
        x: Math.random() * g.worldW,
        y: Math.random() * g.worldH * 0.8,
        angle: Math.random() * Math.PI * 2,
        speed: 40 + Math.random() * 80,
        color: '#5ce1ff',
        radius: 4.5,
      });
    }
    g._probe = { frames: 0, start: performance.now() };
    const tick = () => {
      g._probe.frames++;
      if (performance.now() - g._probe.start < 3000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 3400));
  const perf = await page.evaluate(() => {
    const g = window.__game;
    const elapsed = performance.now() - g._probe.start;
    return {
      fps: (g._probe.frames / elapsed) * 1000,
      bullets: g.bullets.live,
      peak: g.bullets.peak,
      dpr: g.viewport.dpr,
    };
  });
  check('renders dense danmaku above 45fps (headless SW renderer)', perf.fps >= 45, JSON.stringify(perf));
  await page.screenshot({ path: `${SHOT_DIR}/05-stress.png` });

  // --- Pause / resume ------------------------------------------------------
  await page.evaluate(() => window.__game.pause());
  await new Promise((r) => setTimeout(r, 250));
  const paused = await page.evaluate(() => window.__game.state);
  await page.screenshot({ path: `${SHOT_DIR}/06-pause.png` });
  await page.evaluate(() => window.__game.resume());
  await new Promise((r) => setTimeout(r, 250));
  const resumed = await page.evaluate(() => window.__game.state);
  check('pause/resume round-trip', paused === 'paused' && resumed === 'playing', `${paused} -> ${resumed}`);

  // --- Bomb clears bullets -------------------------------------------------
  const bombResult = await page.evaluate(async () => {
    const g = window.__game;
    const before = g.bullets.live;
    g.useBomb();
    await new Promise((r) => setTimeout(r, 120));
    return { before, after: g.bullets.live, bombs: g.player.bombs };
  });
  check('bomb cancels bullets', bombResult.after < bombResult.before && bombResult.bombs < 3, JSON.stringify(bombResult));

  // --- Game over path ------------------------------------------------------
  const over = await page.evaluate(async () => {
    const g = window.__game;
    g.player.invuln = 0;
    g.player.lives = 1;
    g.player.hit();
    await new Promise((r) => setTimeout(r, 1600));
    return { state: g.state, score: g.score, high: g.highScore };
  });
  check('game over after last life', over.state === 'gameover', JSON.stringify(over));
  await page.screenshot({ path: `${SHOT_DIR}/07-gameover.png` });

  // --- Restart -------------------------------------------------------------
  await page.touchscreen.tap(195, 844 * 0.5);
  await new Promise((r) => setTimeout(r, 800));
  const restarted = await page.evaluate(() => ({ state: window.__game.state, stage: window.__game.stage, lives: window.__game.player.lives }));
  check('restart from game over', restarted.state === 'playing' && restarted.lives === 3, JSON.stringify(restarted));

  // --- Landscape -----------------------------------------------------------
  await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 600));
  const landscape = await page.evaluate(() => ({ w: window.__game.worldW, h: window.__game.worldH, scale: window.__game.viewport.scale }));
  check('landscape keeps playfield within bounds', landscape.scale > 0 && landscape.h >= 720, JSON.stringify(landscape));
  await page.screenshot({ path: `${SHOT_DIR}/08-landscape.png` });

  check('no page errors', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 400));
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 400));

  await browser.close();
  if (server) server.kill();

  const summary = { date: new Date().toISOString(), url, results, failures };
  await writeFile('verification/smoke-results.json', JSON.stringify(summary, null, 2));
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('SMOKE TEST CRASHED', err);
  process.exit(2);
});
