// Pedestrians. Each walks the sidewalk loop around a city block (or the beach boardwalk),
// chatting along at walking pace. Gunfire, explosions and speeding cars make them run or cower;
// cars and bullets can kill them, which the police care about. People far from the player are
// recycled into new walkers near them, so the streets always look busy.
import { randomLook } from './characterRig.js';
import { GRID_LINES, GRID_COUNT, ROAD_WIDTH, SIDEWALK, LAND, districtAt } from '../world/cityLayout.js';
import { damp, wrapAngle } from '../core/mathUtils.js';

const OFF = ROAD_WIDTH / 2 + SIDEWALK * 0.5;
const SPAWN_RADIUS = 140;
const DESPAWN_RADIUS = 210;

export class PedestrianCrowd {
  constructor(game, count = 46) {
    this.game = game;
    this.people = [];
    for (let k = 0; k < count; k += 1) {
      const fig = game.characters.add(randomLook(game.rng));
      const ped = { fig, health: 40, dead: false, state: 'walk', fear: 0, threat: null, route: null, leg: 0, dir: 1, speed: 1.3, deadTimer: 0 };
      ped.takeHit = (dmg, source, dir) => this.hurt(ped, dmg, source, dir);
      this.people.push(ped);
      fig.visible = false;
    }
    game.events.on('gunshot', (e) => this.scare(e.x, e.z, 55, e.shooter === 'player'));
    game.events.on('explosion', (e) => this.scare(e.x, e.z, 70, true));
    game.events.on('carjack', (e) => this.scare(e.x, e.z, 20, true));
  }

  /** Put every pedestrian somewhere near (x, z) (initial fill and after teleports). */
  populate(x, z) {
    for (const p of this.people) this.respawn(p, x, z, true);
  }

