// Central tuning values. Gameplay code never hard-codes these numbers inline so
// difficulty can be tuned in one place after play-testing on real devices.

/** Virtual playfield width in world units; height is derived per viewport. */
export const GAME_W = 480;
export const GAME_H_MIN = 720;
export const GAME_H_MAX = 1180;

/** Player */
export const PLAYER = {
  /** How quickly the ship catches up to the finger (lower = snappier). */
  follow: 0.22,
  /** Maximum keyboard speed in world units per second. */
  maxSpeed: 980,
  /** Bullet collision radius — deliberately tiny to make grazing possible. */
  hitRadius: 3.2,
  /** Distance at which bullets count as grazed. */
  grazeRadius: 15,
  lives: 3,
  bombs: 3,
  /** Invulnerability window after taking a hit, in seconds. */
  invulnTime: 2.4,
  /** Auto-fire interval in seconds (at power level 1). */
  fireInterval: 0.075,
  respawnY: 0.78,
};

/** Bullets */
export const BULLET = {
  maxPlayer: 600,
  maxEnemy: 1400,
  /** Render radius per bullet type; also the collision fallback. */
  radii: { orb: 4.6, rice: 4.2, big: 9.5 },
};

export const COLORS = {
  playerBullet: '#c8f6ff',
  dim: 'rgba(214, 236, 255, 0.62)',
  accent: '#63e6ff',
  enemy: '#ff4d8d',
  enemy2: '#ff9f45',
  enemy3: '#b18cff',
  ink: '#eaf6ff',
};

/** Palette used in order for each danmaku wave so stages feel distinct. */
export const BULLET_PALETTES = [
  ['#ff4d8d', '#ff9f45', '#ffe066'],
  ['#5ce1ff', '#8b9dff', '#c084fc'],
  ['#ffe066', '#ff8fab', '#9dffb0'],
  ['#ff3355', '#b18cff', '#5ce1ff'],
];
