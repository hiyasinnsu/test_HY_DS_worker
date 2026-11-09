// Parallax starfield plus a subtle moving grid.
//
// The whole scene is drawn on an offscreen canvas at reduced resolution and
// scrolled, which keeps GPU work low on phones while still looking alive.

import { rand } from './util.js';

const LAYERS = [
  { count: 44, speed: 18, size: 1.1, alpha: 0.5, parallax: 0.25 },
  { count: 30, speed: 42, size: 1.5, alpha: 0.7, parallax: 0.6 },
  { count: 16, speed: 88, size: 2.1, alpha: 0.95, parallax: 1 },
];

export class Background {
  constructor() {
    this.layers = LAYERS.map((def) => ({ def, stars: [] }));
    this.w = 0;
    this.h = 0;
    this.time = 0;
    this.hueShift = 0;
    this.flashLine = 0;
    this.bossMode = false;
  }

  resize(w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w;
    this.h = h;
    for (const layer of this.layers) {
      layer.stars = [];
      for (let i = 0; i < layer.def.count; i++) {
        layer.stars.push({
          x: rand(0, w),
          y: rand(0, h),
          tw: rand(0.5, 2.5),
          phase: rand(0, Math.PI * 2),
        });
      }
    }
  }

  setBossMode(on) {
    this.bossMode = on;
  }

  update(dt) {
    this.time += dt;
    const boost = this.bossMode ? 1.9 : 1;
    for (const layer of this.layers) {
      const speed = layer.def.speed * boost;
      for (const s of layer.stars) {
        s.y += speed * dt;
        if (s.y > this.h + 4) {
          s.y = -4;
          s.x = rand(0, this.w);
        }
      }
    }
  }

  draw(ctx) {
    const w = this.w;
    const h = this.h;

    // Deep-space gradient with a slow hue drift per stage.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, this.bossMode ? '#1a0413' : '#070a1c');
    g.addColorStop(0.55, '#05040e');
    g.addColorStop(1, this.bossMode ? '#22061a' : '#040310');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Perspective grid — cheap, sells speed.
    const gridAlpha = this.bossMode ? 0.13 : 0.07;
    ctx.save();
    ctx.strokeStyle = this.bossMode ? `rgba(255,90,150,${gridAlpha})` : `rgba(99,230,255,${gridAlpha})`;
    ctx.lineWidth = 1;
    const spacing = 64;
    const scroll = (this.time * 42) % spacing;
    ctx.beginPath();
    for (let x = 0; x <= w; x += spacing) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = -spacing + scroll; y <= h; y += spacing) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();

    // Stars
    for (const layer of this.layers) {
      ctx.save();
      ctx.globalAlpha = layer.def.alpha;
      ctx.fillStyle = this.bossMode ? '#ffd0e2' : '#d6f4ff';
      for (const s of layer.stars) {
        const tw = 0.6 + 0.4 * Math.sin(this.time * s.tw + s.phase);
        ctx.globalAlpha = layer.def.alpha * tw;
        ctx.fillRect(s.x, s.y, layer.def.size, layer.def.size);
      }
      ctx.restore();
    }

    // Vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
}
