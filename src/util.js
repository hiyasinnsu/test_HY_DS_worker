// Small, dependency-free math helpers shared by every module.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Frame-rate independent exponential smoothing toward `target`. */
export const damp = (current, target, smoothing, dt) =>
  lerp(current, target, 1 - Math.pow(smoothing, dt * 60));

export const formatScore = (n) => Math.floor(n).toString().padStart(8, '0');
