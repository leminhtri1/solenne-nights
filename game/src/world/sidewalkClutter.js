// Life on the sidewalks: bins, hydrants, benches, café tables under striped umbrellas, food
// carts with string lights, bus shelters, planters and vending boxes, placed along every block
// face and flavoured by district (cafés and carts on the strip and the beach, shelters downtown,
// planters in the suburbs, bins and hydrants by the docks). All of it is merged into one mesh;
// the carts and shelters add warm lights that come up at night. Pedestrians walk the lane
// between the kerb row and the shop-front row.
import * as THREE from 'three';
import { MeshBuilder } from '../render/meshBuilder.js';
import { GRID_LINES, GRID_COUNT, ROAD_WIDTH, PARK_BLOCKS, districtAt, blockOfPlace } from './cityLayout.js';

const KERB = ROAD_WIDTH / 2 + 1.0;
const FRONT = ROAD_WIDTH / 2 + 3.9;
const STRIPES = [0xff4fa3, 0x2ec4b6, 0xffb347, 0x5ad1ff, 0xff5a5a, 0xb48cff];

/** Which props each district favours, by weight. */
const MIX = {
  lumen: ['cafe', 'cafe', 'cart', 'vending', 'bin', 'bench'],
  palmera: ['cafe', 'cart', 'bench', 'planter', 'bin', 'cafe'],
  meridian: ['shelter', 'bench', 'bin', 'vending', 'planter', 'hydrant'],
  bellavista: ['cafe', 'planter', 'bench', 'bin', 'hydrant', 'cart'],
  coral: ['planter', 'bin', 'hydrant', 'bench', 'planter', 'bin'],
  sable: ['bin', 'hydrant', 'bin', 'vending', 'bench', 'hydrant'],
  azul: ['bench', 'cafe', 'planter', 'cart', 'bin', 'bench'],
  verano: ['planter', 'bench'],
};

export class SidewalkClutter {
  constructor({ glow, rng }) {
    this.glow = glow;
    this.rng = rng;
    this.b = new MeshBuilder();
    this.count = 0;
  }

