// The plan of Solenne: a grid of avenues on the mainland, the Palmera beach and the ocean to
// the east, the Puerto Azul marina and the Port Sable docks on the south shore, and Isla Verano
// out in the bay, reached over the Halcyon Causeway. Everything else (roads, buildings, AI paths,
// the minimap) is derived from these numbers.

export const ROAD_WIDTH = 20;
export const LANE_OFFSET = 5;
export const SIDEWALK = 5;
export const GRID_STEP = 100;
/** Road centre lines on the mainland, both axes. */
export const GRID_MIN = -700;
export const GRID_MAX = 500;
export const GRID_LINES = [];
for (let v = GRID_MIN; v <= GRID_MAX; v += GRID_STEP) GRID_LINES.push(v);
export const GRID_COUNT = GRID_LINES.length;

export const LAND = { minX: -780, maxX: 540, minZ: -780, maxZ: 545 };
export const BEACH = { minX: 540, maxX: 660 };
export const WATER_LEVEL = -3;
export const ISLAND = { minX: 820, maxX: 1140, minZ: -470, maxZ: -150 };
export const BRIDGE = { z: -300, fromX: 560, toX: 830, deckY: 0 };
/** The marina basin cut into the south shore. */
export const MARINA = { minX: 120, maxX: 420, minZ: 545, maxZ: 760 };
export const WORLD_HALF = 1300;

export const DISTRICTS = [
  { id: 'meridian', name: 'Meridian Heights', color: '#7fd1ff', tag: 'Downtown towers' },
  { id: 'lumen', name: 'Calle Lumen', color: '#ff4fa3', tag: 'Neon nightlife strip' },
  { id: 'palmera', name: 'Palmera Beach', color: '#ffd166', tag: 'Hotels and boardwalk' },
  { id: 'coral', name: 'Coral Flats', color: '#8be28b', tag: 'Bungalows and palms' },
  { id: 'sable', name: 'Port Sable', color: '#c49a6c', tag: 'Docks and warehouses' },
  { id: 'azul', name: 'Puerto Azul', color: '#5fe0d0', tag: 'Marina and yachts' },
  { id: 'bellavista', name: 'Bellavista', color: '#ffa36b', tag: 'Pastel midtown' },
  { id: 'verano', name: 'Isla Verano', color: '#b48cff', tag: 'Island villas' },
  { id: 'bay', name: 'Bahía Solenne', color: '#4aa8ff', tag: 'Open water' },
];
const BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

/** Which district a point lies in. */
export function districtAt(x, z) {
  if (x >= ISLAND.minX - 40 && x <= ISLAND.maxX + 40 && z >= ISLAND.minZ - 40 && z <= ISLAND.maxZ + 40) return BY_ID.verano;
  if (x > BEACH.maxX + 20 || z > LAND.maxZ + 20) {
    if (x >= MARINA.minX - 40 && x <= MARINA.maxX + 60 && z < MARINA.maxZ + 40) return BY_ID.azul;
    if (Math.abs(z - BRIDGE.z) < 30 && x < ISLAND.minX) return BY_ID.bay;
    return BY_ID.bay;
  }
  if (x > 250) return BY_ID.palmera;
  if (z < -450) return BY_ID.coral;
  if (x < -350 && z > 150) return BY_ID.sable;
  if (x > -50 && z > 250) return BY_ID.azul;
  if (x >= -250 && x <= 150 && z >= -450 && z <= -50) return BY_ID.meridian;
  if (x >= -560 && x < -250 && z >= -450 && z <= 60) return BY_ID.lumen;
  return BY_ID.bellavista;
}

/** Ground height and surface kind at a point: 'road' and 'lot' are land, 'sand', 'water'. */
export function surfaceAt(x, z) {
  if (isOnBridge(x, z)) return 'bridge';
  if (x >= ISLAND.minX && x <= ISLAND.maxX && z >= ISLAND.minZ && z <= ISLAND.maxZ) return 'land';
  if (x >= MARINA.minX && x <= MARINA.maxX && z >= LAND.maxZ - 5) return 'water';
  if (x >= LAND.minX && x <= LAND.maxX && z >= LAND.minZ && z <= LAND.maxZ) return 'land';
  if (x > LAND.maxX && x <= BEACH.maxX && z >= LAND.minZ && z <= LAND.maxZ + 10) return 'sand';
  return 'water';
}

export function isOnBridge(x, z) {
  return Math.abs(z - BRIDGE.z) <= ROAD_WIDTH * 0.6 && x >= BRIDGE.fromX - 30 && x <= BRIDGE.toX + 10;
}

