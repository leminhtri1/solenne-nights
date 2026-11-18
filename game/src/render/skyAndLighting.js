// The sky dome (gradient, sun disc and halo, drifting cloud bands, stars at night), the sun or
// moon light with its shadow map following the player, the hemisphere fill and the fog, all
// driven by one clock: hour 0..24. Golden hour and neon night are tuned to look their best.
import * as THREE from 'three';
import { mixHex, sampleKeys, lerp, clamp, smoothstep } from '../core/mathUtils.js';

const num = (a, b, t) => lerp(a, b, t);
const col = (a, b, t) => mixHex(a, b, t);

// [hour, value] keyframes, wrapping at 24.
const SKY_TOP = [[0, 0x050816], [5, 0x0b1030], [6.5, 0x3a4f8f], [9, 0x2f7fd8], [16, 0x3a86d6], [18, 0x4a63a8], [19.2, 0x30306e], [20.4, 0x14133a], [22, 0x070a1f]];
const SKY_HORIZON = [[0, 0x1a1440], [5, 0x2a2050], [6.5, 0xff9a6b], [9, 0xb8dcf5], [16, 0xcfe3f0], [18, 0xffb46a], [19.2, 0xff6f4e], [20.4, 0x7a3a78], [22, 0x2a1a50]];
const FOG = [[0, 0x1c1638], [5, 0x2a2450], [6.5, 0xe7a284], [9, 0xb9d4e6], [16, 0xc9dbe6], [18, 0xf0a878], [19.2, 0xc9686e], [20.4, 0x4a2c62], [22, 0x231c45]];
const SUN_COLOR = [[0, 0x8aa0d8], [5, 0x8aa0d8], [6.5, 0xffb68a], [9, 0xfff3e0], [16, 0xfff0d8], [18, 0xffb46e], [19.2, 0xff8a5a], [20.4, 0x9aa8e0], [22, 0x8aa0d8]];
const SUN_POWER = [[0, 0.55], [5, 0.5], [6.5, 1.6], [9, 3.0], [16, 3.0], [18, 3.1], [19.2, 2.1], [20.4, 0.6], [22, 0.55]];
const HEMI_POWER = [[0, 0.9], [5, 0.9], [6.5, 1.3], [9, 1.7], [16, 1.7], [18, 1.5], [19.2, 1.2], [20.4, 0.95], [22, 0.9]];
const HEMI_SKY = [[0, 0x3a4380], [6.5, 0xffc7a8], [9, 0xcfe6ff], [16, 0xd8e8ff], [18, 0xffcfa0], [19.2, 0xd98aa0], [20.4, 0x5a4a98], [22, 0x3a4380]];
const FOG_FAR = [[0, 620], [6.5, 760], [9, 950], [16, 950], [18, 820], [19.2, 720], [20.4, 640], [22, 620]];

export class SkyAndLighting {
  constructor(scene) {
    this.scene = scene;
    this.hour = 18.4;
    this.night = 0;
    this.sunDir = new THREE.Vector3(1, 0.3, 0);

    this.uniforms = {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() },
      night: { value: 0 },
      time: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome = dome;
    scene.add(dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x5a4a3a, 1.4);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog(0xffffff, 120, 900);
    scene.background = new THREE.Color(0x000000);
  }

  /** Set the clock and recompute every colour. */
  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    const h = this.hour;
    // The sun rises over the ocean (east, +x) and sets behind the hills (west, -x).
    const dayT = (h - 6) / 13.5; // 0 at 6:00, 1 at 19:30
    const elev = Math.sin(clamp(dayT, -0.2, 1.2) * Math.PI) * 1.05;
    const az = lerp(-0.35, Math.PI + 0.35, clamp(dayT, 0, 1));
    this.sunDir.set(Math.cos(az), Math.max(-0.2, elev), -0.45).normalize();
    this.night = 1 - smoothstep(-0.05, 0.22, this.sunDir.y);
    const lightDir = this.night > 0.6
      ? new THREE.Vector3(-0.4, 0.75, 0.5).normalize() // moon
      : this.sunDir.clone().setY(Math.max(0.12, this.sunDir.y)).normalize();
    this.lightDir = lightDir;

    this.uniforms.topColor.value.setHex(sampleKeys(SKY_TOP, h, col));
    this.uniforms.horizonColor.value.setHex(sampleKeys(SKY_HORIZON, h, col));
    this.uniforms.sunColor.value.setHex(sampleKeys(SUN_COLOR, h, col));
    this.uniforms.sunDir.value.copy(this.sunDir);
    this.uniforms.night.value = this.night;

    this.sun.color.setHex(sampleKeys(SUN_COLOR, h, col));
    this.sun.intensity = sampleKeys(SUN_POWER, h, num);
    this.hemi.color.setHex(sampleKeys(HEMI_SKY, h, col));
    this.hemi.groundColor.setHex(mixHex(0x6a5440, 0x1a1530, this.night));
    this.hemi.intensity = sampleKeys(HEMI_POWER, h, num);
    this.scene.fog.color.setHex(sampleKeys(FOG, h, col));
    this.scene.fog.far = sampleKeys(FOG_FAR, h, num);
    this.scene.fog.near = this.scene.fog.far * 0.12;
  }

  /** Keep the dome and the shadow camera centred on the action. */
  follow(focus, camera, elapsed) {
    this.dome.position.copy(camera.position);
    this.uniforms.time.value = elapsed;
    const d = this.lightDir ?? this.sunDir;
    this.sun.position.set(focus.x + d.x * 400, d.y * 400, focus.z + d.z * 400);
    this.sun.target.position.set(focus.x, 0, focus.z);
  }
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 sunDir;
uniform float night; uniform float time;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 c = mix(horizonColor, topColor, t);
  if (h < 0.0) c = mix(horizonColor, horizonColor * 0.55, clamp(-h * 5.0, 0.0, 1.0));
  // sun disc and halo
  float s = max(dot(d, normalize(sunDir)), 0.0);
  float sunVis = 1.0 - night;
  c += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.55 + pow(s, 6.0) * 0.25) * sunVis;
  // horizon warm band
  c += horizonColor * 0.25 * exp(-abs(h) * 14.0);
  // clouds: soft streaks lit by the sun from below at sunset
  vec2 uv = d.xz / max(0.08, d.y + 0.12) * 0.9 + vec2(time * 0.004, 0.0);
  float cl = smoothstep(0.52, 0.85, fbm(uv * 1.4)) * smoothstep(0.0, 0.25, h);
  vec3 cloudCol = mix(vec3(1.0), sunColor * 1.15 + horizonColor * 0.3, 0.55);
  cloudCol = mix(cloudCol, vec3(0.12, 0.1, 0.22), night * 0.85);
  c = mix(c, cloudCol, cl * 0.6);
  // stars
  if (night > 0.01 && h > 0.0) {
    vec2 g = floor(d.xz / (d.y + 0.3) * 260.0);
    float st = step(0.996, hash(g)) * (0.6 + 0.4 * sin(time * 2.0 + hash(g + 3.0) * 30.0));
    c += vec3(st) * night * smoothstep(0.05, 0.4, h);
    // moon
    vec3 moonDir = normalize(vec3(-0.4, 0.55, 0.6));
    float m = max(dot(d, moonDir), 0.0);
    c += vec3(0.9, 0.95, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.4 + pow(m, 60.0) * 0.15) * night;
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