  /** Walk every block face and drop a kerb item and a shop-front item at fixed stations. */
  build() {
    const rng = this.rng;
    for (let i = 0; i < GRID_COUNT - 1; i += 1) {
      for (let j = 0; j < GRID_COUNT - 1; j += 1) {
        if (PARK_BLOCKS.has(`${i},${j}`)) continue;
        const place = blockOfPlace(i, j);
        const x0 = GRID_LINES[i], x1 = GRID_LINES[i + 1], z0 = GRID_LINES[j], z1 = GRID_LINES[j + 1];
        const mix = MIX[districtAt((x0 + x1) / 2, (z0 + z1) / 2).id] ?? MIX.bellavista;
        // four faces: the street line each one fronts, and which side of it the sidewalk is on
        const faces = [
          { ax: x0, az: z0, edge: z0, axis: 'z', sign: 1 },
          { ax: x0, az: z1, edge: z1, axis: 'z', sign: -1 },
          { ax: x0, az: z0, edge: x0, axis: 'x', sign: 1 },
          { ax: x1, az: z0, edge: x1, axis: 'x', sign: -1 },
        ];
        faces.forEach((f, fi) => {
          for (const along of [16, 39, 61, 84]) {
            if (place && fi === 0 && Math.abs(along - 50) < 14) continue;
            const kind = mix[Math.floor(rng() * mix.length)];
            const front = kind === 'cafe' || kind === 'cart' || kind === 'vending' || kind === 'planter';
            const off = front ? FRONT : KERB;
            const px = f.axis === 'z' ? f.ax + along : f.edge + f.sign * off;
            const pz = f.axis === 'z' ? f.edge + f.sign * off : f.az + along;
            // turn the prop to face the road
            const face = f.axis === 'z' ? (f.sign > 0 ? Math.PI : 0) : (f.sign > 0 ? -Math.PI / 2 : Math.PI / 2);
            if (rng() < 0.18) continue;
            this.place(kind, px, pz, face);
          }
        });
      }
    }
    const mesh = new THREE.Mesh(this.b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  place(kind, x, z, yaw) {
    this.count += 1;
    switch (kind) {
      case 'cafe': return this.cafe(x, z, yaw);
      case 'cart': return this.cart(x, z, yaw);
      case 'shelter': return this.shelter(x, z, yaw);
      case 'bench': return this.bench(x, z, yaw);
      case 'planter': return this.planter(x, z);
      case 'vending': return this.vending(x, z, yaw);
      case 'hydrant': return this.hydrant(x, z);
      default: return this.bin(x, z);
    }
  }

  /** Local offset (right r, forward f toward the road) to world, for a prop facing `yaw`. */
  at(x, z, yaw, r, f) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    return [x + c * r + s * f, z - s * r + c * f];
  }

  bin(x, z) {
    const b = this.b;
    b.addCylinder(x, 0.5, z, 0.32, 0.28, 1.0, 0x2f6b3f, 10);
    b.addCylinder(x, 1.04, z, 0.36, 0.36, 0.1, 0x1f3f28, 10);
  }

  hydrant(x, z) {
    const b = this.b;
    b.addCylinder(x, 0.38, z, 0.17, 0.2, 0.76, 0xd6262f, 8);
    b.addCylinder(x, 0.8, z, 0.08, 0.17, 0.12, 0xffd23f, 8);
    b.addBox(x, 0.45, z, 0.56, 0.12, 0.12, 0xd6262f);
  }

  bench(x, z, yaw) {
    const b = this.b;
    const [sx, sz] = this.at(x, z, yaw, 0, 0);
    b.addBox(sx, 0.48, sz, 2.0, 0.08, 0.5, 0xb0753f, yaw);
    const [bx, bz] = this.at(x, z, yaw, 0, -0.26);
    b.addBox(bx, 0.82, bz, 2.0, 0.42, 0.07, 0xb0753f, yaw);
    for (const r of [-0.85, 0.85]) {
      const [lx, lz] = this.at(x, z, yaw, r, -0.05);
      b.addBox(lx, 0.25, lz, 0.08, 0.5, 0.5, 0x2b2d33, yaw);
    }
  }

  planter(x, z) {
    const b = this.b;
    b.addBox(x, 0.35, z, 1.3, 0.7, 1.3, 0xd8cdb8);
    b.addBox(x, 0.74, z, 1.15, 0.12, 1.15, 0x4b3524);
    b.addCylinder(x, 1.2, z, 0.05, 0.62, 0.9, 0x3f9a40, 7);
    b.addCylinder(x, 1.75, z, 0.02, 0.42, 0.6, 0x55b54a, 7);
  }

  vending(x, z, yaw) {
    const b = this.b;
    const color = STRIPES[Math.floor(this.rng() * STRIPES.length)];
    b.addBox(x, 0.95, z, 0.9, 1.9, 0.75, color, yaw);
    const [fx, fz] = this.at(x, z, yaw, 0, 0.39);
    b.addBox(fx, 1.15, fz, 0.6, 0.9, 0.04, 0xe8f6ff, yaw);
    this.glow.push(fx, 1.15, fz, 0xcfefff, 1.6, 1, 0.5);
  }

  /** Two or three round tables, each under a striped umbrella with a pair of chairs. */
  cafe(x, z, yaw) {
    const b = this.b;
    const rng = this.rng;
    const color = STRIPES[Math.floor(rng() * STRIPES.length)];
    const n = rng() < 0.5 ? 2 : 3;
    for (let k = 0; k < n; k += 1) {
      const [tx, tz] = this.at(x, z, yaw, (k - (n - 1) / 2) * 3.4, 0);
      b.addCylinder(tx, 0.37, tz, 0.06, 0.06, 0.74, 0x2b2d33, 6);
      b.addCylinder(tx, 0.76, tz, 0.48, 0.48, 0.05, 0xf4efe6, 12);
      b.addCylinder(tx, 1.6, tz, 0.035, 0.035, 1.7, 0xdedede, 6);
      b.addCylinder(tx, 2.5, tz, 0.0, 1.55, 0.5, k % 2 ? color : 0xfdf6ea, 8);
      b.addCylinder(tx, 2.22, tz, 1.55, 1.55, 0.08, color, 8);
      for (const r of [-0.8, 0.8]) {
        const [cx, cz] = this.at(tx, tz, yaw, r, 0);
        b.addBox(cx, 0.45, cz, 0.42, 0.06, 0.42, 0x8a5a3a, yaw);
        const [kx, kz] = this.at(tx, tz, yaw, r * 1.25, 0);
        b.addBox(kx, 0.7, kz, 0.05, 0.5, 0.42, 0x8a5a3a, yaw);
      }
    }
  }

  /** A food cart with a striped awning, wheels and a warm string of lights. */
  cart(x, z, yaw) {
    const b = this.b;
    const color = STRIPES[Math.floor(this.rng() * STRIPES.length)];
    b.addBox(x, 0.85, z, 2.4, 1.0, 1.2, 0xf6f1e4, yaw);
    b.addBox(x, 0.62, z, 2.42, 0.22, 1.22, color, yaw);
    for (const r of [-0.8, 0.8]) {
      const [wx, wz] = this.at(x, z, yaw, r, 0);
      b.addCylinder(wx, 0.3, wz, 0.3, 0.3, 1.26, 0x222222, 10, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).cross(new THREE.Vector3(0, 1, 0)).normalize(), Math.PI / 2));
    }
    for (const r of [-1.1, 1.1]) {
      const [px, pz] = this.at(x, z, yaw, r, 0.5);
      b.addBox(px, 1.75, pz, 0.06, 0.9, 0.06, 0xdedede, yaw);
    }
    const [ax, az] = this.at(x, z, yaw, 0, 0.35);
    for (let s = 0; s < 6; s += 1) {
      const [sx, sz] = this.at(ax, az, yaw, -1.25 + s * 0.5 + 0.25, 0);
      b.addBox(sx, 2.25, sz, 0.5, 0.12, 1.9, s % 2 ? color : 0xfdf6ea, yaw);
    }
    for (let s = 0; s < 5; s += 1) {
      const [lx, lz] = this.at(x, z, yaw, -1.0 + s * 0.5, 1.25);
      this.glow.push(lx, 2.12, lz, 0xffd27a, 1.4, 1, 0.9);
    }
  }

  /** A bus shelter: roof, glass back, bench and a lit advertising panel at one end. */
  shelter(x, z, yaw) {
    const b = this.b;
    const [rx, rz] = this.at(x, z, yaw, 0, -0.3);
    b.addBox(rx, 2.6, rz, 4.2, 0.12, 1.7, 0x30343c, yaw);
    const [gx, gz] = this.at(x, z, yaw, 0, -1.05);
    b.addBox(gx, 1.35, gz, 4.0, 2.4, 0.06, 0x9ad8ff, yaw);
    for (const r of [-2.0, 2.0]) {
      const [px, pz] = this.at(x, z, yaw, r, -1.0);
      b.addBox(px, 1.3, pz, 0.1, 2.6, 0.1, 0x30343c, yaw);
    }
    const [ex, ez] = this.at(x, z, yaw, 2.05, -0.35);
    b.addBox(ex, 1.3, ez, 0.12, 2.1, 1.3, 0xffb347, yaw);
    this.glow.push(ex, 1.4, ez, 0xffe6b0, 2.6, 1, 0.7);
    this.bench(...this.at(x, z, yaw, -0.6, -0.65), yaw);
  }
}
