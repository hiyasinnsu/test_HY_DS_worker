// Entry point. Boots the game, wires the error surface, and exposes a small
// debug handle (`window.__game`) used by the automated smoke test.

import { Game } from './game.js';

function fatal(message) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:600 14px system-ui,sans-serif;color:#ffd8ea;background:#05040c;z-index:99';
  el.textContent = message;
  stage.appendChild(el);
}

function boot() {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    fatal('ゲーム画面が見つかりませんでした。');
    return;
  }
  let game;
  try {
    game = new Game(canvas);
  } catch (err) {
    console.error('[boot] failed', err);
    fatal('このゲームを起動できませんでした。別のブラウザでお試しください。');
    return;
  }
  game.start();
  window.__game = game;

  window.addEventListener('error', (e) => {
    console.error('[window] error', e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[window] unhandled rejection', e.reason);
  });

  // Offline / home-screen support. Registered lazily so the first frame is not
  // delayed, and silently skipped on file:// or insecure origins.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('[sw] registration failed', err);
      });
    });
  }

  // Keep the canvas in sync with URL-bar collapse on mobile browsers.
  const remeasure = () => game.viewport.measure();
  window.addEventListener('orientationchange', () => setTimeout(remeasure, 150));
  window.visualViewport?.addEventListener('resize', remeasure);

  // Rotate hint on very narrow landscape screens.
  const hint = document.getElementById('rotate-hint');
  const updateHint = () => {
    if (!hint) return;
    const isLandscape = window.innerWidth > window.innerHeight;
    hint.hidden = !(isLandscape && window.innerWidth < 900);
  };
  window.addEventListener('resize', updateHint);
  updateHint();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
