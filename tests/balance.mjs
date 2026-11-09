// Difficulty / balance probe.
//
// Drives the real stage-1 boss with an invulnerable player parked in the
// bottom-centre and reports how long each phase takes to kill at each power
// level. Used to tune boss HP so a phase never runs long past its timer.
//
// Usage: node tests/balance.mjs

const FRAME = 1 / 60;

function stubDom() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy(
    { canvas: null, measureText: (t) => ({ width: String(t).length * 6 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'globalAlpha' || prop === 'lineWidth' || prop === 'shadowBlur') return 1;
        if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'font' || prop === 'textAlign' || prop === 'textBaseline' || prop === 'shadowColor' || prop === 'lineCap' || prop === 'globalCompositeOperation') return '';
        return noop;
      },
      set() {
        return true;
      },
    },
  );
  const canvas = {
    width: 390,
    height: 844,
    addEventListener: noop,
    removeEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 }),
  };
  globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};
  globalThis.window = globalThis;
  globalThis.devicePixelRatio = 2;
  globalThis.innerWidth = 390;
  globalThis.innerHeight = 844;
  globalThis.addEventListener = noop;
  globalThis.removeEventListener = noop;
  globalThis.document = {
    readyState: 'complete',
    hidden: false,
    getElementById: () => canvas,
    createElement: () => ({ width: 32, height: 32, getContext: () => ctx }),
    addEventListener: noop,
    removeEventListener: noop,
  };
  globalThis.visualViewport = undefined;
  globalThis.localStorage = undefined;
  globalThis.requestAnimationFrame = () => 0;
  return canvas;
}

async function main() {
  const canvas = stubDom();
  const { Game } = await import('../src/game.js');

  const rows = [];
  for (const power of [1, 2, 3, 4]) {
    const game = new Game(canvas);
    game.startNewGame();
    game.player.invuln = 1e9;
    game.player.power = power;
    game.player.targetX = game.worldW / 2;
    game.player.targetY = game.worldH * 0.82;
    // Skip the wave script: go straight to the boss.
    game.director.stop();
    game.spawnBoss();
    game.player.power = power;

    const phases = [];
    let framesRun = 0;
    let lastPhase = -1;
    let phaseStart = 0;
    let lagX = game.worldW / 2;
    while (framesRun < 60 * 200 && game.boss) {
      // Model a competent player: the ship tracks the boss horizontally with a
      // little lag (auto-fire is straight up, so alignment is the whole skill).
      game.player.power = power;
      if (game.boss) lagX += (game.boss.x - lagX) * 0.12;
      game.player.x = lagX;
      game.player.targetX = lagX;
      game.player.y = game.worldH * 0.82;
      game.player.targetY = game.player.y;
      game.update(FRAME);
      framesRun++;
      if (game.boss && game.boss.phaseIndex !== lastPhase) {
        if (lastPhase >= 0) phases.push({ phase: lastPhase, seconds: (framesRun - phaseStart) / 60 });
        lastPhase = game.boss.phaseIndex;
        phaseStart = framesRun;
      }
    }
    if (lastPhase >= 0) phases.push({ phase: lastPhase, seconds: (framesRun - phaseStart) / 60 });
    rows.push({ power, killed: !game.boss, phases });
    console.log(`power ${power}: ${game.boss ? 'NOT KILLED' : 'cleared'}`);
    for (const p of phases) console.log(`  phase ${p.phase + 1}: ${p.seconds.toFixed(1)}s`);
  }

  console.log('\nRecommendation: every phase under ~35s at power 2, under ~15s at power 4.');
  const worstPower2 = Math.max(...(rows.find((r) => r.power === 2)?.phases.map((p) => p.seconds) ?? [0]));
  const worstPower4 = Math.max(...(rows.find((r) => r.power === 4)?.phases.map((p) => p.seconds) ?? [0]));
  const ok = worstPower2 < 35 && worstPower4 < 18 && rows.every((r) => r.killed || r.power < 3);
  console.log(`${ok ? 'PASS' : 'FAIL'}  slowest phase: power2=${worstPower2.toFixed(1)}s power4=${worstPower4.toFixed(1)}s`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
