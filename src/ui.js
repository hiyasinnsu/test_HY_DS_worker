// UI, HUD and screen overlays.
//
// All layout is done in world units (480 wide) so the same numbers work on a
// small phone and a desktop window. Buttons are plain rects registered in
// `this.buttons`; the game routes taps through `hitTest`.

import { COLORS, PLAYER } from './config.js';
import { TAU, formatScore, easeOutCubic } from './util.js';

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const btn = (id, x, y, w, h, label, kind = 'primary') => ({ id, x, y, w, h, label, kind });

export class UI {
  constructor(game) {
    this.game = game;
    this.buttons = [];
    this.flashMessage = '';
    this.flashTime = 0;
    this.toast = '';
    this.toastTime = 0;
    this.titleGlow = 0;
    this.bossIntroText = '';
    this.bossIntroTime = 0;
    this.stageIntroTime = 0;
    this.combo = 0;
    this.comboTime = 0;
    this.settingsOpen = false;
  }

  get w() {
    return this.game.worldW;
  }

  get h() {
    return this.game.worldH;
  }

  message(text, duration = 1.2) {
    this.toast = text;
    this.toastTime = duration;
  }

  bossIntro(name) {
    this.bossIntroText = name;
    this.bossIntroTime = 2.2;
  }

  stageIntro(stage) {
    this.stageIntroTime = 2.2;
    this.stageNumber = stage;
  }

  update(dt) {
    this.titleGlow += dt;
    if (this.toastTime > 0) this.toastTime -= dt;
    if (this.bossIntroTime > 0) this.bossIntroTime -= dt;
    if (this.stageIntroTime > 0) this.stageIntroTime -= dt;
    if (this.comboTime > 0) {
      this.comboTime -= dt;
      if (this.comboTime <= 0) this.combo = 0;
    }
    this.layout();
  }

  // ---------------------------------------------------------------- layout --

  layout() {
    const state = this.game.state;
    const w = this.w;
    const h = this.h;
    const cx = w / 2;
    const buttons = [];
    const bottom = h - 26 - (this.game.safeBottom || 0);

    if (state === 'title') {
      buttons.push(btn('start', w * 0.14, h * 0.56, w * 0.72, 62, 'ゲームスタート', 'primary'));
      buttons.push(btn('settings', w * 0.24, h * 0.56 + 76, w * 0.52, 42, '設定', 'ghost'));
      buttons.push(btn('mute', w - 54, 14, 40, 40, '', 'icon'));
    } else if (state === 'paused') {
      const bw = Math.min(300, w * 0.7);
      let y = h * 0.3;
      buttons.push(btn('resume', cx - bw / 2, y, bw, 52, 'つづける', 'primary'));
      buttons.push(btn('settings', cx - bw / 2, y + 62, bw, 44, '設定', 'ghost'));
      buttons.push(btn('restart', cx - bw / 2, y + 114, bw, 44, '最初から', 'ghost'));
      buttons.push(btn('title', cx - bw / 2, y + 166, bw, 44, 'タイトルへ', 'ghost'));
    } else if (state === 'gameover') {
      const bw = Math.min(300, w * 0.72);
      let y = h * 0.46;
      buttons.push(btn('retry', cx - bw / 2, y, bw, 54, 'もう一度', 'primary'));
      buttons.push(btn('title', cx - bw / 2, y + 66, bw, 46, 'タイトルへ', 'ghost'));
    } else if (state === 'stageclear') {
      const bw = Math.min(300, w * 0.72);
      buttons.push(btn('next', cx - bw / 2, bottom - 56, bw, 54, '次のステージへ', 'primary'));
    } else if (state === 'settings') {
      const bw = Math.min(300, w * 0.74);
      const x = cx - bw / 2;
      let y = h * 0.2;
      buttons.push(btn('toggleMute', x, y, bw, 46, 'サウンド', 'toggle'));
      buttons.push(btn('toggleMusic', x, y + 56, bw, 46, '音楽', 'toggle'));
      buttons.push(btn('toggleQuality', x, y + 112, bw, 46, '画質', 'toggle'));
      buttons.push(btn('toggleSens', x, y + 168, bw, 46, '操作の追従', 'toggle'));
      buttons.push(btn('closeSettings', cx - bw / 2, bottom - 8, bw, 50, 'もどる', 'primary'));
    } else if (state === 'playing') {
      buttons.push(btn('pause', w - 46, 12, 38, 38, '||', 'icon'));
      buttons.push(btn('bomb', 22, h - 92, 64, 64, 'BOMB', 'round'));
    }

    this.buttons = buttons;
  }

