// Stage scripts.
//
// Difficulty ramps along two axes: more simultaneous spawns and higher fire
// rates. Every pattern here is telegraphed (spawn from the top, slow first
// volley) so a phone player can read it.

import { rand } from './util.js';

const fmt = (n) => n;

function droneWave(game, count, opts = {}) {
  const spread = Math.min(game.worldW - 80, 300);
  const startX = game.worldW / 2 - spread / 2;
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? game.worldW / 2 : startX + (spread * i) / (count - 1);
    game.enemies.spawn('drone', {
      x: x + rand(-14, 14),
      y: -30 - i * 12,
      vy: opts.vy ?? 74,
      hpScale: game.hpScale,
      difficulty: game.difficulty,
      fireDelay: 0.8 + i * 0.18,
      sway: opts.sway ?? 26,
    });
  }
}

function weaverPair(game) {
  for (const side of [-1, 1]) {
    game.enemies.spawn('weaver', {
      x: game.worldW / 2 + side * 70,
      y: -40,
      vy: 62,
      hpScale: game.hpScale,
      difficulty: game.difficulty,
      fireDelay: 1.0,
      sway: 44,
    });
  }
}

function turret(game, x = null) {
  game.enemies.spawn('turret', {
    x: x ?? rand(80, game.worldW - 80),
    y: -40,
    vy: 48,
    holdY: 130,
    hpScale: game.hpScale,
    difficulty: game.difficulty,
    fireDelay: 1.2,
    life: 16,
  });
}

function bomber(game, x = null) {
  game.enemies.spawn('bomber', {
    x: x ?? rand(100, game.worldW - 100),
    y: -50,
    vy: 44,
    holdY: 110,
    hpScale: game.hpScale,
    difficulty: game.difficulty,
    fireDelay: 1.6,
    life: 20,
  });
}

export function buildStage(stageNumber) {
  const s = stageNumber;
  const events = [];
  const push = (t, fn) => events.push({ t, fn });

  push(1.2, (g) => g.ui.stageIntro(s));
  push(1.4, (g) => g.audio.startMusic('stage'));

  // ---- Opener: gentle drones so the player learns the drag controls -------
  push(3.0, (g) => droneWave(g, 3, { sway: 30 + s * 4 }));
  push(5.4, (g) => droneWave(g, 3, { sway: 36 + s * 4 }));
  push(7.8, (g) => droneWave(g, 4, { sway: 42 + s * 4 }));

  // ---- Mid section: weavers + turrets -----------------------------------
  push(11.5, (g) => weaverPair(g));
  push(13.0, (g) => droneWave(g, 4));
  push(16.0, (g) => turret(g, g.worldW * 0.3));
  push(18.2, (g) => turret(g, g.worldW * 0.7));
  push(19.0, (g) => weaverPair(g));

  // ---- Power-up breather -------------------------------------------------
  push(22.0, (g) => {
    g.ui.message('POWER UP!', 1.4);
    for (let i = 0; i < 3; i++) g.spawnPowerItem(g.worldW / 2 + (i - 1) * 46, -20, 70);
  });

  // ---- Pressure ---------------------------------------------------------
  push(25.0, (g) => droneWave(g, 5, { vy: 84 }));
  push(27.5, (g) => bomber(g));
  push(29.0, (g) => turret(g));
  push(31.0, (g) => weaverPair(g));
  push(33.5, (g) => droneWave(g, 5, { vy: 90 }));
  push(36.0, (g) => bomber(g, g.worldW * 0.5));
  push(38.0, (g) => turret(g, g.worldW * 0.35));
  push(38.6, (g) => turret(g, g.worldW * 0.65));

  // ---- Second breather ---------------------------------------------------
  push(41.0, (g) => {
    g.ui.message('NICE!', 1.1);
    g.spawnPowerItem(g.worldW * 0.5, -20, 60);
    g.spawnPowerItem(g.worldW * 0.5, -20, 60);
  });

  // ---- Ramp --------------------------------------------------------------
  push(43.5, (g) => droneWave(g, 6, { vy: 96, sway: 48 }));
  push(46.0, (g) => weaverPair(g));
  push(47.5, (g) => bomber(g));
  push(49.5, (g) => turret(g));
  push(51.0, (g) => droneWave(g, 6, { vy: 100 }));
  push(53.5, (g) => bomber(g, g.worldW * 0.3));
  push(54.5, (g) => bomber(g, g.worldW * 0.7));

  // ---- Mini gauntlet -----------------------------------------------------
  for (let i = 0; i < 6; i++) {
    push(58 + i * 3.2, (g) => droneWave(g, 4, { vy: 100 + i * 4, sway: 40 }));
  }
  push(60.0, (g) => turret(g, g.worldW * 0.25));
  push(63.0, (g) => turret(g, g.worldW * 0.75));
  push(66.0, (g) => weaverPair(g));
  push(69.0, (g) => bomber(g));

  // ---- Calm before the boss ---------------------------------------------
  push(74.0, (g) => g.ui.message('WARNING', 1.6));
  push(75.0, (g) => {
    g.spawnPowerItem(g.worldW * 0.35, -20, 70);
    g.spawnPowerItem(g.worldW * 0.65, -20, 70);
  });
  push(80.0, (g) => droneWave(g, 3, { vy: 60 }));

  // ---- Boss --------------------------------------------------------------
  push(88.0, (g) => g.spawnBoss());

  // Scale event timestamps to keep the stage length similar for later stages.
  for (const ev of events) ev.t = fmt(ev.t);
  return events;
}

export const STAGE_COUNT = 3;
