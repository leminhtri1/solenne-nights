// Paints Solenne once onto an offscreen canvas in bright tourist-map style: a blue bay with a
// shallow turquoise shelf, sand beaches, district-tinted blocks with every building footprint
// (shaded by height), green parks and palms, white streets with gold avenues, the causeway and
// the marina piers. The minimap and the full-screen map both draw from it. `toMap` converts
// world metres to canvas pixels.
import {
  GRID_LINES, GRID_COUNT, ROAD_WIDTH, LAND, BEACH, ISLAND, ISLAND_RING, BRIDGE, MARINA,
  blockBounds, districtAt, PARK_BLOCKS,
} from '../world/cityLayout.js';

export const MAP = { minX: -840, minZ: -860, size: 2040, px: 2040 };
export const MAP_SCALE = MAP.px / MAP.size;

export function toMap(x, z) {
  return [(x - MAP.minX) * MAP_SCALE, (z - MAP.minZ) * MAP_SCALE];
}

export function toWorld(px, py) {
  return [px / MAP_SCALE + MAP.minX, py / MAP_SCALE + MAP.minZ];
}

/** Lot colour of each district (the ground between buildings). */
export const DISTRICT_FILL = {
  meridian: '#8fa8e8', lumen: '#d77acb', palmera: '#f5c46e', coral: '#f29a84', sable: '#c2a27a',
  azul: '#6fd6cf', bellavista: '#f4a9bd', verano: '#b69cf0',
};

/** Darken (k < 0) or lighten (k > 0) a #rrggbb colour. */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function paintCityMap(collision = null) {
  const c = document.createElement('canvas');
  c.width = c.height = MAP.px;
  const g = c.getContext('2d');
  const s = MAP_SCALE;
  const rect = (x0, z0, x1, z1, fill) => {
    const [a, b] = toMap(x0, z0);
    g.fillStyle = fill;
    g.fillRect(a, b, (x1 - x0) * s, (z1 - z0) * s);
  };
  paintWater(g, rect);
  // land, beach, island
  rect(LAND.minX - 60, LAND.minZ - 60, LAND.maxX, LAND.maxZ, '#e4ddd0');
  rect(LAND.maxX, LAND.minZ - 60, BEACH.maxX - 20, LAND.maxZ + 10, '#f6dc94');
  rect(BEACH.maxX - 40, LAND.minZ - 60, BEACH.maxX - 20, LAND.maxZ + 10, '#ead08a');
  rect(ISLAND.minX - 8, ISLAND.minZ - 8, ISLAND.maxX + 8, ISLAND.maxZ + 8, '#f6dc94');
  rect(ISLAND.minX, ISLAND.minZ, ISLAND.maxX, ISLAND.maxZ, '#86cf73');
  rect(MARINA.minX, MARINA.minZ - 4, MARINA.maxX, MARINA.maxZ, '#2f8fd0');
  // blocks tinted by district, parks with trees
  for (let i = 0; i < GRID_COUNT - 1; i += 1) {
    for (let j = 0; j < GRID_COUNT - 1; j += 1) {
      const b = blockBounds(i, j);
      const d = districtAt(b.cx, b.cz).id;
      if (PARK_BLOCKS.has(`${i},${j}`)) {
        rect(b.x0, b.z0, b.x1, b.z1, '#5fc35a');
        g.fillStyle = '#3e9d45';
        for (let k = 0; k < 18; k += 1) {
          const [tx, tz] = toMap(b.x0 + 6 + ((k * 37) % 58), b.z0 + 6 + ((k * 53) % 58));
          g.beginPath(); g.arc(tx, tz, 3.4 * s, 0, Math.PI * 2); g.fill();
        }
        rect(b.cx - 3, b.z0, b.cx + 3, b.z1, '#efe6cf');
        rect(b.x0, b.cz - 3, b.x1, b.cz + 3, '#efe6cf');
      } else {
        rect(b.x0, b.z0, b.x1, b.z1, DISTRICT_FILL[d] || '#ccc');
      }
    }
  }
  if (collision) paintFootprints(g, collision, s);
  paintRoads(g, s);
  return c;
}

