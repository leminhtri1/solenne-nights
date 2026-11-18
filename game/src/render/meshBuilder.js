// Collects many small shapes (boxes, cylinders, any BufferGeometry) with per-vertex colours
// into one BufferGeometry, so a whole city block, a car body or a row of palms is a single
// draw call.
import * as THREE from 'three';

const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpColor = new THREE.Color();
const normalMatrix = new THREE.Matrix3();

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  /** Append one triangle-list geometry transformed by `matrix`, tinted `color`. */
  addGeometry(geometry, matrix, color = 0xffffff, uvTransform = null) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const uv = geo.attributes.uv;
    normalMatrix.getNormalMatrix(matrix);
    tmpColor.set(color);
    for (let i = 0; i < p.count; i += 1) {
      tmpV.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(tmpV.x, tmpV.y, tmpV.z);
      tmpN.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      this.nor.push(tmpN.x, tmpN.y, tmpN.z);
      let u = uv ? uv.getX(i) : 0;
      let v = uv ? uv.getY(i) : 0;
      if (uvTransform) [u, v] = uvTransform(u, v, tmpV, tmpN);
      this.uv.push(u, v);
      this.col.push(tmpColor.r, tmpColor.g, tmpColor.b);
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

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
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
