// Low-poly vehicle meshes. A car body is a side profile extruded across its width; the
// greenhouse glass is a slightly wider inset profile; bumpers, grilles, mirrors, lamps and
// wheels are boxes and cylinders. Geometry is built once per body type and shared; each car
// only owns its paint material.
import * as THREE from 'three';
import { MeshBuilder } from '../render/meshBuilder.js';

// Side profiles as [z, y] points (z forward). `hull` is the painted lower body up to the
// beltline; `cabin` is the glass greenhouse on top of it, whose two top points carry a painted
// roof. A van's cabin is its windscreen block only: the cargo box is part of the hull.
const PROFILES = {
  sports: { hull: [[-2.3, 0.32], [2.3, 0.32], [2.36, 0.6], [2.0, 0.72], [0.85, 0.84], [-1.95, 0.88], [-2.32, 0.86]],
    cabin: [[0.85, 0.84], [-0.05, 1.16], [-0.95, 1.18], [-1.95, 0.88]] },
  muscle: { hull: [[-2.45, 0.34], [2.45, 0.34], [2.5, 0.82], [0.75, 0.98], [-1.75, 1.0], [-2.45, 0.98]],
    cabin: [[0.75, 0.98], [0.05, 1.3], [-1.15, 1.3], [-1.75, 1.0]] },
  sedan: { hull: [[-2.3, 0.34], [2.3, 0.34], [2.36, 0.8], [1.1, 0.92], [-1.85, 0.97], [-2.32, 0.92]],
    cabin: [[1.1, 0.92], [0.42, 1.44], [-1.2, 1.44], [-1.85, 0.97]] },
  police: { hull: [[-2.4, 0.34], [2.4, 0.34], [2.46, 0.82], [1.12, 0.94], [-1.88, 0.98], [-2.42, 0.94]],
    cabin: [[1.12, 0.94], [0.44, 1.46], [-1.22, 1.46], [-1.88, 0.98]] },
  van: { hull: [[-2.7, 0.4], [2.7, 0.4], [2.76, 1.05], [2.25, 1.32], [1.55, 2.35], [-2.7, 2.35]],
    cabin: [[2.31, 1.34], [1.61, 2.3], [0.9, 2.3], [0.9, 1.34]], van: true },
};

const cache = new Map();

function extrude(points, width) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // shape lies in XY (x = car z); extrusion runs along +Z (= car x). Rotate into car space.
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return geo;
}

function addWheels(b, def, r = 0.38, wheelZ = null) {
  const wz = wheelZ ?? def.length * 0.31;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  for (const z of [wz, -wz]) {
    for (const s of [-1, 1]) {
      const x = s * (def.width / 2 - 0.12);
      b.addCylinder(x, r, z, r, r, 0.3, 0x15161a, 12, q);
      b.addCylinder(x + s * 0.16, r, z, r * 0.55, r * 0.55, 0.02, 0xb8bec6, 8, q);
    }
  }
}

