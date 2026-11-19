// Arcade vehicle dynamics. Velocity is split into forward and sideways parts in the car's
// frame: the engine and brakes act on the forward part, tyre grip bleeds off the sideways part
// (much less with the handbrake up, which is what lets the car drift), and the yaw rate follows
// a bicycle model with speed-sensitive steering. Buildings push the car out and dent it.
import { clamp, damp, wrapAngle } from '../core/mathUtils.js';
import { surfaceAt, groundHeight } from '../world/cityLayout.js';
import { topSpeedFactor, accelFactor, gripFactor, damageFactor } from './vehicleTuning.js';

export class VehicleBody {
  constructor(def, x, z, heading) {
    this.def = def;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this.health = def.health;
    this.slip = 0;
    this.braking = false;
    this.reversing = false;
    this.airborne = 0;
    this.rpm = 0;
    this.gear = 1;
    this.roll = 0;
    this.pitch = 0;
    this.lastImpact = 0;
    this.sunk = false;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading); }
  get radius() { return this.def.width * 0.55; }

  setVelocityForward(v) {
    this.vx = Math.sin(this.heading) * v;
    this.vz = Math.cos(this.heading) * v;
  }
}

/**
 * Advance one vehicle by dt. `input` is { throttle: -1..1, steer: -1..1, handbrake }.
 * Returns an impact record { speed, x, z } when it hit something this step, else null.
 */
export function stepVehicle(body, input, dt, collision) {
  const def = body.def;
  const sin = Math.sin(body.heading), cos = Math.cos(body.heading);
  let vF = body.vx * sin + body.vz * cos;
  let vR = body.vx * -cos + body.vz * sin;
  const throttle = body.health > 0 ? input.throttle : 0;
  const onSand = surfaceAt(body.x, body.z) === 'sand';
  const top = def.maxSpeed * topSpeedFactor(body) * (onSand ? 0.55 : 1) * (body.health < def.health * 0.25 ? 0.7 : 1);
  const accel = def.accel * accelFactor(body);

  body.braking = false;
  body.reversing = false;
  if (throttle > 0) {
    if (vF < -0.5) { vF += def.brake * throttle * dt; body.braking = true; }
    else if (vF < top) vF += accel * throttle * dt * (1 - 0.65 * (vF / top) ** 2);
  } else if (throttle < 0) {
    if (vF > 0.5) { vF -= def.brake * -throttle * dt; body.braking = true; }
    else if (vF > -top * 0.3) { vF += accel * 0.55 * throttle * dt; body.reversing = true; }
  }
  // rolling resistance and aero drag
  const drag = (throttle === 0 ? 1.4 : 0.3) + Math.abs(vF) * 0.006;
  vF -= Math.sign(vF) * Math.min(Math.abs(vF), drag * dt * (def.kind === 'boat' ? 3 : 1));
  if (input.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 7 * dt);

  // tyre grip on the sideways component
  const grip = def.grip * gripFactor(body) * (input.handbrake ? 0.13 : 1) * (onSand ? 0.6 : 1);
  vR *= Math.exp(-grip * dt);
  body.slip = Math.abs(vR);

  // steering: less lock at speed, more yaw with the handbrake up
  const speedFactor = 1 / (1 + Math.abs(vF) * 0.045);
  const targetSteer = input.steer * def.steer * speedFactor;
  body.steerAngle += (targetSteer - body.steerAngle) * damp(9, dt);
  const wheelbase = def.length * 0.62;
  let targetYaw = (vF / wheelbase) * Math.tan(body.steerAngle);
  if (input.handbrake) targetYaw *= 1.55;
  if (def.kind === 'boat') targetYaw = input.steer * def.steer * clamp(Math.abs(vF) / 8, 0, 1.2) * Math.sign(vF || 1) * 1.4;
  body.yawRate += (targetYaw - body.yawRate) * damp(input.handbrake ? 4 : 8, dt);
  body.heading = wrapAngle(body.heading - body.yawRate * dt);

  const ns = Math.sin(body.heading), nc = Math.cos(body.heading);
  body.vx = ns * vF + -nc * vR;
  body.vz = nc * vF + ns * vR;

  const px = body.x, pz = body.z;
  body.x += body.vx * dt;
  body.z += body.vz * dt;

  // stay on the right medium: cars sink in the bay, boats beach on land
  const surf = surfaceAt(body.x, body.z);
  let impact = null;
  if (def.kind === 'boat' && surf !== 'water') {
    body.x = px; body.z = pz;
    impact = bounce(body, -body.vx, -body.vz, 0.2);
  }
  if (def.kind !== 'boat' && surf === 'water') body.sunk = true;

  // building collisions with front and rear circles
  const r = body.radius;
  for (const off of [def.length * 0.3, -def.length * 0.3]) {
    const cx = body.x + ns * off, cz = body.z + nc * off;
    const hit = collision.resolveCircle(cx, cz, r);
    if (!hit) continue;
    body.x += hit.x - cx;
    body.z += hit.z - cz;
    const rec = bounce(body, hit.nx, hit.nz, 0.25);
    if (rec && (!impact || rec.speed > impact.speed)) impact = { ...rec, x: cx - hit.nx * r, z: cz - hit.nz * r };
  }

  // engine note bookkeeping: fake gearbox from road speed
  const ratio = Math.abs(vF) / def.maxSpeed;
  const gearF = clamp(ratio * def.gears, 0, def.gears - 0.001);
  body.gear = body.reversing ? 0 : Math.floor(gearF) + 1;
  const inGear = gearF - Math.floor(gearF);
  body.rpm = throttle !== 0 || Math.abs(vF) > 1 ? 0.25 + 0.75 * inGear : 0.15;

  // body roll and pitch for the visual mesh
  body.roll += (clamp(-body.yawRate * vF * 0.01, -0.12, 0.12) - body.roll) * damp(6, dt);
  body.pitch += (clamp((body.braking ? 0.04 : throttle > 0 ? -0.025 : 0), -0.06, 0.06) - body.pitch) * damp(5, dt);
  const ground = def.kind === 'boat' ? null : groundHeight(body.x, body.z);
  if (ground !== null) body.y = ground;
  return impact;
}

