// HALO-1, the Solenne Police air unit. It joins at three stars, flies an orbit around the
// player's last known position, and sweeps a searchlight (a real spot light plus a visible
// additive beam and a bright pool on the ground) toward them. The light is always in the
// scene, dark when the helicopter is away, so no shader ever has to recompile.
import * as THREE from 'three';
import { MeshBuilder } from '../render/meshBuilder.js';
import { glowTexture } from '../render/proceduralTextures.js';
import { damp, wrapAngle } from '../core/mathUtils.js';

/** The airframe is modelled at about two thirds of real size and scaled up here. */
const SCALE = 1.55;

/**
 * The HALO-1 airframe, nose toward +z: a rounded white cabin with a blue belly band and a dark
 * wraparound canopy, a tapering tail boom with fin and stabiliser, skids, and the rotor mast.
 */
function buildAirframe() {
  const b = new MeshBuilder();
  const alongZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const WHITE = 0xf2f4f8, BLUE = 0x1d48b8, GLASS = 0x0e1a2c, DARK = 0x23262d;
  b.addCylinder(0, 0, 0.2, 1.15, 1.15, 3.6, WHITE, 14, alongZ);
  b.addCylinder(0, -0.05, 2.45, 0.55, 1.12, 0.9, WHITE, 14, alongZ);
  b.addCylinder(0, 0.12, 2.25, 0.62, 1.0, 1.1, GLASS, 14, alongZ);
  b.addCylinder(0, 0, -1.9, 1.12, 0.7, 1.0, WHITE, 14, alongZ);
  b.addBox(0, -0.55, 0.2, 2.34, 0.42, 3.4, BLUE);
  b.addBox(0, 0.15, 0.55, 2.36, 0.85, 1.1, GLASS);
  b.addCylinder(0, 0.35, -4.6, 0.42, 0.22, 4.6, WHITE, 10, alongZ);
  b.addBox(0, 0.32, -4.4, 0.48, 0.16, 3.8, BLUE);
  b.addBox(0, 1.05, -6.75, 0.14, 1.9, 0.95, BLUE);
  b.addBox(0, 0.4, -6.2, 2.0, 0.1, 0.55, WHITE);
  b.addBox(0, 1.05, 0, 1.3, 0.35, 1.8, DARK);
  b.addCylinder(0, 1.4, 0, 0.18, 0.24, 0.5, DARK, 8);
  for (const s of [-1, 1]) {
    b.addBox(s * 1.05, -1.55, 0.2, 0.13, 0.13, 3.9, DARK);
    b.addBox(s * 0.85, -1.2, 1.1, 0.1, 0.65, 0.1, DARK);
    b.addBox(s * 0.85, -1.2, -0.8, 0.1, 0.65, 0.1, DARK);
  }
  b.addCylinder(0, -1.0, 2.0, 0.28, 0.28, 0.4, 0xdfe8f0, 10);
  return b.build();
}

