// Player ship: movement, auto-fire, bombs and graze detection.
//
// Movement model (mobile-first):
//   * touch   — the ship follows the *relative* delta of the finger, so the
//               ship is never hidden under the thumb and precision is preserved
//   * keyboard— direct velocity, Shift slows to a precise crawl
// The hitbox is tiny (3.2 world units) which is the genre convention.

import { PLAYER, COLORS } from './config.js';
import { clamp, TAU, damp, angleTo } from './util.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.x = this.game.worldW / 2;
    this.y = this.game.worldH * PLAYER.respawnY;
    this.prevX = this.x;
    this.prevY = this.y;
    this.targetX = this.x;
    this.targetY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.lives = PLAYER.lives;
    this.bombs = PLAYER.bombs;
    this.power = 1;
    this.invuln = 0;
    this.fireTimer = 0;
    this.bombTimer = 0;
    this.bombActive = false;
    this.dead = false;
    this.tilt = 0;
    this.grazeFlash = 0;
    this.focus = false;
    this.moving = false;
    this.fireFlash = 0;
    this.thrust = 0;
  }

  get hitRadius() {
    return PLAYER.hitRadius;
  }

  /** World-space drag target set by the game from pointer deltas. */
  moveTo(x, y) {
    this.targetX = x;
    this.targetY = y;
  }

  nudge(dx, dy) {
    this.targetX = clamp(this.targetX + dx, 14, this.game.worldW - 14);
    this.targetY = clamp(this.targetY + dy, 14, this.game.worldH - 14);
  }

  respawn() {
    this.x = this.targetX = this.game.worldW / 2;
    this.y = this.targetY = this.game.worldH * PLAYER.respawnY;
    this.prevX = this.x;
    this.prevY = this.y;
    this.invuln = PLAYER.invulnTime;
    this.bombActive = false;
    this.bombTimer = 0;
    this.dead = false;
  }

  addPower(n = 1) {
    this.power = Math.min(4, this.power + n);
  }

  get shotStreams() {
    const p = this.power;
    if (p >= 4) return [-0.16, -0.05, 0.05, 0.16];
    if (p === 3) return [-0.13, 0, 0.13];
    if (p === 2) return [-0.07, 0.07];
    return [0];
  }

  get shotDamage() {
    return this.power >= 3 ? 1.6 : 1.25;
  }

  update(dt, input) {
    this.prevX = this.x;
    this.prevY = this.y;

    const w = this.game.worldW;
    const h = this.game.worldH;

    // ---- Keyboard movement -------------------------------------------------
    let kx = 0;
    let ky = 0;
    kx = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    ky = (input.isDown('down') ? 1 : 0) - (input.isDown('up') ? 1 : 0);
    this.focus = input.isDown('focus');

    if (kx !== 0 || ky !== 0) {
      const len = Math.hypot(kx, ky) || 1;
      const speed = PLAYER.maxSpeed * (this.focus ? 0.42 : 1);
      this.targetX = clamp(this.targetX + (kx / len) * speed * dt, 14, w - 14);
      this.targetY = clamp(this.targetY + (ky / len) * speed * dt, 14, h - 14);
    }

    // ---- Smooth follow toward the drag target ------------------------------
    const follow = input.pointerType === 'touch' ? PLAYER.follow : 0.42;
    const prevX = this.x;
    const prevY = this.y;
    this.x = damp(this.x, this.targetX, follow, dt);
    this.y = damp(this.y, this.targetY, follow, dt);
    this.x = clamp(this.x, 12, w - 12);
    this.y = clamp(this.y, 12, h - 12);
    this.moving = Math.abs(this.x - prevX) + Math.abs(this.y - prevY) > 0.15;
    this.tilt = damp(this.tilt, clamp((this.x - prevX) * 0.35, -0.5, 0.5), 0.6, dt);
    this.thrust = damp(this.thrust, this.moving ? 1 : 0.45, 0.4, dt);

    if (this.invuln > 0) this.invuln -= dt;
    if (this.grazeFlash > 0) this.grazeFlash -= dt * 4;
    if (this.fireFlash > 0) this.fireFlash -= dt * 8;

    // ---- Auto fire ---------------------------------------------------------
    this.fireTimer -= dt;
    if (!this.dead && this.fireTimer <= 0) {
      this.fire();
      const interval = PLAYER.fireInterval * (this.power >= 3 ? 0.88 : 1);
      this.fireTimer += interval;
      if (this.fireTimer < 0) this.fireTimer = interval;
    }

    // ---- Bomb --------------------------------------------------------------
    if (this.bombActive) {
      this.bombTimer -= dt;
      if (this.bombTimer <= 0) this.bombActive = false;
    }
  }

  fire() {
    const shots = this.game.shots;
    const dmg = this.shotDamage;
    for (const tilt of this.shotStreams) {
      const angle = -Math.PI / 2 + tilt;
      const ox = Math.sin(tilt) * 10;
      shots.fire(this.x + ox, this.y - 12, angle, 1080, dmg, 3.2);
    }
    // Two homing-ish "option" shots at max power for readability of the upgrade.
    if (this.power >= 4) {
      const target = this.game.enemies.nearest(this.x, this.y - 200);
      for (const side of [-1, 1]) {
        const ox = this.x + side * 16;
        const oy = this.y - 4;
        let angle = -Math.PI / 2;
        if (target) angle = angleTo(ox, oy, target.x, target.y);
        shots.fire(ox, oy, angle, 960, dmg * 0.8, 3);
      }
    }
    this.fireFlash = 1;
    this.game.audio.sfx('shot');
    this.game.effects.trail(this.x, this.y - 14, COLORS.playerBullet);
  }

  useBomb() {
    if (this.bombs <= 0 || this.bombActive || this.dead) return false;
    this.bombs--;
    this.bombActive = true;
    this.bombTimer = 1.15;
    this.invuln = Math.max(this.invuln, 1.6);
    this.game.onBomb();
    return true;
  }

  /** Called when an enemy bullet hits the hitbox. */
  hit() {
    if (this.invuln > 0 || this.dead) return false;
    this.lives--;
    this.invuln = PLAYER.invulnTime;
    this.power = Math.max(1, this.power - 1);
    this.game.onPlayerHit();
    if (this.lives <= 0) {
      this.dead = true;
      this.game.onPlayerDeath();
    } else {
      this.respawn();
    }
    return true;
  }

  draw(ctx, time) {
    if (this.dead) return;
    const blink = this.invuln > 0 && Math.floor(time * 18) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt * 0.35);

    // Engine flame
    const flame = 10 + this.thrust * 10 + Math.sin(time * 40) * 2;
    const grad = ctx.createLinearGradient(0, 8, 0, 8 + flame);
    grad.addColorStop(0, 'rgba(120,255,255,0.95)');
    grad.addColorStop(0.5, 'rgba(60,180,255,0.55)');
    grad.addColorStop(1, 'rgba(40,80,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-4, 8);
    ctx.lineTo(4, 8);
    ctx.lineTo(0, 8 + flame);
    ctx.closePath();
    ctx.fill();

    // Hull
    ctx.fillStyle = '#eaf8ff';
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(9, 4);
    ctx.lineTo(5, 10);
    ctx.lineTo(0, 7);
    ctx.lineTo(-5, 10);
    ctx.lineTo(-9, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = this.bombActive ? '#fff1a8' : '#4fd8ff';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(4.5, 2);
    ctx.lineTo(0, 5);
    ctx.lineTo(-4.5, 2);
    ctx.closePath();
    ctx.fill();

    // Hitbox core — always visible so the player can reason about collisions.
    ctx.fillStyle = this.grazeFlash > 0 ? '#ffe066' : '#ff2e63';
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, 0, TAU);
    ctx.stroke();

    // Graze radius hint while touching the screen
    if (this.focus) {
      ctx.strokeStyle = 'rgba(255,224,102,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER.grazeRadius, 0, TAU);
      ctx.stroke();
    }

    // Bomb aura
    if (this.bombActive) {
      const p = 1 - this.bombTimer / 1.15;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,240,160,${0.75 * (1 - p)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 24 + p * 260, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
