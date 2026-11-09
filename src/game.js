// Game orchestration: state machine, loop, input routing and rendering order.
//
// Render order matters for readability and is fixed here:
//   background → items → player shots → enemies → lasers → enemy bullets →
//   player → particles → HUD/overlays
// Enemy bullets are deliberately drawn *above* the player so a bullet can never
// hide underneath the ship sprite.

import { Viewport } from './viewport.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Effects } from './effects.js';
import { Background } from './background.js';
import { BulletField, ShotField } from './bullets.js';
import { LaserField } from './lasers.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { Items } from './items.js';
import { Boss, BOSS_PHASE_COUNT } from './boss.js';
import { StageDirector } from './stage.js';
import { buildStage } from './stages.js';
import { UI } from './ui.js';
import { PLAYER } from './config.js';
import { rand, clamp } from './util.js';
import * as storage from './storage.js';

const STATE = {
  TITLE: 'title',
  PLAYING: 'playing',
  PAUSED: 'paused',
  SETTINGS: 'settings',
  GAMEOVER: 'gameover',
  STAGE_CLEAR: 'stageclear',
};

const QUALITY_DPR = { high: 2, standard: 1.25 };
const SENSITIVITIES = [0.7, 0.85, 1.0, 1.15];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.viewport = new Viewport(canvas);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.effects = new Effects();
    this.background = new Background();
    this.bullets = new BulletField();
    this.shots = new ShotField();
    this.lasers = new LaserField();
    this.items = new Items(this);
    this.enemies = new EnemyManager(this);
    this.ui = new UI(this);
    this.director = new StageDirector(this);

    this.settings = {
      muted: !!storage.getSetting('muted'),
      music: !!storage.getSetting('music'),
      quality: storage.getSetting('quality') || 'auto',
      dragSensitivity: Number(storage.getSetting('dragSensitivity')) || 1,
    };
    this.audio.setMuted(this.settings.muted);
    this.audio.setMusicEnabled(this.settings.music);

    this.highScore = storage.getSetting('highScore') || 0;
    this.state = STATE.TITLE;
    this.stage = 1;
    this.score = 0;
    this.displayScore = 0;
    this.stageTimer = 0;
    this.boss = null;
    this.bossPhaseCount = 4;
    this.lastResult = null;
    this.clearBonus = { kills: 0, lives: 0, time: 0 };
    this.time = 0;
    this.hpScale = 1;
    this.difficulty = 1;
    this.pending = [];
    this.gameoverTimer = 0;
    this.safeLeft = 0;
    this.safeTop = 0;
    this.safeBottom = 0;
    this.stats = { graze: 0, kills: 0, hits: 0, bombs: 0 };
    this._drag = { active: false, lastX: 0, lastY: 0, totalMove: 0 };
    this._lastTs = 0;
    this._rafId = 0;
    this._fpsSamples = [];
    this.fps = 60;

    this.player = new Player(this);

    this.viewport.onResize(() => {
      this.background.resize(this.worldW, this.worldH);
      // Keep the ship inside the field when the viewport shrinks (rotation,
      // URL-bar collapse). Both the target and the rendered position are
      // clamped so a paused game never shows the ship outside the border.
      const w = this.worldW;
      const h = this.worldH;
      this.player.targetX = clamp(this.player.targetX, 12, w - 12);
      this.player.targetY = clamp(this.player.targetY, 12, h - 12);
      this.player.x = clamp(this.player.x, 12, w - 12);
      this.player.y = clamp(this.player.y, 12, h - 12);
    });
    this.viewport.dprCap = QUALITY_DPR[this.settings.quality] ?? 2;
    this.viewport.measure();

    this._onVisibility = () => {
      if (document.hidden && this.state === STATE.PLAYING) this.pause();
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    // First gesture unlocks Web Audio (browser policy) and starts the title tune.
    this._unlockOnce = () => {
      this.audio.unlock();
      this.audio.setMuted(this.settings.muted);
      if (this.state === STATE.TITLE) this.audio.startMusic('title');
      window.removeEventListener('pointerdown', this._unlockOnce);
      window.removeEventListener('keydown', this._unlockOnce);
    };
    window.addEventListener('pointerdown', this._unlockOnce, { passive: true });
    window.addEventListener('keydown', this._unlockOnce);

    this.prepareTitle();
  }

  // ------------------------------------------------------------- geometry --

  get worldW() {
    return this.viewport.worldW;
  }

  get worldH() {
    return this.viewport.worldH;
  }

  // ----------------------------------------------------------------- loop --

  start() {
    if (this._rafId) return;
    const frame = (ts) => {
      this._rafId = requestAnimationFrame(frame);
      if (!this._lastTs) this._lastTs = ts;
      let dt = (ts - this._lastTs) / 1000;
      this._lastTs = ts;
      if (dt > 0.05) dt = 0.05; // clamp after tab switches / hitches
      if (dt <= 0) return;
      this._fpsSamples.push(dt);
      if (this._fpsSamples.length > 30) this._fpsSamples.shift();
      const avg = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
      this.fps = 1 / avg;
      try {
        this.update(dt);
        this.render();
      } catch (err) {
        console.error('[game] frame error', err);
      }
      this.input.endFrame();
    };
    this._rafId = requestAnimationFrame(frame);
  }

  update(dtRaw) {
    const dt = dtRaw * this.effects.slowmo;
    this.time += dtRaw;
    this.processInput();
    this.ui.update(dtRaw);
    this.background.update(dt);
    this.displayScore += (this.score - this.displayScore) * Math.min(1, dtRaw * 9);
    if (Math.abs(this.score - this.displayScore) < 0.6) this.displayScore = this.score;
    this.audio.pump();

    if (this.state === STATE.PLAYING) {
      this.stageTimer += dt;
      this.director.update(dt);
      this.updatePending(dt);
      this.player.update(dt, this.input);
      this.enemies.update(dt);
      this.shots.update(dt, this.worldH);
      this.items.update(dt);
      this.lasers.update(dt);
      this.bullets.update(dt, this.worldW, this.worldH);
      if (this.boss) {
        this.boss.update(dt);
        this.bossCollisions();
        if (this.boss.dead) {
          this.boss = null;
        }
      }
      this.playerCollisions(dt);
    } else if (this.state === STATE.STAGE_CLEAR || this.state === STATE.GAMEOVER) {
      this.bullets.update(dt, this.worldW, this.worldH);
      this.enemies.update(dt);
      if (this.gameoverTimer > 0) this.gameoverTimer -= dtRaw;
    }

    // Effects keep animating on every screen so the title has life.
    this.effects.update(dtRaw);
  }

  updatePending(dt) {
    if (this.pending.length === 0) return;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        try {
          p.fn();
        } catch (err) {
          console.error('[game] pending failed', err);
        }
      }
    }
  }

  scheduleAt(delay, fn) {
    this.pending.push({ t: delay, fn });
  }

  // ---------------------------------------------------------------- input --

  processInput() {
    const input = this.input;
    const events = input.drain();

    if (input.wasPressed('mute')) this.toggleMute();

    for (const ev of events) {
      if (ev.type === 'resize') {
        this.viewport.measure();
        continue;
      }
      if (ev.type === 'down') this.onPointerDown(ev);
      else if (ev.type === 'move') this.onPointerMove(ev);
      else if (ev.type === 'up') this.onPointerUp(ev);
      else if (ev.type === 'down2' && this.state === STATE.PLAYING) {
        // Second finger during play = panic bomb (classic mobile shortcut).
        this.useBomb();
      }
    }

    if (input.wasPressed('pause')) {
      if (this.state === STATE.PLAYING) this.pause();
      else if (this.state === STATE.PAUSED) this.resume();
    }
    if (input.wasPressed('bomb') && this.state === STATE.PLAYING) this.useBomb();
    if (input.wasPressed('confirm')) this.onConfirm();
  }

  onConfirm() {
    switch (this.state) {
      case STATE.TITLE:
        this.startNewGame();
        break;
      case STATE.PAUSED:
        this.resume();
        break;
      case STATE.GAMEOVER:
        this.startNewGame();
        break;
      case STATE.STAGE_CLEAR:
        this.nextStage();
        break;
      case STATE.SETTINGS:
        this.closeSettings();
        break;
      default:
        break;
    }
  }

  onPointerDown(ev) {
    this.audio.unlock();
    const world = this.viewport.toWorld(ev.x, ev.y);

    // UI buttons take priority on every screen.
    const button = this.ui.hitTest(world.x, world.y);
    if (button) {
      this.onButton(button.id);
      return;
    }

    if (this.state === STATE.PLAYING) {
      this._drag.active = true;
      this._drag.lastX = ev.x;
      this._drag.lastY = ev.y;
      this._drag.totalMove = 0;
      if (ev.pointerType === 'mouse') {
        // Desk­top: point-and-place feels natural with a cursor.
        this.player.moveTo(clamp(world.x, 12, this.worldW - 12), clamp(world.y, 12, this.worldH - 12));
      }
      return;
    }

    if (this.state === STATE.TITLE) {
      this.startNewGame();
    } else if (this.state === STATE.GAMEOVER) {
      if (this.gameoverTimer <= 0) this.startNewGame();
    } else if (this.state === STATE.STAGE_CLEAR) {
      this.nextStage();
    } else if (this.state === STATE.PAUSED) {
      this.resume();
    }
  }

  onPointerMove(ev) {
    if (this.state !== STATE.PLAYING || !this._drag.active) return;
    if (ev.pointerType === 'mouse') {
      const world = this.viewport.toWorld(ev.x, ev.y);
      this.player.moveTo(clamp(world.x, 12, this.worldW - 12), clamp(world.y, 12, this.worldH - 12));
      return;
    }
    const dx = (ev.x - this._drag.lastX) / this.viewport.scale;
    const dy = (ev.y - this._drag.lastY) / this.viewport.scale;
    this._drag.lastX = ev.x;
    this._drag.lastY = ev.y;
    this._drag.totalMove += Math.abs(dx) + Math.abs(dy);
    const s = this.settings.dragSensitivity;
    this.player.nudge(dx * s, dy * s);
  }

  onPointerUp() {
    this._drag.active = false;
  }

  onButton(id) {
    this.audio.sfx('select');
    switch (id) {
      case 'start':
      case 'retry':
        this.startNewGame();
        break;
      case 'resume':
        this.resume();
        break;
      case 'pause':
        this.pause();
        break;
      case 'restart':
        this.startNewGame();
        break;
      case 'title':
        this.prepareTitle();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'closeSettings':
        this.closeSettings();
        break;
      case 'next':
        this.nextStage();
        break;
      case 'bomb':
        this.useBomb();
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'toggleMute':
        this.toggleMute();
        break;
      case 'toggleMusic':
        this.settings.music = storage.setSetting('music', !this.settings.music);
        this.audio.setMusicEnabled(this.settings.music);
        if (this.settings.music) this.audio.startMusic(this.state === STATE.PLAYING ? (this.boss ? 'boss' : 'stage') : 'title');
        break;
      case 'toggleQuality': {
        // Stored default is 'auto'; the first tap must move it explicitly.
        const order = ['standard', 'high'];
        const idx = order.indexOf(this.settings.quality);
        const next = order[(idx + 1) % order.length];
        this.settings.quality = storage.setSetting('quality', next);
        this.viewport.dprCap = QUALITY_DPR[next];
        this.viewport.measure();
        this.ui.message(next === 'high' ? '画質: 高' : '画質: 標準', 1.0);
        break;
      }
      case 'toggleSens': {
        const cur = this.settings.dragSensitivity;
        const idx = SENSITIVITIES.indexOf(cur);
        const next = SENSITIVITIES[(idx + 1) % SENSITIVITIES.length];
        this.settings.dragSensitivity = storage.setSetting('dragSensitivity', next);
        break;
      }
      default:
        break;
    }
  }

  toggleMute() {
    this.settings.muted = storage.setSetting('muted', !this.settings.muted);
    this.audio.unlock();
    this.audio.setMuted(this.settings.muted);
    if (!this.settings.muted) this.audio.setMusicEnabled(this.settings.music);
  }

  // ---------------------------------------------------------------- states --

  setState(next) {
    this.state = next;
    this.ui.layout();
  }

  prepareTitle() {
    this.setState(STATE.TITLE);
    this.boss = null;
    this.background.setBossMode(false);
    this.bullets.cancelAll();
    this.lasers.clear();
    this.enemies.clear();
    this.items.clear();
    this.shots.clear();
    this.effects.clear();
    this.director.stop();
    this.audio.startMusic('title');
    this.audio.sfx('clear');
    this.score = 0;
    this.displayScore = 0;
    this.stage = 1;
    this.stats = { graze: 0, kills: 0, hits: 0, bombs: 0 };
    this._titleTime = 0;
  }

  startNewGame() {
    this.audio.unlock();
    this.audio.sfx('start');
    this.score = 0;
    this.displayScore = 0;
    this.stage = 1;
    this.stats = { graze: 0, kills: 0, hits: 0, bombs: 0 };
    this.player.reset();
    // Auto-pick a sensible quality once, based on the first frame budget.
    this.startStage(1);
  }

  startStage(n) {
    this.stage = n;
    this.stageTimer = 0;
    this.boss = null;
    this.difficulty = 1 + (n - 1) * 0.16;
    this.hpScale = 1 + (n - 1) * 0.3;
    this.pending.length = 0;
    this.bullets.cancelAll();
    this.lasers.clear();
    this.enemies.clear();
    this.items.clear();
    this.shots.clear();
    this.effects.clear();
    this.background.setBossMode(false);
    this.player.respawn();
    this.player.invuln = 2.0;
    this.director.load(buildStage(n));
    this.audio.startMusic('stage');
    this.setState(STATE.PLAYING);
    this.ui.message(`STAGE ${n}`, 1.4);
  }

  nextStage() {
    this.audio.sfx('start');
    this.startStage(this.stage + 1);
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.setState(STATE.PAUSED);
    this.audio.stopMusic();
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.setState(STATE.PLAYING);
    this._lastTs = 0;
    this.audio.startMusic(this.boss ? 'boss' : 'stage');
  }

  openSettings() {
    this._returnState = this.state === STATE.SETTINGS ? this._returnState : this.state;
    this.setState(STATE.SETTINGS);
  }

  closeSettings() {
    this.setState(this._returnState ?? STATE.TITLE);
    if (this.state === STATE.PLAYING) this.audio.startMusic(this.boss ? 'boss' : 'stage');
  }

  // ------------------------------------------------------------ game logic --

  addScore(n) {
    this.score += Math.round(n);
  }

  spawnPowerItem(x, y, vy = -40) {
    this.items.spawn('power', x, y, rand(-40, 40), vy);
  }

  spawnGemBurst(x, y, count = 4) {
    this.items.spawnBurst('gem', x, y, count);
  }

  bossBurst(x, y) {
    this.effects.spark(x, y, '#ffffff', 40, 420, 3.2);
    this.effects.spark(x, y, '#ff9f45', 30, 300, 2.6);
    this.effects.debris(x, y, '#ff4d8d', 24, 320);
    this.effects.ring(x, y, '#ff4d8d', 260, 0.7, 4);
    this.effects.ring(x, y, '#ffffff', 160, 0.5, 2);
    this.spawnGemBurst(x, y, 6);
  }

  useBomb() {
    if (this.state !== STATE.PLAYING) return;
    if (!this.player.useBomb()) return;
    this.stats.bombs++;
    this.audio.sfx('bomb');
    this.effects.flash('#ffe9a8', 0.55);
    this.effects.shake(10, 0.4);
    this.effects.ring(this.player.x, this.player.y, '#ffe066', 420, 0.65, 5);
    this.ui.message('BOMB!', 0.7);
  }

  onBomb() {
    const p = this.player;
    const cancelled = this.bullets.cancelInRadius(p.x, p.y, 520);
    this.lasers.clear();
    for (const e of this.enemies.list) {
      if (e.dead) continue;
      e.damage(e.maxHp * 0.25 + 10);
    }
    if (this.boss) this.boss.damage(this.boss.maxHp * 0.03);
    if (cancelled > 0) this.addScore(cancelled * 12);
  }

  onPlayerHit() {
    const p = this.player;
    this.stats.hits++;
    this.effects.flash('#ff3355', 0.5);
    this.effects.shake(16, 0.5);
    this.effects.slowMotion(0.35, 0.35);
    this.effects.spark(p.x, p.y, '#ff6f9c', 26, 320, 2.6);
    this.effects.ring(p.x, p.y, '#ff3355', 120, 0.45, 3);
    this.audio.sfx('damage');
    // Mercy clear: wipe bullets around the respawn point.
    this.scheduleAt(0.05, () => {
      this.bullets.cancelInRadius(this.player.x, this.player.y, 140);
    });
  }

  onPlayerDeath() {
    this.effects.flash('#ffffff', 0.75);
    this.effects.shake(22, 0.8);
    this.effects.spark(this.player.x, this.player.y, '#ffffff', 50, 420, 3);
    this.effects.debris(this.player.x, this.player.y, '#7df9ff', 26, 320);
    this.audio.sfx('explode');
    this.audio.stopMusic();
    this.gameoverTimer = 1.1;
    this.scheduleAt(1.2, () => this.finishRun());
  }

  finishRun() {
    if (this.state !== STATE.PLAYING) return;
    const result = storage.submitScore(this.score, this.stage);
    this.highScore = result.highScore;
    this.lastResult = result;
    this.audio.sfx('gameover');
    this.gameoverTimer = 0.6;
    this.setState(STATE.GAMEOVER);
  }

  spawnBoss() {
    if (this.boss) return;
    this.boss = new Boss(this, this.difficulty);
    this.bossPhaseCount = BOSS_PHASE_COUNT;
    this.background.setBossMode(true);
    this.audio.startMusic('boss');
    this.ui.bossIntro(this.boss.phase.name);
    this.ui.message('', 0);
    this._bossPhaseToast = true;
  }

  onBossPhase(boss) {
    if (boss.phaseIndex > 0) this.ui.bossIntro(boss.phase.name);
  }

  onBossPhaseCleared(boss, timedOut) {
    this.ui.message(timedOut ? 'TIME UP - 突破!' : 'PHASE CLEAR', 1.4);
    this.addScore(timedOut ? 1500 : 4000);
  }

  onBossDefeated(boss, timedOut = false) {
    const game = this;
    this.background.setBossMode(false);
    this.audio.stopMusic();
    this.audio.sfx('clear');
    this.effects.flash('#ffffff', 0.7);
    this.effects.shake(18, 0.7);
    this.bullets.cancelAll();
    this.lasers.clear();
    this.bossBurst(boss.x, boss.y);
    this.addScore(timedOut ? 20000 : 30000);
    this.enemies.clear();
    this.shots.clear();
    this.scheduleAt(1.1, () => game.finishStage());
  }

  finishStage() {
    // A player who runs out of lives in the same second the boss dies loses; the
    // game-over flow takes precedence over the clear screen.
    if (this.player.dead) {
      this.finishRun();
      return;
    }
    const kills = this.stats.kills * 120;
    const lives = this.player.lives * 2500;
    // Reward finishing early: the reference clear time is 150s per stage.
    const time = Math.max(0, Math.round(150 - this.stageTimer)) * 40;
    this.clearBonus = { kills, lives, time };
    this.bullets.cancelAll();
    this.lasers.clear();
    this.items.clear();
    this.enemies.clear();
    this.shots.clear();
    this.addScore(kills + lives + time);
    const result = storage.submitScore(this.score, this.stage);
    this.highScore = result.highScore;
    this.lastResult = result;
    this.setState(STATE.STAGE_CLEAR);
    this.director.stop();
  }

  bossCollisions() {
    const boss = this.boss;
    if (!boss || boss.entering || boss.dead) return;
    for (const s of this.shots.pool) {
      if (!s.active) continue;
      const dx = boss.x - s.x;
      const dy = boss.y - s.y;
      const rr = boss.r + s.radius;
      if (dx * dx + dy * dy <= rr * rr) {
        boss.damage(s.damage);
        this.effects.spark(s.x, s.y, '#ffffff', 2, 80, 1.5);
        this.shots.release(s);
      }
    }
  }

  playerCollisions(dt) {
    const p = this.player;
    if (p.dead) return;

    if (p.invuln <= 0) {
      const bullets = this.bullets.pool;
      const hitR = p.hitRadius;
      const grazeR = PLAYER.grazeRadius;
      let grazedNow = 0;
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b.active || b.age < b.grace) continue;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const d2 = dx * dx + dy * dy;
        const hr = b.hit + hitR;
        if (d2 <= hr * hr) {
          p.hit();
          this.bullets.release(b);
          return;
        }
        if (!b.grazed && d2 <= grazeR * grazeR) {
          b.grazed = true;
          grazedNow++;
          this.stats.graze++;
          this.addScore(35);
          this.effects.spark(b.x, b.y, '#ffe066', 2, 70, 1.4);
          p.grazeFlash = 1;
        }
      }
      if (grazedNow > 0) {
        this.audio.sfx('graze');
        if (grazedNow >= 3 && Math.random() < 0.25) this.spawnPowerItem(p.x + rand(-30, 30), p.y - 20, -50);
      }

      const laser = this.lasers.hitTest(p.x, p.y, p.hitRadius, p.prevX, p.prevY);
      if (laser) p.hit();

      const enemy = this.enemies.touchTest(p.x, p.y, p.hitRadius + 2);
      if (enemy) {
        enemy.damage(enemy.maxHp * 0.5);
        p.hit();
      }
    }

    // Boss body is also solid.
    if (this.boss && !this.boss.entering && p.invuln <= 0) {
      const dx = this.boss.x - p.x;
      const dy = this.boss.y - p.y;
      const rr = this.boss.r * 0.72 + p.hitRadius;
      if (dx * dx + dy * dy <= rr * rr) p.hit();
    }
  }

  // --------------------------------------------------------------- render --

  render() {
    const vp = this.viewport;
    const ctx = vp.ctx;
    const w = this.worldW;
    const h = this.worldH;
    vp.begin();

    const shake = this.effects.shakeOffset;
    ctx.save();
    ctx.translate(shake.x, shake.y);

    this.background.draw(ctx);
    this.items.draw(ctx, this.time);
    this.shots.draw(ctx);
    this.enemies.draw(ctx, this.time);
    if (this.boss) this.boss.draw(ctx, this.time);
    this.lasers.draw(ctx);
    this.bullets.draw(ctx);
    if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) {
      this.player.draw(ctx, this.time);
    }
    this.effects.drawRings(ctx);
    this.effects.drawParticles(ctx);
    this.effects.drawTexts(ctx);

    ctx.restore();

    // Field border so letterboxing looks intentional.
    ctx.save();
    ctx.strokeStyle = 'rgba(120,220,255,0.10)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.restore();

    if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) {
      this.ui.drawHud(ctx);
    }
    if (this.state === STATE.TITLE) this.ui.drawTitle(ctx);
    else if (this.state === STATE.PAUSED) this.ui.drawPause(ctx);
    else if (this.state === STATE.GAMEOVER) this.ui.drawGameOver(ctx);
    else if (this.state === STATE.STAGE_CLEAR) this.ui.drawStageClear(ctx);
    else if (this.state === STATE.SETTINGS) this.ui.drawSettings(ctx);

    this.effects.drawFlash(ctx, w, h);

    if (this.debugOverlay) this.drawDebug(ctx);
  }

  drawDebug(ctx) {
    const lines = [
      `fps ${this.fps.toFixed(0)}`,
      `bullets ${this.bullets.live}`,
      `shots ${this.shots.live}`,
      `enemies ${this.enemies.count}`,
      `state ${this.state}`,
    ];
    ctx.save();
    ctx.font = '600 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(160,255,180,0.85)';
    lines.forEach((l, i) => ctx.fillText(l, this.worldW - 8, this.worldH * 0.42 + i * 12));
    ctx.restore();
  }
}

export { STATE };
