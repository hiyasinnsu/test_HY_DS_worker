// Pickups: power crystals (P) and point gems.

import { TAU, rand, clamp } from './util.js';

const ITEM_KINDS = {
  power: { color: '#63e6ff', r: 9, label: 'P' },
  gem: { color: '#ffd166', r: 6, label: '' },
  life: { color: '#ff7ab6', r: 10, label: '1UP' },
};

export class Items {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  spawn(kind, x, y, vx = 0, vy = -60) {
    const def = ITEM_KINDS[kind] ?? ITEM_KINDS.gem;
    this.list.push({
      kind,
      x,
      y,
      vx,
      vy,
      r: def.r,
      color: def.color,
      label: def.label,
      age: 0,
      life: 14,
      collected: false,
    });
  }

  spawnBurst(kind, x, y, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
      const s = rand(60, 170);
      this.spawn(kind, x, y, Math.cos(a) * s, Math.sin(a) * s);
    }
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.age += dt;
      it.life -= dt;

      // Magnet toward the player when close: generous, so pickups feel good.
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 130 * 130 && !p.dead) {
        const d = Math.sqrt(d2) || 1;
        const pull = 920 * dt;
        it.vx += (dx / d) * pull;
        it.vy += (dy / d) * pull;
      }
      it.vy += 180 * dt; // gravity-ish so items arc toward the player
      it.vx *= Math.pow(0.14, dt);
      it.vy *= Math.pow(0.35, dt);
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.x = clamp(it.x, it.r, game.worldW - it.r);

      if (!p.dead && d2 < (it.r + 16) ** 2) {
        this._collect(it);
        this.list.splice(i, 1);
        continue;
      }
      if (it.life <= 0 || it.y > game.worldH + 40) {
        this.list.splice(i, 1);
      }
    }
  }

  _collect(it) {
    const game = this.game;
    const p = game.player;
    if (it.kind === 'power') {
      const before = p.power;
      p.addPower(1);
      if (p.power > before) game.audio.sfx('power');
      game.effects.popup(p.x, p.y - 26, p.power >= 4 ? 'MAX' : 'POWER UP', '#9dfcff');
      game.addScore(50);
    } else if (it.kind === 'life') {
      p.lives = Math.min(6, p.lives + 1);
      game.audio.sfx('extend');
      game.effects.popup(p.x, p.y - 26, 'EXTEND', '#ff9ecd');
    } else {
      game.addScore(120);
      game.effects.spark(it.x, it.y, it.color, 4, 120, 1.6);
    }
  }

  clear() {
    this.list.length = 0;
  }

  draw(ctx, time) {
    for (const it of this.list) {
      const pulse = 1 + Math.sin(time * 6 + it.x) * 0.12;
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = it.life < 3 ? 0.4 + 0.6 * Math.abs(Math.sin(time * 12)) : 1;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(0, 0, it.r * pulse * 1.5, 0, TAU);
      ctx.globalAlpha *= 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.arc(0, 0, it.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0a0512';
      ctx.font = `700 ${it.kind === 'life' ? 8 : 11}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, 0, 0.5);
      ctx.restore();
    }
  }
}
