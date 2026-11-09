// Persistence layer. Every call is guarded because Safari private mode can throw
// on localStorage access and we must never crash the game over a saved score.

const KEY = 'neon-barrage:v1';

const DEFAULTS = {
  highScore: 0,
  bestStage: 1,
  muted: false,
  music: true,
  quality: 'auto',
  dragSensitivity: 1,
};

let cache = null;

function readAll() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(DEFAULTS)) {
          if (typeof parsed[key] === typeof DEFAULTS[key]) cache[key] = parsed[key];
        }
      }
    }
  } catch {
    // Storage unavailable or corrupted: fall back to in-memory defaults.
  }
  return cache;
}

function writeAll() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(readAll()));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function getSetting(key) {
  return readAll()[key];
}

export function setSetting(key, value) {
  const all = readAll();
  if (all[key] === value) return value;
  all[key] = value;
  writeAll();
  return value;
}

export function submitScore(score, stage) {
  const all = readAll();
  let isBest = false;
  if (score > all.highScore) {
    all.highScore = Math.floor(score);
    isBest = true;
  }
  if (stage > all.bestStage) all.bestStage = stage;
  writeAll();
  return { highScore: all.highScore, isBest };
}

export function resetProgress() {
  cache = { ...DEFAULTS };
  writeAll();
  return cache;
}
