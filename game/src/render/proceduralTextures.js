// Every texture in the game is painted here on a canvas at start-up: building facades with
// their lit-window maps, asphalt with lane paint, crosswalks, sidewalks, sand, the soft glow
// sprite that fakes bloom, neon signs and billboards for the city's own brands.
import * as THREE from 'three';
import { createRandom } from '../core/seededRandom.js';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function speckle(g, w, h, count, rng, colors, size = 2) {
  for (let i = 0; i < count; i += 1) {
    g.fillStyle = rng.pick(colors);
    g.fillRect(rng() * w, rng() * h, size, size);
  }
}

/**
 * Facade styles. Each is one repeating unit 16 m wide and 16 m tall (4 window columns by 4
 * floors), painted light so per-building vertex colours tint it. The bottom-left pixel block is
 * plain wall, which roofs sample.
 */
export const FACADE_STYLES = [
  { id: 'glass', wall: '#d9e4ec', frame: '#8ea3b4', glass: '#1d3a52', cols: 4, floors: 4, band: true },
  { id: 'deco', wall: '#fbf3e6', frame: '#e0cdb0', glass: '#2a4b5e', cols: 3, floors: 4, deco: true },
  { id: 'stucco', wall: '#f4ece2', frame: '#d8c7b2', glass: '#24323d', cols: 4, floors: 4, shutters: true },
  { id: 'office', wall: '#c9ced4', frame: '#9aa3ad', glass: '#16283a', cols: 6, floors: 4, band: true },
  { id: 'tower', wall: '#b7c7d6', frame: '#5d7387', glass: '#0f2338', cols: 8, floors: 6, curtain: true },
  { id: 'warehouse', wall: '#d6cfc4', frame: '#a99d8c', glass: '#3b3f44', cols: 2, floors: 2, ribbed: true },
  { id: 'hotel', wall: '#fff6ee', frame: '#efd9c4', glass: '#25495f', cols: 4, floors: 5, balconies: true },
  { id: 'brick', wall: '#e2c3a8', frame: '#b98d6a', glass: '#28323a', cols: 4, floors: 4, brick: true },
];

