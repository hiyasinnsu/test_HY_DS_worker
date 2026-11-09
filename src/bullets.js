// Bullet pools.
//
// Two independent systems:
//   BulletField — enemy danmaku (up to ~1400 live bullets on a phone)
//   ShotField   — player shots, far fewer, checked against enemies
//
// Every object is pooled and mutated in place: allocating per bullet causes GC
// hitches that are very visible at 60 fps with hundreds of projectiles.

import { BULLET } from './config.js';
import { getSprite, PLAYER_SHOT_SPRITE } from './sprites.js';

const CULL = 56;

function makeEnemyBullet() {
  return {
    active: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    curve: 0,
    age: 0,
    life: 10,
    kind: 'orb',
    color: '#ff4d8d',
    radius: 4.6,
    hit: 3.2,
    sprite: null,
    rot: 0,
    spin: 0,
    grazed: false,
    grace: 0.06,
  };
}

export class BulletField {
  constructor(limit = BULLET.maxEnemy) {
    this.limit = limit;
    this.pool = [];
    for (let i = 0; i < limit; i++) this.pool.push(makeEnemyBullet());
    this.free = [];
    for (let i = limit - 1; i >= 0; i--) this.free.push(i);
    this.live = 0;
    this.peak = 0;
  }

  fire(opts) {
    if (this.free.length === 0) return null;
    const idx = this.free.pop();
    const b = this.pool[idx];
    const kind = opts.kind ?? 'orb';
    const radius = opts.radius ?? BULLET.radii[kind] ?? 4.6;
    const angle = opts.angle ?? 0;
    const speed = opts.speed ?? 120;

    b.active = true;
    b.x = opts.x;
    b.y = opts.y;
    b.px = opts.x;
    b.py = opts.y;
    b.vx = Math.cos(angle) * speed;
    b.vy = Math.sin(angle) * speed;
    b.ax = opts.ax ?? 0;
    b.ay = opts.ay ?? 0;
    b.curve = opts.curve ?? 0;
    b.age = 0;
    b.life = opts.life ?? 14;
    b.kind = kind;
    b.color = opts.color ?? '#ff4d8d';
    b.radius = radius;
    b.hit = opts.hit ?? radius * 0.78;
    b.spin = opts.spin ?? 0;
    b.rot = angle + Math.PI / 2;
    b.grazed = false;
    b.grace = opts.grace ?? 0.05;
    b.sprite = getSprite(kind, b.color, radius);
    this.live++;
    if (this.live > this.peak) this.peak = this.live;
    return b;
  }

  release(b) {
    if (!b.active) return;
    b.active = false;
    this.live--;
    this.free.push(this.pool.indexOf(b));
  }

  /** Removes bullets inside a radius, returning how many were cancelled. */
  cancelInRadius(cx, cy, radius) {
    const r2 = radius * radius;
    let removed = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const b = this.pool[i];
      if (!b.active) continue;
      const dx = b.x - cx;
      const dy = b.y - cy;
      if (dx * dx + dy * dy <= r2) {
        b.active = false;
        this.live--;
        this.free.push(i);
        removed++;
      }
    }
    return removed;
  }

  cancelAll() {
    let removed = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const b = this.pool[i];
      if (b.active) {
        b.active = false;
        this.free.push(i);
        removed++;
      }
    }
    this.live = 0;
    return removed;
  }

  update(dt, worldW, worldH) {
    const pool = this.pool;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;

      b.px = b.x;
      b.py = b.y;
      b.age += dt;
      b.life -= dt;

      if (b.curve !== 0) {
        const c = Math.cos(b.curve * dt);
        const s = Math.sin(b.curve * dt);
        const vx = b.vx * c - b.vy * s;
        const vy = b.vx * s + b.vy * c;
        b.vx = vx;
        b.vy = vy;
      }
      if (b.ax !== 0 || b.ay !== 0) {
        b.vx += b.ax * dt;
        b.vy += b.ay * dt;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.spin !== 0) b.rot += b.spin * dt;
      else if (b.kind === 'rice') b.rot = Math.atan2(b.vy, b.vx) + Math.PI / 2;

      if (
        b.life <= 0 ||
        b.x < -CULL ||
        b.x > worldW + CULL ||
        b.y < -CULL ||
        b.y > worldH + CULL
      ) {
        b.active = false;
        this.live--;
        this.free.push(i);
      }
    }
  }

  draw(ctx) {
    const pool = this.pool;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;
      const sp = b.sprite;
      if (b.kind === 'rice' && b.spin === 0) {
        // The sprite's long axis is vertical, so align it with the velocity.
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot - Math.PI);
        ctx.drawImage(sp.canvas, -sp.half, -sp.half);
        ctx.restore();
      } else {
        ctx.drawImage(sp.canvas, b.x - sp.half, b.y - sp.half);
      }
    }
  }
}

function makeShot() {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage: 1,
    radius: 3,
    sprite: null,
  };
}

export class ShotField {
  constructor(limit = BULLET.maxPlayer) {
    this.pool = [];
    for (let i = 0; i < limit; i++) this.pool.push(makeShot());
    this.free = [];
    for (let i = limit - 1; i >= 0; i--) this.free.push(i);
    this.live = 0;
    this.shotSprite = null;
  }

  fire(x, y, angle, speed, damage, radius = 3.4) {
    if (this.free.length === 0) return null;
    this.shotSprite ??= getSprite(PLAYER_SHOT_SPRITE, '#c8f6ff', 4.2);
    const idx = this.free.pop();
    const s = this.pool[idx];
    s.active = true;
    s.x = x;
    s.y = y;
    s.vx = Math.cos(angle) * speed;
    s.vy = Math.sin(angle) * speed;
    s.damage = damage;
    s.radius = radius;
    s.sprite = this.shotSprite;
    this.live++;
    return s;
  }

  update(dt, worldH) {
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s.active) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y < -40 || s.y > worldH + 40 || s.x < -40 || s.x > 520) {
        s.active = false;
        this.live--;
        this.free.push(i);
      }
    }
  }

  release(s) {
    if (!s.active) return;
    s.active = false;
    this.live--;
    this.free.push(this.pool.indexOf(s));
  }

  clear() {
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].active) {
        this.pool[i].active = false;
        this.free.push(i);
      }
    }
    this.live = 0;
  }

  draw(ctx) {
    for (let i = 0; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (!s.active) continue;
      const sp = s.sprite;
      ctx.drawImage(sp.canvas, s.x - sp.half, s.y - sp.half);
    }
  }
}
