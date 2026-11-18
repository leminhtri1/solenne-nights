// Small math helpers shared by physics, AI and the camera.

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach factor. */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));
/** Heading (radians) from +z axis, matching how vehicles and characters face. */
export const headingTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

/** Mix two 0xRRGGBB colours. */
export function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

/** Sample a keyframed list [[t, value], ...] (sorted, wrapping over `period`) with a mixer. */
export function sampleKeys(keys, t, mix, period = 24) {
  for (let i = 0; i < keys.length; i += 1) {
    const [t0, v0] = keys[i];
    const [t1raw, v1] = keys[(i + 1) % keys.length];
    const t1 = i + 1 < keys.length ? t1raw : t1raw + period;
    const tt = t < keys[0][0] ? t + period : t;
    if (tt >= t0 && tt <= t1) return mix(v0, v1, (tt - t0) / Math.max(1e-6, t1 - t0));
  }
  return keys[0][1];
}
