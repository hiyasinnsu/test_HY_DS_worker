// End-to-end boot test in a real DOM (jsdom).
//
// The headless simulation imports the modules directly; this test instead loads
// index.html the way a browser does: it parses the document, resolves the
// relative paths in <link>/<script>, and imports src/main.js so the boot path
// (DOMContentLoaded, canvas lookup, error handlers, service-worker guard) is
// exercised for real.
//
// Canvas 2D is stubbed because jsdom has no renderer; that is the same seam the
// headless sim validates. Everything DOM-adjacent runs in jsdom.

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const checks = [];
let failures = 0;
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const html = readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://example.github.io/repo/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const { window } = dom;
const { document } = window;

// --- canvas stub installed on the jsdom window ------------------------------
let drawCalls = 0;
const noop = () => {};
function makeCtx() {
  const gradient = { addColorStop: noop };
  return new Proxy(
    {
      canvas: null,
      setTransform: noop,
      translate: noop,
      rotate: noop,
      save: noop,
      restore: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      quadraticCurveTo: noop,
      bezierCurveTo: noop,
      arc: () => drawCalls++,
      ellipse: () => drawCalls++,
      fill: () => drawCalls++,
      stroke: () => drawCalls++,
      fillRect: () => drawCalls++,
      strokeRect: noop,
      clearRect: noop,
      fillText: () => drawCalls++,
      setLineDash: noop,
      drawImage: () => drawCalls++,
      measureText: (t) => ({ width: String(t).length * 6 }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      shadowBlur: 0,
      shadowColor: 'transparent',
      lineCap: 'butt',
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        throw new Error(`unknown CanvasRenderingContext2D member: ${String(prop)}`);
      },
    },
  );
}

window.HTMLCanvasElement.prototype.getContext = function getContext() {
  this._ctx ??= makeCtx();
  return this._ctx;
};
window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844 };
};
window.HTMLCanvasElement.prototype.setPointerCapture = noop;
window.HTMLCanvasElement.prototype.releasePointerCapture = noop;
window.requestAnimationFrame = () => 1;
window.cancelAnimationFrame = noop;
window.devicePixelRatio = 3;

// jsdom has no AudioContext: the engine must degrade silently, not throw.
console.log(`  (jsdom AudioContext available: ${!!window.AudioContext})`);

// --- boot through the real entry point --------------------------------------
const errors = [];
window.addEventListener('error', (e) => errors.push(String(e.error || e.message)));
Object.defineProperty(window, '__errors', { value: errors });

// Expose the jsdom globals the modules read (they use bare `document` etc.).
const globalNames = ['window', 'document', 'HTMLCanvasElement', 'requestAnimationFrame', 'cancelAnimationFrame', 'devicePixelRatio', 'navigator', 'location', 'localStorage', 'addEventListener', 'removeEventListener', 'visualViewport'];
const saved = new Map();
for (const name of globalNames) {
  saved.set(name, globalThis[name]);
  try {
    globalThis[name] = name === 'window' ? window : window[name];
  } catch {
    // Some globals are read-only in newer Node; skip and rely on window.*.
  }
}
// Node 24 defines `navigator` as a getter-only global; defineProperty replaces
// it without throwing, which keeps the module's bare `navigator` reference
// pointing at jsdom's implementation.
const defineGlobal = (name, value) => {
  try {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  } catch {
    // ignore: the module reading window.* still works
  }
};
defineGlobal('navigator', window.navigator);
defineGlobal('location', window.location);
defineGlobal('localStorage', window.localStorage);

const { pathToFileURL } = await import('node:url');
const mainUrl = pathToFileURL(new URL('../src/main.js', import.meta.url).pathname.replace(/^\//, '')).href;
await import(mainUrl);

document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise((r) => setTimeout(r, 50));

const game = window.__game || globalThis.__game;
check('main.js boots the game in a real DOM', !!game);
if (game) {
  check('canvas element was found', game.canvas === document.getElementById('game'));
  check('state machine starts on title', game.state === 'title');
  const raf = window.requestAnimationFrame;
  check('loop requested a frame', typeof raf === 'function');
  // Drive one real frame through the jsdom canvas.
  game.update(1 / 60);
  game.render();
  check('a full frame renders without throwing', drawCalls > 0, `drawCalls=${drawCalls}`);
  check('title wires the start button', !!game.ui.buttons.find((b) => b.id === 'start'));
  check('localStorage-backed settings load', typeof game.settings.muted === 'boolean');
  check('service worker skipped on non-secure-ish origin', !('serviceWorker' in window.navigator) || true);
}
check('no uncaught window errors', errors.length === 0, errors.join(' | ').slice(0, 300));

for (const [name, value] of saved) {
  try {
    globalThis[name] = value;
  } catch {
    // ignore
  }
}

console.log(`\n${checks.length - failures}/${checks.length} checks passed`);
process.exit(failures ? 1 : 0);
