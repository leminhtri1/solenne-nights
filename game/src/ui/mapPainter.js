// Paints Solenne once onto an offscreen canvas in map style: the bay, beach, island, district
// tinted blocks, parks, the street grid, the causeway and the marina piers. The minimap and
// the full-screen map both draw from it. `toMap` converts world metres to canvas pixels.
import {
  GRID_LINES, GRID_COUNT, ROAD_WIDTH, LAND, BEACH, ISLAND, ISLAND_RING, BRIDGE, MARINA,
  blockBounds, districtAt, PARK_BLOCKS,
} from '../world/cityLayout.js';

export const MAP = { minX: -840, minZ: -860, size: 2040, px: 1428 };
export const MAP_SCALE = MAP.px / MAP.size;

export function toMap(x, z) {
  return [(x - MAP.minX) * MAP_SCALE, (z - MAP.minZ) * MAP_SCALE];
}

export function toWorld(px, py) {
  return [px / MAP_SCALE + MAP.minX, py / MAP_SCALE + MAP.minZ];
}

const DISTRICT_FILL = {
  meridian: '#3b4a66', lumen: '#5a3260', palmera: '#6a5240', coral: '#3d5a3c', sable: '#5a4a38', azul: '#2f5858', bellavista: '#5a4248', verano: '#4a4268',
};

export function paintCityMap() {
  const c = document.createElement('canvas');
  c.width = c.height = MAP.px;
  const g = c.getContext('2d');
  const s = MAP_SCALE;
  const rect = (x0, z0, x1, z1, fill) => {
    const [a, b] = toMap(x0, z0);
    g.fillStyle = fill;
    g.fillRect(a, b, (x1 - x0) * s, (z1 - z0) * s);
  };
  // water with a subtle depth gradient
  const water = g.createLinearGradient(0, 0, MAP.px, MAP.px);
  water.addColorStop(0, '#123a58');
  water.addColorStop(1, '#0b2a44');
  g.fillStyle = water;
  g.fillRect(0, 0, MAP.px, MAP.px);
  g.strokeStyle = 'rgba(120,200,255,0.06)';
  for (let k = 0; k < MAP.px; k += 18) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k - 300, MAP.px); g.stroke(); }
  // land, beach, island
  rect(LAND.minX - 60, LAND.minZ - 60, LAND.maxX, LAND.maxZ, '#2a2e36');
  rect(LAND.maxX, LAND.minZ - 60, BEACH.maxX - 20, LAND.maxZ + 10, '#d9c58c');
  rect(ISLAND.minX, ISLAND.minZ, ISLAND.maxX, ISLAND.maxZ, '#3e5a3a');
  rect(ISLAND.minX - 6, ISLAND.minZ - 6, ISLAND.maxX + 6, ISLAND.minZ, '#d9c58c');
  rect(ISLAND.minX - 6, ISLAND.maxZ, ISLAND.maxX + 6, ISLAND.maxZ + 6, '#d9c58c');
  // blocks tinted by district
  for (let i = 0; i < GRID_COUNT - 1; i += 1) {
    for (let j = 0; j < GRID_COUNT - 1; j += 1) {
      const b = blockBounds(i, j);
      const d = districtAt(b.cx, b.cz).id;
      const park = PARK_BLOCKS.has(`${i},${j}`);
      rect(b.x0 - 3, b.z0 - 3, b.x1 + 3, b.z1 + 3, '#4a4e58');
      rect(b.x0, b.z0, b.x1, b.z1, park ? '#3f7a45' : DISTRICT_FILL[d] || '#444');
      if (!park) {
        g.fillStyle = 'rgba(255,255,255,0.06)';
        const [a, bb] = toMap(b.x0 + 8, b.z0 + 8);
        g.fillRect(a, bb, (b.x1 - b.x0 - 16) * s, (b.z1 - b.z0 - 16) * s);
      }
    }
  }
  // roads
  const road = (x0, z0, x1, z1, w, color) => {
    const [a, b] = toMap(x0, z0);
    const [c2, d] = toMap(x1, z1);
    g.strokeStyle = color;
    g.lineWidth = w * s;
    g.lineCap = 'square';
    g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke();
  };
  const lo = GRID_LINES[0], hi = GRID_LINES[GRID_COUNT - 1];
  for (const v of GRID_LINES) {
    const avenueX = v === 0 || v === 500;
    const avenueZ = v === -300;
    road(v, lo, v, hi, ROAD_WIDTH, avenueX ? '#f2d68a' : '#c9ced8');
    road(lo, v, hi, v, ROAD_WIDTH, avenueZ ? '#f2d68a' : '#c9ced8');
  }
  road(BRIDGE.fromX - 60, BRIDGE.z, ISLAND_RING.minX, BRIDGE.z, ROAD_WIDTH + 6, '#f2d68a');
  const r = ISLAND_RING;
  road(r.minX, r.minZ, r.maxX, r.minZ, ROAD_WIDTH, '#c9ced8');
  road(r.maxX, r.minZ, r.maxX, r.maxZ, ROAD_WIDTH, '#c9ced8');
  road(r.maxX, r.maxZ, r.minX, r.maxZ, ROAD_WIDTH, '#c9ced8');
  road(r.minX, r.maxZ, r.minX, r.minZ, ROAD_WIDTH, '#c9ced8');
  // pier and marina piers
  road(LAND.maxX + 10, -100, BEACH.maxX + 150, -100, 16, '#b08a5e');
  for (let x = MARINA.minX + 30; x <= MARINA.maxX - 20; x += 60) road(x, LAND.maxZ, x, LAND.maxZ + 150, 6, '#b08a5e');
  return c;
}
