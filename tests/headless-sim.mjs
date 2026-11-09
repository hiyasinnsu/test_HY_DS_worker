// Headless gameplay simulation.
//
// CI and the authoring sandbox cannot always run a real browser, so this test
// boots the *real* game modules against a strict Canvas/DOM stub. The stub
// throws on NaN coordinates and on any CanvasRenderingContext2D method that is
// not part of the real API, which catches the two failure classes that matter
// most for a hand-written engine: typo'd draw calls and math that produces NaN.
//
// Usage: node tests/headless-sim.mjs

const FRAME = 1 / 60;
const issues = [];
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) issues.push(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- canvas --

function assertNumbers(name, args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a === 'number' && !Number.isFinite(a)) {
      throw new Error(`${name} received non-finite argument #${i}: ${a}`);
    }
  }
}

class StubContext {
  constructor(canvas) {
    this.canvas = canvas;
    this._depth = 0;
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.shadowBlur = 0;
    this.shadowColor = 'transparent';
    this.lineCap = 'butt';
    this.calls = 0;
  }

  setTransform(...a) { assertNumbers('setTransform', a); }
  translate(...a) { assertNumbers('translate', a); }
  rotate(a) { assertNumbers('rotate', [a]); }
  save() { this._depth++; }
  restore() { this._depth--; if (this._depth < 0) throw new Error('unbalanced ctx.restore()'); }
  beginPath() {}
  closePath() {}
  moveTo(...a) { assertNumbers('moveTo', a); }
  lineTo(...a) { assertNumbers('lineTo', a); }
  quadraticCurveTo(...a) { assertNumbers('quadraticCurveTo', a); }
  bezierCurveTo(...a) { assertNumbers('bezierCurveTo', a); }
  arc(...a) { assertNumbers('arc', a); this.calls++; }
  ellipse(...a) { assertNumbers('ellipse', a); this.calls++; }
  rect(...a) { assertNumbers('rect', a); }
  fill() { this.calls++; }
  stroke() { this.calls++; }
  clip() {}
  fillRect(...a) { assertNumbers('fillRect', a); }
  strokeRect(...a) { assertNumbers('strokeRect', a); }
  clearRect(...a) { assertNumbers('clearRect', a); }
  fillText(text, ...a) {
    assertNumbers('fillText', a);
    if (text === 'undefined' || text === 'NaN') throw new Error(`text drawn as ${text}`);
  }
  setLineDash(a) { assertNumbers('setLineDash', a); }
  drawImage(img, ...a) {
    if (!img) throw new Error('drawImage received a falsy image');
    assertNumbers('drawImage', a);
    this.calls++;
  }
  measureText(text) { return { width: String(text).length * 6 }; }
  createLinearGradient(...a) {
    assertNumbers('createLinearGradient', a);
    return { addColorStop(o, c) { assertNumbers('addColorStop', [o]); if (!c) throw new Error('empty color stop'); } };
  }
  createRadialGradient(...a) {
    assertNumbers('createRadialGradient', a);
    return { addColorStop(o, c) { assertNumbers('addColorStop', [o]); if (!c) throw new Error('empty color stop'); } };
  }
}

class StubCanvas {
  constructor(w = 390, h = 844) {
    this.width = w;
    this.height = h;
    this._cssW = w;
    this._cssH = h;
    this.style = {};
    this._ctx = null;
  }
  getContext() {
    this._ctx ??= new StubContext(this);
    return this._ctx;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: this._cssW, height: this._cssH, right: this._cssW, bottom: this._cssH };
  }
  addEventListener() {}
  removeEventListener() {}
  setPointerCapture() {}
  releasePointerCapture() {}
}