  hitTest(x, y) {
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  // ------------------------------------------------------------------- HUD --

  drawHud(ctx) {
    const g = this.game;
    const w = this.w;
    const h = this.h;
    const safeLeft = 14 + (g.safeLeft || 0);
    const safeTop = 14 + (g.safeTop || 0);

    ctx.save();
    ctx.textBaseline = 'top';

    // Score
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', safeLeft, safeTop);
    ctx.font = `800 24px ${MONO}`;
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(formatScore(g.displayScore), safeLeft, safeTop + 14);

    // High score under it
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.42)';
    ctx.fillText(`HI ${formatScore(g.highScore)}`, safeLeft, safeTop + 44);

    // Stage + timer centered
    ctx.textAlign = 'center';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(`STAGE ${g.stage}`, w / 2, safeTop);
    const remain = Math.max(0, Math.ceil(g.stageTimer));
    ctx.font = `700 15px ${MONO}`;
    ctx.fillStyle = remain <= 10 ? '#ff7d97' : 'rgba(234,246,255,0.85)';
    ctx.fillText(`${Math.floor(remain / 60)}:${(remain % 60).toString().padStart(2, '0')}`, w / 2, safeTop + 16);

    // Lives & bombs sit in the bottom centre so the round BOMB button in the
    // left corner never covers them (an overlap visible in the screenshots).
    const ly = h - 24 - (g.safeBottom || 0);
    const lifeRowW = PLAYER.lives * 17;
    const bombRowW = PLAYER.bombs * 16;
    ctx.textAlign = 'left';
    ctx.font = `700 10px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('LIFE', w / 2 - lifeRowW / 2 - 34, ly - 18);
    for (let i = 0; i < PLAYER.lives; i++) {
      this._drawHeart(ctx, w / 2 - lifeRowW / 2 + 6 + i * 17, ly - 14, i < g.player.lives);
    }
    ctx.fillStyle = COLORS.dim;
    ctx.font = `700 10px ${MONO}`;
    ctx.fillText('BOMB', w / 2 - bombRowW / 2 - 36, ly + 8);
    for (let i = 0; i < PLAYER.bombs; i++) {
      ctx.beginPath();
      ctx.arc(w / 2 - bombRowW / 2 + 5 + i * 16, ly + 12, 5, 0, TAU);
      ctx.fillStyle = i < g.player.bombs ? '#ffe066' : 'rgba(255,224,102,0.16)';
      ctx.fill();
    }

    // Power meter bottom-right
    const pw = 92;
    const px = w - safeLeft - pw;
    const py = h - 30 - (g.safeBottom || 0);
    ctx.textAlign = 'right';
    ctx.font = `700 10px ${MONO}`;
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(`POWER ${g.player.power}/4`, w - safeLeft, py - 16);
    ctx.fillStyle = 'rgba(120,220,255,0.15)';
    ctx.fillRect(px, py, pw, 7);
    const pk = g.player.power / 4;
    const pg = ctx.createLinearGradient(px, 0, px + pw, 0);
    pg.addColorStop(0, '#63e6ff');
    pg.addColorStop(1, '#c084fc');
    ctx.fillStyle = pg;
    ctx.fillRect(px, py, pw * pk, 7);

    // Graze count
    ctx.textAlign = 'right';
    ctx.font = `700 10px ${MONO}`;
    ctx.fillStyle = 'rgba(255,224,102,0.75)';
    ctx.fillText(`GRAZE ${g.stats.graze}`, w - safeLeft, py + 14);

    // Boss HP bar
    const boss = g.boss;
    if (boss && !boss.dead) {
      this._drawBossBar(ctx, boss, safeTop);
    }

    // Toast
    if (this.toastTime > 0 && this.toast) {
      const a = Math.min(1, this.toastTime * 2.4);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = `800 18px ${FONT}`;
      ctx.fillStyle = '#eaf6ff';
      ctx.shadowColor = '#63e6ff';
      ctx.shadowBlur = 14;
      ctx.fillText(this.toast, w / 2, h * 0.3);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Boss intro card
    if (this.bossIntroTime > 0) {
      const t = this.bossIntroTime;
      const a = Math.min(1, Math.min(t, 2.2 - t) * 3);
      ctx.globalAlpha = Math.max(0, a);
      const cw = w * 0.86;
      const cy = h * 0.26;
      ctx.fillStyle = 'rgba(12,4,18,0.74)';
      ctx.fillRect(w / 2 - cw / 2, cy - 34, cw, 68);
      ctx.strokeStyle = 'rgba(255,80,140,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w / 2 - cw / 2, cy - 34, cw, 68);
      ctx.textAlign = 'center';
      ctx.font = `800 13px ${MONO}`;
      ctx.fillStyle = '#ff5c8f';
      ctx.fillText('WARNING', w / 2, cy - 22);
      ctx.font = `800 20px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.bossIntroText, w / 2, cy + 2);
      ctx.globalAlpha = 1;
    }

    // Stage intro
    if (this.stageIntroTime > 0) {
      const t = this.stageIntroTime;
      const a = Math.min(1, Math.min(t, 2.2 - t) * 3);
      ctx.globalAlpha = Math.max(0, a);
      ctx.textAlign = 'center';
      ctx.font = `800 13px ${MONO}`;
      ctx.fillStyle = COLORS.accent;
      ctx.fillText('STAGE', w / 2, h * 0.4);
      ctx.font = `900 52px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = COLORS.accent;
      ctx.shadowBlur = 22;
      ctx.fillText(String(this.stageNumber ?? 1), w / 2, h * 0.43);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // Pause button glyph
    ctx.restore();
    this._drawButtons(ctx, true);
  }

  _drawHeart(ctx, x, y, alive) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-6, -1, -5, -7, 0, -4);
    ctx.bezierCurveTo(5, -7, 6, -1, 0, 4);
    ctx.closePath();
    ctx.fillStyle = alive ? '#ff5c8f' : 'rgba(255,92,143,0.18)';
    ctx.fill();
    ctx.restore();
  }

  _drawBossBar(ctx, boss, safeTop) {
    const w = this.w;
    // Sits below the score/stage header (which ends around safeTop+60) so the
    // phase name never collides with the SCORE block.
    const barW = w - 40;
    const x = 20;
    const y = safeTop + 88;
    const k = Math.max(0, boss.hp / boss.maxHp);
    const tk = Math.max(0, boss.phaseTime / boss.timeLimit);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `700 10px ${MONO}`;
    ctx.fillStyle = 'rgba(255,180,200,0.85)';
    ctx.fillText(boss.phase.name, w / 2, y - 12);

    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, barW, 6);
    const g = ctx.createLinearGradient(x, 0, x + barW, 0);
    g.addColorStop(0, boss.phase.color);
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, barW * k, 6);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y + 9, barW, 3);
    ctx.fillStyle = tk < 0.25 ? '#ff7d97' : 'rgba(200,230,255,0.55)';
    ctx.fillRect(x, y + 9, barW * tk, 3);

    // Phase pips
    const n = this.game.bossPhaseCount;
    for (let i = 0; i < n; i++) {
      const px = w / 2 - ((n - 1) * 10) / 2 + i * 10;
      ctx.beginPath();
      ctx.arc(px, y + 20, 2.6, 0, TAU);
      ctx.fillStyle = i < boss.phaseIndex ? 'rgba(255,255,255,0.25)' : i === boss.phaseIndex ? boss.phase.color : 'rgba(255,255,255,0.6)';
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- screens --

  drawTitle(ctx) {
    const g = this.game;
    const w = this.w;
    const h = this.h;
    const t = this.titleGlow;

    ctx.save();
    ctx.fillStyle = 'rgba(4,3,12,0.55)';
    ctx.fillRect(0, 0, w, h);

    // Logo
    const cx = w / 2;
    const ly = h * 0.24;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = '#ff4d8d';
    ctx.shadowBlur = 28 + Math.sin(t * 2) * 8;
    ctx.font = `900 ${Math.min(56, w * 0.13)}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('NEON', cx, ly - 26);
    ctx.shadowColor = '#63e6ff';
    ctx.fillStyle = '#9dfcff';
    ctx.fillText('BARRAGE', cx, ly + 22);
    ctx.restore();

    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.68)';
    ctx.fillText('DANMAKU SHOOTER', cx, ly + 58);

    // High score
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.55)';
    ctx.fillText(`HIGH ${formatScore(g.highScore)}`, cx, h * 0.44);

    // Blinking prompt
    const blink = 0.55 + 0.45 * Math.sin(t * 3.4);
    ctx.globalAlpha = blink;
    ctx.font = `800 17px ${FONT}`;
    ctx.fillStyle = '#ffe066';
    ctx.fillText('タップしてスタート', cx, h * 0.485);
    ctx.globalAlpha = 1;

    // Instructions
    const iy = h * 0.72;
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(214,236,255,0.72)';
    const lines = [
      'ドラッグで移動 / 自動で射撃',
      'BOMB ボタンで弾を消す',
      '当たり判定は機体中央の赤点だけ',
    ];
    lines.forEach((line, i) => ctx.fillText(line, cx, iy + i * 19));

    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.35)';
    ctx.fillText('KEYBOARD: ARROWS / SHIFT=SLOW / X=BOMB / P=PAUSE', cx, h - 18 - (g.safeBottom || 0));

    ctx.restore();
    this._drawButtons(ctx);
  }

  drawPause(ctx) {
    const w = this.w;
    const h = this.h;
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,14,0.76)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = '#eaf6ff';
    ctx.shadowColor = '#63e6ff';
    ctx.shadowBlur = 16;
    ctx.fillText('PAUSE', w / 2, h * 0.22);
    ctx.restore();
    this._drawButtons(ctx);
  }

  drawSettings(ctx) {
    const w = this.w;
    const h = this.h;
    const g = this.game;
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,14,0.9)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 22px ${FONT}`;
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText('設定', w / 2, h * 0.13);
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.5)';
    ctx.fillText('SETTINGS', w / 2, h * 0.13 + 22);

    const values = {
      toggleMute: g.audio.muted ? 'OFF' : 'ON',
      toggleMusic: g.settings.music ? 'ON' : 'OFF',
      toggleQuality: g.settings.quality === 'high' ? '高' : '標準',
      toggleSens: g.settings.dragSensitivity.toFixed(2),
    };
    ctx.restore();
    this._drawButtons(ctx, false, values);
  }

  drawGameOver(ctx) {
    const g = this.game;
    const w = this.w;
    const h = this.h;
    const t = this.titleGlow;
    ctx.save();
    ctx.fillStyle = 'rgba(3,4,12,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.min(40, w * 0.1)}px ${FONT}`;
    ctx.shadowColor = '#ff3355';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ff5c8f';
    ctx.fillText('GAME OVER', w / 2, h * 0.24);
    ctx.shadowBlur = 0;

    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.6)';
    ctx.fillText('SCORE', w / 2, h * 0.32);
    ctx.font = `800 34px ${MONO}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatScore(g.displayScore), w / 2, h * 0.35);

    if (g.lastResult?.isBest) {
      const a = 0.6 + 0.4 * Math.sin(t * 6);
      ctx.globalAlpha = a;
      ctx.font = `800 14px ${FONT}`;
      ctx.fillStyle = '#ffe066';
      ctx.fillText('NEW RECORD!', w / 2, h * 0.4);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = `600 11px ${MONO}`;
      ctx.fillStyle = 'rgba(214,236,255,0.45)';
      ctx.fillText(`HIGH ${formatScore(g.highScore)}`, w / 2, h * 0.4);
    }

    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = 'rgba(214,236,255,0.55)';
    ctx.fillText(`STAGE ${g.stage} ・ 撃破 ${g.stats.kills} ・ GRAZE ${g.stats.graze}`, w / 2, h * 0.43);
    ctx.restore();
    this._drawButtons(ctx);
  }

  drawStageClear(ctx) {
    const g = this.game;
    const w = this.w;
    const h = this.h;
    const t = this.titleGlow;
    ctx.save();
    ctx.fillStyle = 'rgba(3,8,14,0.78)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.min(36, w * 0.09)}px ${FONT}`;
    ctx.shadowColor = '#63e6ff';
    ctx.shadowBlur = 22 + Math.sin(t * 3) * 6;
    ctx.fillStyle = '#9dfcff';
    ctx.fillText('STAGE CLEAR', w / 2, h * 0.26);
    ctx.shadowBlur = 0;

    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.6)';
    ctx.fillText(`STAGE ${g.stage}`, w / 2, h * 0.32);

    const rows = [
      ['撃破ボーナス', `+${formatScore(g.clearBonus.kills)}`],
      ['残機ボーナス', `+${formatScore(g.clearBonus.lives)}`],
      ['残り時間ボーナス', `+${formatScore(g.clearBonus.time)}`],
    ];
    ctx.textAlign = 'right';
    rows.forEach(([label, value], i) => {
      const y = h * 0.38 + i * 22;
      ctx.textAlign = 'left';
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = 'rgba(214,236,255,0.7)';
      ctx.fillText(label, w * 0.18, y);
      ctx.textAlign = 'right';
      ctx.font = `700 13px ${MONO}`;
      ctx.fillStyle = '#ffe066';
      ctx.fillText(value, w * 0.82, y);
    });

    ctx.textAlign = 'center';
    ctx.font = `700 12px ${MONO}`;
    ctx.fillStyle = 'rgba(214,236,255,0.55)';
    ctx.fillText(`SCORE ${formatScore(g.displayScore)}`, w / 2, h * 0.55);
    ctx.restore();
    this._drawButtons(ctx);
  }

  // ---------------------------------------------------------------- buttons --

  _drawButtons(ctx, compact = false, values = null) {
    for (const b of this.buttons) {
      if (b.kind === 'icon') {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(10,18,34,0.7)';
        this._roundRect(ctx, b.x, b.y, b.w, b.h, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,220,255,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#d6ecff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (b.id === 'mute') {
          const on = !this.game.audio.muted;
          ctx.font = `700 15px ${FONT}`;
          ctx.fillText(on ? '♪' : '✕', b.x + b.w / 2, b.y + b.h / 2);
        } else if (b.id === 'pause') {
          ctx.fillRect(b.x + 12, b.y + 10, 4, 18);
          ctx.fillRect(b.x + 22, b.y + 10, 4, 18);
        }
        ctx.restore();
        continue;
      }
      if (b.kind === 'round') {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const r = b.w / 2;
        const active = this.game.player.bombs > 0;
        ctx.save();
        ctx.globalAlpha = active ? 0.9 : 0.35;
        const g = ctx.createRadialGradient(cx, cy - 6, 4, cx, cy, r);
        g.addColorStop(0, 'rgba(255,240,160,0.95)');
        g.addColorStop(0.55, 'rgba(255,190,60,0.55)');
        g.addColorStop(1, 'rgba(255,120,40,0.15)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,224,102,0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#3a1b00';
        ctx.font = `900 12px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOMB', cx, cy + 1);
        ctx.restore();
        continue;
      }

      const isPrimary = b.kind === 'primary';
      const isToggle = b.kind === 'toggle';
      ctx.save();
      if (isToggle) {
        ctx.fillStyle = 'rgba(16,24,44,0.82)';
        ctx.strokeStyle = 'rgba(120,220,255,0.28)';
      } else if (isPrimary) {
        ctx.fillStyle = 'rgba(99,230,255,0.16)';
        ctx.strokeStyle = 'rgba(99,230,255,0.85)';
      } else {
        ctx.fillStyle = 'rgba(12,18,34,0.7)';
        ctx.strokeStyle = 'rgba(150,190,230,0.32)';
      }
      this._roundRect(ctx, b.x, b.y, b.w, b.h, 12);
      ctx.fill();
      ctx.lineWidth = isPrimary ? 1.6 : 1;
      ctx.stroke();
      if (isPrimary) {
        ctx.shadowColor = '#63e6ff';
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.textBaseline = 'middle';
      if (isToggle) {
        ctx.textAlign = 'left';
        ctx.font = `700 14px ${FONT}`;
        ctx.fillStyle = '#eaf6ff';
        ctx.fillText(b.label, b.x + 16, b.y + b.h / 2);
        ctx.textAlign = 'right';
        ctx.font = `800 14px ${MONO}`;
        ctx.fillStyle = '#9dfcff';
        ctx.fillText(values?.[b.id] ?? '', b.x + b.w - 16, b.y + b.h / 2);
      } else {
        ctx.textAlign = 'center';
        ctx.font = `800 ${b.h >= 50 ? 17 : 14}px ${FONT}`;
        ctx.fillStyle = isPrimary ? '#ffffff' : '#cfe6ff';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      }
      ctx.restore();
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }
}