  respawn(p, px, pz, anywhere = false) {
    const rng = this.game.rng;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const a = rng() * Math.PI * 2;
      const r = anywhere ? 15 + rng() * SPAWN_RADIUS : SPAWN_RADIUS * (0.7 + rng() * 0.3);
      const tx = px + Math.sin(a) * r, tz = pz + Math.cos(a) * r;
      const route = this.routeNear(tx, tz);
      if (!route) continue;
      p.route = route;
      p.leg = Math.floor(rng() * route.length);
      p.dir = rng() < 0.5 ? 1 : -1;
      const c = route[p.leg];
      const n = route[(p.leg + p.dir + route.length) % route.length];
      const t = rng();
      p.fig.x = c[0] + (n[0] - c[0]) * t;
      p.fig.z = c[1] + (n[1] - c[1]) * t;
      p.fig.y = 0.2;
      p.fig.visible = true;
      p.fig.state = 'walk';
      p.fig.deathTime = 0;
      p.state = 'walk';
      p.dead = false;
      p.health = 40;
      p.fear = 0;
      p.speed = 1.1 + rng() * 0.6;
      p.fig.look = randomLook(rng);
      this.game.characters.paint(p.fig);
      return;
    }
    p.fig.visible = false;
  }

  /** The sidewalk loop of the block containing (x, z), or the boardwalk. */
  routeNear(x, z) {
    if (x > LAND.maxX - 30 && x < LAND.maxX + 14 && z > LAND.minZ + 30 && z < LAND.maxZ - 30) {
      const bx = LAND.maxX + 5;
      return [[bx, z - 60], [bx + 3, z + 60]];
    }
    const i = Math.floor((x - GRID_LINES[0]) / 100);
    const j = Math.floor((z - GRID_LINES[0]) / 100);
    if (i < 0 || j < 0 || i >= GRID_COUNT - 1 || j >= GRID_COUNT - 1) return null;
    const x0 = GRID_LINES[i] + OFF, x1 = GRID_LINES[i + 1] - OFF;
    const z0 = GRID_LINES[j] + OFF, z1 = GRID_LINES[j + 1] - OFF;
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  }

  scare(x, z, radius, crime) {
    for (const p of this.people) {
      if (p.dead || !p.fig.visible) continue;
      const d = Math.hypot(p.fig.x - x, p.fig.z - z);
      if (d > radius) continue;
      p.state = d < 9 && this.game.rng() < 0.4 ? 'cower' : 'flee';
      p.fear = 5 + this.game.rng() * 5;
      p.threat = { x, z };
      if (crime && d < 30 && this.game.rng() < 0.3) this.game.events.emit('witness', { x: p.fig.x, z: p.fig.z });
    }
  }

  hurt(p, dmg, source, dir) {
    if (p.dead) return;
    p.health -= dmg;
    if (dir) { p.fig.x += dir.x * 0.3; p.fig.z += dir.z * 0.3; }
    if (p.health <= 0) this.kill(p, source);
    else { p.state = 'flee'; p.fear = 8; p.threat = { x: p.fig.x - (dir?.x ?? 0) * 5, z: p.fig.z - (dir?.z ?? 0) * 5 }; }
  }

  kill(p, source) {
    p.dead = true;
    p.state = 'dead';
    p.fig.state = 'dead';
    p.fig.speed = 0;
    p.deadTimer = 25;
    if (source === 'player') {
      this.game.state.stats.kills += 1;
      this.game.events.emit('pedKilled', { x: p.fig.x, z: p.fig.z });
    }
  }

  update(dt) {
    const g = this.game;
    const px = g.player.x, pz = g.player.z;
    for (const p of this.people) {
      const f = p.fig;
      if (!f.visible) { this.respawn(p, px, pz); continue; }
      const far = Math.hypot(f.x - px, f.z - pz) > DESPAWN_RADIUS;
      if (p.dead) {
        p.deadTimer -= dt;
        if (p.deadTimer <= 0 || far) this.respawn(p, px, pz);
        continue;
      }
      if (far && p.state === 'walk') { this.respawn(p, px, pz); continue; }
      this.dodgeTraffic(p);
      if (p.dead) continue;
      if (p.state === 'walk') this.walk(p, dt);
      else this.panic(p, dt);
      f.y += (0.2 - f.y) * damp(10, dt);
    }
  }

  walk(p, dt) {
    const f = p.fig;
    const route = p.route;
    const next = route[(p.leg + p.dir + route.length) % route.length];
    const dx = next[0] - f.x, dz = next[1] - f.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      p.leg = (p.leg + p.dir + route.length) % route.length;
      if (route.length === 2) p.dir *= -1;
      return;
    }
    f.x += (dx / d) * p.speed * dt;
    f.z += (dz / d) * p.speed * dt;
    f.yaw += wrapAngle(Math.atan2(dx, dz) - f.yaw) * damp(8, dt);
    f.speed = p.speed;
    f.state = 'walk';
  }

  panic(p, dt) {
    const f = p.fig;
    p.fear -= dt;
    if (p.fear <= 0) {
      p.state = 'walk';
      p.route = this.routeNear(f.x, f.z) || p.route;
      p.leg = 0;
      return;
    }
    if (p.state === 'cower') {
      f.speed = 0;
      f.state = 'cower';
      if (p.fear < 3) p.state = 'flee';
      return;
    }
    const ax = f.x - p.threat.x, az = f.z - p.threat.z;
    const a = Math.atan2(ax, az);
    f.yaw += wrapAngle(a - f.yaw) * damp(6, dt);
    const sp = 6.2;
    f.x += Math.sin(f.yaw) * sp * dt;
    f.z += Math.cos(f.yaw) * sp * dt;
    const hit = this.game.collision.resolveCircle(f.x, f.z, 0.4);
    if (hit) { f.x = hit.x; f.z = hit.z; f.yaw += 0.8; }
    f.speed = sp;
    f.state = 'flee';
  }

  /** Jump clear of approaching cars; get run over if too slow. */
  dodgeTraffic(p) {
    const f = p.fig;
    for (const v of this.game.vehicles.list) {
      const b = v.body;
      if (Math.abs(b.x - f.x) > 6 || Math.abs(b.z - f.z) > 6) continue;
      const d = Math.hypot(b.x - f.x, b.z - f.z);
      if (d < v.def.length * 0.45 && b.speed > 5) {
        this.kill(p, v.role === 'player' ? 'player' : 'traffic');
        f.x += b.vx * 0.15; f.z += b.vz * 0.15;
        this.game.particles.blood(f.x, 1, f.z);
        this.game.events.emit('pedHitByCar', { vehicle: v, x: f.x, z: f.z });
        return;
      }
      if (d < 5 && b.speed > 4 && p.state === 'walk') { p.state = 'flee'; p.fear = 2; p.threat = { x: b.x, z: b.z }; }
    }
  }

  /** District-flavoured head count (busier in Calle Lumen and downtown). */
  static densityAt(x, z) {
    const d = districtAt(x, z).id;
    return d === 'lumen' || d === 'meridian' || d === 'palmera' ? 1 : 0.6;
  }
}
