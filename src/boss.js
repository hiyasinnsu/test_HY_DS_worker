// Multi-phase boss.
//
// Each phase is a separate "spell card" with its own attack generator, HP budget
// and timer. When HP or the timer runs out the boss clears the screen, drops
// power items and moves on — so a player who is struggling is never hard-locked.

import { TAU, rand, clamp, angleTo, lerp, easeOutCubic } from './util.js';
import * as P from './patterns.js';
import { COLORS } from './config.js';

const PHASES = [
  {
    name: '螺旋の序曲',
    hp: 0.24,
    time: 34,
    color: '#ff4d8d',
    update(boss, dt, game) {
      boss.spinPhase += dt * 2.6;
      boss.timerA -= dt;
      if (boss.timerA <= 0) {
        boss.timerA = 0.10;
        const color = P.palette(game, 0);
        for (let arm = 0; arm < 3; arm++) {
          const a = boss.spinPhase + (arm / 3) * TAU;
          P.shoot(game, boss.x, boss.y, a, 165, { color, radius: 4.8 });
          P.shoot(game, boss.x, boss.y, -a, 165, { color, radius: 4.8 });
        }
      }
      boss.timerB -= dt;
      if (boss.timerB <= 0) {
        boss.timerB = 2.2;
        P.aimedFan(game, boss.x, boss.y, 5, 0.7, 215, {
          kind: 'rice',
          radius: 4.4,
          color: '#ffd166',
        });
      }
    },
  },
  {
    name: '星屑の雨',
    hp: 0.22,
    time: 34,
    color: '#5ce1ff',
    update(boss, dt, game) {
      boss.timerA -= dt;
      if (boss.timerA <= 0) {
        boss.timerA = 0.22;
        const x = rand(30, game.worldW - 30);
        game.bullets.fire({
          x,
          y: -12,
          angle: Math.PI / 2 + rand(-0.25, 0.25),
          speed: rand(150, 210),
          kind: 'rice',
          color: '#5ce1ff',
          radius: 4.2,
          spin: 0,
        });
      }
      boss.timerB -= dt;
      if (boss.timerB <= 0) {
        boss.timerB = 3.0;
        P.delayedRing(game, boss.x, boss.y, 14, 175, {
          color: '#ffe066',
          kind: 'orb',
          radius: 5,
          delay: 0.75,
        });
      }
      boss.timerC -= dt;
      if (boss.timerC <= 0) {
        boss.timerC = 1.6;
        P.aimedFan(game, boss.x, boss.y, 3, 0.34, 260, { color: '#9dffb0', radius: 4.4 });
      }
    },
  },
  {
    name: '紅蓮の光線',
    hp: 0.26,
    time: 36,
    color: '#ff3355',
    update(boss, dt, game) {
      boss.timerA -= dt;
      if (boss.timerA <= 0) {
        boss.timerA = 2.8;
        const base = P.aimAt(game, boss.x, boss.y);
        for (let i = 0; i < 3; i++) {
          game.lasers.spawn({
            x: boss.x,
            y: boss.y,
            angle: base + (i - 1) * 0.5,
            width: 13,
            warn: 0.95,
            duration: 0.45,
            track: (i - 1) * 0.55,
            color: '#ff3355',
          });
        }
      }
      boss.timerB -= dt;
      if (boss.timerB <= 0) {
        boss.timerB = 0.14;
        boss.spinPhase += 0.5;
        P.spiral(game, boss.x, boss.y, boss.spinPhase, 2, 120, {
          color: '#ff9f45',
          kind: 'rice',
          radius: 4.3,
          curve: 0.9,
        });
      }
      boss.timerC -= dt;
      if (boss.timerC <= 0) {
        boss.timerC = 3.4;
        P.heavySpread(game, boss.x, boss.y, 7, 1.3, { color: '#ff9f45', speed: 95 });
      }
    },
  },
  {
    name: '終焉の輪舞',
    hp: 0.34,
    time: 44,
    color: '#c084fc',
    update(boss, dt, game) {
      boss.timerA -= dt;
      if (boss.timerA <= 0) {
        boss.timerA = 0.085;
        boss.spinPhase += 0.33;
        const color = P.palette(game, 3);
        for (let arm = 0; arm < 5; arm++) {
          const a = boss.spinPhase + (arm / 5) * TAU;
          P.shoot(game, boss.x, boss.y, a, 150, { color, radius: 4.6 });
          P.shoot(game, boss.x, boss.y, -a, 110, { color, radius: 4.6 });
        }
      }
      boss.timerB -= dt;
      if (boss.timerB <= 0) {
        boss.timerB = 2.4;
        const base = P.aimAt(game, boss.x, boss.y);
        for (let i = 0; i < 2; i++) {
          game.lasers.spawn({
            x: boss.x,
            y: boss.y,
            angle: base + (i === 0 ? -0.9 : 0.9),
            width: 15,
            warn: 0.85,
            duration: 0.4,
            track: i === 0 ? 0.7 : -0.7,
            color: '#c084fc',
          });
        }
      }
      boss.timerC -= dt;
      if (boss.timerC <= 0) {
        boss.timerC = 1.5;
        P.aimedFan(game, boss.x, boss.y, 7, 1.1, 245, {
          kind: 'rice',
          radius: 4.4,
          color: '#ffffff',
        });
      }
    },
  },
];

