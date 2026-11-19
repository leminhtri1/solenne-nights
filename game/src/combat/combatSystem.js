// Gunfire and fists. A shot is a hitscan ray (several for the shotgun) tested against walls,
// people (as upright cylinders) and vehicles; the nearest hit takes the damage. Every shot is
// announced as a 'gunshot' event, which scatters pedestrians and tells the police.
import * as THREE from 'three';
import { WEAPONS } from './weaponCatalog.js';
import { damageFactor } from '../vehicles/vehicleTuning.js';

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.tracers = [];
    // tracer streaks: one additive line-segment buffer refilled every frame
    this.maxTracers = 64;
    this.tracerPos = new Float32Array(this.maxTracers * 6);
    this.tracerCol = new Float32Array(this.maxTracers * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracerLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.tracerLines.frustumCulled = false;
    this.tracerLines.renderOrder = 8;
    game.scene.add(this.tracerLines);
  }

  /** All people that can be hit, as { fig, takeHit(dmg, source, dir) } entries. */
  targets() {
    const g = this.game;
    const list = [];
    for (const p of g.peds.people) if (!p.dead) list.push(p);
    for (const c of g.police.officers) if (!c.dead) list.push(c);
    for (const a of g.missions.actors) if (!a.dead) list.push(a);
    return list;
  }

  fire(shot) {
    const g = this.game;
    const w = WEAPONS[shot.weapon];
    g.state.stats.shots += shot.shooter === 'player' ? 1 : 0;
    if (w.melee) return this.melee(shot, w);
    const dx = Math.sin(shot.yaw), dz = Math.cos(shot.yaw);
    const mx = shot.x + dx * 0.9, mz = shot.z + dz * 0.9;
    g.particles.muzzle(mx, shot.y, mz, dx, dz, shot.weapon === 'shotgun');
    g.audio?.gunshot(shot.weapon, shot.x, shot.z);
    g.events.emit('gunshot', { x: shot.x, z: shot.z, shooter: shot.shooter });
    for (let p = 0; p < w.pellets; p += 1) {
      const yaw = shot.yaw + (g.rng() - 0.5) * 2 * w.spread;
      const pitch = (shot.pitch || 0) * 0.6 + (g.rng() - 0.5) * w.spread;
      this.ray(shot, yaw, pitch, w);
    }
  }

  ray(shot, yaw, pitch, w) {
    const g = this.game;
    const dx = Math.sin(yaw) * Math.cos(pitch), dz = Math.cos(yaw) * Math.cos(pitch), dy = -Math.sin(pitch);
    const ox = shot.x + dx * 0.6, oy = shot.y, oz = shot.z + dz * 0.6;
    const range = w.range;
    let best = range;
    let hitTarget = null;
    let hitVehicle = null;
    const wallT = g.collision.raycast(ox, oy, oz, ox + dx * range, oy + dy * range, oz + dz * range);
    best = wallT * range;
    const hitPlayer = shot.shooter !== 'player';
    const people = this.targets();
    if (hitPlayer && g.player.alive && !g.player.vehicle) people.push(g.player.asTarget || (g.player.asTarget = playerTarget(g)));
    for (const t of people) {
      if (t.fig === shot.figure) continue;
      const tt = rayCylinder(ox, oz, dx, dz, t.fig.x, t.fig.z, 0.45);
      if (tt === null || tt > best || tt < 0) continue;
      const y = oy + dy * tt;
      if (y < t.fig.y - 0.1 || y > t.fig.y + 1.95) continue;
      best = tt; hitTarget = t; hitVehicle = null;
    }
    for (const v of g.vehicles.list) {
      if (v === shot.vehicle || v.dead && v.burn <= 0) continue;
      if (!hitPlayer && v === g.player.vehicle) continue;
      const tt = rayCylinder(ox, oz, dx, dz, v.body.x, v.body.z, v.def.length * 0.36);
      if (tt === null || tt > best || tt < 0) continue;
      best = tt; hitVehicle = v; hitTarget = null;
    }
    const hx = ox + dx * best, hy = oy + dy * best, hz = oz + dz * best;
    this.tracers.push({ ax: ox, ay: oy, az: oz, bx: hx, by: hy, bz: hz, life: 0.06 });
    if (hitTarget) {
      g.particles.blood(hx, hy, hz);
      hitTarget.takeHit(w.damage, shot.shooter, { x: dx, z: dz });
    } else if (hitVehicle) {
      g.particles.sparks(hx, hy, hz, 5);
      if (!hitVehicle.body.invulnerable) hitVehicle.body.health -= w.damage * 0.35 * damageFactor(hitVehicle.body);
      if (hitVehicle.role === 'player' && hitPlayer) g.player.damage(w.damage * 0.15, 'gunfire');
      g.events.emit('vehicleShot', { vehicle: hitVehicle, shooter: shot.shooter });
    } else if (best < range * 0.999) {
      g.particles.impact(hx, hy, hz);
    }
  }

  melee(shot, w) {
    const g = this.game;
    const dx = Math.sin(shot.yaw), dz = Math.cos(shot.yaw);
    g.audio?.punch();
    for (const t of this.targets()) {
      const ex = t.fig.x - shot.x, ez = t.fig.z - shot.z;
      const d = Math.hypot(ex, ez);
      if (d > w.range || d < 0.01) continue;
      if ((ex * dx + ez * dz) / d < 0.5) continue;
      t.takeHit(w.damage, shot.shooter, { x: dx, z: dz });
      g.events.emit('assault', { x: shot.x, z: shot.z });
      return;
    }
  }

  /** Bright streaks for recent shots: a hot head near the target fading to a dim tail. */
  update(dt) {
    const glow = this.game.dynamicGlow;
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i -= 1) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.tracers.splice(i, 1); continue; }
      if (n >= this.maxTracers) continue;
      const k = n * 6;
      const tail = 0.35;
      this.tracerPos.set([t.ax + (t.bx - t.ax) * tail, t.ay + (t.by - t.ay) * tail, t.az + (t.bz - t.az) * tail, t.bx, t.by, t.bz], k);
      const a = Math.min(1, t.life / 0.06);
      this.tracerCol.set([0.6 * a, 0.35 * a, 0.1 * a, 3 * a, 2.4 * a, 1.2 * a], k);
      glow.push(t.bx, t.by, t.bz, 0xffc070, 0.9, 0, a);
      n += 1;
    }
    const geo = this.tracerLines.geometry;
    geo.setDrawRange(0, n * 2);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}

function playerTarget(g) {
  return {
    fig: g.player.figure,
    takeHit: (dmg) => g.player.damage(dmg * 0.55, 'gunfire'),
  };
}

/** Distance along a 2D ray (unit-ish dir) to a circle, or null. */
function rayCylinder(ox, oz, dx, dz, cx, cz, r) {
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const fx = cx - ox, fz = cz - oz;
  const along = fx * ux + fz * uz;
  if (along < 0) return null;
  const perp2 = fx * fx + fz * fz - along * along;
  if (perp2 > r * r) return null;
  return (along - Math.sqrt(r * r - perp2)) / len;
}
