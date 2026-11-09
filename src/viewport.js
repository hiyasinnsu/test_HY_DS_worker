// Canvas sizing and coordinate conversion.
//
// The game logic always works in a virtual 480-wide world. This module maps
// that world onto the CSS pixel box of the canvas, letterboxing when the
// aspect ratio does not match, and exposes screen -> world conversion for
// pointer input plus a device pixel ratio cap to keep fill-rate sane.

import { GAME_W, GAME_H_MIN, GAME_H_MAX } from './config.js';
import { clamp } from './util.js';

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.cssW = 1;
    this.cssH = 1;
    this.dpr = 1;
    this.dprCap = 2;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.worldW = GAME_W;
    this.worldH = GAME_H_MIN;
    this.wide = false;
    this._onResize = null;
  }

  /** Registers a callback fired after each successful resize measurement. */
  onResize(fn) {
    this._onResize = fn;
  }

  measure() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width || window.innerWidth));
    const cssH = Math.max(1, Math.round(rect.height || window.innerHeight));
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = clamp(window.devicePixelRatio || 1, 1, this.dprCap);

    const pixelW = Math.round(cssW * this.dpr);
    const pixelH = Math.round(cssH * this.dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    const idealH = Math.round((GAME_W * cssH) / cssW);
    this.worldW = GAME_W;
    this.worldH = clamp(idealH, GAME_H_MIN, GAME_H_MAX);
    this.scale = Math.min(cssW / this.worldW, cssH / this.worldH);
    this.offsetX = (cssW - this.worldW * this.scale) / 2;
    this.offsetY = (cssH - this.worldH * this.scale) / 2;
    this.wide = cssW > cssH;
    this._onResize?.(this);
  }

  /** Converts a CSS-pixel position on the canvas into world coordinates. */
  toWorld(px, py) {
    return {
      x: (px - this.offsetX) / this.scale,
      y: (py - this.offsetY) / this.scale,
    };
  }

  /** Prepares the context so that all drawing uses world units. */
  begin() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04030a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(
      dpr * this.scale,
      0,
      0,
      dpr * this.scale,
      dpr * this.offsetX,
      dpr * this.offsetY,
    );
  }

  get playfield() {
    return { x: 0, y: 0, w: this.worldW, h: this.worldH };
  }
}