export class PoliceHelicopter {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.x = 0; this.y = 60; this.z = 0; this.heading = 0;
    this.orbit = 0;
    this.aim = new THREE.Vector3();
    this.group = new THREE.Group();
    const body = new THREE.Mesh(buildAirframe(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45 }));
    body.castShadow = true;
    this.rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 }));
    this.rotor.position.y = 1.6;
    const rotor2 = this.rotor.clone();
    rotor2.rotation.y = Math.PI / 2;
    this.rotor.add(rotor2);
    rotor2.position.set(0, 0, 0);
    // the spinning blades read as a soft disc from the ground
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x202634, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.y = 1.62;
    this.group.add(disc);
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    this.tail.position.set(0.25, 1.1, -6.5);
    this.group.add(body, this.rotor, this.tail);
    this.group.scale.setScalar(SCALE);

    // searchlight: spot light, visible cone, ground pool
    this.spot = new THREE.SpotLight(0xe8f4ff, 0, 160, 0.2, 0.5, 1.0);
    this.spot.castShadow = false;
    game.scene.add(this.spot, this.spot.target);
    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
    coneGeo.translate(0, -0.5, 0);
    coneGeo.rotateX(-Math.PI / 2);
    // brightest at the lamp, fading toward the ground
    const pos = coneGeo.attributes.position;
    const fade = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const k = 1 - 0.85 * Math.min(1, pos.getZ(i));
      fade[i * 3] = fade[i * 3 + 1] = fade[i * 3 + 2] = k;
    }
    coneGeo.setAttribute('color', new THREE.BufferAttribute(fade, 3));
    this.beam = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xbfdcff, vertexColors: true, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.renderOrder = 8;
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xdcecff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pool.renderOrder = 4;
    game.scene.add(this.group, this.beam, this.pool);
    this.setVisible(false);
  }

  setVisible(on) {
    this.group.visible = on;
    this.beam.visible = on;
    this.pool.visible = on;
    if (!on) this.spot.intensity = 0;
  }

  activate(x, z) {
    if (this.active) return;
    this.active = true;
    this.x = x - 180; this.z = z - 120; this.y = 55;
    this.aim.set(x, 0, z);
    this.setVisible(true);
  }

  deactivate() {
    this.active = false;
    this.leaving = 6;
  }

  get distanceToPlayer() {
    return Math.hypot(this.x - this.game.player.x, this.z - this.game.player.z);
  }

  /** True when the player is inside the searchlight's reach. */
  canSee() {
    return this.active && Math.hypot(this.aim.x - this.game.player.x, this.aim.z - this.game.player.z) < 22 && this.distanceToPlayer < 140;
  }

  update(dt, focus) {
    const g = this.game;
    if (!this.active && !(this.leaving > 0)) return;
    if (!this.active) {
      this.leaving -= dt;
      this.y += dt * 10;
      this.x += Math.sin(this.heading) * 30 * dt;
      this.z += Math.cos(this.heading) * 30 * dt;
      if (this.leaving <= 0) this.setVisible(false);
    } else {
      this.orbit += dt * 0.22;
      const tx = focus.x + Math.sin(this.orbit) * 38, tz = focus.z + Math.cos(this.orbit) * 38;
      const dx = tx - this.x, dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.min(34, d * 0.9);
      if (d > 0.1) { this.x += (dx / d) * sp * dt; this.z += (dz / d) * sp * dt; }
      const want = Math.atan2(focus.x - this.x, focus.z - this.z);
      this.heading += wrapAngle(want - this.heading) * damp(1.5, dt);
      this.y += (46 - this.y) * damp(0.8, dt);
      this.aim.x += (focus.x - this.aim.x) * damp(1.8, dt);
      this.aim.z += (focus.z - this.aim.z) * damp(1.8, dt);
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.set(0.12, this.heading, Math.sin(g.clock * 0.7) * 0.05, 'YXZ');
    this.rotor.rotation.y += dt * 38;
    this.tail.rotation.x += dt * 50;
    // searchlight
    const night = g.sky.night;
    const lx = this.x + Math.sin(this.heading) * 2.4 * SCALE, ly = this.y - 1.4 * SCALE, lz = this.z + Math.cos(this.heading) * 2.4 * SCALE;
    this.spot.position.set(lx, ly, lz);
    this.spot.target.position.set(this.aim.x, 0, this.aim.z);
    this.spot.intensity = this.group.visible ? 60 + night * 900 : 0;
    const toX = this.aim.x - lx, toY = -ly, toZ = this.aim.z - lz;
    const len = Math.hypot(toX, toY, toZ);
    this.beam.position.set(lx, ly, lz);
    this.beam.lookAt(this.aim.x, 0, this.aim.z);
    const radius = Math.min(8, len * Math.tan(0.13));
    this.beam.scale.set(radius, radius, len);
    const near = Math.max(0, 1 - Math.max(0, len - 90) / 80);
    this.beam.material.opacity = (0.08 + night * 0.04) * near;
    this.pool.position.set(this.aim.x, 0.15, this.aim.z);
    this.pool.scale.set(radius * 2.6, 1, radius * 2.6);
    this.pool.material.opacity = (0.12 + night * 0.38) * Math.max(0.3, near);
    this.lamp = { x: lx, y: ly, z: lz };
  }

  /** Searchlight lens and beacon halos, added each rendered frame. */
  pushGlows(glow, clock) {
    if (!this.group.visible || !this.lamp) return;
    glow.push(this.lamp.x, this.lamp.y, this.lamp.z, 0xf0f8ff, 9, 0, 1.6);
    const blink = Math.floor(clock * 2) % 2;
    glow.push(this.x, this.y - 1.6, this.z - 1, blink ? 0xff2030 : 0x2040ff, 4.5, 0, 1.2);
    const tx = this.x - Math.sin(this.heading) * 10, tz = this.z - Math.cos(this.heading) * 10;
    glow.push(tx, this.y + 1.5, tz, blink ? 0x2040ff : 0xff2030, 3, 0, 1);
  }
}
