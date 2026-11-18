// Solenne Police Department. Crimes that a cop or a civilian witness sees raise the wanted
// level (1-5 stars). Each level sends more and harder units: patrol cars that route through
// the street grid and then ram, roadblocks across the road ahead, the Bastion SWAT van and the
// HALO-1 helicopter. Officers bail out to arrest or shoot. Break line of sight and stay out of
// it long enough, and the search is called off.
import { randomLook } from '../actors/characterRig.js';
import { clamp, wrapAngle, damp } from '../core/mathUtils.js';
import { PoliceHelicopter } from './policeHelicopter.js';

const UNITS_FOR_LEVEL = [0, 2, 3, 4, 5, 6];
const CALLSIGNS = ['MARLIN', 'CORAL', 'TIDE', 'REEF', 'DUNE', 'SURF', 'GULL', 'ORCA'];
const OFFICER_LOOK = { skin: 0xc68642, shirt: 0x1b2f5a, pants: 0x14213d, hair: 0x111111, sleeves: true, scale: 1 };

export class PoliceDispatch {
  constructor(game) {
    this.game = game;
    this.units = [];
    this.inSight = false;
    this.lastSeen = { x: 0, z: 0 };
    this.unseenTime = 0;
    this.spawnTimer = 0;
    this.roadblockTimer = 8;
    this.sightTimer = 0;
    this.callIndex = 0;
    this.flash = 0;
    this.heli = new PoliceHelicopter(game);
    this.officerPool = [];
    for (let k = 0; k < 14; k += 1) {
      const fig = game.characters.add({ ...OFFICER_LOOK, skin: randomLook(game.rng).skin });
      fig.visible = false;
      fig.armed = true;
      const o = { fig, active: false, dead: true, health: 60, cooldown: 1, unit: null, state: 'idle' };
      o.takeHit = (dmg, source) => this.hurtOfficer(o, dmg, source);
      this.officerPool.push(o);
    }
    const e = game.events;
    e.on('gunshot', (s) => { if (s.shooter === 'player') this.reportCrime('gunshot', s.x, s.z); });
    e.on('pedKilled', (s) => this.reportCrime('murder', s.x, s.z));
    e.on('explosion', (s) => { if (Math.hypot(s.x - game.player.x, s.z - game.player.z) < 40) this.reportCrime('explosion', s.x, s.z); });
    e.on('assault', (s) => this.reportCrime('assault', s.x, s.z));
    e.on('witness', (s) => { if (this.pendingCrime) this.reportCrime(this.pendingCrime, s.x, s.z, true); });
    e.on('crash', (c) => {
      const pv = game.player.vehicle;
      if (!pv) return;
      if ((c.vehicle === pv && c.other?.def.police) || (c.other === pv && c.vehicle.def.police)) this.reportCrime('hitCop', c.x, c.z, true);
    });
    e.on('vehicleShot', (s) => { if (s.shooter === 'player' && s.vehicle.def.police) this.reportCrime('shotCop', s.vehicle.body.x, s.vehicle.body.z, true); });
  }

  get wanted() { return this.game.state.wanted; }

  /** Activity list for the HUD: callsign, distance, status. */
  get roster() {
    const p = this.game.player;
    const list = this.units.filter((u) => !u.vehicle.dead).map((u) => ({
      callsign: u.callsign, status: u.status, distance: Math.hypot(u.vehicle.body.x - p.x, u.vehicle.body.z - p.z), kind: u.kind,
    }));
    if (this.heli.active) list.push({ callsign: 'HALO-1', status: this.heli.canSee() ? 'SPOTLIGHT' : 'AIR SEARCH', distance: this.heli.distanceToPlayer, kind: 'air' });
    return list.sort((a, b) => a.distance - b.distance);
  }

  /** A crime happened at (x, z). Police or witnesses nearby turn it into stars. */
  reportCrime(kind, x, z, witnessed = false) {
    const g = this.game;
    const severity = { gunshot: 1, assault: 1, carjack: 1, hitCop: 1, murder: 2, stolePolice: 2, shotCop: 3, explosion: 2, copKilled: 3 }[kind] ?? 1;
    const copNear = this.copCanSee(x, z, 90);
    if (!witnessed && !copNear) {
      // civilians may phone it in a moment later
      this.pendingCrime = kind;
      if (kind === 'carjack' && g.rng() > 0.45) return;
      if (kind === 'gunshot' && g.rng() > 0.8) return;
    }
    this.pendingCrime = null;
    let level = this.wanted;
    if (kind === 'murder' || kind === 'copKilled') level += 1;
    level = Math.max(level, severity);
    if (kind === 'shotCop' || kind === 'copKilled') level = Math.max(level, 3);
    this.setWanted(level, x, z);
  }