function paintFacade(style, lit) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rng = createRandom(style.id.length * 977 + (lit ? 13 : 7));
  g.fillStyle = lit ? '#000' : style.wall;
  g.fillRect(0, 0, S, S);
  if (!lit) {
    speckle(g, S, S, 900, rng, ['rgba(0,0,0,0.04)', 'rgba(255,255,255,0.05)'], 2);
    if (style.brick) {
      g.strokeStyle = 'rgba(120,70,40,0.18)';
      for (let y = 0; y < S; y += 6) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      }
    }
    if (style.ribbed) {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let x = 0; x < S; x += 8) g.fillRect(x, 0, 3, S);
    }
  }
  const cw = S / style.cols;
  const fh = S / style.floors;
  for (let f = 0; f < style.floors; f += 1) {
    for (let k = 0; k < style.cols; k += 1) {
      const x = k * cw;
      const y = f * fh;
      const padX = style.curtain ? 2 : cw * 0.2;
      const padTop = style.curtain ? 3 : fh * 0.22;
      const padBottom = style.curtain ? 3 : fh * 0.28;
      const wx = x + padX;
      const wy = y + padTop;
      const ww = cw - padX * 2;
      const wh = fh - padTop - padBottom;
      if (lit) {
        if (rng() < 0.42) {
          const warm = rng() < 0.75;
          const v = 0.55 + rng() * 0.45;
          g.fillStyle = warm ? `rgba(255,${190 + rng() * 40 | 0},${110 + rng() * 50 | 0},${v})` : `rgba(150,${200 + rng() * 40 | 0},255,${v})`;
          g.fillRect(wx, wy, ww, wh);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          if (rng() < 0.4) g.fillRect(wx + ww * rng() * 0.6, wy, ww * 0.25, wh);
        }
        continue;
      }
      g.fillStyle = style.frame;
      g.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grad.addColorStop(0, style.glass);
      grad.addColorStop(0.55, shade(style.glass, 40));
      grad.addColorStop(1, style.glass);
      g.fillStyle = grad;
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(wx, wy, ww * 0.18, wh);
      if (style.shutters) {
        g.fillStyle = '#5e8f7e';
        g.fillRect(wx - 7, wy - 2, 5, wh + 4);
        g.fillRect(wx + ww + 2, wy - 2, 5, wh + 4);
      }
      if (style.balconies) {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.fillRect(wx - 4, wy + wh, ww + 8, 4);
        g.fillStyle = 'rgba(80,110,130,0.6)';
        for (let b = wx - 2; b < wx + ww + 4; b += 4) g.fillRect(b, wy + wh - 8, 1, 8);
      }
    }
    if (!lit && style.band) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(0, f * fh + fh - 3, S, 3);
    }
  }
  if (!lit && style.deco) {
    g.fillStyle = 'rgba(64,196,190,0.55)';
    g.fillRect(0, 0, S, 6);
    g.fillRect(0, S / 2, S, 3);
  }
  // Plain wall swatch for roofs (sampled at uv ~0.01, 0.01 = bottom-left).
  g.fillStyle = lit ? '#000' : style.wall;
  g.fillRect(0, S - 6, 6, 6);
  return c;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const gg = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${gg},${b})`;
}

export function facadeTextures(styleIndex) {
  return memo(`facade${styleIndex}`, () => {
    const style = FACADE_STYLES[styleIndex];
    return { map: toTexture(paintFacade(style, false)), lit: toTexture(paintFacade(style, true)) };
  });
}

/** Asphalt carriageway 20 m wide: kerb lines and a double yellow centre line, repeating along v. */
export function roadTexture() {
  return memo('road', () => {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    const rng = createRandom(4);
    g.fillStyle = '#3a3d44';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 2600, rng, ['#2f3238', '#454850', '#34373d', '#4b4e55'], 2);
    g.fillStyle = 'rgba(20,20,24,0.25)';
    g.fillRect(64, 0, 26, 256);
    g.fillRect(166, 0, 26, 256);
    g.fillStyle = '#e8e6df';
    g.fillRect(10, 0, 4, 256);
    g.fillRect(242, 0, 4, 256);
    g.fillStyle = '#f2c230';
    g.fillRect(122, 0, 4, 256);
    g.fillRect(130, 0, 4, 256);
    return toTexture(c);
  });
}

/** Intersection square with zebra crossings on all four sides. */
export function intersectionTexture() {
  return memo('cross', () => {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    const rng = createRandom(5);
    g.fillStyle = '#3a3d44';
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 2600, rng, ['#2f3238', '#454850', '#34373d'], 2);
    g.fillStyle = '#ecebe6';
    for (let k = 20; k < 236; k += 18) {
      g.fillRect(k, 4, 10, 30);
      g.fillRect(k, 222, 10, 30);
      g.fillRect(4, k, 30, 10);
      g.fillRect(222, k, 30, 10);
    }
    return toTexture(c, { repeat: false });
  });
}

export function sidewalkTexture() {
  return memo('sidewalk', () => {
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    const rng = createRandom(6);
    g.fillStyle = '#c9c1b4';
    g.fillRect(0, 0, 128, 128);
    speckle(g, 128, 128, 500, rng, ['#bdb5a8', '#d4ccbf'], 2);
    g.strokeStyle = 'rgba(90,80,70,0.35)';
    g.lineWidth = 2;
    for (let k = 0; k <= 128; k += 32) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.stroke();
      g.beginPath(); g.moveTo(0, k); g.lineTo(128, k); g.stroke();
    }
    return toTexture(c);
  });
}

export function groundTexture(kind) {
  return memo(`ground-${kind}`, () => {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    const rng = createRandom(kind.length * 31);
    const palettes = {
      grass: ['#6f9a4a', '#7aa653', '#668f43', '#86b35d', '#5f8740'],
      sand: ['#ead8ae', '#f1e2bd', '#e3cf9f', '#f6e9c9', '#dcc797'],
      plaza: ['#d9cbb6', '#cfc0aa', '#e3d6c3', '#c8b8a0'],
      dirt: ['#a08f78', '#958470', '#ab9a82', '#8c7b66'],
    };
    const pal = palettes[kind];
    g.fillStyle = pal[0];
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 6000, rng, pal, kind === 'sand' ? 2 : 3);
    if (kind === 'plaza') {
      g.strokeStyle = 'rgba(120,100,80,0.25)';
      for (let k = 0; k <= 256; k += 32) {
        g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke();
        g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke();
      }
    }
    return toTexture(c);
  });
}

/** Soft white radial falloff used by every additive glow sprite. */
export function glowTexture() {
  return memo('glow', () => {
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return toTexture(c, { repeat: false });
  });
}

/** Puffy smoke particle. */
export function smokeTexture() {
  return memo('smoke', () => {
    const c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    const rng = createRandom(9);
    for (let i = 0; i < 14; i += 1) {
      const x = 20 + rng() * 24, y = 20 + rng() * 24, r = 10 + rng() * 14;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return toTexture(c, { repeat: false });
  });
}

/** A neon sign: glowing script on a transparent board. */
export function neonSignTexture(text, color, accent = '#ffffff') {
  return memo(`neon-${text}-${color}`, () => {
    const c = makeCanvas(512, 128);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,6,20,0.85)';
    roundRect(g, 6, 6, 500, 116, 18);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.shadowColor = color;
    g.shadowBlur = 18;
    roundRect(g, 12, 12, 488, 104, 14);
    g.stroke();
    g.font = 'bold italic 64px "Trebuchet MS", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = accent;
    g.shadowBlur = 26;
    g.fillText(text, 256, 68, 460);
    g.shadowBlur = 0;
    g.fillStyle = color;
    g.globalAlpha = 0.55;
    g.fillText(text, 256, 68, 460);
    return toTexture(c, { repeat: false });
  });
}

/** Billboard art for the city's own (fictional) brands. */
export const BILLBOARD_ADS = [
  { title: 'SUNDROP', sub: 'Citrus Soda · Taste the Coast', a: '#ff7b39', b: '#ffd23f', ink: '#2b0f3a' },
  { title: 'PALMITA', sub: 'Cerveza de la Bahía', a: '#0f8b8d', b: '#a8e6cf', ink: '#ffffff' },
  { title: 'ORBIT BURGER', sub: 'Out of this world. 24/7', a: '#e63946', b: '#f1c453', ink: '#ffffff' },
  { title: 'KESSANE REALTY', sub: 'Own the Skyline', a: '#14213d', b: '#fca311', ink: '#ffffff' },
  { title: 'VELVET CLUB', sub: 'Calle Lumen · Every Night', a: '#3a0ca3', b: '#f72585', ink: '#ffffff' },
  { title: 'HALCYON MOTORS', sub: 'The new Vireo GT', a: '#023047', b: '#8ecae6', ink: '#ffffff' },
  { title: 'RADIO SAL 99.1', sub: 'Solenne’s Sound', a: '#7b2cbf', b: '#ff9e00', ink: '#ffffff' },
  { title: 'CORALINA', sub: 'Beachfront Hotel & Spa', a: '#ff99c8', b: '#fcf6bd', ink: '#3d2c8d' },
];

export function billboardTexture(index) {
  return memo(`bill${index}`, () => {
    const ad = BILLBOARD_ADS[index % BILLBOARD_ADS.length];
    const c = makeCanvas(512, 256);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 512, 256);
    grad.addColorStop(0, ad.a);
    grad.addColorStop(1, ad.b);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath();
    g.arc(420, 70, 90, 0, Math.PI * 2);
    g.fill();
    for (let k = 0; k < 5; k += 1) {
      g.fillStyle = `rgba(255,255,255,${0.08 + k * 0.03})`;
      g.fillRect(0, 170 + k * 14, 512, 6);
    }
    g.fillStyle = ad.ink;
    g.font = 'bold 76px Impact, "Arial Black", sans-serif';
    g.textBaseline = 'middle';
    g.fillText(ad.title, 28, 96, 460);
    g.font = 'italic 30px "Trebuchet MS", sans-serif';
    g.fillText(ad.sub, 32, 168, 450);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 8;
    g.strokeRect(4, 4, 504, 248);
    return toTexture(c, { repeat: false });
  });
}

/** Palm frond: a feathered leaf on transparency. */
export function palmLeafTexture() {
  return memo('palmleaf', () => {
    const c = makeCanvas(128, 256);
    const g = c.getContext('2d');
    g.strokeStyle = '#4c6b2a';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
    for (let y = 8; y < 250; y += 7) {
      const len = 58 * Math.sin((y / 256) * Math.PI) + 6;
      g.strokeStyle = y % 14 ? '#5f8f33' : '#6fa23c';
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(64, y); g.lineTo(64 - len, y + 18); g.stroke();
      g.beginPath(); g.moveTo(64, y); g.lineTo(64 + len, y + 18); g.stroke();
    }
    return toTexture(c, { repeat: false });
  });
}

/** Portrait painter for the dialogue box: a stylised face from a few parameters. */
export function portraitDataUrl(p) {
  const c = makeCanvas(96, 96);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 96, 96);
  grad.addColorStop(0, p.bg[0]);
  grad.addColorStop(1, p.bg[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  g.fillStyle = p.shirt;
  g.beginPath(); g.ellipse(48, 100, 40, 30, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = p.skin;
  g.fillRect(40, 58, 16, 14);
  g.beginPath(); g.ellipse(48, 44, 20, 24, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = p.hair;
  if (p.hairStyle === 'long') { g.fillRect(26, 30, 44, 44); g.fillStyle = p.skin; g.beginPath(); g.ellipse(48, 46, 17, 21, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = p.hair; }
  if (p.hairStyle !== 'bald') { g.beginPath(); g.ellipse(48, 26, 21, 12, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(27, 24, 42, 8); }
  if (p.hairStyle === 'bun') { g.beginPath(); g.arc(48, 12, 8, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#1b1b1b';
  g.fillRect(39, 42, 5, 3);
  g.fillRect(52, 42, 5, 3);
  if (p.shades) { g.fillStyle = '#111'; g.fillRect(34, 39, 28, 8); g.fillStyle = 'rgba(120,200,255,0.6)'; g.fillRect(36, 40, 9, 3); }
  if (p.beard) { g.fillStyle = p.hair; g.beginPath(); g.ellipse(48, 60, 14, 8, 0, 0, Math.PI); g.fill(); }
  g.fillStyle = '#8a3b3b';
  g.fillRect(43, 56, 10, 2);
  if (p.badge) { g.fillStyle = '#f2c230'; g.beginPath(); g.arc(30, 84, 6, 0, Math.PI * 2); g.fill(); }
  return c.toDataURL();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