/** Build (or fetch) the shared geometry set for a vehicle definition. */
export function vehicleGeometry(def) {
  const key = def.body + def.length;
  if (cache.has(key)) return cache.get(key);
  const paint = new MeshBuilder();
  const trim = new MeshBuilder();
  const lights = new MeshBuilder();
  const wheels = new MeshBuilder();
  const W = def.width;
  const I = new THREE.Matrix4();
  if (def.body === 'bike') {
    paint.addBox(0, 0.85, 0.1, 0.5, 0.45, 1.3, 0xffffff);
    paint.addBox(0, 0.75, 0.75, 0.42, 0.3, 0.5, 0xffffff, 0);
    trim.addBox(0, 1.05, -0.35, 0.36, 0.14, 0.8, 0x111111);
    trim.addBox(0, 0.55, 0, 0.3, 0.35, 0.9, 0x333333);
    trim.addBox(0, 1.15, 0.8, 0.7, 0.06, 0.06, 0x222222);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    for (const z of [0.8, -0.75]) wheels.addCylinder(0, 0.36, z, 0.36, 0.36, 0.18, 0x15161a, 12, q);
    lights.addBox(0, 0.92, 1.03, 0.2, 0.14, 0.05, 0xfff4d6);
    lights.addBox(0, 0.95, -0.76, 0.22, 0.08, 0.05, 0xff2020);
  } else if (def.body === 'boat') {
    paint.addBox(0, 0.7, -0.3, W, 1.0, def.length * 0.8, 0xffffff);
    const bow = new THREE.ConeGeometry(W / 2, 2.2, 4, 1);
    bow.rotateX(Math.PI / 2); bow.rotateZ(Math.PI / 4); bow.scale(1, 0.55, 1);
    paint.addGeometry(bow, new THREE.Matrix4().makeTranslation(0, 0.85, def.length * 0.4 + 0.5), 0xffffff);
    trim.addBox(0, 0.32, -0.3, W + 0.02, 0.3, def.length * 0.8, 0x1d3a52);
    trim.addBox(0, 1.35, 0.2, W * 0.8, 0.5, 0.15, 0x0d1b2a);
    trim.addBox(0, 1.25, -1.2, W * 0.75, 0.3, 1.6, 0xe9e4d8);
    trim.addBox(0, 1.3, -def.length * 0.42, 0.6, 0.8, 0.5, 0x222222);
    lights.addBox(-W / 2, 1.0, 1.8, 0.05, 0.15, 0.15, 0xff2020);
    lights.addBox(W / 2, 1.0, 1.8, 0.05, 0.15, 0.15, 0x20ff40);
  } else {
    const prof = PROFILES[def.body];
    paint.addGeometry(extrude(prof.hull, W), I, 0xffffff);
    if (prof.van) {
      trim.addGeometry(extrude(prof.cabin, W + 0.04), I, 0x152230);
    } else {
      const gw = W * 0.88;
      trim.addGeometry(extrude(prof.cabin, gw), I, 0x152230);
      const [, [z1, y1], [z2, y2]] = prof.cabin;
      paint.addBox(0, (y1 + y2) / 2 + 0.035, (z1 + z2) / 2, gw + 0.04, 0.07, Math.abs(z1 - z2) + 0.12, 0xffffff);
      // B-pillars
      for (const s of [-1, 1]) paint.addBox(s * gw / 2, (y1 + prof.cabin[0][1]) / 2 + 0.02, (z1 + z2) / 2 + 0.15, 0.06, (y1 - prof.cabin[0][1]) * 0.95, 0.14, 0xffffff);
    }
    const L = def.length;
    const front = prof.hull[1][0], rear = prof.hull[0][0];
    // bumpers, grille, sills, mirrors
    trim.addBox(0, 0.42, front + 0.06, W * 0.98, 0.22, 0.14, 0x22252a);
    trim.addBox(0, 0.42, rear - 0.06, W * 0.98, 0.22, 0.14, 0x22252a);
    trim.addBox(0, 0.62, front + 0.04, W * 0.45, 0.14, 0.06, 0x111111);
    for (const s of [-1, 1]) {
      trim.addBox(s * (W / 2 + 0.01), 0.42, 0, 0.04, 0.12, L * 0.55, 0x22252a);
      trim.addBox(s * (W / 2 + 0.12), def.body === 'van' ? 1.45 : 0.98, prof.cabin[0][0] - 0.15, 0.2, 0.12, 0.12, 0x22252a);
      lights.addBox(s * W * 0.34, 0.66, front + 0.03, W * 0.2, 0.12, 0.06, 0xfff4d6);
      lights.addBox(s * W * 0.36, 0.72, rear - 0.03, W * 0.18, 0.12, 0.06, 0xff2020);
    }
    if (def.body === 'police') {
      trim.addBox(0, 1.52, -0.3, 1.3, 0.1, 0.35, 0x222222);
      lights.addBox(-0.36, 1.62, -0.3, 0.55, 0.16, 0.3, 0xff1a1a);
      lights.addBox(0.36, 1.62, -0.3, 0.55, 0.16, 0.3, 0x1a4dff);
      trim.addBox(0, 0.5, front + 0.18, W * 0.9, 0.35, 0.1, 0x111111); // push bar
    }
    if (def.body === 'van' && def.swat) {
      lights.addBox(-0.5, 2.42, 1.2, 0.5, 0.12, 0.25, 0xff1a1a);
      lights.addBox(0.5, 2.42, 1.2, 0.5, 0.12, 0.25, 0x1a4dff);
    }
    if (def.taxi) {
      trim.addBox(0, 1.6, -0.3, 0.8, 0.25, 0.3, 0x111111);
      lights.addBox(0, 1.6, -0.3, 0.7, 0.18, 0.32, 0xfff1a0);
    }
    if (def.body === 'sports') trim.addBox(0, 1.0, rear + 0.2, W * 0.9, 0.06, 0.35, 0x111111); // spoiler
    addWheels(wheels, def, def.body === 'van' ? 0.42 : 0.38);
  }
  const set = { paint: paint.build(), trim: trim.build(), lights: lights.build(), wheels: wheels.build() };
  cache.set(key, set);
  return set;
}

const shared = {};
function sharedMaterials() {
  if (shared.trim) return shared;
  shared.trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.5 });
  shared.lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  shared.lights.color.setScalar(2.2);
  shared.wheels = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  shared.policeDecal = new THREE.MeshStandardMaterial({ color: 0x0b1d3a, roughness: 0.4, metalness: 0.4 });
  return shared;
}

/** A complete vehicle Group with its own paint material. */
export function createVehicleMesh(def, paintColor) {
  const geo = vehicleGeometry(def);
  const mats = sharedMaterials();
  const group = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.2 });
  const body = new THREE.Mesh(geo.paint, paintMat);
  const trim = new THREE.Mesh(geo.trim, mats.trim);
  const lights = new THREE.Mesh(geo.lights, mats.lights);
  const wheels = new THREE.Mesh(geo.wheels, mats.wheels);
  body.castShadow = trim.castShadow = wheels.castShadow = true;
  group.add(body, trim, lights, wheels);
  if (def.police && def.body === 'police') {
    // dark doors and bonnet panel for the black-and-white livery
    const decal = new THREE.Mesh(new THREE.BoxGeometry(def.width + 0.03, 0.42, 2.0), mats.policeDecal);
    decal.position.set(0, 0.62, -0.1);
    group.add(decal);
  }
  group.userData.paint = paintMat;
  return group;
}
