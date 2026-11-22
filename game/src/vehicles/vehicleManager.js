// Owns every vehicle in the world: spawns and removes them, steps their physics with whatever
// is driving them (player, traffic AI, police AI), resolves car-on-car hits, smokes and burns
// damaged wrecks, blows them up, and feeds headlight, tail-light and siren halos to the glow
// cloud.
import * as THREE from 'three';
import { VEHICLES } from './vehicleCatalog.js';
import { createVehicleMesh } from './vehicleModels.js';
import { VehicleBody, stepVehicle, collideVehicles } from './vehiclePhysics.js';
import { glowTexture } from '../render/proceduralTextures.js';

let nextId = 1;
const DRAW_DISTANCE = 330;
const SHADOW_DISTANCE = 80;

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.beamMaterial = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xfff1c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beamGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }

  spawn(type, x, z, heading, { role = 'parked', paint = null } = {}) {
    const def = VEHICLES[type];
    const color = paint ?? def.paints[Math.floor(this.game.rng() * def.paints.length)];
    const body = new VehicleBody(def, x, z, heading);
    const mesh = createVehicleMesh(def, color);
    if (def.kind !== 'boat') {
      const beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      beam.scale.set(def.width * 3.2, 1, 16);
      beam.position.set(0, 0.08, def.length / 2 + 8);
      beam.renderOrder = 3;
      mesh.add(beam);
      mesh.userData.beam = beam;
    }
    this.group.add(mesh);
    const v = {
      id: nextId++, type, def, body, mesh, role, paint: color, driver: role === 'parked' ? null : 'npc',
      ai: null, siren: false, sirenPhase: this.game.rng() * 6, dead: false, burn: 0, smokeTimer: 0,
      input: { throttle: 0, steer: 0, handbrake: false }, horn: 0, label: def.short,
    };
    this.list.push(v);
    this.syncMesh(v);
    return v;
  }

  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(v.mesh);
    v.mesh.userData.paint?.dispose();
    v.removed = true;
  }

  syncMesh(v) {
    const b = v.body;
    v.mesh.position.set(b.x, b.y + (v.def.kind === 'boat' ? this.game.water.heightAt(b.x, b.z, this.game.clock) - b.y + 0.2 : 0), b.z);
    v.mesh.rotation.set(b.pitch, b.heading, b.roll, 'YXZ');
    if (v.def.kind === 'bike') v.mesh.rotation.z = -b.steerAngle * Math.min(1, b.speed / 15) * 0.9;
  }

  /** Physics, damage and collisions for everything. */
  update(dt) {
    const game = this.game;
    for (const v of this.list) {
      if (v.dead) {
        v.body.vx *= 0.96; v.body.vz *= 0.96;
        v.body.x += v.body.vx * dt; v.body.z += v.body.vz * dt;
        this.burnWreck(v, dt);
        continue;
      }
      const impact = stepVehicle(v.body, v.input, dt, game.collision);
      if (impact && impact.speed > 8) game.events.emit('crash', { vehicle: v, speed: impact.speed, x: impact.x ?? v.body.x, z: impact.z ?? v.body.z });
      if (v.body.sunk) this.sink(v);
      if (v.body.health <= 0 && !v.dead) this.explode(v);
      this.damageEffects(v, dt);
    }
    // car-on-car contacts (n is small; broad phase by distance)
    const n = this.list.length;
    for (let i = 0; i < n; i += 1) {
      const a = this.list[i];
      for (let j = i + 1; j < n; j += 1) {
        const b = this.list[j];
        if (Math.abs(a.body.x - b.body.x) > 8 || Math.abs(a.body.z - b.body.z) > 8) continue;
        const speed = collideVehicles(a.body, b.body);
        if (speed > 6) game.events.emit('crash', { vehicle: a, other: b, speed, x: (a.body.x + b.body.x) / 2, z: (a.body.z + b.body.z) / 2 });
      }
    }
    for (const v of this.list) this.syncMesh(v);
  }

  damageEffects(v, dt) {
    const frac = v.body.health / v.def.health;
    if (frac > 0.45) return;
    v.smokeTimer -= dt;
    if (v.smokeTimer > 0) return;
    v.smokeTimer = frac < 0.2 ? 0.05 : 0.12;
    const b = v.body;
    const fx = Math.sin(b.heading) * v.def.length * 0.38, fz = Math.cos(b.heading) * v.def.length * 0.38;
    const fire = frac < 0.2;
    this.game.particles.smoke(b.x + fx, b.y + 1.1, b.z + fz, fire ? 0x2a2a2a : 0x9a9a9a, fire ? 1.6 : 1.1);
    if (fire) this.game.particles.fire(b.x + fx, b.y + 1.0, b.z + fz);
    if (fire) v.body.health -= dt * 3;
  }

  explode(v) {
    v.dead = true;
    v.input.throttle = 0;
    v.mesh.userData.paint.color.setHex(0x1a1a1a);
    v.mesh.userData.paint.roughness = 1;
    v.burn = 12;
    const b = v.body;
    this.game.particles.explosion(b.x, b.y + 1, b.z);
    this.game.events.emit('explosion', { x: b.x, z: b.z, vehicle: v, radius: 9 });
  }

  burnWreck(v, dt) {
    if (v.burn <= 0) return;
    v.burn -= dt;
    v.smokeTimer -= dt;
    if (v.smokeTimer > 0) return;
    v.smokeTimer = 0.07;
    this.game.particles.fire(v.body.x, v.body.y + 1.2, v.body.z);
    this.game.particles.smoke(v.body.x, v.body.y + 2, v.body.z, 0x222222, 2);
  }

  sink(v) {
    if (v.dead) return;
    v.dead = true;
    v.burn = 0;
    v.mesh.position.y -= 2;
    this.game.particles.splash(v.body.x, v.body.z);
    this.game.events.emit('vehicleSunk', { vehicle: v });
  }

  /** Nearest vehicle to a point, within range, optionally filtered. */
  nearest(x, z, range, filter = null) {
    let best = null, bestD = range * range;
    for (const v of this.list) {
      if (filter && !filter(v)) continue;
      const d = (v.body.x - x) ** 2 + (v.body.z - z) ** 2;
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  /** Light halos for every vehicle near the camera. */
  pushGlows(glow, camPos, night, clock) {
    this.beamMaterial.opacity = night * 0.2;
    const beams = night > 0.05;
    for (const v of this.list) {
      const b = v.body;
      const d2 = (b.x - camPos.x) ** 2 + (b.z - camPos.z) ** 2;
      // distance culling: far cars are not drawn, and only nearby ones cast shadows
      v.mesh.visible = d2 < DRAW_DISTANCE * DRAW_DISTANCE;
      v.mesh.userData.body.castShadow = d2 < SHADOW_DISTANCE * SHADOW_DISTANCE;
      if (v.mesh.userData.beam) v.mesh.userData.beam.visible = beams && d2 < 120 * 120;
      if (v.dead) continue;
      if (d2 > 260 * 260) continue;
      const s = Math.sin(b.heading), c = Math.cos(b.heading);
      const half = v.def.length / 2;
      const w = v.def.width * 0.34;
      const lift = b.y + (v.def.kind === 'bike' ? 0.92 : 0.68);
      if (v.def.kind !== 'boat') {
        if (night > 0.2) {
          for (const side of v.def.kind === 'bike' ? [0] : [-1, 1]) {
            glow.push(b.x + s * (half + 0.1) - c * side * w, lift, b.z + c * (half + 0.1) + s * side * w, 0xfff2d0, 2.6, 0, night);
          }
        }
        const brake = b.braking ? 1 : 0.35 + 0.4 * night;
        for (const side of v.def.kind === 'bike' ? [0] : [-1, 1]) {
          glow.push(b.x - s * (half + 0.1) - c * side * w, lift + 0.05, b.z - c * (half + 0.1) + s * side * w, 0xff2020, b.braking ? 2.4 : 1.4, 0, brake);
        }
      }
      if (v.siren) {
        const phase = Math.floor((clock + v.sirenPhase) * 7) % 2;
        const roof = b.y + (v.def.body === 'van' ? 2.5 : 1.7);
        const rz = v.def.body === 'van' ? 1.2 : -0.3;
        const ox = s * rz, oz = c * rz;
        glow.push(b.x + ox + c * 0.45, roof, b.z + oz - s * 0.45, 0xff1530, phase ? 3.8 : 1.6, 0, phase ? 1.2 : 0.45);
        glow.push(b.x + ox - c * 0.45, roof, b.z + oz + s * 0.45, 0x1a50ff, phase ? 1.6 : 3.8, 0, phase ? 0.45 : 1.2);
      }
    }
  }
}