/** Reflect the velocity off a contact normal; returns { speed } of the hit if it was hard. */
function bounce(body, nx, nz, restitution) {
  const len = Math.hypot(nx, nz) || 1;
  nx /= len; nz /= len;
  const vn = body.vx * nx + body.vz * nz;
  if (vn >= 0) return null;
  body.vx -= (1 + restitution) * vn * nx;
  body.vz -= (1 + restitution) * vn * nz;
  body.vx *= 0.92;
  body.vz *= 0.92;
  body.yawRate *= 0.5;
  const speed = -vn;
  if (speed > 6) {
    if (!body.invulnerable) body.health = Math.max(0, body.health - ((speed - 6) * 2.2 / body.def.mass) * damageFactor(body));
    body.lastImpact = speed;
  }
  return speed > 3 ? { speed } : null;
}

/** Push two overlapping vehicles apart and exchange momentum. Returns the closing speed. */
export function collideVehicles(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const minD = (a.def.length + b.def.length) * 0.3;
  if (d >= minD || d < 1e-4) return 0;
  const nx = dx / d, nz = dz / d;
  const overlap = minD - d;
  const ma = a.def.mass, mb = b.def.mass;
  const total = ma + mb;
  a.x -= nx * overlap * (mb / total); a.z -= nz * overlap * (mb / total);
  b.x += nx * overlap * (ma / total); b.z += nz * overlap * (ma / total);
  const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rel >= 0) return 0;
  const j = (-1.3 * rel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx; a.vz -= (j / ma) * nz;
  b.vx += (j / mb) * nx; b.vz += (j / mb) * nz;
  const speed = -rel;
  if (speed > 5) {
    if (!a.invulnerable) a.health = Math.max(0, a.health - (speed * 1.2 / ma) * damageFactor(a));
    if (!b.invulnerable) b.health = Math.max(0, b.health - (speed * 1.2 / mb) * damageFactor(b));
  }
  return speed;
}
