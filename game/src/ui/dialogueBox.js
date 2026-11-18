// The subtitle box with a painted portrait: plays a queue of [speaker, line] pairs with a
// typewriter reveal, each line held long enough to read. X skips to the next line.
import { portraitDataUrl } from '../render/proceduralTextures.js';

const $ = (id) => document.getElementById(id);

export class DialogueBox {
  constructor(game) {
    this.game = game;
    this.queue = [];
    this.current = null;
    this.portraits = {};
    this.el = $('dialogue');
  }

  get active() { return !!this.current || this.queue.length > 0; }

  play(lines, cast) {
    this.cast = cast;
    for (const [who, text] of lines) this.queue.push({ who, text });
    if (!this.current) this.next();
  }

  stopIfFrom() {
    this.queue = [];
    this.current = null;
    this.el.classList.add('hidden');
  }

  portrait(who) {
    if (!this.portraits[who]) this.portraits[who] = portraitDataUrl(this.cast[who].portrait);
    return this.portraits[who];
  }

  next() {
    this.current = this.queue.shift() || null;
    if (!this.current) { this.el.classList.add('hidden'); return; }
    const c = this.current;
    c.time = 0;
    c.hold = 2.2 + c.text.length * 0.05;
    this.el.classList.remove('hidden');
    $('dlg-portrait').src = this.portrait(c.who);
    $('dlg-name').textContent = this.cast[c.who].name;
    this.game.audio?.blip();
  }

  /** Show a line instantly and hold it (used by screenshot scenes). */
  pin(who, text, cast) {
    this.cast = cast;
    this.queue = [];
    this.current = { who, text, time: 999, hold: 1e9 };
    this.el.classList.remove('hidden');
    $('dlg-portrait').src = this.portrait(who);
    $('dlg-name').textContent = cast[who].name;
    $('dlg-text').textContent = text;
  }

  update(dt) {
    const c = this.current;
    if (!c) return;
    c.time += dt;
    const shown = Math.min(c.text.length, Math.floor(c.time * 45));
    $('dlg-text').textContent = c.text.slice(0, shown);
    if (c.time > c.hold || this.game.input.pressed('KeyX')) this.next();
  }
}