  setWanted(level, x = this.game.player.x, z = this.game.player.z) {
    const st = this.game.state;
    level = clamp(Math.round(level), 0, 5);
    if (level > st.wanted) {
      this.flash = 2.5;
      this.unseenTime = 0;
      this.lastSeen = { x, z };
      this.game.events.emit('wantedUp', level);
    }
    st.wanted = level;
    if (level === 0) this.standDown();
  }

  standDown() {
    for (const u of this.units) { u.status = 'RETURNING'; u.leaving = true; u.vehicle.siren = false; }
    this.heli.deactivate();
    for (const o of this.officerPool) if (o.active && !o.dead) o.state = 'leave';
  }

  /** Can any unit or officer see the point (x, z) from within `range`? */
  copCanSee(x, z, range) {
    const col = this.game.collision;
    for (const u of this.units) {
      const b = u.vehicle.body;
      if (u.vehicle.dead || u.leaving) continue;
      if (Math.hypot(b.x - x, b.z - z) < range && col.lineOfSight(b.x, 1.6, b.z, x, 1.6, z)) return true;
    }
    for (const o of this.officerPool) {
      if (!o.active || o.dead) continue;
      if (Math.hypot(o.fig.x - x, o.fig.z - z) < range && col.lineOfSight(o.fig.x, 1.6, o.fig.z, x, 1.6, z)) return true;
    }
    return false;
  }

  get officers() { return this.officerPool.filter((o) => o.active); }

  nearestOfficer(x, z, range) {
    let best = null, bestD = range;
    for (const o of this.officerPool) {
      if (!o.active || o.dead) continue;
      const d = Math.hypot(o.fig.x - x, o.fig.z - z);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.flash = Math.max(0, this.flash - dt);
    this.sightTimer -= dt;
    if (this.sightTimer <= 0 && this.wanted > 0) {
      this.sightTimer = 0.25;
      this.inSight = this.copCanSee(p.x, p.z, 110) || this.heli.canSee();
      if (this.inSight) { this.lastSeen = { x: p.x, z: p.z }; this.unseenTime = 0; }
    }
    if (this.wanted > 0) {
      if (!this.inSight) this.unseenTime += dt;
      const searchFor = 9 + this.wanted * 4;
      if (this.unseenTime > searchFor) this.setWanted(0);
      this.spawnTimer -= dt;
      const active = this.units.filter((u) => !u.leaving && !u.vehicle.dead).length;
      if (this.spawnTimer <= 0 && active < UNITS_FOR_LEVEL[this.wanted]) {
        this.spawnTimer = 2.5;
        this.spawnUnit(this.wanted >= 4 && !this.units.some((u) => u.kind === 'swat' && !u.leaving) ? 'swat' : 'patrol');
      }
      if (this.wanted >= 3) {
        if (!this.heli.active) this.heli.activate(p.x, p.z);
        this.roadblockTimer -= dt;
        if (this.roadblockTimer <= 0 && p.vehicle) { this.roadblockTimer = 22; this.placeRoadblock(); }
      }
    } else {
      this.inSight = false;
    }
    const focus = this.inSight ? { x: p.x, z: p.z } : this.lastSeen;
    this.heli.update(dt, this.wanted >= 3 ? { x: p.x + (focus.x - p.x) * 0.5, z: p.z + (focus.z - p.z) * 0.5 } : focus);
    for (const u of this.units.slice()) this.driveUnit(u, dt);
    for (const o of this.officerPool) if (o.active) this.updateOfficer(o, dt);
  }

  spawnUnit(kind, at = null) {
    const g = this.game;
    const roads = g.roads;
    const p = g.player;
    let node = at;
    if (!node) {
      const candidates = roads.nodes.filter((n) => {
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        return d > 110 && d < 220;
      });
      if (!candidates.length) return null;
      node = candidates[Math.floor(g.rng() * candidates.length)];
    }
    const heading = Math.atan2(p.x - node.x, p.z - node.z);
    const v = g.vehicles.spawn(kind === 'swat' ? 'swat' : 'police', node.x, node.z, heading, { role: 'police' });
    v.siren = true;
    v.body.setVelocityForward(15);
    const n = ++this.callIndex;
    const unit = {
      vehicle: v, kind, callsign: kind === 'swat' ? `BASTION-${n}` : `${CALLSIGNS[n % CALLSIGNS.length]}-${10 + n}`,
      status: 'RESPONDING', route: [], routeTimer: 0, stuck: 0, reverse: 0, crew: kind === 'swat' ? 4 : 2, deployed: false, leaving: false,
    };
    v.ai = unit;
    this.units.push(unit);
    return unit;
  }

  placeRoadblock() {
    const g = this.game;
    const p = g.player;
    const b = p.vehicle.body;
    const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    let best = null, bestScore = -Infinity;
    for (const n of g.roads.nodes) {
      const dx = n.x - p.x, dz = n.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 70 || d > 170) continue;
      const score = (dx * fx + dz * fz) / d - Math.abs(d - 110) / 200;
      if (score > bestScore) { bestScore = score; best = n; }
    }
    if (!best || bestScore < 0.6) return;
    for (const side of [-1, 1]) {
      const ang = b.heading + Math.PI / 2 + side * 0.35;
      const ox = Math.cos(b.heading) * side * 3.2, oz = -Math.sin(b.heading) * side * 3.2;
      const v = g.vehicles.spawn('police', best.x + ox, best.z + oz, ang, { role: 'police' });
      v.siren = true;
      v.input.handbrake = true;
      const unit = { vehicle: v, kind: 'roadblock', callsign: `BLOCK-${++this.callIndex}`, status: 'ROADBLOCK', route: [], crew: 1, deployed: false, leaving: false, parked: true };
      v.ai = unit;
      this.units.push(unit);
      this.deployOfficers(unit, 1);
    }
  }

