// Kessane's people: collectors, tower security and villa guards. They hold their ground near
// where they were posted, strafe while they shoot when they can see the player, and close in
// when they cannot. A boss has more health and a heavier gun.
import { damp, wrapAngle } from '../core/mathUtils.js';

const SUIT = { skin: 0xe0ac69, shirt: 0x1a1a1a, pants: 0x111111, hair: 0x2a1a0a, sleeves: true, scale: 1.04 };
const BOSS = { skin: 0xe0ac69, shirt: 0xf1f1f1, pants: 0x2b2b2b, hair: 0x8b8b8b, sleeves: true, scale: 1.08 };

export class HostileActors {
  constructor(game, capacity = 10) {
    this.game = game;
    this.pool = [];
    for (let k = 0; k < capacity; k += 1) {
      const fig = game.characters.add({ ...SUIT });
      fig.visible = false;
      fig.armed = true;
      const a = { fig, dead: true, active: false, health: 0, cooldown: 1, post: null, boss: false, strafe: 1 };
      a.takeHit = (dmg, source) => this.hurt(a, dmg, source);
      this.pool.push(a);
    }
  }

  get active() { return this.pool.filter((a) => a.active); }
  get aliveCount() { return this.pool.filter((a) => a.active && !a.dead).length; }

  spawn(x, z, boss = false) {
    const a = this.pool.find((p) => !p.active);
    if (!a) return null;
    Object.assign(a, { active: true, dead: false, health: boss ? 260 : 70, boss, cooldown: 1 + this.game.rng(), post: { x, z }, strafe: this.game.rng() < 0.5 ? 1 : -1 });
    a.fig.look = boss ? { ...BOSS } : { ...SUIT, skin: this.game.rng.pick([0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642]) };
    this.game.characters.paint(a.fig);
    Object.assign(a.fig, { x, z, y: 0, visible: true, state: 'idle', deathTime: 0, aim: false });
    return a;
  }

  clear() {
    for (const a of this.pool) { a.active = false; a.dead = true; a.fig.visible = false; }
  }

  hurt(a, dmg, source) {
    if (a.dead) return;
    a.health -= dmg;
    a.alerted = true;
    if (a.health > 0) return;
    a.dead = true;
    a.fig.state = 'dead';
    a.fig.aim = false;
    a.fig.speed = 0;
    if (source === 'player') this.game.state.stats.kills += 1;
    this.game.events.emit('hostileDown', a);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    for (const a of this.pool) {
      if (!a.active || a.dead) continue;
      const f = a.fig;
      const dx = p.x - f.x, dz = p.z - f.z;
      const d = Math.hypot(dx, dz);
      const sees = d < 55 && g.collision.lineOfSight(f.x, 1.5, f.z, p.x, 1.5, p.z);
      if (sees && d < 40) a.alerted = true;
      if (!a.alerted || !p.alive) { f.aim = false; f.speed = 0; continue; }
      const face = Math.atan2(dx, dz);
      f.yaw += wrapAngle(face - f.yaw) * damp(7, dt);
      let mx = 0, mz = 0;
      if (!sees || d > 30) { mx = dx / d; mz = dz / d; }
      else { mx = Math.cos(face) * a.strafe * 0.6; mz = -Math.sin(face) * a.strafe * 0.6; }
      const fromPost = Math.hypot(f.x - a.post.x, f.z - a.post.z);
      if (fromPost > 25 && sees) { mx = (a.post.x - f.x) / fromPost; mz = (a.post.z - f.z) / fromPost; }
      const sp = sees ? 2.4 : 5;
      f.x += mx * sp * dt; f.z += mz * sp * dt;
      const hit = g.collision.resolveCircle(f.x, f.z, 0.4);
      if (hit) { f.x = hit.x; f.z = hit.z; a.strafe *= -1; }
      f.speed = Math.hypot(mx, mz) * sp;
      f.aim = sees;
      if (sees) {
        a.cooldown -= dt;
        if (a.cooldown <= 0) {
          a.cooldown = (a.boss ? 0.22 : 0.8) + g.rng() * 0.7;
          const miss = (g.rng() - 0.5) * (0.1 + d * 0.005);
          g.combat.fire({ shooter: 'hostile', x: f.x, y: 1.45, z: f.z, yaw: face + miss, pitch: 0, weapon: a.boss ? 'smg' : 'pistol', figure: f });
        }
      }
    }
  }
}
