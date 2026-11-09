// Wave scheduler.
//
// A stage is a list of timestamped events (spawn waves, messages). The director
// keeps an index pointer and fires everything whose time has passed; this avoids
// setTimeout drift and keeps pausing deterministic.

export class StageDirector {
  constructor(game) {
    this.game = game;
    this.events = [];
    this.index = 0;
    this.time = 0;
    this.running = false;
  }

  load(events) {
    this.events = events.slice().sort((a, b) => a.t - b.t);
    this.index = 0;
    this.time = 0;
    this.running = true;
  }

  at(t, fn) {
    this.events.push({ t, fn });
  }

  update(dt) {
    if (!this.running) return;
    this.time += dt;
    while (this.index < this.events.length && this.events[this.index].t <= this.time) {
      const ev = this.events[this.index++];
      try {
        ev.fn(this.game);
      } catch (err) {
        console.error('[stage] event failed', err);
      }
    }
  }

  stop() {
    this.running = false;
  }

  get finished() {
    return this.index >= this.events.length;
  }
}
