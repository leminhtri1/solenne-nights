// Builds the mainland city block by block. Each district has its own rules: glass towers in
// Meridian Heights, a continuous neon-lit street wall in Calle Lumen, pastel hotels on Palmera
// Beach, bungalows in Coral Flats, warehouses at Port Sable. Buildings are merged per facade
// style and per chunk; every one also becomes a collision box.
import * as THREE from 'three';
import { MeshBuilder, CITY_TILE } from '../render/meshBuilder.js';
import { FACADE_STYLES, facadeTextures, sidewalkTexture, groundTexture } from '../render/proceduralTextures.js';
import { createRandom, hash2 } from '../core/seededRandom.js';
import {
  GRID_LINES, GRID_COUNT, ROAD_WIDTH, SIDEWALK, blockBounds, districtAt, PARK_BLOCKS, blockOfPlace,
} from './cityLayout.js';

const STYLE = Object.fromEntries(FACADE_STYLES.map((s, i) => [s.id, i]));
const PASTELS = [0xffd6e0, 0xc1f0e5, 0xffe5b4, 0xd7c8ff, 0xbde0fe, 0xfff1c1, 0xffc8a2, 0xe2f0cb, 0xffffff, 0xf9d5bb];
const GLASS_TINTS = [0xbfd8ff, 0x9fd3d8, 0xd8e2ec, 0xa9c0e8, 0xffffff, 0xc7f0ff];
const NEON_WORDS = [
  ['VELVET', '#ff3fa4'], ['LUMEN BAR', '#3ff2ff'], ['CASA FUEGO', '#ff7a1a'], ['PIXEL PALMS', '#b06bff'],
  ['NOCHE AZUL', '#2f8cff'], ['TACOS 24H', '#ffe14a'], ['KARAOKE', '#ff4f6d'], ['MOTEL SOLARIS', '#ff9e3d'],
  ['DISCO MAREA', '#4dffb8'], ['BAILA', '#ff3fd0'], ['ORQUÍDEA', '#d36bff'], ['LUCKY 7', '#ff2f2f'],
  ['BODEGA', '#7dff6b'], ['CAFÉ BRISA', '#5fe0ff'], ['SALSA ROJA', '#ff5050'], ['NEÓN 88', '#ffffff'],
];

export class CityGenerator {
  constructor({ scene, collision, props, glow, seed = 7 }) {
    this.scene = scene;
    this.collision = collision;
    this.props = props;
    this.glow = glow;
    this.rng = createRandom(seed);
    this.chunks = new Map();
    this.base = new MeshBuilder({ tile: CITY_TILE });
    this.lots = { grass: new MeshBuilder({ tile: CITY_TILE }), plaza: new MeshBuilder({ tile: CITY_TILE }), dirt: new MeshBuilder({ tile: CITY_TILE }) };
    this.detail = new MeshBuilder({ tile: CITY_TILE });
    this.buildingCount = 0;
    this.neonIndex = 0;
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.windowMaterials = [];
  }

  chunkBuilder(style, x, z) {
    const key = `${style}:${Math.floor(x / CITY_TILE)}:${Math.floor(z / CITY_TILE)}`;
    if (!this.chunks.has(key)) this.chunks.set(key, { style, builder: new MeshBuilder() });
    return this.chunks.get(key).builder;
  }

  /** One building: facade box + collision + optional roof clutter. */
  building(x, z, sx, sz, h, styleId, color, { roof = true, baseY = 0 } = {}) {
    const style = STYLE[styleId];
    this.chunkBuilder(style, x, z).addFacadeBox(x, baseY, z, sx, h, sz, color);
    this.collision.addCentered(x, z, sx, sz, baseY + h, 'building');
    this.buildingCount += 1;
    if (!roof) return;
    const rng = this.rng;
    const top = baseY + h;
    this.detail.addBox(x, top + 0.4, z, sx + 0.6, 0.8, sz + 0.6, 0xd8d2c8);
    const units = Math.floor(rng() * 3) + 1;
    for (let u = 0; u < units; u += 1) {
      const ux = x + (rng() - 0.5) * sx * 0.6, uz = z + (rng() - 0.5) * sz * 0.6;
      if (rng() < 0.4) this.detail.addCylinder(ux, top + 2.2, uz, 1.4, 1.4, 3.2, 0x8a6f58, 8);
      else this.detail.addBox(ux, top + 1.2, uz, 2.5, 1.6, 2, 0xa7adb3);
    }
    if (h > 60 && rng() < 0.6) this.detail.addCylinder(x, top + 9, z, 0.15, 0.3, 16, 0x9aa0a8, 5);
    if (h > 60) this.glow.push(x, top + (h > 60 ? 17 : 1), z, 0xff3030, 6, 0, 0.9);
  }

