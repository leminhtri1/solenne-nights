// Street furniture builders: palm trees (merged trunks and alpha-tested fronds), lamp posts
// with glowing heads and pools of light on the asphalt, billboards for the city's brands and
// neon signs. Each kind is merged into a handful of meshes for the whole city.
import * as THREE from 'three';
import { MeshBuilder, CITY_TILE } from '../render/meshBuilder.js';
import { palmLeafTexture, glowTexture, billboardTexture, neonSignTexture, BILLBOARD_ADS } from '../render/proceduralTextures.js';

const UP = new THREE.Vector3(0, 1, 0);

export class StreetProps {
  constructor(collision, glow, rng) {
    this.collision = collision;
    this.glow = glow;
    this.rng = rng;
    this.trunks = new MeshBuilder({ tile: CITY_TILE });
    this.leaves = new MeshBuilder({ tile: CITY_TILE });
    this.posts = new MeshBuilder({ tile: CITY_TILE });
    this.pools = new MeshBuilder({ tile: CITY_TILE });
    this.signs = [];
    this.blades = [];
    this.billboards = [];
    this.frond = new THREE.PlaneGeometry(1, 1, 1, 4);
    this.poolPlane = new THREE.PlaneGeometry(1, 1);
    this.palmCount = 0;
  }

