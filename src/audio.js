// Procedural audio. No external assets: everything is synthesised with the
// Web Audio API so the GitHub Pages build stays a few hundred kilobytes.
//
// Browsers require a user gesture before audio may start, so `unlock()` is
// called from the first pointer/key event.

const NOTE = (semitoneFromA4) => 440 * Math.pow(2, semitoneFromA4 / 12);

// Scale degrees (A minor pentatonic-ish) used for arpeggios.
const ARP = [0, 3, 7, 10, 12, 10, 7, 3];
const CHORDS = [
  [-24, -17, -12],
  [-27, -20, -15],
  [-22, -15, -10],
  [-25, -18, -13],
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.musicOn = true;
    this.track = null;
    this._step = 0;
    this._nextNoteTime = 0;
    this._lastSfx = new Map();
    this._unlocked = false;
  }

  unlock() {
    if (this._unlocked) return;
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.55;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.26;
    this.musicBus.connect(this.master);

    this.noiseBuffer = this._makeNoise();
    this._unlocked = true;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.02);
    }
  }

  setMusicEnabled(on) {
    this.musicOn = on;
    if (!on) this.stopMusic();
    else if (this.track) this.startMusic(this.track);
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _tone({ type = 'sine', freq = 440, endFreq = null, dur = 0.15, gain = 0.3, delay = 0, bus = null }) {
    if (!this.ctx) return;
    const t0 = this.now + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.02, dur * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.2, gain = 0.25, delay = 0, filter = 1200, q = 1, bus = null }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t0 = this.now + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(filter, t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(80, filter * 0.35), t0 + dur);
    bp.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(env).connect(bus || this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Rate-limits spammy sounds so overlapping shots do not clip. */
  _throttle(name, ms) {
    const last = this._lastSfx.get(name) || 0;
    const now = performance.now();
    if (now - last < ms) return false;
    this._lastSfx.set(name, now);
    return true;
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'shot':
        if (!this._throttle('shot', 55)) return;
        this._tone({ type: 'square', freq: 1400, endFreq: 900, dur: 0.045, gain: 0.05 });
        break;
      case 'hit':
        if (!this._throttle('hit', 40)) return;
        this._noise({ dur: 0.06, gain: 0.08, filter: 2400, q: 0.8 });
        break;
      case 'graze':
        if (!this._throttle('graze', 45)) return;
        this._tone({ type: 'triangle', freq: 2200, endFreq: 2600, dur: 0.06, gain: 0.05 });
        break;
      case 'pop':
        this._noise({ dur: 0.18, gain: 0.18, filter: 900, q: 0.7 });
        this._tone({ type: 'sawtooth', freq: 320, endFreq: 90, dur: 0.16, gain: 0.12 });
        break;
      case 'explode':
        this._noise({ dur: 0.5, gain: 0.32, filter: 1400, q: 0.5 });
        this._tone({ type: 'sawtooth', freq: 160, endFreq: 40, dur: 0.45, gain: 0.22 });
        break;
      case 'damage':
        this._noise({ dur: 0.4, gain: 0.3, filter: 700, q: 0.9 });
        this._tone({ type: 'square', freq: 220, endFreq: 55, dur: 0.4, gain: 0.2 });
        break;
      case 'bomb':
        this._noise({ dur: 0.9, gain: 0.34, filter: 2600, q: 0.4 });
        this._tone({ type: 'sine', freq: 90, endFreq: 30, dur: 0.8, gain: 0.3 });
        break;
      case 'power':
        this._tone({ type: 'triangle', freq: 880, endFreq: 1320, dur: 0.12, gain: 0.14 });
        break;
      case 'extend':
        this._tone({ type: 'triangle', freq: 660, endFreq: 990, dur: 0.1, gain: 0.14 });
        this._tone({ type: 'triangle', freq: 990, endFreq: 1485, dur: 0.14, gain: 0.12, delay: 0.09 });
        break;
      case 'select':
        this._tone({ type: 'square', freq: 660, endFreq: 990, dur: 0.08, gain: 0.12 });
        break;
      case 'start':
        this._tone({ type: 'triangle', freq: 440, endFreq: 880, dur: 0.2, gain: 0.16 });
        this._tone({ type: 'triangle', freq: 880, endFreq: 1320, dur: 0.25, gain: 0.12, delay: 0.12 });
        break;
      case 'boss':
        this._tone({ type: 'sawtooth', freq: 110, endFreq: 220, dur: 0.7, gain: 0.22 });
        this._noise({ dur: 0.7, gain: 0.14, filter: 500, q: 1.4 });
        break;
      case 'clear':
        [0, 4, 7, 12].forEach((st, i) =>
          this._tone({ type: 'triangle', freq: NOTE(st), dur: 0.28, gain: 0.14, delay: i * 0.1 }),
        );
        break;
      case 'gameover':
        [0, -3, -7, -12].forEach((st, i) =>
          this._tone({ type: 'sawtooth', freq: NOTE(st), dur: 0.4, gain: 0.12, delay: i * 0.16 }),
        );
        break;
      default:
        break;
    }
  }

  startMusic(track) {
    if (!this.ctx) return;
    this.track = track;
    this._step = 0;
    this._nextNoteTime = this.now + 0.06;
    if (!this.musicOn || this.muted) return;
  }

  stopMusic() {
    this.track = null;
  }

  /** Called every frame; schedules notes slightly ahead of the clock. */
  pump() {
    if (!this.ctx || !this.track || this.muted || !this.musicOn) return;
    const tempo = this.track === 'boss' ? 0.125 : 0.140625; // seconds per 16th
    const lookahead = 0.25;
    // The context may have been created after startMusic() set the clock, and
    // resuming from a paused tab leaves a large gap. Without this guard the
    // replan loop would try to schedule thousands of missed notes at once.
    if (this._nextNoteTime < this.now - 0.1) this._nextNoteTime = this.now + 0.05;
    while (this._nextNoteTime < this.now + lookahead) {
      this._scheduleStep(this._step, this._nextNoteTime - this.now, tempo);
      this._step = (this._step + 1) % 128;
      this._nextNoteTime += tempo;
    }
  }

  _scheduleStep(step, delay, tempo) {
    const bar = Math.floor(step / 16) % 4;
    const beat = step % 16;
    const boss = this.track === 'boss';
    const chord = CHORDS[bar];

    // Bass on every quarter.
    if (beat % 4 === 0) {
      this._tone({
        type: 'triangle',
        freq: NOTE(chord[0]),
        dur: tempo * 3.4,
        gain: 0.16,
        delay,
        bus: this.musicBus,
      });
    }

    // Arpeggio.
    const arp = ARP[(step + bar * 2) % ARP.length];
    const octave = beat % 8 < 4 ? 12 : 0;
    this._tone({
      type: boss ? 'sawtooth' : 'square',
      freq: NOTE(chord[1] + arp + octave),
      dur: tempo * 1.6,
      gain: boss ? 0.055 : 0.04,
      delay,
      bus: this.musicBus,
    });

    // Kick + hat groove.
    if (beat % 8 === 0 || beat === 6) {
      this._tone({ type: 'sine', freq: 120, endFreq: 45, dur: 0.18, gain: 0.24, delay, bus: this.musicBus });
    }
    if (beat % 4 === 2) {
      this._noise({ dur: 0.05, gain: 0.05, filter: 6000, q: 1.2, delay, bus: this.musicBus });
    }
    // Boss adds a snare backbeat.
    if (boss && beat % 8 === 4) {
      this._noise({ dur: 0.14, gain: 0.1, filter: 1800, q: 1.6, delay, bus: this.musicBus });
    }
  }
}
