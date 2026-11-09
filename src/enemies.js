// Enemies and their AI.
//
// Enemies are few (under ~24 on screen) so they are plain objects in an array
// rather than pooled. Each type has a distinct silhouette and firing logic so
// the player can learn to read threats at a glance.

import { COLORS } from './config.js';
import { TAU, rand, clamp } from './util.js';
import * as P from './patterns.js';

export const ENEMY_TYPES = {
  drone: { hp: 16, r: 13, score: 120, color: COLORS.enemy },
  weaver: { hp: 30, r: 15, score: 240, color: COLORS.enemy2 },
  turret: { hp: 60, r: 18, score: 460, color: COLORS.enemy3 },
  bomber: { hp: 90, r: 21, score: 620, color: COLORS.enemy2 },
};

export class Enemy {
  constructor(type, opts) {
    const def = ENEMY_TYPES[type] ?? ENEMY_TYPES.drone;
    this.type = type;
    this.def = def;
    this.x = opts.x;
    this.y = opts.y ?? -30;
    this.baseX = opts.x;
    this.vx = 0;
    this.vy = opts.vy ?? 70;
    this.hp = Math.round(def.hp * (opts.hpScale ?? 1));
    this.maxHp = this.hp;
    this.r = def.r;
    this.color = opts.color ?? def.color;
    this.score = def.score;
    this.age = 0;
    this.fireTimer = opts.fireDelay ?? rand(0.4, 1.1);
    this.flash = 0;
    this.dead = false;
    this.phase = opts.phase ?? rand(0, TAU);
    this.sway = opts.sway ?? (type === 'drone' ? 26 : 48);
    this.holdY = opts.holdY ?? null;
    this.life = opts.life ?? 9;
    this.difficulty = opts.difficulty ?? 1;
    this.spin = 0;
    this.dropChance = opts.dropChance ?? 0.22;
  }

  get alive() {
    return !this.dead;
  }

  damage(n) {
    this.hp -= n;
    this.flash = 0.14;
    if (this.hp <= 0) this.dead = true;
  }

  update(dt, game) {
    this.age += dt;
    this.life -= dt;
    if (this.flash > 0) this.flash -= dt;
    this.spin += dt * 0.7;

    if (this.holdY !== null && this.y < this.holdY) {
      const ease = Math.min(1, (this.holdY - this.y) / 60 + 0.06);
      this.y += this.vy * dt * ease;
      if (this.y >= this.holdY) this.y = this.holdY;
    } else if (this.holdY === null) {
      this.y += this.vy * dt;
    }

    switch (this.type) {
      case 'drone':
        this.x = this.baseX + Math.sin(this.age * 2.1 + this.phase) * this.sway;
        this._fireDrone(dt, game);
        break;
      case 'weaver':
        this.x = this.baseX + Math.sin(this.age * 1.5 + this.phase) * (this.sway + 20);
        this._fireWeaver(dt, game);
        break;
      case 'turret':
        this.x = this.baseX + Math.sin(this.age * 0.9 + this.phase) * 10;
        this._fireTurret(dt, game);
        break;
      case 'bomber':
        this.x = this.baseX + Math.sin(this.age * 0.6 + this.phase) * this.sway;
        this._fireBomber(dt, game);
        break;
      default:
        break;
    }

    this.x = clamp(this.x, this.r, game.worldW - this.r);
    if (this.y > game.worldH + 60 || this.life <= 0) this.dead = true;
  }

