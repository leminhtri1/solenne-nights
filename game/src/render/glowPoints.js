// Additive glow halos drawn as one point cloud: street lamps, neon, windows, traffic signals,
// headlights, police light bars, muzzle flashes. A static cloud is built once; a dynamic cloud
// is refilled every frame. Points marked "night" fade in only after dusk.
import * as THREE from 'three';
import { glowTexture } from './proceduralTextures.js';

const VERT = /* glsl */ `
attribute float size; attribute float nightOnly; attribute vec3 tint;
uniform float scale; uniform float night; uniform float fogNear; uniform float fogFar;
varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float depth = -mv.z;
  // in daylight a halo is a small hot core; after dusk it opens up a little
  float dayScale = mix(0.45, 1.0, night);
  gl_PointSize = min(size * dayScale * scale / max(depth, 0.1), 120.0);
  float fog = smoothstep(fogNear, fogFar * 1.25, depth);
  // fade halos that pass right by the camera instead of letting them fill the screen
  vAlpha = mix(1.0, night, nightOnly) * mix(0.7, 1.0, night) * (1.0 - fog * 0.85) * smoothstep(3.0, 14.0, depth);
  vColor = tint;
}`;
const FRAG = /* glsl */ `
uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb * t.a * vAlpha, 1.0);
}`;

export class GlowPoints {
  constructor(capacity, { dynamic = false } = {}) {
    this.capacity = capacity;
    this.count = 0;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.nightOnly = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    const usage = dynamic ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage;
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(usage));
    g.setAttribute('tint', new THREE.BufferAttribute(this.colors, 3).setUsage(usage));
    g.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(usage));
    g.setAttribute('nightOnly', new THREE.BufferAttribute(this.nightOnly, 1).setUsage(usage));
    g.setDrawRange(0, 0);
    this.uniforms = {
      map: { value: glowTexture() },
      scale: { value: 400 },
      night: { value: 0 },
      fogNear: { value: 100 },
      fogFar: { value: 900 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.geometry = g;
    this.color = new THREE.Color();
  }

  clear() { this.count = 0; }

  /** Add a halo. `size` is its world diameter in metres (roughly). */
  push(x, y, z, color, size, nightOnly = 0, strength = 1) {
    if (this.count >= this.capacity) return;
    const i = this.count;
    this.positions[i * 3] = x; this.positions[i * 3 + 1] = y; this.positions[i * 3 + 2] = z;
    this.color.set(color);
    this.colors[i * 3] = this.color.r * strength;
    this.colors[i * 3 + 1] = this.color.g * strength;
    this.colors[i * 3 + 2] = this.color.b * strength;
    this.sizes[i] = size;
    this.nightOnly[i] = nightOnly;
    this.count += 1;
  }

  /** Upload what was pushed since `clear()`. */
  commit() {
    for (const name of ['position', 'tint', 'size', 'nightOnly']) this.geometry.attributes[name].needsUpdate = true;
    this.geometry.setDrawRange(0, this.count);
  }

  /** Per-frame uniforms: viewport scale, the night factor and the scene fog. */
  sync(renderer, camera, night, fog) {
    const h = renderer.domElement.height;
    this.uniforms.scale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.uniforms.night.value = night;
    if (fog) { this.uniforms.fogNear.value = fog.near; this.uniforms.fogFar.value = fog.far; }
  }
}