  /** A palm: a gently curved trunk of stacked segments and 8 drooping fronds. */
  palm(x, z, height = 11, lean = null) {
    const rng = this.rng;
    const leanYaw = lean ?? rng() * Math.PI * 2;
    const leanAmt = 0.08 + rng() * 0.12;
    const segments = 5;
    let px = x, pz = z, py = 0;
    const segH = height / segments;
    for (let s = 0; s < segments; s += 1) {
      const bend = leanAmt * (s / segments) * 1.4;
      const dx = Math.sin(leanYaw) * bend * segH, dz = Math.cos(leanYaw) * bend * segH;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(dx, segH, dz).normalize());
      const r0 = 0.42 - s * 0.05;
      this.trunks.addCylinder(px + dx / 2, py + segH / 2, pz + dz / 2, r0 - 0.04, r0, segH * 1.04, s % 2 ? 0x8a6a48 : 0x9a7a55, 6, q);
      px += dx; py += segH; pz += dz;
    }
    // crown: coconuts and fronds
    this.trunks.addBox(px, py - 0.2, pz, 0.9, 0.7, 0.9, 0x5b4a2a);
    const fronds = 8;
    for (let f = 0; f < fronds; f += 1) {
      const yaw = (f / fronds) * Math.PI * 2 + rng() * 0.4;
      const len = 4.6 + rng() * 1.6;
      const droop = 0.35 + rng() * 0.35;
      const tint = rng() < 0.5 ? 0xffffff : 0xd9f0b0;
      this.leaves.addGeometry(this.frond, new THREE.Matrix4().makeTranslation(px, py, pz), tint, null);
      // bend the frond we just appended: walk its vertices (24 of them, non-indexed)
      const base = this.leaves.pos.length - 24 * 3;
      for (let k = 0; k < 24; k += 1) {
        const ix = base + k * 3;
        const lx = this.leaves.pos[ix] - px; // -0.5..0.5 across
        const ly = this.leaves.pos[ix + 1] - py + 0.5; // 0..1 along
        const along = ly * len;
        const drop = Math.pow(ly, 1.6) * len * droop - ly * 0.6;
        const width = lx * 1.7;
        const cx = Math.sin(yaw) * along + Math.cos(yaw) * width;
        const cz = Math.cos(yaw) * along - Math.sin(yaw) * width;
        this.leaves.pos[ix] = px + cx;
        this.leaves.pos[ix + 1] = py - drop + 0.3;
        this.leaves.pos[ix + 2] = pz + cz;
        this.leaves.nor[ix] = 0; this.leaves.nor[ix + 1] = 1; this.leaves.nor[ix + 2] = 0;
      }
    }
    this.collision.addCentered(x, z, 0.9, 0.9, height, 'palm');
    this.palmCount += 1;
  }

  /** A lamp post leaning its arm toward the road (direction dx, dz), with a pool of light. */
  lamp(x, z, dx, dz, color = 0xffc98a) {
    this.posts.addCylinder(x, 4, z, 0.12, 0.18, 8, 0x3b3f46, 6);
    const ax = x + dx * 1.6, az = z + dz * 1.6;
    this.posts.addBox((x + ax) / 2, 7.9, (z + az) / 2, Math.abs(dx) * 3.2 + 0.15, 0.15, Math.abs(dz) * 3.2 + 0.15, 0x3b3f46);
    this.posts.addBox(ax, 7.75, az, 0.9, 0.25, 0.5, 0xfff2d0);
    this.glow.push(ax, 7.5, az, color, 7, 1, 1.0);
    const m = new THREE.Matrix4().makeTranslation(ax + dx * 1.5, 0.06, az + dz * 1.5)
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
      .multiply(new THREE.Matrix4().makeScale(13, 13, 1));
    this.pools.addGeometry(this.poolPlane, m, color);
    this.collision.addCentered(x, z, 0.4, 0.4, 8, 'post');
  }

  /** A billboard on legs (or a roof) facing `yaw`. */
  billboard(x, y, z, yaw, adIndex, width = 14) {
    const h = width / 2;
    const legs = y > 1 ? 0 : 7;
    const baseY = y + legs;
    if (legs) {
      for (const s of [-0.3, 0.3]) {
        this.posts.addBox(x + Math.cos(yaw) * s * width, legs / 2, z - Math.sin(yaw) * s * width, 0.4, legs, 0.4, 0x50545c);
      }
      this.collision.addCentered(x, z, 1.2, 1.2, legs + h, 'post');
    }
    this.posts.addBox(x - Math.sin(yaw) * 0.25, baseY + h / 2, z - Math.cos(yaw) * 0.25, width + 0.6, h + 0.6, 0.35, 0x30333a, yaw);
    this.billboards.push({ x, y: baseY + h / 2, z, yaw, adIndex: adIndex % BILLBOARD_ADS.length, width, h });
    this.glow.push(x + Math.sin(yaw) * 1.2, baseY + h + 0.6, z + Math.cos(yaw) * 1.2, 0xfff0d0, 5, 1, 0.6);
  }

  /** A neon sign flat on a facade at (x, y, z), facing `yaw`, with its glow on the wet street. */
  neon(x, y, z, yaw, text, color, width = 9, reflect = true) {
    this.signs.push({ x, y, z, yaw, text, color, width });
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const s of [-0.35, 0, 0.35]) {
      this.glow.push(x + fx * 0.8 + rx * s * width, y, z + fz * 0.8 + rz * s * width, color, width * 0.9, 1, 0.55);
    }
    if (reflect) this.streetGlow(x + fx * 7, z + fz * 7, yaw, width * 1.1, 13, color);
  }

  /** A vertical blade sign sticking out of a facade, readable down the street. */
  blade(x, y, z, yaw, text, color, length = 7) {
    this.blades.push({ x, y, z, yaw, text, color, length });
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    this.posts.addBox(x - fx * 0.2, y, z - fz * 0.2, Math.abs(fz) * 0.15 + Math.abs(fx) * 0.5, length + 0.4, Math.abs(fx) * 0.15 + Math.abs(fz) * 0.5, 0x1a1a22);
    for (const s of [-0.3, 0, 0.3]) this.glow.push(x + fx * 1.4, y + s * length, z + fz * 1.4, color, 5, 1, 0.6);
    this.streetGlow(x + fx * 6, z + fz * 6, yaw, 4, 9, color);
  }

  /** A soft coloured smear of light on the asphalt, stretched away from its source. */
  streetGlow(x, z, yaw, width, length, color) {
    const m = new THREE.Matrix4().makeTranslation(x, 0.07, z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
      .multiply(new THREE.Matrix4().makeScale(width, length, 1));
    this.pools.addGeometry(this.poolPlane, m, color);
  }

  /** Turn everything collected into meshes. Returns the group plus materials that react to night. */
  build() {
    const group = new THREE.Group();
    const trunk = this.trunks.buildTiles(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { castShadow: true, cullDistance: 650 });
    const leafMat = new THREE.MeshStandardMaterial({
      map: palmLeafTexture(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9,
    });
    const leaves = this.leaves.buildTiles(leafMat, { castShadow: true, cullDistance: 650 });
    const posts = this.posts.buildTiles(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 }), { castShadow: true, cullDistance: 320 });
    this.poolMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture(), vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pools = this.pools.buildTiles(this.poolMaterial, { cullDistance: 320 });
    for (const m of pools.children) m.renderOrder = 2;
    group.add(trunk, leaves, posts, pools);

    const plane = new THREE.PlaneGeometry(1, 1);
    for (const b of this.billboards) {
      const mesh = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ map: billboardTexture(b.adIndex), roughness: 0.6, emissive: 0xffffff, emissiveMap: billboardTexture(b.adIndex), emissiveIntensity: 0.0 }));
      mesh.scale.set(b.width, b.h, 1);
      mesh.position.set(b.x, b.y, b.z);
      mesh.rotation.y = b.yaw;
      mesh.userData.cullDistance = 520;
      group.add(mesh);
      (this.billboardMaterials ||= []).push(mesh.material);
    }
    for (const s of this.signs) {
      const mesh = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: neonSignTexture(s.text, s.color), transparent: true, toneMapped: false }));
      mesh.scale.set(s.width, s.width / 4, 1);
      mesh.position.set(s.x + Math.sin(s.yaw) * 0.4, s.y, s.z + Math.cos(s.yaw) * 0.4);
      mesh.rotation.y = s.yaw;
      mesh.userData.cullDistance = 280;
      group.add(mesh);
      (this.neonMaterials ||= []).push(mesh.material);
    }
    for (const s of this.blades) {
      // two single-sided faces back to back, so the lettering reads correctly from both ends of the street
      const material = new THREE.MeshBasicMaterial({ map: neonSignTexture(s.text, s.color), transparent: true, toneMapped: false });
      for (const flip of [0, Math.PI]) {
        const mesh = new THREE.Mesh(plane, material);
        mesh.scale.set(s.length, s.length / 4, 1);
        mesh.position.set(s.x + Math.sin(s.yaw) * 1.4, s.y, s.z + Math.cos(s.yaw) * 1.4);
        mesh.rotation.set(0, s.yaw + Math.PI / 2 + flip, Math.PI / 2, 'YXZ');
        mesh.userData.cullDistance = 240;
        group.add(mesh);
      }
      (this.neonMaterials ||= []).push(material);
    }
    return group;
  }

  /** Night factor 0..1: light pools and billboard lamps come up after dusk. */
  setNight(night) {
    if (this.poolMaterial) this.poolMaterial.opacity = 0.45 * night;
    for (const m of this.billboardMaterials || []) m.emissiveIntensity = 0.55 * night;
    for (const m of this.neonMaterials || []) m.color.setScalar(0.8 + 0.9 * night);
  }
}
