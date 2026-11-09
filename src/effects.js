// Particle & screen-effect system.
//
// Everything is pooled-free (small arrays with splice on death) because the
// counts stay in the low hundreds; the expensive part is the additive blending,
// so each kind of effect uses pre-rendered or cheap primitives.

import { TAU, rand, easeOutCubic } from './util.js';

const MAX_PARTICLES = 520;

class Particle {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.drag = 0.92;
    this.life = 0;
    this.maxLife = 1;
    this.size = 2;
    this.color = '#fff';
    this.kind = 'spark';
    this.spin = 0;
    this.rot = 0;
  }
}

export class Effects {
  constructor() {
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push(new Particle());
    this.rings = [];
    this.flashAlpha = 0;
    this.flashColor = '#ffffff';
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.slowmo = 1;
    this.slowmoTime = 0;
    this.texts = [];
    this._spawnIndex = 0;
  }

  _take() {
    // Round-robin: oldest particle gets recycled when the pool is exhausted.
    const pool = this.particles;
    for (let n = 0; n < pool.length; n++) {
      const p = pool[this._spawnIndex];
      this._spawnIndex = (this._spawnIndex + 1) % pool.length;
      if (!p.active) return p;
    }
    const p = pool[this._spawnIndex];
    this._spawnIndex = (this._spawnIndex + 1) % pool.length;
    return p;
  }

  spark(x, y, color, count = 6, speed = 160, size = 2.2) {
    for (let i = 0; i < count; i++) {
      const p = this._take();
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      p.active = true;
      p.kind = 'spark';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.maxLife = rand(0.18, 0.45);
      p.size = rand(size * 0.6, size * 1.5);
      p.color = color;
      p.drag = 0.9;
    }
  }

  debris(x, y, color, count = 8, speed = 220) {
    for (let i = 0; i < count; i++) {
      const p = this._take();
      const a = rand(-Math.PI, 0);
      const s = rand(speed * 0.4, speed);
      p.active = true;
      p.kind = 'debris';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.maxLife = rand(0.35, 0.8);
      p.size = rand(2, 4.5);
      p.color = color;
      p.drag = 0.96;
      p.spin = rand(-12, 12);
      p.rot = rand(0, TAU);
    }
  }

  trail(x, y, color) {
    const p = this._take();
    p.active = true;
    p.kind = 'trail';
    p.x = x;
    p.y = y;
    p.vx = rand(-8, 8);
    p.vy = rand(10, 40);
    p.life = p.maxLife = rand(0.16, 0.3);
    p.size = rand(1.6, 3.2);
    p.color = color;
    p.drag = 0.94;
  }

  ring(x, y, color, radius = 30, life = 0.35, width = 3) {
    this.rings.push({ x, y, color, radius: 0, target: radius, life, maxLife: life, width });
  }

  flash(color = '#ffffff', alpha = 0.5) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  shake(amount = 6, time = 0.25) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  slowMotion(scale = 0.35, time = 0.45) {
    this.slowmo = Math.min(this.slowmo, scale);
    this.slowmoTime = Math.max(this.slowmoTime, time);
  }

  popup(x, y, text, color = '#ffe066') {
    this.texts.push({ x, y, text, color, life: 0.9, maxLife: 0.9 });
  }

  update(dt) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      if (p.kind === 'debris') p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
      else r.radius = r.target * easeOutCubic(1 - r.life / r.maxLife);
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2);
    }
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      if (this.shakeTime <= 0) this.shakeAmount = 0;
    }
    if (this.slowmoTime > 0) {
      this.slowmoTime -= dt;
      if (this.slowmoTime <= 0) this.slowmo = 1;
    }
  }

  /** Current screen-shake offset applied by the renderer. */
  get shakeOffset() {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const a = this.shakeAmount * (this.shakeTime / 0.25);
    return { x: rand(-a, a), y: rand(-a, a) };
  }

  drawParticles(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, t));
      ctx.fillStyle = p.color;
      if (p.kind === 'debris') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
        ctx.restore();
      } else {
        const s = p.size * (0.4 + t * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawRings(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const t = r.life / r.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * t + 0.6;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, r.radius), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 15px system-ui, sans-serif';
    for (const t of this.texts) {
      const k = t.life / t.maxLife;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawFlash(ctx, w, h) {
    if (this.flashAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.flashAlpha);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** Wipes transient state on stage change / restart. */
  clear() {
    for (const p of this.particles) p.active = false;
    this.rings.length = 0;
    this.texts.length = 0;
    this.flashAlpha = 0;
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.slowmo = 1;
    this.slowmoTime = 0;
  }
}
