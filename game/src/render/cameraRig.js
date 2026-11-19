// The third-person camera. Behind a vehicle it trails with spring lag, leads into turns and
// widens its field of view with speed; on foot it orbits over the right shoulder and tightens
// when aiming. It pulls in when a wall would block the view, shakes on impacts, and can be
// handed a fixed cinematic framing for cutscenes and the title screen.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from '../core/mathUtils.js';

/** Chase distances the player cycles with V: low and close, standard, high and far. */
export const CHASE_VIEWS = [
  { name: 'CLOSE CHASE', dist: 5.6, perSpeed: 0.014, height: 1.85, lookUp: 1.25, fov: 52, fovGain: 0.2 },
  { name: 'STANDARD', dist: 6.4, perSpeed: 0.026, height: 2.1, lookUp: 1.3, fov: 56, fovGain: 0.24 },
  { name: 'HIGH', dist: 10.5, perSpeed: 0.03, height: 4.4, lookUp: 1.1, fov: 58, fovGain: 0.24 },
];

export class CameraRig {
  constructor(camera, collision) {
    this.camera = camera;
    this.collision = collision;
    this.yaw = 0;
    this.pitch = 0.22;
    this.orbitIdle = 0;
    this.shake = 0;
    this.fov = 62;
    this.pos = new THREE.Vector3(0, 10, 0);
    this.look = new THREE.Vector3();
    this.cinematic = null;
    this.mode = 'foot';
    this.initialised = false;
    this.viewIndex = 0;
  }

  /** Next chase view (V). Returns its name for a toast. */
  cycleView() {
    this.viewIndex = (this.viewIndex + 1) % CHASE_VIEWS.length;
    return CHASE_VIEWS[this.viewIndex].name;
  }

  /** Mouse look: dx, dy in pixels. */
  orbit(dx, dy, sensitivity = 1, invert = false) {
    if (dx === 0 && dy === 0) return;
    this.yaw -= dx * 0.0032 * sensitivity;
    this.pitch = clamp(this.pitch + dy * 0.0026 * sensitivity * (invert ? -1 : 1), -0.5, 1.1);
    this.orbitIdle = 0;
  }

  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  /** Snap behind a heading (after entering a car, or for staged shots). */
  snapBehind(heading) {
    this.yaw = heading + Math.PI;
    this.initialised = false;
  }

  update(dt, target) {
    const cam = this.camera;
    if (this.cinematic) {
      const c = this.cinematic;
      this.pos.lerp(c.position, this.initialised ? damp(c.rate ?? 3, dt) : 1);
      this.look.lerp(c.target, this.initialised ? damp(c.rate ?? 3, dt) : 1);
      this.fov = lerp(this.fov, c.fov ?? 55, this.initialised ? damp(3, dt) : 1);
      this.initialised = true;
      this.apply(cam);
      return;
    }
    let desired, lookAt, fov;
    if (target.vehicle) {
      const b = target.vehicle.body;
      const def = target.vehicle.def;
      const speed = b.speed;
      this.orbitIdle += dt;
      const behind = b.heading + Math.PI;
      if (this.orbitIdle > 1.4 || this.mode !== 'vehicle') this.yaw += wrapAngle(behind - this.yaw) * damp(this.mode !== 'vehicle' ? 30 : 3.2, dt);
      if (this.orbitIdle > 1.4) this.pitch += (0.12 - this.pitch) * damp(2, dt);
      this.mode = 'vehicle';
      const view = CHASE_VIEWS[this.viewIndex];
      const size = def.kind === 'bike' ? 0.8 : def.body === 'van' ? 1.25 : def.kind === 'boat' ? 1.35 : 1;
      const dist = (view.dist + Math.min(speed, 50) * view.perSpeed) * size;
      const height = view.height * size + Math.max(0, this.pitch) * 5;
      desired = new THREE.Vector3(b.x + Math.sin(this.yaw) * dist, b.y + height, b.z + Math.cos(this.yaw) * dist);
      const lead = Math.min(speed, 40) * 0.16;
      lookAt = new THREE.Vector3(b.x + Math.sin(b.heading) * lead, b.y + view.lookUp * size, b.z + Math.cos(b.heading) * lead);
      fov = view.fov + clamp(speed, 0, 60) * view.fovGain;
    } else {
      this.mode = target.aiming ? 'aim' : 'foot';
      const aiming = target.aiming;
      const dist = aiming ? 3.5 : 4.6;
      const shoulder = aiming ? 0.95 : 0.6;
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      const p = target.position;
      const pitch = this.pitch;
      desired = new THREE.Vector3(
        p.x + Math.sin(this.yaw) * dist * Math.cos(pitch) - rx * shoulder,
        p.y + 1.7 + Math.sin(pitch) * dist,
        p.z + Math.cos(this.yaw) * dist * Math.cos(pitch) - rz * shoulder,
      );
      lookAt = new THREE.Vector3(p.x - Math.sin(this.yaw) * 6 - rx * shoulder, p.y + 1.55 - pitch * 3, p.z - Math.cos(this.yaw) * 6 - rz * shoulder);
      fov = aiming ? 52 : 62;
    }
    // keep the camera out of walls
    const from = target.vehicle ? target.vehicle.body : target.position;
    const hit = this.collision.raycast(from.x, 2, from.z, desired.x, desired.y, desired.z);
    if (hit < 1) desired.set(lerp(from.x, desired.x, hit * 0.9), desired.y, lerp(from.z, desired.z, hit * 0.9));
    desired.y = Math.max(desired.y, 0.8);
    // translation follows tightly (lag would leave the car tiny at speed); the swing comes from yaw smoothing
    const rate = target.vehicle ? 24 : 14;
    if (!this.initialised) { this.pos.copy(desired); this.look.copy(lookAt); this.fov = fov; this.initialised = true; }
    this.pos.lerp(desired, damp(rate, dt));
    this.look.lerp(lookAt, damp(target.vehicle ? 26 : 18, dt));
    this.fov = lerp(this.fov, fov, damp(4, dt));
    this.apply(cam, dt);
  }

  apply(cam, dt = 0) {
    cam.position.copy(this.pos);
    if (this.shake > 0) {
      const s = this.shake * 0.35;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Direction the camera faces on the ground plane (for on-foot movement and aiming). */
  forward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }
}