export class Boss {
  constructor(game, difficulty = 1) {
    this.game = game;
    this.x = game.worldW / 2;
    this.y = -70;
    this.targetY = 120;
    this.r = 44;
    this.difficulty = difficulty;
    this.phaseIndex = 0;
    this.timers = [];
    this.spinPhase = 0;
    this.timerA = 0.9;
    this.timerB = 2.0;
    this.timerC = 3.2;
    this.hp = 1;
    this.maxHp = 1;
    this.timeLimit = 0;
    this.phaseTime = 0;
    this.entering = true;
    this.flash = 0;
    this.sway = 0;
    this.dead = false;
    this.finished = false;
    this._startPhase(0);
  }

  get phase() {
    return PHASES[Math.min(this.phaseIndex, PHASES.length - 1)];
  }

  get hue() {
    return this.phase.color;
  }

  _startPhase(index) {
    this.phaseIndex = index;
    const phase = this.phase;
    const base = this.game.stage * 1.15 + this.difficulty * 220;
    this.maxHp = Math.round(2600 * phase.hp + base * phase.hp * 3);
    this.hp = this.maxHp;
    this.timeLimit = phase.time;
    this.phaseTime = phase.time;
    this.timerA = 0.9;
    this.timerB = 2.0;
    this.timerC = 3.2;
    this.entering = true;
    this.game.audio.sfx('boss');
    this.game.onBossPhase?.(this);
  }

  damage(n) {
    if (this.entering || this.dead) return;
    this.hp -= n;
    this.flash = 0.1;
    if (this.hp <= 0) this._finishPhase();
  }

  _finishPhase() {
    const game = this.game;
    game.effects.flash('#ffffff', 0.6);
    game.effects.shake(14, 0.5);
    game.effects.slowMotion(0.45, 0.5);
    game.audio.sfx('explode');
    game.bullets.cancelAll();
    game.lasers.clear();
    game.bossBurst(this.x, this.y);
    game.addScore(Math.round(this.maxHp * 1.5), this.x, this.y);
    for (let i = 0; i < 4; i++) game.spawnPowerItem(this.x + rand(-60, 60), this.y + rand(-20, 40));

    if (this.phaseIndex >= PHASES.length - 1) {
      this.dead = true;
      game.onBossDefeated(this);
    } else {
      this._startPhase(this.phaseIndex + 1);
      game.onBossPhaseCleared?.(this);
    }
  }

  _timeoutPhase() {
    const game = this.game;
    game.bullets.cancelAll();
    game.lasers.clear();
    game.effects.flash('#63e6ff', 0.35);
    game.audio.sfx('clear');
    if (this.phaseIndex >= PHASES.length - 1) {
      this.dead = true;
      game.onBossDefeated(this, true);
    } else {
      this._startPhase(this.phaseIndex + 1);
      game.onBossPhaseCleared?.(this, true);
    }
  }

  update(dt) {
    if (this.dead) return;
    const game = this.game;
    this.phaseTime -= dt;
    if (this.flash > 0) this.flash -= dt;

    if (this.entering) {
      this.y = lerp(this.y, this.targetY, 1 - Math.pow(0.06, dt));
      if (Math.abs(this.y - this.targetY) < 1.5) {
        this.y = this.targetY;
        this.entering = false;
      }
      return;
    }

    // Gentle horizontal drift keeps the hitbox moving without being unfair.
    this.sway += dt;
    const amp = game.worldW * 0.26;
    const nx = game.worldW / 2 + Math.sin(this.sway * 0.55) * amp;
    this.x = clamp(lerp(this.x, nx, 1 - Math.pow(0.2, dt)), this.r, game.worldW - this.r);
    const ny = this.targetY + Math.sin(this.sway * 0.8) * 16;
    this.y = lerp(this.y, ny, 1 - Math.pow(0.3, dt));

    this.phase.update(this, dt, game);

    if (this.phaseTime <= 0) this._timeoutPhase();
  }

  draw(ctx, time) {
    if (this.dead) return;
    const color = this.phase.color;
    const flash = this.flash > 0;
    ctx.save();
    ctx.translate(this.x, this.y);

    // Aura rings
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const rr = 46 + i * 13 + Math.sin(time * 2 + i) * 3;
      ctx.globalAlpha = 0.12 - i * 0.03;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Core body
    ctx.save();
    ctx.rotate(Math.sin(time * 0.8) * 0.12);
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.fillStyle = flash ? '#ffffff' : '#160a1c';
    ctx.strokeStyle = flash ? '#ffffff' : color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + time * 0.35;
      const rr = i % 2 === 0 ? 46 : 30;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr * 0.86;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Eye / core
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = flash ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(0, 0, 13 + Math.sin(time * 5) * 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, TAU);
    ctx.fill();

    ctx.restore();
  }
}

export const BOSS_PHASE_COUNT = PHASES.length;
export { PHASES as BOSS_PHASES };
