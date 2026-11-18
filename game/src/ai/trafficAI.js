// Civilian traffic. Each car follows the right-hand lane of a street edge, stops at red
// signals and behind slower cars, picks a new street at every junction (never a U-turn unless
// it must), and floors it when a crime breaks out nearby. Cars that fall far behind the player
// are recycled ahead of them; parked cars line the kerbs, ready to be stolen.
import { RoadNetwork } from '../world/roadNetwork.js';
import { TRAFFIC_MIX } from '../vehicles/vehicleCatalog.js';
import { clamp, wrapAngle } from '../core/mathUtils.js';
import { ROAD_WIDTH } from '../world/cityLayout.js';

const MIN_SPAWN = 70;
const MAX_SPAWN = 200;
const DESPAWN = 270;

export class TrafficAI {
  constructor(game, { moving = 26, parked = 12 } = {}) {
    this.game = game;
    this.targetMoving = moving;
    this.targetParked = parked;
    this.cars = [];
    this.parked = [];
    this.panicUntil = 0;
    game.events.on('gunshot', () => { this.panicUntil = game.clock + 8; });
    game.events.on('explosion', () => { this.panicUntil = game.clock + 10; });
  }

  get roads() { return this.game.roads; }

  /** Spawn a moving car on a random edge within the spawn ring around (x, z). */
  spawnNear(x, z, minR = MIN_SPAWN, maxR = MAX_SPAWN, type = null) {
    const g = this.game;
    const roads = this.roads;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const e = roads.edges[Math.floor(g.rng() * roads.edges.length)];
      const a = roads.nodes[e.a], b = roads.nodes[e.b];
      const t = 0.2 + g.rng() * 0.6;
      const [from, to] = g.rng() < 0.5 ? [a, b] : [b, a];
      const p = roads.lanePoint(from, to, t);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < minR || d > maxR) continue;
      if (g.vehicles.nearest(p.x, p.z, 12)) continue;
      const heading = Math.atan2(to.x - from.x, to.z - from.z);
      const kind = type || TRAFFIC_MIX[Math.floor(g.rng() * TRAFFIC_MIX.length)];
      const v = g.vehicles.spawn(kind, p.x, p.z, heading, { role: 'traffic' });
      v.ai = { from: from.id, to: to.id, cruise: (e.kind === 'avenue' ? 16 : 12.5) * (0.85 + g.rng() * 0.3), wait: 0, honk: 0 };
      v.body.setVelocityForward(v.ai.cruise * 0.8);
      this.cars.push(v);
      return v;
    }
    return null;
  }

  spawnParked(x, z) {
    const g = this.game;
    const roads = this.roads;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const e = roads.edges[Math.floor(g.rng() * roads.edges.length)];
      if (e.kind === 'bridge') continue;
      const a = roads.nodes[e.a], b = roads.nodes[e.b];
      const t = 0.25 + g.rng() * 0.5;
      const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t;
      const d = Math.hypot(cx - x, cz - z);
      if (d < 30 || d > 160) continue;
      const len = e.length || 1;
      const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
      const side = g.rng() < 0.5 ? 1 : -1;
      const px = cx - fz * side * (ROAD_WIDTH / 2 - 1.6), pz = cz + fx * side * (ROAD_WIDTH / 2 - 1.6);
      if (g.vehicles.nearest(px, pz, 8)) continue;
      const kind = g.rng.pick(['sedan', 'brutus', 'vireo', 'van', 'cab', 'bike', 'sedan']);
      const heading = Math.atan2(fx * side, fz * side);
      const v = g.vehicles.spawn(kind, px, pz, heading, { role: 'parked' });
      v.input.handbrake = true;
      this.parked.push(v);
      return v;
    }
    return null;
  }

  populate(x, z) {
    for (let k = 0; k < this.targetMoving; k += 1) this.spawnNear(x, z, 25, MAX_SPAWN);
    for (let k = 0; k < this.targetParked; k += 1) this.spawnParked(x, z);
  }

  update(dt) {
    const g = this.game;
    const px = g.player.x, pz = g.player.z;
    this.cars = this.cars.filter((v) => !v.removed && v.role === 'traffic');
    this.parked = this.parked.filter((v) => !v.removed && v.role === 'parked');
    for (const v of this.cars) {
      const far = Math.hypot(v.body.x - px, v.body.z - pz) > DESPAWN;
      if (far || (v.dead && v.burn <= 0 && far)) { g.vehicles.remove(v); continue; }
      if (v.dead) { v.input.throttle = 0; continue; }
      this.drive(v, dt);
    }
    for (const v of this.parked) {
      if (Math.hypot(v.body.x - px, v.body.z - pz) > DESPAWN) g.vehicles.remove(v);
    }
    // wrecks and abandoned cars left behind
    for (const v of g.vehicles.list.slice()) {
      if ((v.role === 'wreck' || v.dead) && Math.hypot(v.body.x - px, v.body.z - pz) > DESPAWN) g.vehicles.remove(v);
    }
    const moving = this.cars.length;
    if (moving < this.targetMoving) this.spawnNear(px, pz);
    if (this.parked.length < this.targetParked) this.spawnParked(px, pz);
  }

  /** Steer one car along its lane. `flee` ignores signals and drives flat out (mission targets). */
  drive(v, dt, flee = false) {
    const g = this.game;
    const roads = this.roads;
    const ai = v.ai;
    const b = v.body;
    let from = roads.nodes[ai.from], to = roads.nodes[ai.to];
    const remaining = Math.hypot(to.x - b.x, to.z - b.z);
    if (remaining < 9) {
      const next = this.chooseNext(from, to);
      ai.from = to.id; ai.to = next.id;
      from = to; to = next;
    }
    // aim at a point a little ahead along the lane
    const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    const along = ((b.x - from.x) * (to.x - from.x) + (b.z - from.z) * (to.z - from.z)) / (len * len);
    const ahead = clamp(along + 10 / len, 0, 1);
    const p = roads.lanePoint(from, to, ahead);
    const want = Math.atan2(p.x - b.x, p.z - b.z);
    const diff = wrapAngle(want - b.heading);
    v.input.steer = clamp(-diff * 2.4, -1, 1);
    const panic = flee || (g.clock < this.panicUntil && Math.hypot(b.x - g.player.x, b.z - g.player.z) < 120);
    let target = panic ? ai.cruise * 1.5 : ai.cruise;
    if (Math.abs(diff) > 0.35) target = Math.min(target, 7);
    // red light ahead?
    const distToNode = Math.hypot(to.x - b.x, to.z - b.z);
    if (to.signal && !panic) {
      const axis = Math.abs(to.x - from.x) > Math.abs(to.z - from.z) ? 'x' : 'z';
      const light = RoadNetwork.signalFor(axis, g.clock);
      if (light !== 'green' && distToNode > 12 && distToNode < 26) target = Math.min(target, (distToNode - 13) * 0.6);
    }
    // keep distance to whatever is in front
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    for (const o of g.vehicles.list) {
      if (o === v) continue;
      const dx = o.body.x - b.x, dz = o.body.z - b.z;
      if (Math.abs(dx) > 22 || Math.abs(dz) > 22) continue;
      const fwd = dx * fx + dz * fz;
      if (fwd < 0 || fwd > 20) continue;
      const lat = Math.abs(dx * -fz + dz * fx);
      if (lat > 3) continue;
      target = Math.min(target, Math.max(0, (fwd - 6) * 0.8));
      if (o.role === 'player' && fwd < 10) ai.honk += dt;
    }
    if (ai.honk > 1.2) { ai.honk = 0; g.audio?.horn(b.x, b.z); }
    const speed = b.forwardSpeed;
    const err = target - speed;
    v.input.throttle = clamp(err * 0.5, -1, 1);
    v.input.handbrake = target < 0.5 && speed < 1;
  }

  /** Pick the next node at a junction: straight on is likeliest, U-turns only at dead ends. */
  chooseNext(from, at) {
    const g = this.game;
    const options = at.links.map((l) => this.roads.nodes[l.node]).filter((n) => n.id !== from.id);
    if (!options.length) return from;
    const dirX = at.x - from.x, dirZ = at.z - from.z;
    const weights = options.map((n) => {
      const ox = n.x - at.x, oz = n.z - at.z;
      const straight = (ox * dirX + oz * dirZ) / ((Math.hypot(ox, oz) * Math.hypot(dirX, dirZ)) || 1);
      return straight > 0.7 ? 3 : 1;
    });
    let r = g.rng() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < options.length; i += 1) {
      r -= weights[i];
      if (r <= 0) return options[i];
    }
    return options[options.length - 1];
  }
}