/** Height of the drivable surface: 0 on land, raised on the causeway deck, sloping down the beach. */
export function groundHeight(x, z) {
  const s = surfaceAt(x, z);
  if (s === 'bridge') return 0.6;
  if (s === 'sand') return -Math.max(0, (x - (LAND.maxX + 15)) / (BEACH.maxX - LAND.maxX - 15)) * 3.4;
  if (s === 'water') return WATER_LEVEL;
  return 0;
}

export function isLandOrBridge(x, z) {
  return surfaceAt(x, z) !== 'water';
}

/** Index of the nearest grid line to v, or -1 if none is within `tolerance`. */
export function nearestLine(v, tolerance = ROAD_WIDTH / 2) {
  const i = Math.round((v - GRID_MIN) / GRID_STEP);
  if (i < 0 || i >= GRID_COUNT) return -1;
  return Math.abs(GRID_LINES[i] - v) <= tolerance ? i : -1;
}

/** True when the point is on a mainland or island carriageway. */
export function isOnRoad(x, z) {
  if (isOnBridge(x, z)) return true;
  if (onIslandRoad(x, z)) return true;
  if (x < LAND.minX + 10 || x > LAND.maxX + 5 || z < LAND.minZ + 10 || z > LAND.maxZ) return false;
  return nearestLine(x) >= 0 || nearestLine(z) >= 0;
}

/** The island's ring road: a rectangle inset from the shore, plus the causeway's landing spur. */
export const ISLAND_RING = { minX: ISLAND.minX + 40, maxX: ISLAND.maxX - 40, minZ: ISLAND.minZ + 40, maxZ: ISLAND.maxZ - 40 };
export function onIslandRoad(x, z) {
  const r = ISLAND_RING;
  const h = ROAD_WIDTH / 2;
  const inX = x >= r.minX - h && x <= r.maxX + h;
  const inZ = z >= r.minZ - h && z <= r.maxZ + h;
  if (inX && (Math.abs(z - r.minZ) <= h || Math.abs(z - r.maxZ) <= h)) return true;
  if (inZ && (Math.abs(x - r.minX) <= h || Math.abs(x - r.maxX) <= h)) return true;
  return Math.abs(z - BRIDGE.z) <= h && x >= ISLAND.minX - 10 && x <= r.minX;
}

/** Block (lot) index ranges: block (i, j) lies between grid lines i..i+1 and j..j+1. */
export function blockBounds(i, j) {
  const x0 = GRID_LINES[i] + ROAD_WIDTH / 2 + SIDEWALK;
  const x1 = GRID_LINES[i + 1] - ROAD_WIDTH / 2 - SIDEWALK;
  const z0 = GRID_LINES[j] + ROAD_WIDTH / 2 + SIDEWALK;
  const z1 = GRID_LINES[j + 1] - ROAD_WIDTH / 2 - SIDEWALK;
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/**
 * Named places: story contacts, shops and the safehouse. Each sits on a block whose buildings
 * leave room for it; `door` is where the player stands to use it.
 */
export const PLACES = {
  safehouse: { name: 'Casa Aurora Safehouse', block: [10, 4], icon: 'H', color: '#7dff9a' },
  laundromat: { name: 'Lavandería Celeste', block: [3, 5], icon: 'C', color: '#ff7ad9' },
  garage: { name: "Gizmo's Chop Garage", block: [1, 9], icon: 'G', color: '#ffb347' },
  gunshop: { name: 'Brass & Barrel Arms', block: [2, 3], icon: '$', color: '#ff5050' },
  customs: { name: 'Chromatica Customs', block: [6, 7], icon: 'P', color: '#5ad1ff' },
  kessane: { name: 'Kessane Tower', block: [6, 4], icon: 'K', color: '#ffd166' },
  radio: { name: 'Radio Sal 99.1 Studio', block: [10, 7], icon: 'R', color: '#c38bff' },
  marina: { name: 'Puerto Azul Docks', block: null, door: [270, 535], icon: 'M', color: '#5fe0d0' },
  lighthouse: { name: 'Faro Verano', block: null, door: [1100, -172], icon: 'L', color: '#b48cff' },
  villa: { name: 'Villa Kessane', block: null, door: [980, -400], icon: 'V', color: '#ffd166' },
};
// A place on a block has its door on the block's north sidewalk, facing the avenue.
for (const place of Object.values(PLACES)) {
  if (!place.block) continue;
  const b = blockBounds(place.block[0], place.block[1]);
  place.door = [b.cx, b.z0 - 2];
}

export function blockOfPlace(i, j) {
  for (const [key, place] of Object.entries(PLACES)) {
    if (place.block && place.block[0] === i && place.block[1] === j) return key;
  }
  return null;
}

/** Blocks kept open as palm plazas and parks. */
export const PARK_BLOCKS = new Set(['5,2', '3,9', '9,1', '0,0', '10,8']);
