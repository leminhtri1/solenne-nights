// Collects many small shapes (boxes, cylinders, any BufferGeometry) with per-vertex colours
// into merged BufferGeometry. Untiled, everything becomes one draw call. Tiled (`{ tile: m }`),
// each shape lands in the square tile its first vertex falls in and `buildTiles` makes one mesh
// per tile, so the camera and the sun's shadow frustum skip whole districts out of view.
import * as THREE from 'three';

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpColor = new THREE.Color();
const normalMatrix = new THREE.Matrix3();

function emptyBucket() { return { pos: [], nor: [], uv: [], col: [] }; }

/** Tile size in metres for the city's static meshes (Solenne is about 1.4 km across). */
export const CITY_TILE = 160;

export class MeshBuilder {
  constructor({ tile = 0 } = {}) {
    this.tile = tile;
    this.buckets = new Map();
    this.whole = emptyBucket();
    this.last = this.whole;
  }

  /** Vertex arrays of the bucket written last, for callers that reshape a shape just added. */
  get pos() { return this.last.pos; }
  get nor() { return this.last.nor; }

  get vertexCount() {
    let n = this.whole.pos.length;
    for (const b of this.buckets.values()) n += b.pos.length;
    return n / 3;
  }

  bucketAt(x, z) {
    if (!this.tile) return this.whole;
    const key = `${Math.floor(x / this.tile)}:${Math.floor(z / this.tile)}`;
    let b = this.buckets.get(key);
    if (!b) { b = emptyBucket(); this.buckets.set(key, b); }
    return b;
  }

  /** Append one triangle-list geometry transformed by `matrix`, tinted `color`. */
  addGeometry(geometry, matrix, color = 0xffffff, uvTransform = null) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const uv = geo.attributes.uv;
    normalMatrix.getNormalMatrix(matrix);
    tmpColor.set(color);
    tmpV.fromBufferAttribute(p, 0).applyMatrix4(matrix);
    const out = this.bucketAt(tmpV.x, tmpV.z);
    this.last = out;
    for (let i = 0; i < p.count; i += 1) {
      tmpV.fromBufferAttribute(p, i).applyMatrix4(matrix);
      out.pos.push(tmpV.x, tmpV.y, tmpV.z);
      tmpN.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      out.nor.push(tmpN.x, tmpN.y, tmpN.z);
      let u = uv ? uv.getX(i) : 0;
      let v = uv ? uv.getY(i) : 0;
      if (uvTransform) [u, v] = uvTransform(u, v, tmpV, tmpN);
      out.uv.push(u, v);
      out.col.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
    if (geo !== geometry) geo.dispose();
  }

  /** Axis-aligned (optionally yaw-rotated) box centred at (x, y, z). */
  addBox(x, y, z, sx, sy, sz, color, yaw = 0, uvTransform = null) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw),
      new THREE.Vector3(sx, sy, sz),
    );
    this.addGeometry(UNIT_BOX, m, color, uvTransform);
  }

  /** A building block whose sides tile a 16 m facade texture and whose top samples plain wall. */
  addFacadeBox(x, baseY, z, sx, sy, sz, color, tile = 16) {
    const halfX = sx / 2, halfZ = sz / 2;
    this.addBox(x, baseY + sy / 2, z, sx, sy, sz, color, 0, (u, v, p, n) => {
      if (n.y > 0.5 || n.y < -0.5) return [0.01, 0.01];
      const along = Math.abs(n.x) > 0.5 ? (p.z - (z - halfZ)) : (p.x - (x - halfX));
      return [along / tile, (p.y - baseY) / tile];
    });
  }

  addCylinder(x, y, z, rTop, rBottom, h, color, segments = 8, rotation = null) {
    const geo = cylinderGeo(rTop, rBottom, segments);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      rotation ?? new THREE.Quaternion(),
      new THREE.Vector3(1, h, 1),
    );
    this.addGeometry(geo, m, color);
  }

  /** Everything collected, as one geometry (tiles included). */
  build() {
    if (!this.buckets.size) return bucketGeometry(this.whole);
    const all = emptyBucket();
    for (const b of [this.whole, ...this.buckets.values()]) {
      for (const k of ['pos', 'nor', 'uv', 'col']) for (let i = 0; i < b[k].length; i += 1) all[k].push(b[k][i]);
    }
    return bucketGeometry(all);
  }

  /** One mesh per tile (plus one for untiled shapes), sharing `material`. */
  buildTiles(material, { castShadow = false, receiveShadow = false, cullDistance = 0 } = {}) {
    const group = new THREE.Group();
    for (const b of [this.whole, ...this.buckets.values()]) {
      if (!b.pos.length) continue;
      const mesh = new THREE.Mesh(bucketGeometry(b), material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      if (cullDistance) mesh.userData.cullDistance = cullDistance;
      group.add(mesh);
    }
    return group;
  }
}

function bucketGeometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
function cylinderGeo(rTop, rBottom, segments) {
  const key = `${rTop}|${rBottom}|${segments}`;
  if (!cylCache.has(key)) cylCache.set(key, new THREE.CylinderGeometry(rTop, rBottom, 1, segments));
  return cylCache.get(key);
}

/** Convenience: a Mesh from a builder with a vertex-coloured standard material. */
export function builderMesh(builder, materialOptions = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, ...materialOptions });
  return new THREE.Mesh(builder.build(), mat);
}
