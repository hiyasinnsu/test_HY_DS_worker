// Unified pointer + keyboard input.
//
// Mobile danmaku convention: the ship follows the *relative* motion of the
// finger so the thumb never covers the ship. We therefore deliver raw pointer
// events and let the game accumulate deltas in world space.

const KEY_ALIASES = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ShiftLeft: 'focus',
  ShiftRight: 'focus',
  KeyX: 'bomb',
  Space: 'bomb',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  KeyM: 'mute',
};

export class Input {
  constructor(target) {
    this.target = target;
    this.events = [];
    this.down = new Set();
    this.pressed = new Set();
    this.pointerType = 'mouse';
    this._activePointer = null;
    this._bound = [];

    this._listen(window, 'keydown', (e) => this._onKeyDown(e), { passive: false });
    this._listen(window, 'keyup', (e) => this._onKeyUp(e));
    this._listen(window, 'blur', () => this._clearKeys());
    this._listen(target, 'pointerdown', (e) => this._onPointerDown(e));
    this._listen(target, 'pointermove', (e) => this._onPointerMove(e));
    this._listen(target, 'pointerup', (e) => this._onPointerUp(e));
    this._listen(target, 'pointercancel', (e) => this._onPointerUp(e));
    this._listen(target, 'contextmenu', (e) => e.preventDefault());
    this._listen(document, 'gesturestart', (e) => e.preventDefault());
    this._listen(document, 'dblclick', (e) => e.preventDefault());
    this._listen(window, 'resize', () => this.events.push({ type: 'resize' }));
    globalThis.visualViewport?.addEventListener('resize', () =>
      this.events.push({ type: 'resize' }),
    );
  }

  _listen(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    this._bound.push([el, type, fn]);
  }

  _clearKeys() {
    this.down.clear();
  }

  _onKeyDown(e) {
    const action = KEY_ALIASES[e.code];
    if (!action) return;
    if (action !== 'mute') e.preventDefault();
    if (!this.down.has(action)) this.pressed.add(action);
    this.down.add(action);
    this.pointerType = 'keyboard';
  }

  _onKeyUp(e) {
    const action = KEY_ALIASES[e.code];
    if (!action) return;
    this.down.delete(action);
  }

  _pos(e) {
    const rect = this.target.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _onPointerDown(e) {
    this.pointerType = e.pointerType || 'mouse';
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Ignore secondary fingers so a stray palm does not hijack the ship.
    if (this._activePointer !== null) {
      this.events.push({ type: 'down2', ...this._pos(e), id: e.pointerId });
      return;
    }
    e.preventDefault();
    this._activePointer = e.pointerId;
    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic events; harmless.
    }
    this.events.push({ type: 'down', ...this._pos(e), id: e.pointerId, pointerType: e.pointerType });
  }

  _onPointerMove(e) {
    if (e.pointerId !== this._activePointer) return;
    e.preventDefault();
    this.events.push({ type: 'move', ...this._pos(e), id: e.pointerId });
  }

  _onPointerUp(e) {
    if (e.pointerId !== this._activePointer) return;
    this._activePointer = null;
    try {
      this.target.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    this.events.push({ type: 'up', ...this._pos(e), id: e.pointerId });
  }

  isDown(action) {
    return this.down.has(action);
  }

  /** True exactly once per physical press. */
  wasPressed(action) {
    return this.pressed.has(action);
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.events.length = 0;
  }

  drain() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
