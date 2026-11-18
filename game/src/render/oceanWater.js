// The bay: one large plane whose fragment shader sums travelling waves into a normal, mixes
// deep and shallow blues by fresnel, reflects the sky's horizon, adds the sun's glitter path
// and fades into the scene fog. A low-poly vertex swell keeps the silhouette moving.
import * as THREE from 'three';
import { WATER_LEVEL } from '../world/cityLayout.js';

export class OceanWater {
  constructor(scene) {
    this.uniforms = {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(0x0a3d5c) },
      shallowColor: { value: new THREE.Color(0x1aa6b7) },
      skyColor: { value: new THREE.Color(0xffb46a) },
      sunColor: { value: new THREE.Color(0xffc080) },
      sunDir: { value: new THREE.Vector3(1, 0.2, 0) },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 100 },
      fogFar: { value: 900 },
      night: { value: 0 },
    };
    const geo = new THREE.PlaneGeometry(5200, 5200, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(300, WATER_LEVEL, 0);
    this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }

  update(time, sky, fog) {
    const u = this.uniforms;
    u.time.value = time;
    u.skyColor.value.copy(sky.uniforms.horizonColor.value);
    u.sunColor.value.copy(sky.uniforms.sunColor.value);
    u.sunDir.value.copy(sky.sunDir);
    u.night.value = sky.night;
    u.fogColor.value.copy(fog.color);
    u.fogNear.value = fog.near;
    u.fogFar.value = fog.far;
  }

  /** Height of the swell at a point (for boats bobbing). */
  heightAt(x, z, t) {
    return WATER_LEVEL + Math.sin(x * 0.05 + t * 1.1) * 0.25 + Math.sin(z * 0.07 - t * 0.9) * 0.2;
  }
}

const VERT = /* glsl */ `
uniform float time;
varying vec3 vWorld; varying float vDepth;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y += sin(w.x * 0.05 + time * 1.1) * 0.25 + sin(w.z * 0.07 - time * 0.9) * 0.2;
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float time; uniform vec3 deepColor; uniform vec3 shallowColor; uniform vec3 skyColor;
uniform vec3 sunColor; uniform vec3 sunDir; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
uniform float night;
varying vec3 vWorld; varying float vDepth;
vec2 wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
  float ph = dot(p, dir) * freq + time * speed;
  return dir * cos(ph) * amp * freq;
}
void main() {
  vec2 p = vWorld.xz;
  vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.21, 1.6, 0.35)
         + wave(p, normalize(vec2(-0.4, 1.0)), 0.37, 2.1, 0.18)
         + wave(p, normalize(vec2(0.8, -0.7)), 0.83, 2.9, 0.07)
         + wave(p, normalize(vec2(-0.9, -0.2)), 1.7, 3.7, 0.03);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  vec3 base = mix(deepColor, shallowColor, 0.35 + 0.25 * n.y);
  base *= mix(1.0, 0.25, night);
  vec3 col = mix(base, skyColor * mix(1.0, 0.45, night), clamp(fres * 0.9 + 0.08, 0.0, 1.0));
  vec3 refl = reflect(-viewDir, n);
  float spec = pow(max(dot(refl, normalize(sunDir)), 0.0), 180.0);
  float glitter = pow(max(dot(refl, normalize(sunDir)), 0.0), 18.0) * 0.25;
  col += sunColor * (spec * 3.0 + glitter) * (1.0 - night);
  // moonlight shimmer
  col += vec3(0.5, 0.6, 0.9) * pow(max(dot(refl, normalize(vec3(-0.4, 0.55, 0.6))), 0.0), 60.0) * night * 0.8;
  float fog = smoothstep(fogNear, fogFar, vDepth);
  col = mix(col, fogColor, fog);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
