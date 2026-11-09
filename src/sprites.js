// Pre-rendered bullet sprites.
//
// Hundreds of bullets are on screen at once; building a radial gradient per
// bullet per frame destroys mobile frame rates. Each (kind, palette, size)
// combination is rasterised once into an offscreen canvas and blitted.

const CACHE = new Map();
const SPRITE_PAD = 3;

export const PLAYER_SHOT_SPRITE = 'player-shot';

function makeKey(kind, color, radius) {
  return `${kind}|${color}|${radius}`;
}

function drawOrb(ctx, cx, cy, r, color) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.55, color);
  g.addColorStop(0.86, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawRice(ctx, cx, cy, r, color) {
  // Rice/petal bullets point along +Y; callers rotate the context.
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, color);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.62, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(cx, cy - r * 0.32, r * 0.26, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBig(ctx, cx, cy, r, color) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, color);
  g.addColorStop(0.78, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlayerShot(ctx, cx, cy, r) {
  // Slim cyan lances: visually distinct from the round/oval enemy danmaku so the
  // player can separate "my bullets" from "bullets that can kill me".
  const g = ctx.createLinearGradient(cx, cy - r * 3.2, cx, cy + r * 1.6);
  g.addColorStop(0, 'rgba(140,240,255,0)');
  g.addColorStop(0.45, 'rgba(120,230,255,0.85)');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.34, r * 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Returns a canvas of size (2r+pad) with the sprite centred. */
export function getSprite(kind, color, radius) {
  const key = makeKey(kind, color, radius);
  const cached = CACHE.get(key);
  if (cached) return cached;

  const size = Math.ceil((radius + SPRITE_PAD) * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  if (kind === 'orb') drawOrb(ctx, cx, cy, radius, color);
  else if (kind === 'rice') drawRice(ctx, cx, cy, radius, color);
  else if (kind === 'big') drawBig(ctx, cx, cy, radius, color);
  else if (kind === PLAYER_SHOT_SPRITE) drawPlayerShot(ctx, cx, cy, radius);
  else drawOrb(ctx, cx, cy, radius, color);

  const sprite = { canvas: c, half: size / 2, radius };
  CACHE.set(key, sprite);
  return sprite;
}

export function clearSpriteCache() {
  CACHE.clear();
}