function paintWater(g, rect) {
  const water = g.createLinearGradient(0, 0, MAP.px, MAP.px);
  water.addColorStop(0, '#2a86d1');
  water.addColorStop(1, '#155ea8');
  g.fillStyle = water;
  g.fillRect(0, 0, MAP.px, MAP.px);
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = 2;
  for (let k = 0; k < MAP.px * 1.3; k += 26) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k - 400, MAP.px); g.stroke(); }
  // a shallow turquoise shelf around every shore
  rect(LAND.minX - 90, LAND.minZ - 90, BEACH.maxX + 30, LAND.maxZ + 40, 'rgba(90,220,230,0.45)');
  rect(ISLAND.minX - 40, ISLAND.minZ - 40, ISLAND.maxX + 40, ISLAND.maxZ + 40, 'rgba(90,220,230,0.45)');
}

/** Buildings as darker blocks with a soft south-east shadow; palms as green dots. */
function paintFootprints(g, collision, s) {
  for (const box of collision.boxes) {
    const [a, b] = toMap(box.minX, box.minZ);
    const w = (box.maxX - box.minX) * s, h = (box.maxZ - box.minZ) * s;
    if (box.tag === 'palm') {
      g.fillStyle = '#2f9a48';
      g.beginPath(); g.arc(a + w / 2, b + h / 2, 3.2 * s, 0, Math.PI * 2); g.fill();
      continue;
    }
    if (box.tag !== 'building' && box.tag !== 'container') continue;
    const base = DISTRICT_FILL[districtAt((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2).id] || '#bbbbbb';
    const tall = Math.min(1, box.height / 70);
    const off = (1.5 + tall * 4) * s;
    g.fillStyle = 'rgba(30,20,50,0.28)';
    g.fillRect(a + off, b + off, w, h);
    g.fillStyle = box.tag === 'container' ? '#d2694a' : shade(base, -0.18 - tall * 0.3);
    g.fillRect(a, b, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(a, b, w, Math.max(1, 1.2 * s));
  }
}

function paintRoads(g, s) {
  const road = (x0, z0, x1, z1, w, color) => {
    const [a, b] = toMap(x0, z0);
    const [c2, d] = toMap(x1, z1);
    g.strokeStyle = color;
    g.lineWidth = w * s;
    g.lineCap = 'square';
    g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke();
  };
  const lo = GRID_LINES[0], hi = GRID_LINES[GRID_COUNT - 1];
  const r = ISLAND_RING;
  const ring = [[r.minX, r.minZ, r.maxX, r.minZ], [r.maxX, r.minZ, r.maxX, r.maxZ], [r.maxX, r.maxZ, r.minX, r.maxZ], [r.minX, r.maxZ, r.minX, r.minZ]];
  // a dark kerb line under every street, then the carriageway on top
  for (const pass of [0, 1]) {
    const widen = pass ? 0 : 4;
    for (const v of GRID_LINES) {
      const avenueX = v === 0 || v === 500;
      const avenueZ = v === -300;
      road(v, lo, v, hi, ROAD_WIDTH + widen, pass ? (avenueX ? '#ffd36e' : '#fbf8f1') : '#6d6578');
      road(lo, v, hi, v, ROAD_WIDTH + widen, pass ? (avenueZ ? '#ffd36e' : '#fbf8f1') : '#6d6578');
    }
    road(BRIDGE.fromX - 60, BRIDGE.z, r.minX, BRIDGE.z, ROAD_WIDTH + 6 + widen, pass ? '#ffd36e' : '#5a5266');
    for (const [a, b, c2, d] of ring) road(a, b, c2, d, ROAD_WIDTH + widen, pass ? '#fbf8f1' : '#6d6578');
  }
  // pier and marina piers
  road(LAND.maxX + 10, -100, BEACH.maxX + 150, -100, 16, '#b9885a');
  for (let x = MARINA.minX + 30; x <= MARINA.maxX - 20; x += 60) road(x, LAND.maxZ, x, LAND.maxZ + 150, 6, '#b9885a');
}
