// Pooled particles in two point clouds: one alpha-blended (smoke, tyre smoke, dust, water
// spray) and one additive (fire, sparks, muzzle flashes, explosion cores). A single flash
// light, always in the scene so shaders never recompile, lights up gunfire and blasts.
import * as THREE from 'three';
import { smokeTexture, glowTexture } from './proceduralTextures.js';

const VERT = /* glsl */ `
attribute float size; attribute float alpha; attribute vec3 tint;
uniform float scale; varying float vAlpha; varying vec3 vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(size * scale / max(-mv.z, 0.1), 160.0);
  // anything right in front of the lens fades out rather than smearing the frame
  vAlpha = alpha * smoothstep(2.5, 8.0, -mv.z); vTint = tint;
}`;
const FRAG = /* glsl */ `
uniform sampler2D map; uniform float additive; varying float vAlpha; varying vec3 vTint;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  if (additive > 0.5) gl_FragColor = vec4(vTint * t.rgb * t.a * vAlpha, 1.0);
  else gl_FragColor = vec4(vTint, t.a * vAlpha * 0.7);
}`;

class ParticleCloud {
  constructor(capacity, additive, texture) {
    this.capacity = capacity;
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.c = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.grow = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { map: { value: texture }, scale: { value: 400 }, additive: { value: additive ? 1 : 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 7 : 6;
    this.geometry = g;
    this.color = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, color, size, life, grow = 1, gravity = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.color.set(color);
    this.c[i * 3] = this.color.r; this.c[i * 3 + 1] = this.color.g; this.c[i * 3 + 2] = this.color.b;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.gravity[i] = gravity;
  }

  update(dt) {
    for (let i = 0; i < this.capacity; i += 1) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.v[k + 1] -= this.gravity[i] * dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      this.v[k] *= 0.985; this.v[k + 2] *= 0.985;
      this.size[i] += this.grow[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 1.6) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    for (const name of ['position', 'tint', 'size', 'alpha']) this.geometry.attributes[name].needsUpdate = true;
  }
}

export class ParticleEffects {
  constructor(scene, rng) {
    this.rng = rng;
    this.soft = new ParticleCloud(900, false, smokeTexture());
    this.hot = new ParticleCloud(700, true, glowTexture());
    scene.add(this.soft.points, this.hot.points);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 30, 1.6);
    scene.add(this.flashLight);
    this.flashTime = 0;
    this.screenFlash = 0;
  }

  sync(renderer, camera) {
    const h = renderer.domElement.height;
    const s = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.soft.uniforms.scale.value = s;
    this.hot.uniforms.scale.value = s;
  }

  update(dt) {
    this.soft.update(dt);
    this.hot.update(dt);
    this.flashTime -= dt;
    this.flashLight.intensity = this.flashTime > 0 ? this.flashPower * (this.flashTime / this.flashDuration) : 0;
    this.screenFlash = Math.max(0, this.screenFlash - dt * 2.5);
  }

  flash(x, y, z, color, power, duration, reach = 14) {
    this.flashLight.position.set(x, y, z);
    this.flashLight.distance = reach;
    this.flashLight.color.set(color);
    this.flashPower = power;
    this.flashDuration = duration;
    this.flashTime = duration;
  }

  r(a) { return (this.rng() - 0.5) * 2 * a; }

  smoke(x, y, z, color = 0x999999, size = 1.2) {
    this.soft.emit(x + this.r(0.3), y, z + this.r(0.3), this.r(0.6), 1.4 + this.rng(), this.r(0.6), color, size, 1.6 + this.rng(), 2.2);
  }

  tyreSmoke(x, z) {
    this.soft.emit(x + this.r(0.3), 0.3, z + this.r(0.3), this.r(1), 0.4 + this.rng() * 0.4, this.r(1), 0xd8d8dc, 0.7, 0.5 + this.rng() * 0.3, 1.6);
  }

  dust(x, z) {
    this.soft.emit(x + this.r(0.4), 0.3, z + this.r(0.4), this.r(1), 0.5, this.r(1), 0xd9c7a0, 0.8, 0.7, 1.4);
  }

  fire(x, y, z, size = 1.1) {
    this.hot.emit(x + this.r(0.5), y, z + this.r(0.5), this.r(0.4), 2 + this.rng() * 2, this.r(0.4), this.rng() < 0.5 ? 0xff5a10 : 0xffa020, size, 0.45 + this.rng() * 0.25, -1.2);
  }

  sparks(x, y, z, count = 14) {
    for (let i = 0; i < count; i += 1) {
      this.hot.emit(x, y, z, this.r(7), 2 + this.rng() * 5, this.r(7), 0xffd27a, 0.18, 0.25 + this.rng() * 0.3, 0, 14);
    }
  }

  muzzle(x, y, z, dx, dz, big = false) {
    // a small star-shaped flash: a hot core and a short tongue along the barrel
    this.hot.emit(x, y, z, dx * 2, 0, dz * 2, 0xfff0c0, big ? 0.9 : 0.6, 0.05, 0);
    this.hot.emit(x + dx * 0.35, y, z + dz * 0.35, dx * 6, 0, dz * 6, 0xffa040, big ? 0.6 : 0.4, 0.05, 0);
    this.soft.emit(x, y, z, dx * 1.5 + this.r(0.3), 0.5, dz * 1.5 + this.r(0.3), 0xbbbbbb, 0.25, 0.35, 0.8);
    this.flash(x, y, z, 0xffb060, big ? 4 : 2.5, 0.05, big ? 9 : 7);
  }

  impact(x, y, z) {
    for (let i = 0; i < 5; i += 1) this.hot.emit(x, y, z, this.r(4), this.rng() * 4, this.r(4), 0xffe2a0, 0.3, 0.2, 0, 12);
    this.soft.emit(x, y, z, 0, 0.5, 0, 0xcfc6b8, 0.5, 0.5, 1.5);
  }

  blood(x, y, z) {
    for (let i = 0; i < 6; i += 1) this.soft.emit(x, y, z, this.r(2), this.rng() * 2, this.r(2), 0x8a0f14, 0.35, 0.5, 0.4, 9);
  }

  explosion(x, y, z) {
    for (let i = 0; i < 40; i += 1) {
      this.hot.emit(x + this.r(1), y + this.r(1), z + this.r(1), this.r(8), this.rng() * 8, this.r(8), this.rng() < 0.5 ? 0xff6a10 : 0xffb030, 1.6 + this.rng() * 1.6, 0.4 + this.rng() * 0.4, 1, 4);
    }
    for (let i = 0; i < 18; i += 1) this.soft.emit(x + this.r(2), y + this.rng() * 2, z + this.r(2), this.r(3), 2 + this.rng() * 4, this.r(3), 0x2b2b2b, 1.8, 2 + this.rng() * 1.2, 1.6);
    this.sparks(x, y, z, 30);
    this.flash(x, y + 2, z, 0xff9040, 60, 0.5, 35);
    this.screenFlash = 0.15;
  }

  splash(x, z) {
    for (let i = 0; i < 24; i += 1) this.soft.emit(x + this.r(2), -2.5, z + this.r(2), this.r(3), 4 + this.rng() * 4, this.r(3), 0xe8f6ff, 1.2, 1.1, 1.5, 9);
  }

  wake(x, z) {
    this.soft.emit(x + this.r(0.6), -2.7, z + this.r(0.6), this.r(0.8), 0.6, this.r(0.8), 0xf4fbff, 1.3, 1.6, 2.5);
  }
}
