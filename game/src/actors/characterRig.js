// Every person in Solenne (the player, pedestrians, police on foot, story contacts) is drawn
// by one instanced rig: each body part is an InstancedMesh, so the whole crowd costs a few draw
// calls. A figure is a plain state object; `pose()` turns it into joint angles every frame.
import * as THREE from 'three';

const PARTS = {
  legL: { size: [0.2, 0.88, 0.22], pivot: [-0.11, 0.9, 0], hang: true },
  legR: { size: [0.2, 0.88, 0.22], pivot: [0.11, 0.9, 0], hang: true },
  torso: { size: [0.48, 0.62, 0.27], pivot: [0, 0.88, 0], hang: false },
  armL: { size: [0.14, 0.66, 0.14], pivot: [-0.32, 1.46, 0], hang: true },
  armR: { size: [0.14, 0.66, 0.14], pivot: [0.32, 1.46, 0], hang: true },
  head: { size: [0.23, 0.27, 0.25], pivot: [0, 1.53, 0.01], hang: false },
  hair: { size: [0.25, 0.08, 0.27], pivot: [0, 1.76, -0.005], hang: false },
  gun: { size: [0.08, 0.42, 0.13], pivot: [0.32, 1.46, 0], hang: true, gun: true },
  handL: { size: [0.12, 0.15, 0.13], pivot: [-0.32, 1.46, 0], drop: 0.66, follow: 'armL' },
  handR: { size: [0.12, 0.15, 0.13], pivot: [0.32, 1.46, 0], drop: 0.66, follow: 'armR' },
  shoeL: { size: [0.22, 0.11, 0.33], pivot: [-0.11, 0.9, 0], drop: 0.84, fwd: 0.06, follow: 'legL' },
  shoeR: { size: [0.22, 0.11, 0.33], pivot: [0.11, 0.9, 0], drop: 0.84, fwd: 0.06, follow: 'legR' },
};

const tmpM = new THREE.Matrix4();
const rootM = new THREE.Matrix4();
const partM = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
const col = new THREE.Color();

export class CharacterRig {
  constructor(scene, capacity = 120) {
    this.capacity = capacity;
    this.figures = [];
    this.meshes = {};
    for (const [name, part] of Object.entries(PARTS)) {
      const geo = partGeometry(name, part.size);
      // hanging parts pivot at their top; standing parts at their bottom
      if (part.gun) geo.translate(0, -0.74, 0.07);
      else if (part.drop) geo.translate(0, -part.drop - part.size[1] / 2, part.fwd ?? 0);
      else geo.translate(0, part.hang ? -part.size[1] / 2 : part.size[1] / 2, 0);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: part.gun ? 0.6 : 0 });
      const mesh = new THREE.InstancedMesh(geo, mat, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      for (let i = 0; i < capacity; i += 1) {
        mesh.setMatrixAt(i, hidden);
        mesh.setColorAt(i, col.set(0xffffff));
      }
      mesh.count = 0;
      scene.add(mesh);
      this.meshes[name] = mesh;
    }
  }

  /** Register a figure; returns the state object callers mutate. */
  add(look) {
    const fig = {
      slot: this.figures.length, x: 0, y: 0, z: 0, yaw: 0, phase: 0, speed: 0, state: 'idle', visible: true,
      aim: false, armed: false, punch: 0, deathTime: 0, scale: look.scale ?? 1, hitFlash: 0, hands: 0,
      look,
    };
    if (fig.slot >= this.capacity) throw new Error('character capacity');
    this.figures.push(fig);
    this.paint(fig);
    for (const mesh of Object.values(this.meshes)) mesh.count = this.figures.length;
    return fig;
  }

  paint(fig) {
    const L = fig.look;
    const set = (name, c) => this.meshes[name].setColorAt(fig.slot, col.set(c));
    set('legL', L.pants); set('legR', L.pants);
    set('torso', L.shirt);
    set('armL', L.sleeves ? L.shirt : L.skin); set('armR', L.sleeves ? L.shirt : L.skin);
    set('head', L.skin);
    set('hair', L.hair);
    set('gun', 0x1c1c1f);
    set('handL', L.skin); set('handR', L.skin);
    const shoe = L.shoes ?? (L.pants === 0xe0e1dd || L.pants === 0xf2e8cf ? 0xf4f4f4 : 0x1d1d22);
    set('shoeL', shoe); set('shoeR', shoe);
    for (const mesh of Object.values(this.meshes)) mesh.instanceColor.needsUpdate = true;
  }

  /** Write every figure's joint transforms into the instanced meshes. */
  update(dt) {
    for (const fig of this.figures) this.pose(fig, dt);
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  pose(fig, dt) {
    if (!fig.visible) {
      for (const mesh of Object.values(this.meshes)) mesh.setMatrixAt(fig.slot, hidden);
      return;
    }
    const s = fig.scale;
    fig.phase += dt * (fig.speed > 0.1 ? 2.2 + fig.speed * 1.3 : 0);
    const dead = fig.state === 'dead';
    if (dead) fig.deathTime += dt;
    const fall = dead ? Math.min(1, fig.deathTime * 3) : 0;
    rootM.compose(
      v.set(fig.x, fig.y + (dead ? 0.15 * fall : 0), fig.z),
      q.setFromEuler(e.set(-fall * Math.PI / 2, fig.yaw, fig.roll || 0, 'YXZ')),
      v.clone().set(s, s, s),
    );
    const swingAmt = Math.min(1, fig.speed / 3) * (fig.speed > 5 ? 0.95 : 0.6);
    const swing = Math.sin(fig.phase) * swingAmt;
    const bob = Math.abs(Math.cos(fig.phase)) * swingAmt * 0.06;
    const angles = {
      legL: [swing, 0, 0], legR: [-swing, 0, 0],
      armL: [-swing * 0.8, 0, -0.06], armR: [swing * 0.8, 0, 0.06],
      torso: [fig.speed > 5 ? 0.12 : 0, 0, 0], head: [0, 0, 0], hair: [0, 0, 0], gun: [0, 0, 0],
    };
    if (fig.state === 'ride') {
      angles.legL = [-1.35, 0, -0.18]; angles.legR = [-1.35, 0, 0.18];
      angles.armL = [-1.15, 0, -0.12]; angles.armR = [-1.15, 0, 0.12];
    }
    if (fig.state === 'helm') { angles.armL = [-0.95, 0, -0.1]; angles.armR = [-0.95, 0, 0.1]; }
    if (fig.state === 'flee') { angles.armL = [-2.6, 0, -0.3]; angles.armR = [-2.6, 0, 0.3]; }
    if (fig.state === 'cower') { angles.armL = [-2.2, 0, 0.6]; angles.armR = [-2.2, 0, -0.6]; }
    if (fig.aim) {
      angles.armR = [-Math.PI / 2 + (fig.aimPitch || 0), 0, 0];
      angles.armL = [-Math.PI / 2 + 0.15 + (fig.aimPitch || 0), 0.45, 0];
      angles.gun = angles.armR;
    }
    if (fig.punch > 0) {
      fig.punch -= dt;
      angles.armR = [-Math.PI / 2 - 0.1, 0, 0.1];
    }
    const showGun = fig.armed && (fig.aim || fig.holster);
    for (const [name, part] of Object.entries(PARTS)) {
      const mesh = this.meshes[name];
      if (name === 'gun' && !showGun) { mesh.setMatrixAt(fig.slot, hidden); continue; }
      const [ax, ay, az] = angles[part.follow ?? name];
      const legLike = name.startsWith('leg') || name.startsWith('shoe');
      partM.compose(v.set(part.pivot[0], part.pivot[1] + (legLike ? 0 : bob), part.pivot[2]), q.setFromEuler(e.set(ax, ay, az)), one);
      tmpM.multiplyMatrices(rootM, partM);
      mesh.setMatrixAt(fig.slot, tmpM);
    }
  }
}

