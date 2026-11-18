// In-world markers: a tall light beacon with a pulsing ground ring for objectives, and
// checkpoint arches for races. They are additive and unlit so they read at any hour.
import * as THREE from 'three';
import { glowTexture } from './proceduralTextures.js';

export class Beacon {
  constructor(scene, color = 0xffd166, height = 40) {
    this.group = new THREE.Group();
    const beamGeo = new THREE.CylinderGeometry(1.6, 2.2, height, 16, 1, true);
    beamGeo.translate(0, height / 2, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.ringMat = new THREE.MeshBasicMaterial({ color, map: glowTexture(), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.y = 0.3;
    const chevron = new THREE.ConeGeometry(1.1, 1.8, 4);
    chevron.rotateX(Math.PI);
    this.arrow = new THREE.Mesh(chevron, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    this.arrow.position.y = 5;
    this.group.add(this.beam, this.ring, this.arrow);
    this.beam.renderOrder = 9;
    this.ring.renderOrder = 4;
    this.group.visible = false;
    scene.add(this.group);
    this.t = 0;
  }

  setColor(color) {
    this.beamMat.color.set(color);
    this.ringMat.color.set(color);
    this.arrow.material.color.set(color);
  }

  show(x, z, size = 6, y = 0) {
    this.group.visible = true;
    this.group.position.set(x, y, z);
    this.size = size;
  }

  hide() { this.group.visible = false; }

  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;
    const s = this.size * (1 + Math.sin(this.t * 4) * 0.08);
    this.ring.scale.set(s * 2.4, 1, s * 2.4);
    this.arrow.position.y = 4.5 + Math.sin(this.t * 3) * 0.5;
    this.arrow.rotation.y += dt * 2;
  }
}

/** A race checkpoint: two glowing posts and a banner bar between them. */
export class CheckpointGate {
  constructor(scene, color = 0x4fe8ff) {
    this.group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), mat);
      post.position.set(s * 9, 3.5, 0);
      this.group.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.8, 0.4), mat);
    bar.position.y = 7;
    this.group.add(bar);
    this.group.visible = false;
    scene.add(this.group);
  }

  show(x, z, yaw, y = 0) {
    this.group.visible = true;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
  }

  hide() { this.group.visible = false; }
}