  /** Street-level awning and shop band along one face. */
  shopfront(x, z, width, yaw, color) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.detail.addBox(x + fx * 1.3, 4.2, z + fz * 1.3, Math.abs(fz) * width + Math.abs(fx) * 2.6, 0.3, Math.abs(fx) * width + Math.abs(fz) * 2.6, color);
    this.glow.push(x + fx * 1.5, 3.2, z + fz * 1.5, 0xffd9a0, width * 0.7, 1, 0.35);
  }

  generate() {
    for (let i = 0; i < GRID_COUNT - 1; i += 1) {
      for (let j = 0; j < GRID_COUNT - 1; j += 1) this.generateBlock(i, j);
    }
    this.streetFurniture();
    return this.buildMeshes();
  }

  generateBlock(i, j) {
    const b = blockBounds(i, j);
    // raised sidewalk slab under the whole block, lot surface on top
    const sx0 = GRID_LINES[i] + ROAD_WIDTH / 2, sx1 = GRID_LINES[i + 1] - ROAD_WIDTH / 2;
    const sz0 = GRID_LINES[j] + ROAD_WIDTH / 2, sz1 = GRID_LINES[j + 1] - ROAD_WIDTH / 2;
    this.base.addBox((sx0 + sx1) / 2, 0.1, (sz0 + sz1) / 2, sx1 - sx0, 0.2, sz1 - sz0, 0xffffff, 0, (u, v, p) => [p.x / 6, p.z / 6]);
    const district = districtAt(b.cx, b.cz).id;
    const placeKey = blockOfPlace(i, j);
    const park = PARK_BLOCKS.has(`${i},${j}`);
    const lotKind = park ? 'plaza' : district === 'coral' ? 'grass' : district === 'sable' ? 'dirt' : 'plaza';
    this.lot(b, lotKind);
    const rng = createRandom(Math.floor(hash2(i, j, 99) * 1e9));
    if (placeKey) return this.placeBlock(placeKey, b, rng);
    if (park) return this.parkBlock(b, rng);
    const generators = {
      meridian: this.towerBlock, lumen: this.neonBlock, palmera: this.hotelBlock, coral: this.bungalowBlock,
      sable: this.warehouseBlock, azul: this.marinaFrontBlock, bellavista: this.midtownBlock,
    };
    (generators[district] || this.midtownBlock).call(this, b, rng, i, j);
  }

  lot(b, kind) {
    const m = new THREE.Matrix4().makeTranslation(b.cx, 0.215, b.cz)
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
      .multiply(new THREE.Matrix4().makeScale(b.x1 - b.x0, b.z1 - b.z0, 1));
    this.lots[kind].addGeometry(this.plane, m, 0xffffff, (u, v, p) => [p.x / 24, p.z / 24]);
  }

  towerBlock(b, rng) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const split = rng() < 0.5;
    const parcels = split
      ? [[b.x0 + w * 0.25, b.cz, w * 0.48, d], [b.x0 + w * 0.75, b.cz, w * 0.48, d]]
      : [[b.cx, b.cz, w, d]];
    for (const [px, pz, pw, pd] of parcels) {
      const podiumH = 8 + Math.floor(rng() * 2) * 4;
      const tint = rng.pick(GLASS_TINTS);
      this.building(px, pz, pw - 2, pd - 2, podiumH, 'office', 0xe8e4dc, { roof: false });
      this.shopfront(px, b.z0 + 1, pw * 0.8, Math.PI, 0x1f6f8b);
      const tw = pw * (0.55 + rng() * 0.25), td = pd * (0.45 + rng() * 0.3);
      const th = 50 + Math.floor(rng() * 9) * 14;
      const style = rng() < 0.6 ? 'tower' : 'glass';
      this.building(px, pz, tw, td, th, style, tint, { baseY: podiumH, roof: rng() < 0.5 });
      if (rng() < 0.5) this.building(px, pz, tw * 0.7, td * 0.7, 14 + rng() * 20, style, tint, { baseY: podiumH + th });
    }
  }

  neonBlock(b, rng) {
    // a continuous street wall around the block with neon at first-floor height
    const depth = 20;
    const sides = [
      { yaw: Math.PI, along: 'x', fixed: b.z0 + depth / 2, out: b.z0 },
      { yaw: 0, along: 'x', fixed: b.z1 - depth / 2, out: b.z1 },
      { yaw: -Math.PI / 2, along: 'z', fixed: b.x0 + depth / 2, out: b.x0 },
      { yaw: Math.PI / 2, along: 'z', fixed: b.x1 - depth / 2, out: b.x1 },
    ];
    for (const side of sides) {
      const lo = side.along === 'x' ? b.x0 : b.z0 + depth;
      const hi = side.along === 'x' ? b.x1 : b.z1 - depth;
      let cursor = lo;
      while (cursor < hi - 6) {
        const len = Math.min(hi - cursor, 14 + rng() * 14);
        const mid = cursor + len / 2;
        const h = 12 + Math.floor(rng() * 5) * 4;
        const style = rng.pick(['brick', 'stucco', 'deco', 'brick']);
        const color = rng.pick([0xffd1dc, 0xd0c4ff, 0xffe0b0, 0xc6f1ff, 0xffffff, 0xf4b6c2]);
        const [x, z] = side.along === 'x' ? [mid, side.fixed] : [side.fixed, mid];
        const [sx, sz] = side.along === 'x' ? [len - 0.6, depth] : [depth, len - 0.6];
        this.building(x, z, sx, sz, h, style, color);
        const [ox, oz] = side.along === 'x' ? [mid, side.out] : [side.out, mid];
        this.shopfront(ox, oz, len - 2, side.yaw, rng.pick([0xc2185b, 0x00838f, 0x6a1b9a, 0xe65100]));
        const fx = Math.sin(side.yaw), fz = Math.cos(side.yaw);
        if (rng() < 0.85) {
          const [word, color2] = NEON_WORDS[this.neonIndex++ % NEON_WORDS.length];
          this.props.neon(ox + fx * 0.2, 6.5 + rng() * 3, oz + fz * 0.2, side.yaw, word, color2, Math.min(len - 3, 11));
        }
        if (h >= 16 && rng() < 0.55) {
          const [word, color2] = NEON_WORDS[(this.neonIndex + 5) % NEON_WORDS.length];
          const edge = cursor + 1.2;
          const [bx, bz] = side.along === 'x' ? [edge, side.out] : [side.out, edge];
          this.props.blade(bx + fx * 0.2, Math.min(h - 4, 12), bz + fz * 0.2, side.yaw, word, color2, 7);
        }
        cursor += len;
      }
    }
    if (rng() < 0.5) this.props.billboard(b.cx, 12 + 16, b.z0 + depth / 2, Math.PI, Math.floor(rng() * 8), 16);
  }

  hotelBlock(b, rng, i) {
    const w = b.x1 - b.x0;
    const beachfront = i >= 10;
    const n = beachfront ? 2 : 1 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k += 1) {
      const pz = n === 1 ? b.cz : b.z0 + (b.z1 - b.z0) * (k + 0.5) / n;
      const pd = (b.z1 - b.z0) / n - 6;
      const h = 18 + Math.floor(rng() * 6) * 6 + (beachfront ? 12 : 0);
      const color = rng.pick(PASTELS);
      const style = rng() < 0.55 ? 'hotel' : 'deco';
      this.building(b.cx, pz, w * 0.7, pd, h, style, color);
      this.shopfront(b.cx, pz - pd / 2 - 0.2, w * 0.5, Math.PI, 0x0aa3a3);
      if (beachfront && rng() < 0.7) {
        const names = [['CORALINA', '#ff7ad9'], ['HOTEL MIRADOR', '#5fe0ff'], ['SOL Y MAR', '#ffd166'], ['LA PERLA', '#b48cff']];
        const [word, c] = names[(k + i) % names.length];
        this.props.neon(b.x1 - w * 0.15 + 0.3, h - 3, pz, Math.PI / 2, word, c, 12);
      }
    }
    this.props.palm(b.x0 + 4, b.z0 + 4); this.props.palm(b.x1 - 4, b.z1 - 4); this.props.palm(b.x1 - 4, b.z0 + 4);
  }

  bungalowBlock(b, rng) {
    for (let gx = 0; gx < 3; gx += 1) {
      for (let gz = 0; gz < 3; gz += 1) {
        if (rng() < 0.2) continue;
        const x = b.x0 + 12 + gx * 24, z = b.z0 + 12 + gz * 24;
        const w = 11 + rng() * 5, d = 10 + rng() * 5;
        const h = 4.5 + Math.floor(rng() * 2) * 3.5;
        this.building(x, z, w, d, h, 'stucco', rng.pick(PASTELS), { roof: false });
        // hipped roof slab in terracotta
        this.detail.addBox(x, h + 0.6, z, w + 1.4, 1.2, d + 1.4, 0xc4643a);
        this.detail.addBox(x, h + 1.5, z, w * 0.6, 0.8, d * 0.6, 0xb35a33);
        if (rng() < 0.35) this.detail.addBox(x + w * 0.9, 0.3, z, 6, 0.2, 4, 0x3fc6e8);
        if (rng() < 0.6) this.props.palm(x + w * 0.7, z - d * 0.7, 8 + rng() * 4);
      }
    }
  }

  warehouseBlock(b, rng) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    this.building(b.cx, b.z0 + d * 0.3, w - 6, d * 0.5, 10 + rng() * 6, 'warehouse', rng.pick([0xd9d2c3, 0xbcd4e6, 0xe8c9a8]));
    // container stacks
    const colors = [0xc0392b, 0x2471a3, 0x229954, 0xd68910, 0x7d3c98, 0x839192];
    for (let k = 0; k < 6; k += 1) {
      const x = b.x0 + 8 + k * 11, z = b.z1 - 14;
      const stack = 1 + Math.floor(rng() * 3);
      for (let s = 0; s < stack; s += 1) this.detail.addBox(x, 1.45 + s * 2.9, z, 2.6, 2.8, 12, rng.pick(colors));
      this.collision.addCentered(x, z, 2.6, 12, stack * 2.9, 'container');
    }
  }

  marinaFrontBlock(b, rng) {
    const w = b.x1 - b.x0;
    for (let k = 0; k < 2; k += 1) {
      const x = b.x0 + w * (0.27 + k * 0.46);
      const h = 9 + Math.floor(rng() * 3) * 4;
      this.building(x, b.cz, w * 0.42, (b.z1 - b.z0) * 0.7, h, rng() < 0.5 ? 'deco' : 'stucco', rng.pick(PASTELS));
      this.shopfront(x, b.z0 + 8, w * 0.35, Math.PI, 0x0fa3b1);
    }
    this.props.palm(b.x0 + 3, b.z0 + 3); this.props.palm(b.x1 - 3, b.z0 + 3);
  }

  midtownBlock(b, rng) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    for (let gx = 0; gx < 2; gx += 1) {
      for (let gz = 0; gz < 2; gz += 1) {
        const x = b.x0 + w * (0.25 + gx * 0.5), z = b.z0 + d * (0.25 + gz * 0.5);
        const h = 14 + Math.floor(rng() * 7) * 5;
        this.building(x, z, w * 0.46, d * 0.46, h, rng.pick(['stucco', 'brick', 'hotel', 'deco']), rng.pick(PASTELS));
        if (gz === 0) this.shopfront(x, b.z0, w * 0.4, Math.PI, rng.pick([0x00897b, 0xd81b60, 0xf9a825]));
      }
    }
    if (rng() < 0.3) this.props.billboard(b.x0 + w * 0.25, 14 + 20, b.z0 + d * 0.25, Math.PI, Math.floor(rng() * 8), 14);
  }

  parkBlock(b, rng) {
    for (let k = 0; k < 10; k += 1) this.props.palm(b.x0 + 6 + rng() * (b.x1 - b.x0 - 12), b.z0 + 6 + rng() * (b.z1 - b.z0 - 12), 9 + rng() * 5);
    this.detail.addCylinder(b.cx, 0.6, b.cz, 7, 7.5, 1.2, 0xe0d6c4, 16);
    this.detail.addCylinder(b.cx, 1.05, b.cz, 6.2, 6.2, 0.2, 0x3fb8e0, 16);
    this.detail.addCylinder(b.cx, 2.5, b.cz, 0.5, 0.9, 3, 0xe8e0d0, 8);
    this.collision.addCentered(b.cx, b.cz, 13, 13, 1.2, 'fountain');
    this.glow.push(b.cx, 3, b.cz, 0x7fe6ff, 10, 1, 0.5);
  }

  /** Story and shop buildings: each a recognisable silhouette with its sign. */
  placeBlock(key, b, rng) {
    const w = b.x1 - b.x0;
    const front = b.z0;
    const sign = (text, color, h, width = 12) => this.props.neon(b.cx, h, front - 0.2 + 0.2, Math.PI, text, color, width);
    switch (key) {
      case 'kessane': {
        this.building(b.cx, b.cz + 6, w - 8, 50, 14, 'office', 0xf3e7c9, { roof: false });
        this.building(b.cx, b.cz + 8, 34, 30, 200, 'tower', 0xffe2a0, { baseY: 14 });
        this.building(b.cx, b.cz + 8, 22, 20, 30, 'glass', 0xffe2a0, { baseY: 214 });
        sign('KESSANE', '#ffd166', 10, 18);
        break;
      }
      case 'laundromat': {
        this.building(b.cx, front + 12, w * 0.6, 22, 8, 'stucco', 0xffd6f0);
        this.building(b.cx, b.cz + 16, w - 6, 30, 18, 'brick', 0xe7c6ff);
        this.shopfront(b.cx, front, w * 0.5, Math.PI, 0xff4fa3);
        sign('LAVANDERÍA CELESTE', '#ff7ad9', 6.4, 16);
        break;
      }
      case 'garage': {
        this.building(b.cx, b.cz + 10, w - 8, 44, 11, 'warehouse', 0xffd9a8);
        this.detail.addBox(b.cx, 3.5, front + 12 - 22 + 9.9, 14, 7, 0.3, 0x3a3f47);
        sign("GIZMO'S GARAGE", '#ffb347', 9, 14);
        break;
      }
      case 'gunshop': {
        this.building(b.cx, front + 14, w * 0.55, 26, 9, 'brick', 0xd7b29a);
        this.building(b.cx, b.cz + 18, w - 6, 26, 22, 'stucco', 0xffe0c0);
        this.shopfront(b.cx, front, w * 0.4, Math.PI, 0x8b0000);
        sign('BRASS & BARREL', '#ff5050', 6.2, 13);
        break;
      }
      case 'customs': {
        this.building(b.cx, b.cz + 12, w - 10, 36, 12, 'warehouse', 0xc6f1ff);
        this.detail.addBox(b.cx, 4, front + 12 - 6 + 0.1, 16, 8, 0.3, 0x24323d);
        sign('CHROMATICA CUSTOMS', '#5ad1ff', 10, 16);
        break;
      }
      case 'safehouse': {
        this.building(b.cx, b.cz + 6, 30, 26, 10, 'hotel', 0xfff6ee);
        this.detail.addBox(b.cx, 10.6, b.cz + 6, 32, 1.2, 28, 0xc4643a);
        this.detail.addBox(b.cx + 22, 0.3, b.cz + 6, 10, 0.2, 16, 0x3fc6e8);
        sign('CASA AURORA', '#7dff9a', 6, 10);
        for (const dx of [-18, 18]) this.props.palm(b.cx + dx, front + 6, 11);
        break;
      }
      case 'radio': {
        this.building(b.cx, b.cz, w * 0.6, 40, 24, 'deco', 0xe6d0ff);
        this.detail.addCylinder(b.cx, 24 + 15, b.cz, 0.3, 0.8, 30, 0xd0d4dc, 4);
        this.glow.push(b.cx, 54.5, b.cz, 0xff3030, 6, 0, 1);
        sign('RADIO SAL 99.1', '#c38bff', 8, 14);
        break;
      }
      default:
        this.midtownBlock(b, rng);
    }
  }

  /** Lamps along every street, palms on the avenues, billboards on the boulevard. */
  streetFurniture() {
    const edgeOff = ROAD_WIDTH / 2 + SIDEWALK * 0.55;
    for (let i = 0; i < GRID_COUNT; i += 1) {
      const line = GRID_LINES[i];
      for (let v = GRID_LINES[0] + 25; v < GRID_LINES[GRID_COUNT - 1]; v += 50) {
        if (Math.abs(((v - GRID_LINES[0]) % 100) - 0) < 15) continue;
        const flip = ((v / 50) | 0) % 2 ? 1 : -1;
        // streets along z (x = line) and along x (z = line)
        if (line < 500) this.props.lamp(line + flip * edgeOff, v, -flip, 0);
        this.props.lamp(v, line + flip * edgeOff, 0, -flip);
      }
    }
    // palm-lined avenues: Avenida Meridian (x = 0), Calle del Sol (z = -300), and the coast road
    for (let v = -690; v <= 490; v += 20) {
      if (Math.abs(((v + 700) % 100)) < 14 || Math.abs(((v + 700) % 100) - 100) < 14) continue;
      for (const s of [-1, 1]) {
        this.props.palm(0 + s * (ROAD_WIDTH / 2 + 2.5), v, 10 + (v % 3));
        this.props.palm(v, -300 + s * (ROAD_WIDTH / 2 + 2.5), 10 + (v % 3));
      }
      this.props.palm(500 + ROAD_WIDTH / 2 + 3, v, 12 + ((v / 20) % 3));
    }
    let ad = 0;
    for (let z = -650; z <= 450; z += 100) this.props.billboard(526, 0, z + 40, -Math.PI / 2, ad++, 16);
  }

  buildMeshes() {
    const group = new THREE.Group();
    for (const { style, builder } of this.chunks.values()) {
      const tex = facadeTextures(style);
      if (!this.windowMaterials[style]) {
        this.windowMaterials[style] = new THREE.MeshStandardMaterial({
          map: tex.map, vertexColors: true, roughness: 0.62, metalness: style === STYLE.tower || style === STYLE.glass ? 0.35 : 0.05,
          emissive: 0xffffff, emissiveMap: tex.lit, emissiveIntensity: 0,
        });
      }
      const mesh = new THREE.Mesh(builder.build(), this.windowMaterials[style]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.add(this.base.buildTiles(new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.9 }), { receiveShadow: true }));
    for (const [kind, builder] of Object.entries(this.lots)) {
      if (!builder.vertexCount) continue;
      group.add(builder.buildTiles(new THREE.MeshStandardMaterial({ map: groundTexture(kind), roughness: 0.95 }), { receiveShadow: true }));
    }
    group.add(this.detail.buildTiles(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), { castShadow: true, receiveShadow: true }));
    return group;
  }

  /** Lit windows fade in as the sun goes down. */
  setNight(night) {
    for (const m of this.windowMaterials) if (m) m.emissiveIntensity = 0.05 + night * 1.6;
  }
}
