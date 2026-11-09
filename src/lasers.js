// Beam lasers used by the boss.
//
// A laser warns for a moment (thin flickering line) and then fires for a set
// duration. Collision is a capsule test against the player's swept position so
// a fast sweep cannot skip over the tiny hitbox.

function distToSegmentSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

export class Laser {
  constructor(opts) {
    this.x = opts.x;
    this.y = opts.y;
    this.angle = opts.angle;
    this.width = opts.width ?? 16;
    this.length = opts.length ?? 900;
    this.warn = opts.warn ?? 0.85;
    this.duration = opts.duration ?? 0.45;
    this.color = opts.color ?? '#ff3355';
    this.age = 0;
    this.active = true;
    this.hitCooldown = 0;
    this.track = opts.track ?? 0; // radians/sec of sweep while firing
  }

  get firing() {
    return this.age >= this.warn;
  }

  get done() {
    return this.age >= this.warn + this.duration;
  }

  update(dt) {
    this.age += dt;
    if (this.firing) this.angle += this.track * dt;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
    if (this.done) this.active = false;
  }

  /** True when the player capsule intersects the beam this frame. */
  hits(px, py, radius, prevX, prevY) {
    if (!this.firing || this.hitCooldown > 0) return false;
    const ex = this.x + Math.cos(this.angle) * this.length;
    const ey = this.y + Math.sin(this.angle) * this.length;
    const r = this.width / 2 + radius;
    const d1 = distToSegmentSq(px, py, this.x, this.y, ex, ey);
    if (d1 <= r * r) return true;
    if (prevX !== undefined) {
      const d2 = distToSegmentSq(prevX, prevY, this.x, this.y, ex, ey);
      if (d2 <= r * r) return true;
    }
    return false;
  }

  draw(ctx) {
    const ex = this.x + Math.cos(this.angle) * this.length;
    const ey = this.y + Math.sin(this.angle) * this.length;
    ctx.save();
    if (!this.firing) {
      const t = this.age / this.warn;
      ctx.globalAlpha = 0.18 + 0.3 * Math.abs(Math.sin(this.age * 22));
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5 + t * 2;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    } else {
      const k = 1 - Math.min(1, (this.age - this.warn) / 0.08);
      const w = this.width * (0.35 + 0.65 * (1 - k));
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.32;
      ctx.lineWidth = w * 2.4;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = w * 0.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export class LaserField {
  constructor() {
    this.items = [];
  }

  spawn(opts) {
    const laser = new Laser(opts);
    this.items.push(laser);
    return laser;
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const l = this.items[i];
      l.update(dt);
      if (!l.active) this.items.splice(i, 1);
    }
  }

  /** Returns the first laser currently intersecting the player. */
  hitTest(px, py, radius, prevX, prevY) {
    for (const l of this.items) {
      if (l.hits(px, py, radius, prevX, prevY)) {
        l.hitCooldown = 0.35;
        return l;
      }
    }
    return null;
  }

  draw(ctx) {
    for (const l of this.items) l.draw(ctx);
  }

  clear() {
    this.items.length = 0;
  }

  get count() {
    return this.items.length;
  }
}