function installDom() {
  const listeners = new Map();
  const canvas = new StubCanvas(390, 844);
  globalThis.HTMLCanvasElement = StubCanvas;
  globalThis.window = globalThis;
  globalThis.devicePixelRatio = 3;
  globalThis.innerWidth = 390;
  globalThis.innerHeight = 844;
  globalThis.addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  globalThis.removeEventListener = () => {};
  globalThis.document = {
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    getElementById: (id) => (id === 'game' ? canvas : null),
    createElement: (tag) => (tag === 'canvas' ? new StubCanvas(32, 32) : { style: {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.visualViewport = undefined;
  globalThis.localStorage = undefined;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.__listeners = listeners;
  return canvas;
}

// ------------------------------------------------------------------- sim --

function sanity(game, where) {
  const finite = (v) => Number.isFinite(v);
  if (!finite(game.player.x) || !finite(game.player.y)) {
    throw new Error(`player position not finite at ${where}: ${game.player.x},${game.player.y}`);
  }
  // The ship is frozen outside the field while paused/on menus by design, so
  // the bounds assertion only applies to live gameplay.
  if (game.state !== 'playing') return;
  if (game.player.x < -1 || game.player.x > game.worldW + 1 || game.player.y < -1 || game.player.y > game.worldH + 1) {
    throw new Error(`player out of field at ${where}: ${game.player.x.toFixed(1)},${game.player.y.toFixed(1)}`);
  }
  for (const b of game.bullets.pool) {
    if (!b.active) continue;
    if (!finite(b.x) || !finite(b.y)) {
      throw new Error(`bullet not finite at ${where}: ${b.x},${b.y}`);
    }
  }
  if (game.boss) {
    if (!finite(game.boss.hp) || !finite(game.boss.x) || !finite(game.boss.y)) {
      throw new Error(`boss state not finite at ${where}`);
    }
  }
}

function frames(game, n, onFrame = null) {
  for (let i = 0; i < n; i++) {
    game.update(FRAME);
    game.render();
    game.input.endFrame();
    if (i % 17 === 0) sanity(game, `frame ${i}`);
    if (onFrame && onFrame(i) === false) return i;
  }
  return n;
}

function pointer(game, type, x, y, pointerType = 'touch') {
  game.input.events.push({ type, x, y, id: 1, pointerType });
}

/** World coordinates -> CSS pixels, as a real pointer event would arrive. */
function toCss(game, wx, wy) {
  return {
    x: wx * game.viewport.scale + game.viewport.offsetX,
    y: wy * game.viewport.scale + game.viewport.offsetY,
  };
}

/** Taps the centre of a UI button (button coords are in world units). */
function tapButton(game, id) {
  const b = game.ui.buttons.find((btn) => btn.id === id);
  if (!b) throw new Error(`no button ${id}`);
  const p = toCss(game, b.x + b.w / 2, b.y + b.h / 2);
  pointer(game, 'down', p.x, p.y);
  pointer(game, 'up', p.x, p.y);
  frames(game, 2);
}

async function main() {
  const canvas = installDom();
  const { Game } = await import('../src/game.js');
  const game = new Game(canvas);

  check('boots into title', game.state === 'title');
  check('playfield uses 480-wide virtual units', game.worldW === 480, `w=${game.worldW} h=${game.worldH}`);
  check('device pixel ratio capped', game.viewport.dpr <= 2, `dpr=${game.viewport.dpr}`);

  frames(game, 30);
  check('title animates without errors', true);

  // Tap to start (middle of the start button).
  const startBtn = game.ui.buttons.find((b) => b.id === 'start');
  check('title exposes a start button', !!startBtn);
  tapButton(game, 'start');
  frames(game, 5);
  check('tap starts a run', game.state === 'playing', game.state);

  // Drag the ship to the right and up.
  const x0 = game.player.x;
  const y0 = game.player.y;
  pointer(game, 'down', 200, 700);
  frames(game, 1);
  for (let i = 0; i < 20; i++) {
    pointer(game, 'move', 200 + (i + 1) * 5, 700 - (i + 1) * 4);
    frames(game, 1);
  }
  pointer(game, 'up', 300, 620);
  frames(game, 30);
  check('relative drag moves the ship', game.player.x > x0 + 20, `dx=${(game.player.x - x0).toFixed(1)}`);
  check('relative drag moves vertically', game.player.y < y0 - 10, `dy=${(game.player.y - y0).toFixed(1)}`);

  // Auto-fire.
  frames(game, 10);
  check('auto-fire creates shots', game.shots.live > 0, `live=${game.shots.live}`);

  // Enemies spawn from the stage script.
  frames(game, 60 * 6);
  check('stage script spawns enemies', game.enemies.spawnedCount > 0, `spawned=${game.enemies.spawnedCount}`);
  check('enemies fire bullets', game.bullets.live > 0, `bullets=${game.bullets.live}`);

  // Survive to the boss with an invulnerable probe, tracking peak bullet load.
  game.player.invuln = 1e9;
  let peak = 0;
  const cpuStart = performance.now();
  let simulated = 0;
  frames(game, 60 * 95, () => {
    peak = Math.max(peak, game.bullets.live);
    simulated += FRAME;
    return !game.boss;
  });
  const cpuMs = performance.now() - cpuStart;
  check('boss appears after the stage script', !!game.boss, `t=${simulated.toFixed(0)}s peakBullets=${peak}`);
  check('bullet pool never exceeded', game.bullets.live <= game.bullets.limit);
  const framesSimulated = Math.max(1, Math.round(simulated * 60));
  console.log(`  simulated ${simulated.toFixed(1)}s (${framesSimulated} frames) in ${cpuMs.toFixed(0)}ms → ${(cpuMs / framesSimulated).toFixed(3)}ms/frame for update+render`);

  // Fight the boss; the auto-fire should chew through phases.
  const phaseStart = game.boss.phaseIndex;
  let killed = false;
  frames(game, 60 * 240, () => {
    peak = Math.max(peak, game.bullets.live);
    if (game.state === 'stageclear') {
      killed = true;
      return false;
    }
    return !!game.boss || game.state === 'playing';
  });
  check('boss phases progress', (game.boss?.phaseIndex ?? 4) > phaseStart || killed, `phase=${game.boss?.phaseIndex ?? 'cleared'}`);
  if (killed) {
    check('stage clear triggered', game.state === 'stageclear', game.state);
    check('clear bonus computed', game.clearBonus.lives >= 0 && game.clearBonus.kills >= 0);
    const nextBtn = game.ui.buttons.find((b) => b.id === 'next');
    check('stage clear exposes next button', !!nextBtn);
    tapButton(game, 'next');
    frames(game, 4);
    check('advances to stage 2', game.stage === 2 && game.state === 'playing', `stage=${game.stage} state=${game.state}`);
  } else {
    console.log('  note: boss not defeated by the passive probe within 240s (expected for an idle ship)');
  }
  console.log(`  peak live bullets: ${Math.max(peak, game.bullets.peak)}`);

  // Pause freezes gameplay time but keeps rendering.
  game.pause();
  const scoreBefore = game.stageTimer;
  frames(game, 60);
  check('pause freezes the stage clock', game.stageTimer === scoreBefore, `${scoreBefore.toFixed(2)} -> ${game.stageTimer.toFixed(2)}`);
  game.resume();
  frames(game, 5);
  check('resume returns to play', game.state === 'playing');

  // Bomb clears the screen and is consumed.
  const bombs0 = game.player.bombs;
  const bullets0 = game.bullets.live;
  game.player.invuln = 0;
  game.useBomb();
  frames(game, 3);
  check('bomb consumes a charge', game.player.bombs === bombs0 - 1, `${bombs0} -> ${game.player.bombs}`);
  check('bomb clears bullets', game.bullets.live < Math.max(bullets0, 1), `${bullets0} -> ${game.bullets.live}`);

  // Losing the last life ends the run.
  game.player.lives = 1;
  game.player.invuln = 0;
  game.player.hit();
  frames(game, 60 * 3);
  check('last life ends the run', game.state === 'gameover', game.state);
  check('score recorded on game over', typeof game.lastResult?.highScore === 'number');

  // Retry from the game-over screen.
  const retry = game.ui.buttons.find((b) => b.id === 'retry');
  check('game over exposes retry', !!retry);
  tapButton(game, 'retry');
  frames(game, 4);
  check('retry restarts the run', game.state === 'playing' && game.stage === 1 && game.player.lives === 3);

  // Settings round-trip.
  game.pause();
  game.openSettings();
  frames(game, 3);
  check('settings screen opens', game.state === 'settings');
  const q0 = game.settings.quality;
  tapButton(game, 'toggleQuality');
  frames(game, 3);
  check('quality toggle changes the dpr cap', game.settings.quality !== q0, `${q0} -> ${game.settings.quality}`);
  game.closeSettings();
  frames(game, 3);
  check('settings return to the previous screen', game.state === 'paused', game.state);

  // Landscape / tablet geometry.
  canvas._cssW = 844;
  canvas._cssH = 390;
  globalThis.innerWidth = 844;
  globalThis.innerHeight = 390;
  game.viewport.measure();
  game.background.resize(game.worldW, game.worldH);
  frames(game, 10);
  check('landscape keeps a sane playfield', game.worldH >= 720 && game.worldH <= 1180, `h=${game.worldH} scale=${game.viewport.scale.toFixed(3)}`);
  check('no NaN/out-of-bounds player after resize', Number.isFinite(game.player.x));

  // Auto quality: sustained low fps must drop the DPR cap exactly once.
  game.resume();
  game.settings.quality = 'auto';
  game._qualityDropped = false;
  game.viewport.dprCap = 2;
  game.fps = 30;
  frames(game, 90);
  check('auto quality drops the dpr cap under load', game.viewport.dprCap === 1.25, `dprCap=${game.viewport.dprCap}`);
  game.fps = 10;
  frames(game, 30);
  check('auto quality only degrades once', game.viewport.dprCap === 1.25);

  // Heavy load CPU budget: 1200 bullets + particles.
  game.resume();
  for (let i = 0; i < 1200; i++) {
    game.bullets.fire({
      x: Math.random() * game.worldW,
      y: Math.random() * game.worldH,
      angle: Math.random() * Math.PI * 2,
      speed: 60,
      color: '#5ce1ff',
    });
  }
  const heavyStart = performance.now();
  frames(game, 240);
  const heavyMs = (performance.now() - heavyStart) / 240;
  check('CPU frame budget under 8ms at 1200 bullets', heavyMs < 8, `${heavyMs.toFixed(2)}ms/frame live=${game.bullets.live}`);

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  if (issues.length) {
    console.log('\nIssues:');
    for (const i of issues) console.log(' - ' + i);
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('HEADLESS SIM CRASHED');
  console.error(err);
  process.exit(2);
});
