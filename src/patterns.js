// Danmaku pattern primitives.
//
// All emitters take `game` so they can read the player position for aimed
// shots and the current difficulty multiplier, then push straight into the
// shared bullet pool.

import { TAU, angleTo } from './util.js';
import { BULLET_PALETTES } from './config.js';

export function palette(game, index = 0) {
  const list = BULLET_PALETTES[(game.stage - 1 + index) % BULLET_PALETTES.length];
  return list[Math.floor(Math.random() * list.length)];
}

export function aimAt(game, x, y) {
  const p = game.player;
  return angleTo(x, y, p.x, p.y);
}

export function shoot(game, x, y, angle, speed, opts = {}) {
  return game.bullets.fire({
    x,
    y,
    angle,
    speed,
    kind: opts.kind ?? 'orb',
    color: opts.color ?? '#ff4d8d',
    radius: opts.radius,
    hit: opts.hit,
    curve: opts.curve ?? 0,
    ax: opts.ax ?? 0,
    ay: opts.ay ?? 0,
    life: opts.life ?? 16,
    spin: opts.spin ?? 0,
  });
}

/** Even ring of bullets around (x, y). */
export function ring(game, x, y, count, speed, opts = {}) {
  const offset = opts.offset ?? 0;
  const color = opts.color ?? '#ff4d8d';
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    shoot(game, x, y, a, speed, { ...opts, color });
  }
}

export function fan(game, x, y, centerAngle, count, spread, speed, opts = {}) {
  if (count <= 0) return;
  const step = count > 1 ? spread / (count - 1) : 0;
  const start = centerAngle - spread / 2;
  for (let i = 0; i < count; i++) {
    shoot(game, x, y, start + step * i, speed, opts);
  }
}

export function aimedFan(game, x, y, count, spread, speed, opts = {}) {
  fan(game, x, y, aimAt(game, x, y), count, spread, speed, opts);
}

export function aimed(game, x, y, speed, opts = {}) {
  shoot(game, x, y, aimAt(game, x, y), speed, opts);
}

/** Rotating spiral arms; call once per volley with an increasing phase. */
export function spiral(game, x, y, phase, arms, speed, opts = {}) {
  const color = opts.color ?? '#5ce1ff';
  for (let i = 0; i < arms; i++) {
    const a = phase + (i / arms) * TAU;
    shoot(game, x, y, a, speed, { ...opts, color });
  }
}

/**
 * A ring that pauses as a stationary "seed" and then bursts outward. Reads as
 * a two-beat pattern instead of an undodgeable wall.
 */
export function delayedRing(game, x, y, count, speed, opts = {}) {
  ring(game, x, y, count, 6, { ...opts, radius: (opts.radius ?? 6) + 1 });
  const delay = opts.delay ?? 0.6;
  const color = opts.color ?? '#ffe066';
  const burstSpeed = speed;
  game.scheduleAt(delay, () => {
    ring(game, x, y, count, burstSpeed, { ...opts, color });
    game.effects.ring(x, y, color, 26, 0.3);
  });
}

const BULLET_BIG_RADIUS = 9.5;

/** Slow heavy bullets fanned toward the player — the "bomber" pattern. */
export function heavySpread(game, x, y, count, spread, opts = {}) {
  const base = aimAt(game, x, y);
  const step = count > 1 ? spread / (count - 1) : 0;
  const start = base - spread / 2;
  for (let i = 0; i < count; i++) {
    shoot(game, x, y, start + step * i, opts.speed ?? 90, {
      kind: 'big',
      radius: BULLET_BIG_RADIUS,
      color: opts.color ?? '#ff9f45',
      life: 14,
    });
  }
}
