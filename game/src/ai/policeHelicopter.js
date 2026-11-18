// HALO-1, the Solenne Police air unit. It joins at three stars, flies an orbit around the
// player's last known position, and sweeps a searchlight (a real spot light plus a visible
// additive beam and a bright pool on the ground) toward them. The light is always in the
// scene, dark when the helicopter is away, so no shader ever has to recompile.
import * as THREE from 'three';
import { MeshBuilder } from '../render/meshBuilder.js';
import { glowTexture } from '../render/proceduralTextures.js';
import { damp, wrapAngle } from '../core/mathUtils.js';

export class PoliceHelicopter {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.x = 0; this.y = 60; this.z = 0; this.heading = 0;
    this.orbit = 0;
    this.aim = new THREE.Vector3();
    this.group = new THREE.Group();
    const b = new MeshBuilder();
    b.addBox(0, 0, 0, 2.2, 2.0, 4.4, 0x10213a);
    b.addBox(0, 0.15, 1.9, 1.9, 1.5, 1.4, 0x0b1626);
    b.addBox(0, -0.2, 2.65, 1.5, 0.9, 0.6, 0x7fb2d8);
    b.addBox(0, 0.4, -4.2, 0.45, 0.5, 5.0, 0x10213a);
    b.addBox(0, 1.1, -6.5, 0.15, 1.6, 0.9, 0xf4f4f4);
    b.addBox(0, -0.2, 0, 2.25, 0.35, 2.6, 0xf4f4f4);
    for (const s of [-1, 1]) {
      b.addBox(s * 1.1, -1.35, 0, 0.12, 0.12, 3.8, 0x222222);
      b.addBox(s * 0.9, -0.95, 0.9, 0.1, 0.8, 0.1, 0x222222);
      b.addBox(s * 0.9, -0.95, -0.9, 0.1, 0.8, 0.1, 0x222222);
    }
    b.addCylinder(0, 1.25, 0, 0.25, 0.3, 0.6, 0x222222, 8);
    const body = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5 }));
    body.castShadow = true;
    this.rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.06, 0.35), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 }));
    this.rotor.position.y = 1.6;
    const rotor2 = this.rotor.clone();
    rotor2.rotation.y = Math.PI / 2;
    this.rotor.add(rotor2);
    rotor2.position.set(0, 0, 0);
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.8, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    this.tail.position.set(0.25, 1.1, -6.5);
    this.group.add(body, this.rotor, this.tail);

    // searchlight: spot light, visible cone, ground pool
    this.spot = new THREE.SpotLight(0xe8f4ff, 0, 160, 0.2, 0.5, 1.0);
    this.spot.castShadow = false;
    game.scene.add(this.spot, this.spot.target);
    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true);
    coneGeo.translate(0, -0.5, 0);
    coneGeo.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xbfdcff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
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
    const lx = this.x + Math.sin(this.heading) * 2.4, ly = this.y - 1.4, lz = this.z + Math.cos(this.heading) * 2.4;
    this.spot.position.set(lx, ly, lz);
    this.spot.target.position.set(this.aim.x, 0, this.aim.z);
    this.spot.intensity = this.group.visible ? 60 + night * 900 : 0;
    const toX = this.aim.x - lx, toY = -ly, toZ = this.aim.z - lz;
    const len = Math.hypot(toX, toY, toZ);
    this.beam.position.set(lx, ly, lz);
    this.beam.lookAt(this.aim.x, 0, this.aim.z);
    const radius = len * Math.tan(0.13);
    this.beam.scale.set(radius, radius, len);
    this.beam.material.opacity = 0.012 + night * 0.1;
    this.pool.position.set(this.aim.x, 0.15, this.aim.z);
    this.pool.scale.set(radius * 3.2, 1, radius * 3.2);
    this.pool.material.opacity = 0.12 + night * 0.55;
    this.lamp = { x: lx, y: ly, z: lz };
  }

  /** Searchlight lens and beacon halos, added each rendered frame. */
  pushGlows(glow, clock) {
    if (!this.group.visible || !this.lamp) return;
    glow.push(this.lamp.x, this.lamp.y, this.lamp.z, 0xf0f8ff, 6, 0, 1.4);
    const blink = Math.floor(clock * 2) % 2;
    glow.push(this.x, this.y - 1, this.z - 1, blink ? 0xff2030 : 0x2040ff, 3, 0, 1);
  }
}
