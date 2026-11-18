// The set pieces around the grid: the mainland slab and its seawall, Palmera beach with its
// boardwalk, umbrellas and the Sundial Pier Ferris wheel, the cable-stayed Halcyon Causeway,
// Isla Verano with Villa Kessane and the Faro Verano lighthouse, the Puerto Azul marina with
// moored yachts, and the gantry cranes and freighter of Port Sable.
import * as THREE from 'three';
import { MeshBuilder } from '../render/meshBuilder.js';
import { groundTexture } from '../render/proceduralTextures.js';
import { LAND, BEACH, ISLAND, BRIDGE, MARINA, WATER_LEVEL, ROAD_WIDTH, ISLAND_RING } from './cityLayout.js';

export class Landmarks {
  constructor({ collision, props, glow, rng }) {
    this.collision = collision;
    this.props = props;
    this.glow = glow;
    this.rng = rng;
    this.solid = new MeshBuilder();
    this.sand = new MeshBuilder();
    this.grass = new MeshBuilder();
    this.wood = new MeshBuilder();
    this.wheel = null;
  }

  build() {
    this.mainland();
    this.beach();
    this.pier();
    this.causeway();
    this.island();
    this.marina();
    this.docks();
    return this.meshes();
  }

  mainland() {
    const depth = 8;
    const s = this.solid;
    s.addBox((LAND.minX + LAND.maxX) / 2, -depth / 2 - 0.01, (LAND.minZ + LAND.maxZ) / 2, LAND.maxX - LAND.minX, depth, LAND.maxZ - LAND.minZ, 0x8c8478);
    // seawall cap along the south shore
    s.addBox((LAND.minX + LAND.maxX) / 2, 0.25, LAND.maxZ - 0.8, LAND.maxX - LAND.minX, 0.5, 1.6, 0xd8d0c0);
    this.collision.addBox(LAND.minX, LAND.maxZ - 1.6, MARINA.minX - 2, LAND.maxZ, 1.2, 'wall');
    this.collision.addBox(MARINA.maxX + 2, LAND.maxZ - 1.6, LAND.maxX, LAND.maxZ, 1.2, 'wall');
    // the outer edges of the map: north and west are walled hills
    s.addBox(LAND.minX - 30, 12, 0, 60, 24, 1700, 0x7d8f5a);
    s.addBox(0, 12, LAND.minZ - 30, 1700, 24, 60, 0x7d8f5a);
    this.collision.addBox(LAND.minX - 60, -900, LAND.minX, 900, 30, 'wall');
    this.collision.addBox(-900, LAND.minZ - 60, 900, LAND.minZ, 30, 'wall');
  }

