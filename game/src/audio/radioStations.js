// Three procedural radio stations, composed live with WebAudio: SOLAR FM (synthwave: gated
// pads, arpeggios, gated-reverb snare), RADIO CALOR (latin: dembow drums, piano montuno,
// bass), WAVEFRONT (lo-fi: dusty keys, soft kick, vinyl crackle). Each "track" is a seeded
// variation: tempo, key, chord loop and patterns. A lookahead scheduler keeps it in time.
import { createRandom } from '../core/seededRandom.js';

export const STATIONS = [
  {
    id: 'solar', name: 'SOLAR FM 101.3', style: 'synthwave', bpm: [96, 108], art: 'linear-gradient(135deg,#ff4fa3,#ffb347)',
    tracks: [['Neon Tide', 'Midnight Arcadia'], ['Causeway Lights', 'VHS Lagoon'], ['Palms After Dark', 'Laser Coast'], ['Kessane Skyline', 'Chrome Dolphin']],
  },
  {
    id: 'calor', name: 'RADIO CALOR 94.7', style: 'latin', bpm: [92, 100], art: 'linear-gradient(135deg,#ff3b3b,#ffd166)',
    tracks: [['Fuego en la Bahía', 'Los Turbo'], ['Calle Lumen', 'DJ Paloma'], ['Marea Alta', 'La Sonora Neón'], ['Noche de Verano', 'Santa Brisa']],
  },
  {
    id: 'wave', name: 'WAVEFRONT 88.1', style: 'lofi', bpm: [74, 84], art: 'linear-gradient(135deg,#3a86ff,#4fe8ff)',
    tracks: [['Low Tide Study', 'Coral Static'], ['Pastel Rooftops', 'Sundial'], ['4AM Ferry', 'Harbor Lights'], ['Boardwalk Rain', 'Mira Mar']],
  },
];

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PROGRESSIONS = [[0, 5, 2, 6], [0, 3, 5, 4], [0, 6, 5, 6], [5, 6, 0, 0]];

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export class RadioPlayer {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(out);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 1.8);
    const rv = ctx.createGain();
    rv.gain.value = 0.35;
    this.reverb.connect(rv).connect(this.out);
    this.noise = noiseBuffer(ctx);
    this.stationIndex = 0;
    this.trackIndex = 0;
    this.on = false;
    this.nextTime = 0;
    this.step = 0;
    this.timer = null;
    this.nowPlaying = null;
  }

  setVolume(v) { this.out.gain.value = v; }

  start(stationIndex = this.stationIndex) {
    this.stationIndex = stationIndex;
    this.on = true;
    this.loadTrack(this.trackIndex);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.on = false;
    this.nowPlaying = null;
    clearInterval(this.timer);
    this.timer = null;
  }

  nextStation() {
    if (!this.on) { this.start(0); return; }
    if (this.stationIndex === STATIONS.length - 1) { this.stop(); return; }
    this.stationIndex += 1;
    this.trackIndex = 0;
    this.loadTrack(0);
  }

  loadTrack(index) {
    const st = STATIONS[this.stationIndex];
    this.trackIndex = index % st.tracks.length;
    const rng = createRandom(this.stationIndex * 101 + this.trackIndex * 7 + 3);
    const [title, artist] = st.tracks[this.trackIndex];
    this.track = {
      bpm: rng.int(st.bpm[0], st.bpm[1]),
      root: 45 + rng.int(0, 7),
      prog: PROGRESSIONS[rng.int(0, PROGRESSIONS.length - 1)],
      arp: [0, 2, 4, 2, 0, 4, 2, 4].map((n) => (rng() < 0.2 ? n + 7 : n)),
      bars: 0,
      length: 48 + rng.int(0, 3) * 8,
    };
    this.nowPlaying = { station: st.name, title, artist, art: st.art };
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
  }

  /** Lookahead: schedule every 16th note that falls in the next 120 ms. */
  schedule() {
    if (!this.on) return;
    const ctx = this.ctx;
    const t = this.track;
    const sixteenth = 60 / t.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step += 1;
      if (this.step % 16 === 0) {
        t.bars += 1;
        if (t.bars >= t.length) this.loadTrack(this.trackIndex + 1);
      }
    }
  }

  chordAt(step) {
    const t = this.track;
    const degree = t.prog[Math.floor(step / 32) % t.prog.length];
    return [0, 2, 4].map((k) => t.root + MINOR[(degree + k) % 7] + 12 * Math.floor((degree + k) / 7));
  }

  playStep(step, time, sixteenth) {
    const style = STATIONS[this.stationIndex].style;
    const s16 = step % 16;
    const chord = this.chordAt(step);
    if (style === 'synthwave') {
      if (s16 % 4 === 0) this.kick(time, 0.9);
      if (s16 === 4 || s16 === 12) this.snare(time, 0.5, true);
      if (s16 % 2 === 1) this.hat(time, 0.12);
      this.tone(time, mtof(chord[0] - 12), sixteenth * 0.9, 'sawtooth', 0.12, 500);
      const arp = this.track.arp[step % 8];
      this.tone(time, mtof(chord[arp % 3] + 24 + (arp >= 7 ? 12 : 0)), sixteenth * 0.8, 'square', 0.035, 2600);
      if (step % 32 === 0) for (const n of chord) this.pad(time, mtof(n + 12), sixteenth * 32, 0.05);
    } else if (style === 'latin') {
      if (s16 % 4 === 0) this.kick(time, 0.85);
      if (s16 === 3 || s16 === 6 || s16 === 11 || s16 === 14) this.snare(time, 0.32, false);
      if (s16 % 2 === 0) this.hat(time, 0.08);
      if ([0, 3, 6, 10, 12].includes(s16)) this.tone(time, mtof(chord[0] - 12 + (s16 === 10 ? 7 : 0)), sixteenth * 1.6, 'triangle', 0.2, 900);
      if ([2, 5, 8, 11, 14].includes(s16)) for (const n of chord) this.tone(time, mtof(n + 12), sixteenth * 0.7, 'triangle', 0.045, 3000);
      if (s16 === 0 && step % 64 === 0) this.tone(time, mtof(chord[2] + 24), sixteenth * 6, 'sine', 0.06, 4000);
    } else {
      if (s16 === 0 || s16 === 10) this.kick(time, 0.55);
      if (s16 === 4 || s16 === 12) this.snare(time, 0.18, false);
      if (s16 % 4 === 2) this.hat(time, 0.05);
      if (step % 16 === 0) for (const n of chord) this.pad(time, mtof(n + 12), sixteenth * 15, 0.06, 'triangle');
      if (s16 === 0 || s16 === 7) this.tone(time, mtof(chord[0] - 12), sixteenth * 5, 'sine', 0.22, 400);
      if (step % 4 === 0) this.crackle(time);
    }
  }

  tone(time, freq, dur, type, vol, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(time);
    o.stop(time + dur + 0.05);
  }

  pad(time, freq, dur, vol, type = 'sawtooth') {
    const ctx = this.ctx;
    for (const detune of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(vol, time + dur * 0.25);
      g.gain.linearRampToValueAtTime(0, time + dur);
      o.connect(f).connect(g);
      g.connect(this.out);
      g.connect(this.reverb);
      o.start(time);
      o.stop(time + dur + 0.05);
    }
  }

  kick(time, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    o.connect(g).connect(this.out);
    o.start(time);
    o.stop(time + 0.32);
  }

  snare(time, vol, gated) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + (gated ? 0.25 : 0.12));
    src.connect(f).connect(g);
    g.connect(this.out);
    if (gated) g.connect(this.reverb);
    src.start(time);
    src.stop(time + 0.3);
  }

  hat(time, vol) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(f).connect(g).connect(this.out);
    src.start(time);
    src.stop(time + 0.06);
  }

  crackle(time) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3500;
    f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.value = 0.025;
    src.connect(f).connect(g).connect(this.out);
    src.start(time, Math.random() * 0.5, 0.03);
  }
}

export function noiseBuffer(ctx, seconds = 1) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const rng = createRandom(77);
  for (let i = 0; i < d.length; i += 1) d[i] = rng() * 2 - 1;
  return buf;
}

function impulse(ctx, seconds) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const rng = createRandom(31);
  for (let c = 0; c < 2; c += 1) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i += 1) d[i] = (rng() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return buf;
}