/**
 * Body-part shapes: tapered four-sided frustums for torso and limbs (broad shoulders, narrow
 * waist and ankles), boxes for the rest, and hair with a back piece.
 */
function partGeometry(name, [sx, sy, sz]) {
  const frustum = (top, bottom, depthScale) => {
    const g = new THREE.CylinderGeometry(top * Math.SQRT1_2, bottom * Math.SQRT1_2, sy, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(1, 1, depthScale);
    return g;
  };
  if (name === 'torso') return frustum(sx * 1.02, sx * 0.74, sz / sx);
  if (name.startsWith('leg')) return frustum(sx * 1.05, sx * 0.72, sz / sx);
  if (name.startsWith('arm')) return frustum(sx * 1.05, sx * 0.8, 1);
  if (name === 'hair') {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    const back = new THREE.BoxGeometry(sx, sy * 1.8, sz * 0.3);
    back.translate(0, -sy * 0.9, -sz * 0.4);
    return mergeTwo(g, back);
  }
  return new THREE.BoxGeometry(sx, sy, sz);
}

function mergeTwo(a, b) {
  const pos = [...a.toNonIndexed().attributes.position.array, ...b.toNonIndexed().attributes.position.array];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Random civilian looks drawn from a coastal-city wardrobe. */
export function randomLook(rng) {
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa86b3c];
  const shirts = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xf7fff7, 0x1a535c, 0xff9f1c, 0xcbf3f0, 0xe63946, 0x8338ec, 0x3a86ff, 0xff006e, 0x06d6a0, 0xfefae0];
  const pants = [0x22333b, 0x3d405b, 0xe0e1dd, 0x8d99ae, 0x283618, 0xbc6c25, 0x1d3557, 0xf2e8cf];
  const hair = [0x1b1b1b, 0x3b2314, 0x6b4423, 0xd4a017, 0x8b8b8b, 0x5a1e0e];
  return { skin: rng.pick(skins), shirt: rng.pick(shirts), pants: rng.pick(pants), hair: rng.pick(hair), sleeves: rng() < 0.3, scale: 0.94 + rng() * 0.12 };
}
