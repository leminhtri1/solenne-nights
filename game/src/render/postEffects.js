// Post-processing: the scene renders into an HDR target, a bright pass and a two-step
// separable blur make the bloom that neon, headlights and police bars bleed into, and a final
// pass adds it back with ACES tone mapping, a warm or cool grade, vignette and gamma.
import * as THREE from 'three';

const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D src; uniform float threshold; varying vec2 vUv;
void main() {
  vec3 c = texture2D(src, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(threshold, threshold * 2.2, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D src; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(src, vUv).rgb * 0.227027;
  c += texture2D(src, vUv + dir * 1.3846).rgb * 0.3162162;
  c += texture2D(src, vUv - dir * 1.3846).rgb * 0.3162162;
  c += texture2D(src, vUv + dir * 3.2308).rgb * 0.0702703;
  c += texture2D(src, vUv - dir * 3.2308).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D scene; uniform sampler2D bloomA; uniform sampler2D bloomB;
uniform float bloomStrength; uniform float exposure; uniform vec3 grade; uniform float vignette;
uniform float saturation; uniform float flash; uniform float speedBlur; uniform float haze;
uniform vec3 hazeColor; varying vec2 vUv;
vec3 aces(vec3 x) {
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 c = texture2D(scene, vUv).rgb;
  // speed: streak the frame toward its edges along rays from the centre
  vec2 fromC = vUv - vec2(0.5, 0.48);
  float edge = smoothstep(0.3, 0.78, length(fromC * vec2(1.6, 1.0)));
  float amt = speedBlur * edge;
  if (amt > 0.001) {
    vec3 acc = c;
    for (int i = 1; i <= 6; i++) acc += texture2D(scene, vUv - fromC * amt * 0.015 * float(i)).rgb;
    c = acc / 7.0;
  }
  // golden-hour haze: warm light scattered over the far, upper part of the frame
  c += hazeColor * haze * smoothstep(0.15, 0.85, vUv.y) * 0.35;
  vec3 bloom = texture2D(bloomA, vUv).rgb * 0.6 + texture2D(bloomB, vUv).rgb * 0.9;
  c += bloom * bloomStrength;
  c *= exposure * grade;
  c = aces(c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * vignette;
  c += vec3(1.0, 0.95, 0.9) * flash;
  gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

export class PostEffects {
  constructor(renderer) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.half = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.quarter = [new THREE.WebGLRenderTarget(1, 1, opts), new THREE.WebGLRenderTarget(1, 1, opts)];
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.bright = this.material(BRIGHT_FRAG, { src: { value: null }, threshold: { value: 0.9 } });
    this.blur = this.material(BLUR_FRAG, { src: { value: null }, dir: { value: new THREE.Vector2() } });
    this.composite = this.material(COMPOSITE_FRAG, {
      scene: { value: null }, bloomA: { value: null }, bloomB: { value: null },
      bloomStrength: { value: 0.8 }, exposure: { value: 1.0 }, grade: { value: new THREE.Vector3(1, 1, 1) },
      vignette: { value: 1.1 }, saturation: { value: 1.12 }, flash: { value: 0 },
      speedBlur: { value: 0 }, haze: { value: 0 }, hazeColor: { value: new THREE.Vector3(1.0, 0.62, 0.32) },
    });
    this.enabled = true;
  }

  material(frag, uniforms) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false });
  }

  setSize(w, h) {
    this.sceneTarget.setSize(w, h);
    for (const t of this.half) t.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    for (const t of this.quarter) t.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.w = w; this.h = h;
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.camera);
  }

  /** Grade presets: warm gold at sunset, cool magenta at night. */
  setGrade(night, golden) {
    const g = this.composite.uniforms.grade.value;
    g.set(1 + golden * 0.06 - night * 0.04, 1 - night * 0.02, 1 - golden * 0.06 + night * 0.08);
    this.composite.uniforms.bloomStrength.value = 0.55 + night * 0.4 + golden * 0.35;
    this.composite.uniforms.exposure.value = 1.0 + night * 0.15;
    this.composite.uniforms.haze.value = golden * 0.4;
    this.bright.uniforms.threshold.value = 0.95 - night * 0.15 - golden * 0.12;
  }

  /** Radial motion streaks, 0 at cruising speed up to 1 flat out. */
  setSpeed(amount) {
    this.composite.uniforms.speedBlur.value = Math.max(0, Math.min(1, amount));
  }

  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.sceneTarget);
    r.render(scene, camera);
    this.bright.uniforms.src.value = this.sceneTarget.texture;
    this.pass(this.bright, this.half[0]);
    const blurInto = (src, tmp, dst, w, h, spread) => {
      this.blur.uniforms.src.value = src.texture;
      this.blur.uniforms.dir.value.set(spread / w, 0);
      this.pass(this.blur, tmp);
      this.blur.uniforms.src.value = tmp.texture;
      this.blur.uniforms.dir.value.set(0, spread / h);
      this.pass(this.blur, dst);
    };
    blurInto(this.half[0], this.half[1], this.half[0], this.w >> 1, this.h >> 1, 1.0);
    this.blur.uniforms.src.value = this.half[0].texture;
    blurInto(this.half[0], this.quarter[1], this.quarter[0], this.w >> 2, this.h >> 2, 2.2);
    const u = this.composite.uniforms;
    u.scene.value = this.sceneTarget.texture;
    u.bloomA.value = this.half[0].texture;
    u.bloomB.value = this.quarter[0].texture;
    this.pass(this.composite, null);
  }
}