  beach() {
    const z0 = LAND.minZ, z1 = LAND.maxZ + 10;
    // sloping sand from the promenade down under the water line
    const geo = new THREE.PlaneGeometry(1, 1, 8, 1);
    const m = new THREE.Matrix4().makeTranslation((LAND.maxX + BEACH.maxX) / 2, 0, (z0 + z1) / 2)
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
      .multiply(new THREE.Matrix4().makeScale(BEACH.maxX - LAND.maxX + 40, z1 - z0, 1));
    this.sand.addGeometry(geo, m, 0xffffff, (u, v, p) => [p.x / 20, p.z / 20]);
    this.fixHeights(this.sand, (x) => -Math.max(0, (x - (LAND.maxX + 15)) / (BEACH.maxX - LAND.maxX - 15)) * 3.4 + 0.02);
    // boardwalk deck and railing along the promenade
    const bx = LAND.maxX + 7;
    this.wood.addBox(bx, 0.25, (z0 + z1) / 2, 9, 0.5, z1 - z0 - 20, 0xb08458, 0, (u, v, p) => [p.x / 3, p.z / 3]);
    for (let z = z0 + 20; z < z1 - 20; z += 4) this.wood.addBox(bx + 4.4, 1, z, 0.2, 1.1, 0.2, 0xf2ead8);
    this.wood.addBox(bx + 4.4, 1.55, (z0 + z1) / 2, 0.25, 0.15, z1 - z0 - 40, 0xf2ead8);
    // umbrellas, loungers, lifeguard towers
    const colors = [0xff5d73, 0xffd23f, 0x3bceac, 0x0ead69, 0x4cc9f0, 0xf72585, 0xff9f1c];
    const rng = this.rng;
    for (let z = z0 + 30; z < z1 - 30; z += 16 + rng() * 10) {
      const x = LAND.maxX + 26 + rng() * 40;
      const y = -Math.max(0, (x - (LAND.maxX + 15)) / (BEACH.maxX - LAND.maxX - 15)) * 3.4;
      const c = rng.pick(colors);
      this.solid.addCylinder(x, y + 1.3, z, 0.06, 0.06, 2.6, 0xeeeeee, 4);
      this.solid.addCylinder(x, y + 2.6, z, 0.05, 1.9, 0.7, c, 10);
      this.solid.addBox(x + 1.6, y + 0.3, z + 0.8, 0.9, 0.2, 2.1, 0xfafafa);
    }
    for (let z = z0 + 120; z < z1; z += 260) {
      const x = LAND.maxX + 40;
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.solid.addBox(x + dx * 1.2, 1.5, z + dz * 1.2, 0.2, 3, 0.2, 0xffffff);
      this.solid.addBox(x, 3.2, z, 3.2, 0.3, 3.2, 0xffffff);
      this.solid.addBox(x, 4.4, z, 2.8, 2.2, 2.8, 0xff4040);
      this.solid.addBox(x, 5.7, z, 3.4, 0.3, 3.4, 0xffffff);
    }
    for (let z = z0 + 40; z < z1 - 40; z += 34) this.props.palm(LAND.maxX + 14 + rng() * 10, z + rng() * 12, 11 + rng() * 4);
  }

  /** Re-level vertices appended by the last addGeometry so the sand follows the slope. */
  fixHeights(builder, heightFn) {
    for (let k = 0; k < builder.pos.length; k += 3) builder.pos[k + 1] = heightFn(builder.pos[k]);
  }

