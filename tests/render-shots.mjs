// Real-renderer screenshot generator.
//
// The sandbox blocks launching a browser, so instead of a headless Chrome we
// render the actual game with a real Canvas 2D implementation (@napi-rs/canvas,
// the same Skia-backed rasteriser class of implementation browsers use for the
// 2D context). This exercises every draw call for real and writes PNGs that can
// be inspected by eye.
//
// Usage: node tests/render-shots.mjs

import { createCanvas } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'verification/screenshots';
const FRAME = 1 / 60;

function stubDom() {
  const listeners = new Map();

  const makeCanvas = (w, h) => {
    const c = createCanvas(w, h);
    c.addEventListener = () => {};
    c.removeEventListener = () => {};
    c.setPointerCapture = () => {};
    c.releasePointerCapture = () => {};
    c.getBoundingClientRect = () => ({ left: 0, top: 0, width: state.cssW, height: state.cssH, right: state.cssW, bottom: state.cssH });
    return c;
  };

  const state = { cssW: 390, cssH: 844, canvas: makeCanvas(390, 844) };

  globalThis.HTMLCanvasElement = Object.getPrototypeOf(state.canvas).constructor;
  globalThis.window = globalThis;
  globalThis.devicePixelRatio = 2;
  globalThis.innerWidth = state.cssW;
  globalThis.innerHeight = state.cssH;
  globalThis.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  globalThis.removeEventListener = () => {};
  globalThis.document = {
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    getElementById: () => state.canvas,
    createElement: (tag) => (tag === 'canvas' ? makeCanvas(32, 32) : { style: {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.visualViewport = undefined;
  globalThis.localStorage = undefined;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};

  return {
    canvas: state.canvas,
    setSize(w, h) {
      state.cssW = w;
      state.cssH = h;
      globalThis.innerWidth = w;
      globalThis.innerHeight = h;
    },
  };
}

function step(game, n) {
  for (let i = 0; i < n; i++) {
    game.update(FRAME);
    game.render();
    game.input.endFrame();
  }
}

function tapWorld(game, wx, wy) {
  const x = wx * game.viewport.scale + game.viewport.offsetX;
  const y = wy * game.viewport.scale + game.viewport.offsetY;
  game.input.events.push({ type: 'down', x, y, id: 1, pointerType: 'touch' });
  game.input.events.push({ type: 'up', x, y, id: 1, pointerType: 'touch' });
}

async function save(canvas, name) {
  const buf = canvas.toBuffer('image/png');
  await writeFile(`${OUT}/${name}.png`, buf);
  console.log(`wrote ${OUT}/${name}.png (${canvas.width}x${canvas.height}, ${(buf.length / 1024).toFixed(0)} KiB)`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const dom = stubDom();
  const { Game } = await import('../src/game.js');
  const game = new Game(dom.canvas);

  // 1. Title
  step(game, 90);
  await save(dom.canvas, '01-title');

  // 2. Opening waves
  const start = game.ui.buttons.find((b) => b.id === 'start');
  tapWorld(game, start.x + start.w / 2, start.y + start.h / 2);
  step(game, 6);
  game.player.invuln = 1e9;
  // Park the ship low and let a few waves build up.
  game.player.targetX = game.worldW * 0.5;
  game.player.targetY = game.worldH * 0.78;
  step(game, 60 * 12);
  await save(dom.canvas, '02-stage-waves');

  // 3. Dense mid-stage fight
  step(game, 60 * 22);
  await save(dom.canvas, '03-midstage');

  // 4. Boss
  game.spawnBoss();
  step(game, 60 * 5);
  await save(dom.canvas, '04-boss');
  step(game, 60 * 12);
  await save(dom.canvas, '05-boss-phase');

  // 5. Worst-case bullet wall
  for (let i = 0; i < 900; i++) {
    game.bullets.fire({
      x: Math.random() * game.worldW,
      y: Math.random() * game.worldH * 0.75,
      angle: Math.random() * Math.PI * 2,
      speed: 40 + Math.random() * 70,
      color: ['#ff4d8d', '#5ce1ff', '#ffe066'][i % 3],
      radius: 4.5,
    });
  }
  step(game, 30);
  await save(dom.canvas, '06-stress');

  // 6. Pause overlay
  game.pause();
  step(game, 10);
  await save(dom.canvas, '07-pause');

  // 7. Game over
  game.resume();
  game.player.invuln = 0;
  game.player.lives = 1;
  game.player.hit();
  step(game, 60 * 2.5);
  await save(dom.canvas, '08-gameover');

  // 8. Stage clear screen (drive the boss to death quickly)
  game.startNewGame();
  step(game, 10);
  game.player.invuln = 1e9;
  game.spawnBoss();
  step(game, 60 * 4);
  for (let i = 0; i < 4 && game.boss; i++) {
    game.boss.hp = 1;
    game.boss.damage(10);
    step(game, 70);
  }
  step(game, 200);
  await save(dom.canvas, '09-stageclear');

  // 9. Settings + landscape
  game.openSettings();
  step(game, 5);
  await save(dom.canvas, '10-settings');

  // 9b. Landscape gameplay (not an overlay screen, so the HUD is inspected).
  dom.setSize(844, 390);
  game.viewport.measure();
  game.closeSettings();
  game.startNewGame();
  game.player.invuln = 1e9;
  step(game, 60 * 14);
  await save(dom.canvas, '11-landscape');

  // 10. Tablet portrait gameplay
  dom.setSize(820, 1180);
  game.viewport.measure();
  step(game, 120);
  await save(dom.canvas, '12-tablet');

  console.log('done');
}

main().catch((err) => {
  console.error('RENDER SHOTS FAILED');
  console.error(err);
  process.exit(2);
});
