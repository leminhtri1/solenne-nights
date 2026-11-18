// Sound made in code: the player's engine (two detuned oscillators through a filter that
// opens with revs), police sirens that wail louder as units close in, gunshots, punches,
// explosions, crashes, the horn, UI blips and mission stings. Also owns the radio.
import { RadioPlayer, noiseBuffer } from './radioStations.js';

export class SoundEffects {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.radio = null;
    this.ready = false;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.game.state.settings.volume;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.noise = noiseBuffer(ctx, 2);
    this.radio = new RadioPlayer(ctx, this.master);
    this.radio.setVolume(this.game.state.settings.music * 0.8);
    // engine voice
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineOsc = [ctx.createOscillator(), ctx.createOscillator()];
    this.engineOsc[0].type = 'sawtooth';
    this.engineOsc[1].type = 'square';
    this.engineOsc[1].detune.value = -1200;
    for (const o of this.engineOsc) { o.connect(this.engineFilter); o.start(); }
    this.engineFilter.connect(this.engineGain).connect(this.sfx);
    // siren voice
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.sfx);
    this.sirenOsc.start();
    this.ready = true;
  }

  setVolumes(master, music) {
    if (!this.ready) return;
    this.master.gain.value = master;
    this.radio.setVolume(music * 0.8);
  }

  update(dt) {
    if (!this.ready) return;
    const g = this.game;
    const t = this.ctx.currentTime;
    const v = g.player.vehicle;
    if (v && !v.dead && g.running) {
      const rpm = v.body.rpm;
      const base = v.def.kind === 'bike' ? 70 : v.def.body === 'muscle' ? 38 : v.def.kind === 'boat' ? 45 : 50;
      const f = base + rpm * base * 2.6;
      for (const o of this.engineOsc) o.frequency.setTargetAtTime(f, t, 0.05);
      this.engineFilter.frequency.setTargetAtTime(400 + rpm * 2200, t, 0.05);
      this.engineGain.gain.setTargetAtTime(0.05 + Math.abs(v.input.throttle) * 0.07, t, 0.08);
    } else this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    // siren: nearest unit with its siren on
    let near = Infinity;
    for (const u of g.police.units) if (u.vehicle.siren && !u.vehicle.dead) near = Math.min(near, Math.hypot(u.vehicle.body.x - g.player.x, u.vehicle.body.z - g.player.z));
    const sv = g.running && near < 200 ? 0.07 * (1 - near / 200) : 0;
    this.sirenGain.gain.setTargetAtTime(sv, t, 0.2);
    const wail = 650 + 350 * Math.sin(t * 2.4);
    this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.02);
  }

  burst(time, { freq = 1000, q = 1, type = 'bandpass', vol = 0.4, decay = 0.2, offset = 0 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + decay);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(time, offset, decay + 0.05);
  }

  thump(time, from, to, vol, decay) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, time);
    o.frequency.exponentialRampToValueAtTime(to, time + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + decay);
    o.connect(g).connect(this.sfx);
    o.start(time);
    o.stop(time + decay + 0.05);
  }

  falloff(x, z, range = 120) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - this.game.player.x, z - this.game.player.z);
    return Math.max(0, 1 - d / range);
  }

  gunshot(weapon, x, z) {
    if (!this.ready) return;
    const k = this.falloff(x, z, 160);
    if (k <= 0) return;
    const t = this.ctx.currentTime;
    const heavy = weapon === 'shotgun';
    this.burst(t, { freq: heavy ? 900 : 1600, q: 0.7, vol: (heavy ? 0.7 : 0.45) * k, decay: heavy ? 0.35 : 0.16 });
    this.thump(t, heavy ? 160 : 220, 50, (heavy ? 0.6 : 0.35) * k, 0.12);
  }

  punch() { if (this.ready) this.thump(this.ctx.currentTime, 120, 60, 0.4, 0.1); }
  click() { if (this.ready) this.thump(this.ctx.currentTime, 2000, 1500, 0.08, 0.03); }
  blip() { if (this.ready) this.thump(this.ctx.currentTime, 900, 1200, 0.05, 0.06); }

  explosion(x, z) {
    if (!this.ready) return;
    const k = this.falloff(x, z, 300);
    const t = this.ctx.currentTime;
    this.burst(t, { freq: 400, type: 'lowpass', q: 0.5, vol: 0.9 * k, decay: 1.6 });
    this.thump(t, 90, 30, 0.9 * k, 0.8);
  }

  crash(speed, x, z) {
    if (!this.ready) return;
    const k = this.falloff(x, z, 120) * Math.min(1, speed / 25);
    const t = this.ctx.currentTime;
    this.burst(t, { freq: 2500, q: 2, vol: 0.5 * k, decay: 0.3 });
    this.burst(t, { freq: 300, type: 'lowpass', vol: 0.6 * k, decay: 0.25 });
  }

  horn(x, z) {
    if (!this.ready) return;
    const k = x === undefined ? 1 : this.falloff(x, z, 90);
    const t = this.ctx.currentTime;
    for (const f of [392, 494]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.06 * k, t);
      g.gain.setValueAtTime(0.06 * k, t + 0.35);
      g.gain.linearRampToValueAtTime(0, t + 0.4);
      o.connect(g).connect(this.sfx);
      o.start(t);
      o.stop(t + 0.42);
    }
  }

  sting(kind) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const notes = { pass: [60, 64, 67, 72, 76], fail: [64, 60, 55, 52], start: [57, 64, 69], checkpoint: [76, 83], cash: [84, 88] }[kind] || [72];
    notes.forEach((n, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 440 * 2 ** ((n - 69) / 12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.15, t + i * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.5);
      o.connect(g).connect(this.sfx);
      o.start(t + i * 0.11);
      o.stop(t + i * 0.11 + 0.55);
    });
  }
}
