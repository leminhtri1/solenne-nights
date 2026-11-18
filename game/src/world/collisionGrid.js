// Static collision for the city: every building, wall, palm trunk and lamp post is an
// axis-aligned box in a spatial hash. Vehicles and people resolve as circles against it, and
// bullets and police sight lines are tested as segments.

const CELL = 40;

export class CollisionGrid {
  constructor() {
    this.cells = new Map();
    this.boxes = [];
    this.stamp = 0;
  }

  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  /** Register a box. `height` lets low walls block cars but not sight lines. */
  addBox(minX, minZ, maxX, maxZ, height = 10, tag = 'building') {
    const box = { minX, minZ, maxX, maxZ, height, tag, mark: 0 };
    this.boxes.push(box);
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
        const k = this.key(cx, cz);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(box);
      }
    }
    return box;
  }

  addCentered(x, z, sx, sz, height, tag) {
    return this.addBox(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, height, tag);
  }

  /** Boxes overlapping the square around (x, z) of half-size r. */
  query(x, z, r, out = []) {
    out.length = 0;
    this.stamp += 1;
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx += 1) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz += 1) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const b of list) {
          if (b.mark === this.stamp) continue;
          b.mark = this.stamp;
          if (b.maxX < x - r || b.minX > x + r || b.maxZ < z - r || b.minZ > z + r) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Push a circle out of every box it overlaps. Returns null when free, else
   * { x, z, nx, nz, depth } with the corrected centre and the strongest contact normal.
   */
  resolveCircle(x, z, r) {
    const hits = this.query(x, z, r, this._scratch || (this._scratch = []));
    let result = null;
    for (const b of hits) {
      const px = Math.max(b.minX, Math.min(x, b.maxX));
      const pz = Math.max(b.minZ, Math.min(z, b.maxZ));
      let dx = x - px;
      let dz = z - pz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) {
        // centre inside the box: push out along the shallowest axis
        const left = x - b.minX, right = b.maxX - x, down = z - b.minZ, up = b.maxZ - z;
        const m = Math.min(left, right, down, up);
        if (m === left) { dx = -1; dz = 0; d = -left; }
        else if (m === right) { dx = 1; dz = 0; d = -right; }
        else if (m === down) { dx = 0; dz = -1; d = -down; }
        else { dx = 0; dz = 1; d = -up; }
        const depth = r - d;
        x += dx * depth; z += dz * depth;
        result = { x, z, nx: dx, nz: dz, depth, box: b };
        continue;
      }
      const nx = dx / d, nz = dz / d;
      const depth = r - d;
      x += nx * depth;
      z += nz * depth;
      if (!result || depth > result.depth) result = { x, z, nx, nz, depth, box: b };
      else { result.x = x; result.z = z; }
    }
    return result;
  }

  /**
   * First hit of the segment from (ax, ay, az) to (bx, by, bz) against boxes tall enough to
   * block it. Returns the fraction along the segment (1 when clear).
   */
  raycast(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / CELL));
    let best = 1;
    this.stamp += 1;
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const cx = Math.floor((ax + dx * t) / CELL), cz = Math.floor((az + dz * t) / CELL);
      for (let ox = -1; ox <= 1; ox += 1) for (let oz = -1; oz <= 1; oz += 1) {
        const list = this.cells.get(this.key(cx + ox, cz + oz));
        if (!list) continue;
        for (const b of list) {
          if (b.mark === this.stamp) continue;
          b.mark = this.stamp;
          const hit = segmentBox(ax, az, dx, dz, b);
          if (hit < best) {
            const y = ay + (by - ay) * hit;
            if (y <= b.height) best = hit;
          }
        }
      }
    }
    return best;
  }

  /** True when nothing tall stands between the two points. */
  lineOfSight(ax, ay, az, bx, by, bz) {
    return this.raycast(ax, ay, az, bx, by, bz) >= 0.999;
  }
}

/** Slab test of a 2D segment against a box; returns entry fraction in [0,1] or 2 for a miss. */
function segmentBox(ax, az, dx, dz, b) {
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < b.minX || ax > b.maxX) return 2;
  } else {
    let t1 = (b.minX - ax) / dx, t2 = (b.maxX - ax) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return 2;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < b.minZ || az > b.maxZ) return 2;
  } else {
    let t1 = (b.minZ - az) / dz, t2 = (b.maxZ - az) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return 2;
  }
  return tmin;
}