  _fireDrone(dt, game) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0 || this.y < 20) return;
    this.fireTimer = 1.25 / this.difficulty;
    const color = P.palette(game, 0);
    P.aimedFan(game, this.x, this.y + 8, 3, 0.42, 190, { color, kind: 'rice', radius: 4.4 });
  }

  _fireWeaver(dt, game) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0 || this.y < 10) return;
    this.fireTimer = 1.9 / this.difficulty;
    const color = P.palette(game, 1);
    P.ring(game, this.x, this.y, 6, 145, { color, kind: 'orb', radius: 4.8 });
  }

  _fireTurret(dt, game) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0 || this.y < 10) return;
    this.fireTimer = 0.42 / this.difficulty;
    this.turretPhase = (this.turretPhase ?? 0) + 0.62;
    const color = P.palette(game, 2);
    P.spiral(game, this.x, this.y, this.turretPhase, 3, 135 + 12 * this.difficulty, {
      color,
      kind: 'rice',
      radius: 4.3,
      curve: 0.6,
    });
  }

  _fireBomber(dt, game) {
    this.fireTimer -= dt;
    if (this.fireTimer > 0 || this.y < 10) return;
    this.fireTimer = 2.4 / this.difficulty;
    const color = P.palette(game, 3);
    P.heavySpread(game, this.x, this.y, 5, 1.0, { color: '#ff9f45', speed: 105 });
  }

  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const flash = this.flash > 0;
    const base = flash ? '#ffffff' : this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = base;

    if (this.type === 'drone') {
      ctx.rotate(Math.sin(this.age * 2.1 + this.phase) * 0.2);
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(10, -4);
      ctx.lineTo(4, -10);
      ctx.lineTo(-4, -10);
      ctx.lineTo(-10, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, TAU);
      ctx.fill();
    } else if (this.type === 'weaver') {
      ctx.rotate(this.spin * 0.5);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const rr = i % 2 === 0 ? 14 : 9;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(10,6,20,0.85)';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
    } else if (this.type === 'turret') {
      ctx.rotate(Math.sin(this.age * 0.9 + this.phase) * 0.35);
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(13, 0);
      ctx.lineTo(7, 14);
      ctx.lineTo(-7, 14);
      ctx.lineTo(-13, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 7.5 + Math.sin(time * 6) * 1.2, 0, TAU);
      ctx.stroke();
    } else {
      ctx.rotate(Math.sin(this.age * 0.6 + this.phase) * 0.15);
      ctx.beginPath();
      ctx.moveTo(0, 20);
      ctx.lineTo(16, 4);
      ctx.lineTo(12, -12);
      ctx.lineTo(-12, -12);
      ctx.lineTo(-16, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(12,8,24,0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(0, 0, 2.6, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    // Small health pip for the tougher types so focus-fire is readable.
    if (this.maxHp >= 48 && this.hp < this.maxHp) {
      const w = this.r * 2;
      const k = Math.max(0, this.hp / this.maxHp);
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(this.x - w / 2, this.y + this.r + 5, w, 3);
      ctx.fillStyle = '#ff9f45';
      ctx.fillRect(this.x - w / 2, this.y + this.r + 5, w * k, 3);
      ctx.restore();
    }
  }
}

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnedCount = 0;
  }

  spawn(type, opts) {
    const enemy = new Enemy(type, opts);
    this.list.push(enemy);
    this.spawnedCount++;
    return enemy;
  }

  nearest(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.list) {
      if (e.dead) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  update(dt) {
    const game = this.game;
    for (const e of this.list) {
      if (e.dead) continue;
      e.update(dt, game);
    }
    // Resolve collisions with player shots.
    const shots = game.shots;
    for (let si = 0; si < shots.pool.length; si++) {
      const s = shots.pool[si];
      if (!s.active) continue;
      for (const e of this.list) {
        if (e.dead) continue;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const rr = e.r + s.radius;
        if (dx * dx + dy * dy <= rr * rr) {
          e.damage(s.damage);
          game.effects.spark(s.x, s.y - 4, '#bdf6ff', 2, 90, 1.6);
          shots.release(s);
          break;
        }
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e.dead) continue;
      this._onKilled(e);
      this.list.splice(i, 1);
    }
  }

  _onKilled(e) {
    const game = this.game;
    game.effects.debris(e.x, e.y, e.color, 12, 260);
    game.effects.ring(e.x, e.y, e.color, e.r * 2.4, 0.3, 2.4);
    game.effects.spark(e.x, e.y, '#ffffff', 8, 220, 2);
    game.audio.sfx('pop');
    game.addScore(e.score, e.x, e.y);
    game.stats.kills++;
    if (Math.random() < e.dropChance) game.spawnPowerItem(e.x, e.y);
  }

  /** Contact damage: enemies ramming the player also hurt. */
  touchTest(px, py, radius) {
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      const rr = e.r + radius;
      if (dx * dx + dy * dy <= rr * rr) return e;
    }
    return null;
  }

  draw(ctx, time) {
    for (const e of this.list) e.draw(ctx, time);
  }

  clear() {
    this.list.length = 0;
  }

  get count() {
    return this.list.length;
  }
}