  driveUnit(u, dt) {
    const g = this.game;
    const v = u.vehicle;
    const b = v.body;
    const p = g.player;
    if (v.removed || v.role === 'player') { this.units.splice(this.units.indexOf(u), 1); return; }
    const dist = Math.hypot(b.x - p.x, b.z - p.z);
    if (v.dead) {
      u.status = 'DISABLED';
      if (dist > 260) { g.vehicles.remove(v); this.units.splice(this.units.indexOf(u), 1); }
      return;
    }
    if (u.leaving) {
      if (dist > 230) { g.vehicles.remove(v); this.units.splice(this.units.indexOf(u), 1); return; }
      v.input.throttle = 0.4; v.input.steer = 0;
      return;
    }
    if (u.parked) { v.input.throttle = 0; v.input.handbrake = true; return; }
    if (u.deployed) {
      v.input.throttle = 0; v.input.handbrake = true;
      if (dist > 45 && p.vehicle) { u.deployed = false; this.recallOfficers(u); }
      return;
    }
    // close enough to bail out?
    if (dist < 16 && (!p.vehicle || p.vehicle.body.speed < 3)) {
      u.deployed = true;
      u.status = 'ON FOOT';
      this.deployOfficers(u, u.crew);
      return;
    }
    let tx, tz;
    const seen = dist < 75 && g.collision.lineOfSight(b.x, 1.5, b.z, p.x, 1.5, p.z);
    if (seen) {
      const pv = p.vehicle?.body;
      const lead = pv ? Math.min(1.2, dist / 30) : 0;
      tx = p.x + (pv ? pv.vx * lead : 0);
      tz = p.z + (pv ? pv.vz * lead : 0);
      u.status = dist < 22 && this.wanted >= 2 ? 'RAMMING' : 'PURSUIT';
    } else {
      u.routeTimer -= dt;
      if (u.routeTimer <= 0 || !u.route.length) {
        u.routeTimer = 2;
        const roads = g.roads;
        const from = roads.nearestNode(b.x, b.z);
        const goal = this.inSight ? { x: p.x, z: p.z } : this.lastSeen;
        const to = roads.nearestNode(goal.x, goal.z);
        u.route = roads.route(from.id, to.id).slice(1);
      }
      const roads = g.roads;
      while (u.route.length && Math.hypot(roads.nodes[u.route[0]].x - b.x, roads.nodes[u.route[0]].z - b.z) < 10) u.route.shift();
      const next = u.route.length ? roads.nodes[u.route[0]] : (this.inSight ? { x: p.x, z: p.z } : this.lastSeen);
      tx = next.x; tz = next.z;
      u.status = this.inSight ? 'PURSUIT' : 'SEARCHING';
    }
    const want = Math.atan2(tx - b.x, tz - b.z);
    const diff = wrapAngle(want - b.heading);
    const speed = b.forwardSpeed;
    if (u.reverse > 0) {
      u.reverse -= dt;
      v.input.throttle = -1;
      v.input.steer = clamp(diff * 2, -1, 1);
      v.input.handbrake = false;
      return;
    }
    v.input.steer = clamp(-diff * 2.6, -1, 1);
    const top = v.def.maxSpeed * (0.7 + this.wanted * 0.06);
    const target = Math.abs(diff) > 1.2 ? 9 : Math.abs(diff) > 0.5 ? top * 0.55 : top;
    v.input.throttle = clamp((target - speed) * 0.4, -1, 1);
    v.input.handbrake = Math.abs(diff) > 1.3 && speed > 12;
    if (Math.abs(speed) < 1.2 && v.input.throttle > 0.3) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt);
    if (u.stuck > 1.4) { u.stuck = 0; u.reverse = 1.1; }
  }

  deployOfficers(u, count) {
    const b = u.vehicle.body;
    let placed = 0;
    for (const o of this.officerPool) {
      if (placed >= count) break;
      if (o.active && !o.dead) continue;
      if (o.active && o.dead && o.deadTimer > 0) continue;
      const side = placed % 2 ? 1 : -1;
      o.active = true; o.dead = false; o.health = u.kind === 'swat' ? 110 : 60; o.unit = u;
      o.fig.x = b.x + Math.cos(b.heading) * side * 2.2 - Math.sin(b.heading) * placed * 0.8;
      o.fig.z = b.z - Math.sin(b.heading) * side * 2.2 - Math.cos(b.heading) * placed * 0.8;
      o.fig.y = 0; o.fig.visible = true; o.fig.state = 'idle'; o.fig.deathTime = 0;
      o.cooldown = 0.6 + this.game.rng() * 0.8;
      o.state = 'engage';
      placed += 1;
    }
  }

  recallOfficers(u) {
    for (const o of this.officerPool) if (o.unit === u && !o.dead) { o.active = false; o.fig.visible = false; }
    u.status = 'PURSUIT';
  }

  updateOfficer(o, dt) {
    const g = this.game;
    const f = o.fig;
    if (o.dead) {
      o.deadTimer -= dt;
      if (o.deadTimer <= 0) { o.active = false; f.visible = false; }
      return;
    }
    const p = g.player;
    const dx = p.x - f.x, dz = p.z - f.z;
    const d = Math.hypot(dx, dz);
    if (o.state === 'leave' || d > 150 || this.wanted === 0) {
      f.aim = false; f.speed = 2;
      if (d > 90 || this.wanted === 0) { o.active = false; f.visible = false; }
      return;
    }
    const face = Math.atan2(dx, dz);
    f.yaw += wrapAngle(face - f.yaw) * damp(8, dt);
    const shooting = this.wanted >= 2 && p.alive;
    const keep = shooting ? 9 : 1.4;
    if (d > keep) {
      const sp = d > 20 ? 6 : 3.6;
      f.x += (dx / d) * sp * dt; f.z += (dz / d) * sp * dt;
      const hit = g.collision.resolveCircle(f.x, f.z, 0.4);
      if (hit) { f.x = hit.x; f.z = hit.z; }
      f.speed = sp;
    } else f.speed = 0;
    f.aim = shooting && d < 45;
    f.aimPitch = 0;
    if (f.aim) {
      o.cooldown -= dt;
      if (o.cooldown <= 0 && g.collision.lineOfSight(f.x, 1.5, f.z, p.x, 1.5, p.z)) {
        o.cooldown = (o.unit?.kind === 'swat' ? 0.25 : 0.7) + g.rng() * 0.6;
        const miss = (g.rng() - 0.5) * (0.12 + d * 0.004);
        g.combat.fire({ shooter: 'police', x: f.x, y: 1.45, z: f.z, yaw: face + miss, pitch: 0, weapon: o.unit?.kind === 'swat' ? 'smg' : 'pistol', figure: f });
      }
    }
  }

  hurtOfficer(o, dmg, source) {
    if (o.dead) return;
    o.health -= dmg;
    if (o.health > 0) return;
    o.dead = true;
    o.deadTimer = 20;
    o.fig.state = 'dead';
    o.fig.aim = false;
    o.fig.speed = 0;
    if (source === 'player') {
      this.game.state.stats.kills += 1;
      this.reportCrime('copKilled', o.fig.x, o.fig.z, true);
    }
  }
}