  pier() {
    const z = -100, x0 = LAND.maxX + 10, x1 = BEACH.maxX + 150;
    this.wood.addBox((x0 + x1) / 2, 1.2, z, x1 - x0, 0.6, 16, 0xa77b52, 0, (u, v, p) => [p.x / 3, p.z / 3]);
    for (let x = x0 + 10; x < x1; x += 12) {
      for (const s of [-7, 7]) this.solid.addCylinder(x, -2, z + s, 0.4, 0.4, 6, 0x6b5139, 6);
    }
    for (let x = x0; x < x1; x += 3) for (const s of [-7.8, 7.8]) this.wood.addBox(x, 2.0, z + s, 0.15, 1.0, 0.15, 0xffffff);
    for (let x = x0 + 6; x < x1; x += 18) for (const s of [-7.6, 7.6]) this.glow.push(x, 3.4, z + s, 0xffe0a0, 4, 1, 0.7);
    // Ferris wheel "Sundial" at the end of the pier
    const cx = x1 - 30, cy = 26;
    const wheel = new THREE.Group();
    const spokes = new MeshBuilder();
    const n = 16;
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
      spokes.addCylinder(Math.cos(a) * 11, Math.sin(a) * 11, 0, 0.15, 0.15, 22, 0xffffff, 4, q);
      const ca = a + Math.PI / n;
      spokes.addBox(Math.cos(ca) * 22, Math.sin(ca) * 22, 0, 2.2, 2.2, 3, [0xff5d73, 0xffd23f, 0x3bceac, 0x4cc9f0][k % 4]);
    }
    const ring = new THREE.TorusGeometry(22, 0.4, 6, 48);
    spokes.addGeometry(ring, new THREE.Matrix4(), 0xffffff);
    spokes.addGeometry(new THREE.TorusGeometry(11, 0.3, 6, 32), new THREE.Matrix4(), 0xffffff);
    const wheelMesh = new THREE.Mesh(spokes.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, emissive: 0xff66cc, emissiveIntensity: 0 }));
    wheel.add(wheelMesh);
    wheel.position.set(cx, cy, z);
    wheel.rotation.y = Math.PI / 2;
    this.wheel = wheel;
    this.wheelMaterial = wheelMesh.material;
    for (const s of [-1, 1]) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(s * 0.32, 0, 0));
      this.solid.addCylinder(cx, cy / 2, z + s * 4, 0.6, 0.8, cy + 2, 0xe8e8e8, 6, q);
    }
    for (let k = 0; k < 24; k += 1) {
      const a = (k / 24) * Math.PI * 2;
      this.glow.push(cx, cy + Math.sin(a) * 22, z + Math.cos(a) * 22, k % 2 ? 0xff4fd8 : 0x4fe8ff, 5, 1, 0.9);
    }
    this.collision.addBox(x0 + 5, z - 8.5, x1, z - 7.5, 3, 'rail');
    this.collision.addBox(x0 + 5, z + 7.5, x1, z + 8.5, 3, 'rail');
  }

  causeway() {
    const { z, fromX, toX } = BRIDGE;
    const len = toX - fromX + 30;
    const cx = (fromX + toX) / 2;
    const w = ROAD_WIDTH + 4;
    this.solid.addBox(cx, 0.3, z, len, 0.6, w, 0xc9c4ba);
    this.solid.addBox(cx, -0.6, z, len, 1.2, w - 2, 0x8f8a82);
    for (const s of [-1, 1]) {
      this.solid.addBox(cx, 1.1, z + s * (w / 2 - 0.3), len, 1.0, 0.5, 0xe8e2d6);
      this.collision.addBox(fromX - 15, z + s * (w / 2) - 0.6, toX + 15, z + s * (w / 2) + 0.6, 1.6, 'rail');
    }
    for (let x = fromX + 10; x < toX; x += 30) this.solid.addBox(x, -3, z, 4, 6, w - 6, 0xa59f94);
    // two A-frame pylons with fanned stay cables
    for (const px of [fromX + 80, toX - 80]) {
      for (const s of [-1, 1]) {
        this.solid.addBox(px, 24, z + s * (w / 2 + 1), 2.4, 48, 2.4, 0xf1ece2);
        this.collision.addCentered(px, z + s * (w / 2 + 1), 2.4, 2.4, 48, 'pylon');
      }
      this.solid.addBox(px, 46, z, 2.4, 2.4, w + 4.8, 0xf1ece2);
      this.solid.addBox(px, 30, z, 1.6, 1.6, w + 4.8, 0xf1ece2);
      this.glow.push(px, 49, z, 0xff3030, 5, 0, 1);
      for (const s of [-1, 1]) {
        for (let k = 1; k <= 6; k += 1) {
          for (const dir of [-1, 1]) {
            const ax = px, ay = 44 - k * 2.2, ex = px + dir * k * 13, ey = 1.6;
            const dx = ex - ax, dy = ey - ay;
            const length = Math.hypot(dx, dy);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, 0).normalize());
            this.solid.addCylinder((ax + ex) / 2, (ay + ey) / 2, z + s * (w / 2 + 1), 0.08, 0.08, length, 0xffffff, 4, q);
          }
        }
      }
    }
    for (let x = fromX; x <= toX; x += 22) for (const s of [-1, 1]) this.glow.push(x, 2.2, z + s * (w / 2), 0xbfe8ff, 3.5, 1, 0.8);
  }

  island() {
    const I = ISLAND;
    this.solid.addBox((I.minX + I.maxX) / 2, -4, (I.minZ + I.maxZ) / 2, I.maxX - I.minX, 8, I.maxZ - I.minZ, 0xd9c79a);
    const m = new THREE.Matrix4().makeTranslation((I.minX + I.maxX) / 2, 0.02, (I.minZ + I.maxZ) / 2)
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
      .multiply(new THREE.Matrix4().makeScale(I.maxX - I.minX - 12, I.maxZ - I.minZ - 12, 1));
    this.grass.addGeometry(new THREE.PlaneGeometry(1, 1), m, 0xffffff, (u, v, p) => [p.x / 24, p.z / 24]);
    const rng = this.rng;
    // Villa Kessane: a white modernist mansion with an infinity pool
    const vx = 980, vz = -340;
    const villa = (x, z, sx, sz, h, y = 0) => {
      this.solid.addBox(x, y + h / 2, z, sx, h, sz, 0xfaf7f0);
      this.collision.addCentered(x, z, sx, sz, y + h, 'building');
    };
    villa(vx, vz, 46, 26, 7);
    villa(vx + 8, vz - 4, 30, 18, 6, 7);
    this.solid.addBox(vx, 13.4, vz, 34, 0.4, 22, 0x333840);
    this.solid.addBox(vx - 6, 0.25, vz + 22, 30, 0.3, 12, 0x2fd0f0);
    this.solid.addBox(vx, 3.4, vz - 13.2, 40, 4.2, 0.2, 0x1d3a52);
    this.props.neon(vx, 9, vz - 13.4, Math.PI, 'VILLA KESSANE', '#ffd166', 12);
    for (let k = 0; k < 18; k += 1) this.props.palm(ISLAND_RING.minX + 20 + rng() * 200, ISLAND_RING.minZ + 20 + rng() * 200, 10 + rng() * 5);
    for (let k = 0; k < 6; k += 1) {
      const x = ISLAND_RING.minX + 30 + k * 38, z = ISLAND_RING.maxZ - 30;
      if (Math.abs(x - vx) < 40) continue;
      villa(x, z, 16, 14, 6 + (k % 2) * 3.5);
      this.solid.addBox(x, 6 + (k % 2) * 3.5 + 0.5, z, 17, 1, 15, 0xc4643a);
    }
    // ring-road lamps
    for (const [x0, z0, x1, z1] of [[ISLAND_RING.minX, ISLAND_RING.minZ, ISLAND_RING.maxX, ISLAND_RING.minZ], [ISLAND_RING.minX, ISLAND_RING.maxZ, ISLAND_RING.maxX, ISLAND_RING.maxZ]]) {
      for (let x = x0 + 20; x < x1; x += 40) this.props.lamp(x, z0 + 13, 0, -1, 0xffd9a0);
      void z1;
    }
    // Faro Verano lighthouse
    const lx = 1128, lz = -160;
    for (let k = 0; k < 6; k += 1) this.solid.addCylinder(lx, 3 + k * 6, lz, 3.4 - k * 0.3, 3.6 - k * 0.3, 6, k % 2 ? 0xd62828 : 0xffffff, 12);
    this.solid.addCylinder(lx, 37.5, lz, 2.2, 2.2, 3, 0x2a2a2a, 10);
    this.solid.addCylinder(lx, 40, lz, 0.2, 2.6, 2, 0xd62828, 10);
    this.collision.addCentered(lx, lz, 7, 7, 40, 'building');
    this.lighthouseGlow = { x: lx, y: 37.5, z: lz };
  }

  marina() {
    const z0 = LAND.maxZ;
    // basin edging and piers
    for (let x = MARINA.minX + 30; x <= MARINA.maxX - 20; x += 60) {
      this.wood.addBox(x, 0.3, z0 + 75, 6, 0.4, 150, 0xb48a5e, 0, (u, v, p) => [p.x / 3, p.z / 3]);
      for (let z = z0 + 8; z < z0 + 150; z += 14) {
        for (const s of [-3.2, 3.2]) this.solid.addCylinder(x + s, -1.6, z, 0.3, 0.3, 4, 0x5d4632, 6);
      }
      for (let z = z0 + 20; z < z0 + 150; z += 24) this.glow.push(x, 1.6, z, 0xfff0c0, 3, 1, 0.8);
    }
    // moored yachts
    const rng = this.rng;
    for (let x = MARINA.minX + 30; x <= MARINA.maxX - 20; x += 60) {
      for (let z = z0 + 22; z < z0 + 140; z += 26) {
        if (rng() < 0.25) continue;
        const side = rng() < 0.5 ? -1 : 1;
        this.yacht(x + side * 9, z, rng() < 0.3 ? 22 : 15);
      }
    }
    this.solid.addBox(MARINA.minX - 30, 5, z0 - 12, 26, 10, 16, 0xffffff);
    this.props.neon(MARINA.minX - 30, 8, z0 - 3.9, 0, 'PUERTO AZUL', '#5fe0d0', 12);
  }

  yacht(x, z, len) {
    const y = WATER_LEVEL + 0.4;
    this.solid.addBox(x, y + 0.9, z, 5, 1.8, len, 0xffffff);
    this.solid.addBox(x, y + 0.35, z, 5.05, 0.5, len * 1.01, 0x1d3a52);
    this.solid.addBox(x, y + 2.6, z - len * 0.08, 3.8, 1.6, len * 0.5, 0xf4f4f4);
    this.solid.addBox(x, y + 2.7, z - len * 0.08, 3.9, 0.8, len * 0.48, 0x2a3f55);
    if (len > 18) this.solid.addBox(x, y + 4, z - len * 0.12, 3, 1.2, len * 0.3, 0xffffff);
    this.collision.addCentered(x, z, 5, len, 4, 'boat');
  }

  docks() {
    const z = LAND.maxZ - 10;
    for (let x = -650; x <= -200; x += 110) {
      const legs = [[-6, -5], [6, -5], [-6, 5], [6, 5]];
      for (const [dx, dz] of legs) this.solid.addBox(x + dx, 14, z + dz, 1.2, 28, 1.2, 0xe63946);
      this.solid.addBox(x, 28.5, z + 8, 14, 2.4, 44, 0xe63946);
      this.solid.addBox(x, 30, z - 10, 6, 4, 6, 0xf1faee);
      this.collision.addCentered(x - 6, z, 1.6, 12, 28, 'crane');
      this.collision.addCentered(x + 6, z, 1.6, 12, 28, 'crane');
      this.glow.push(x, 31, z + 30, 0xff3030, 4, 0, 1);
    }
    // a freighter alongside
    const fx = -420, fz = LAND.maxZ + 26;
    this.solid.addBox(fx, WATER_LEVEL + 3.5, fz, 190, 9, 26, 0x1f3b57);
    this.solid.addBox(fx, WATER_LEVEL + 7.6, fz, 190.2, 0.8, 26.2, 0xb33030);
    this.solid.addBox(fx - 78, WATER_LEVEL + 14, fz, 22, 12, 22, 0xf4f4f4);
    const colors = [0xc0392b, 0x2471a3, 0x229954, 0xd68910, 0x7d3c98];
    for (let k = 0; k < 14; k += 1) {
      for (let s = 0; s < 2 + (k % 3); s += 1) this.solid.addBox(fx - 55 + k * 10, WATER_LEVEL + 9.5 + s * 2.8, fz, 9, 2.7, 22, colors[(k + s) % colors.length]);
    }
  }

  meshes() {
    const group = new THREE.Group();
    const solid = new THREE.Mesh(this.solid.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 }));
    solid.castShadow = solid.receiveShadow = true;
    const sand = new THREE.Mesh(this.sand.build(), new THREE.MeshStandardMaterial({ map: groundTexture('sand'), roughness: 1 }));
    sand.receiveShadow = true;
    const grass = new THREE.Mesh(this.grass.build(), new THREE.MeshStandardMaterial({ map: groundTexture('grass'), roughness: 1 }));
    grass.receiveShadow = true;
    const wood = new THREE.Mesh(this.wood.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    wood.castShadow = wood.receiveShadow = true;
    group.add(solid, sand, grass, wood, this.wheel);
    return group;
  }

  update(dt, night) {
    if (this.wheel) this.wheel.rotation.z += dt * 0.06;
    if (this.wheelMaterial) this.wheelMaterial.emissiveIntensity = night * 0.6;
  }
}
