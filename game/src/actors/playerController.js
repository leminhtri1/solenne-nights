// The player: walking, sprinting and aiming on foot, entering any vehicle (dragging its driver
// out, which is a crime if it is a police car), driving it, switching weapons, taking damage,
// and the WASTED and BUSTED outcomes.
import { clamp, damp, wrapAngle } from '../core/mathUtils.js';
import { WEAPONS, WEAPON_ORDER } from '../combat/weaponCatalog.js';
import { surfaceAt } from '../world/cityLayout.js';

const WALK = 3.2;
const SPRINT = 7.2;

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.figure = game.characters.add({ skin: 0xd8a06a, shirt: 0x2ec4b6, pants: 0x1d2433, hair: 0x1b1210, sleeves: false, scale: 1.02 });
    this.figure.armed = true;
    this.vehicle = null;
    this.vx = 0;
    this.vz = 0;
    this.aiming = false;
    this.fireCooldown = 0;
    this.bustTimer = 0;
    this.deadTimer = 0;
    this.enterCooldown = 0;
    this.position = this.figure; // x, y, z live on the figure
    this.lastDamage = 0;
  }

  get x() { return this.vehicle ? this.vehicle.body.x : this.figure.x; }
  get z() { return this.vehicle ? this.vehicle.body.z : this.figure.z; }
  get y() { return this.vehicle ? this.vehicle.body.y : this.figure.y; }
  get speed() { return this.vehicle ? this.vehicle.body.speed : Math.hypot(this.vx, this.vz); }
  get alive() { return this.game.state.health > 0; }

  placeAt(x, z, yaw = 0) {
    this.figure.x = x; this.figure.z = z; this.figure.y = 0; this.figure.yaw = yaw;
    this.figure.visible = true;
    this.figure.state = 'idle';
  }

  update(dt) {
    const game = this.game;
    const input = game.input;
    this.enterCooldown -= dt;
    this.fireCooldown -= dt;
    if (!this.alive) return this.updateDead(dt);
    this.handleWeaponSwitch(input);
    if (input.pressed('KeyF') || input.pressed('Enter')) {
      if (this.vehicle) this.exitVehicle();
      else this.tryEnterVehicle();
    }
    if (this.vehicle) this.drive(dt, input);
    else this.walk(dt, input);
    this.checkBusted(dt);
  }

  handleWeaponSwitch(input) {
    const st = this.game.state;
    const owned = WEAPON_ORDER.filter((w) => st.weapons[w]);
    let idx = owned.indexOf(st.weapon);
    if (input.wheel !== 0 && !this.vehicle) idx = (idx + input.wheel + owned.length) % owned.length;
    for (let k = 0; k < WEAPON_ORDER.length; k += 1) {
      if (input.pressed(`Digit${k + 1}`) && st.weapons[WEAPON_ORDER[k]]) idx = owned.indexOf(WEAPON_ORDER[k]);
    }
    if (idx >= 0 && owned[idx] !== st.weapon) {
      st.weapon = owned[idx];
      this.game.events.emit('weaponChanged', st.weapon);
    }
    this.figure.armed = st.weapon !== 'fists';
  }

  walk(dt, input) {
    const game = this.game;
    const cam = game.cameraRig;
    const f = cam.forward();
    const rx = -f.z, rz = f.x;
    const mx = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
    const mz = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
    this.aiming = input.mouseHeld(2);
    const sprint = input.down('ShiftLeft') && !this.aiming;
    const speed = sprint ? SPRINT : this.aiming ? WALK * 0.75 : WALK * 1.25;
    let tx = f.x * mz + rx * mx, tz = f.z * mz + rz * mx;
    const len = Math.hypot(tx, tz);
    if (len > 0) { tx /= len; tz /= len; }
    this.vx += (tx * speed - this.vx) * damp(12, dt);
    this.vz += (tz * speed - this.vz) * damp(12, dt);
    const fig = this.figure;
    fig.x += this.vx * dt;
    fig.z += this.vz * dt;
    const hit = game.collision.resolveCircle(fig.x, fig.z, 0.4);
    if (hit) { fig.x = hit.x; fig.z = hit.z; }
    // vehicles shove people aside
    for (const v of game.vehicles.list) {
      const dx = fig.x - v.body.x, dz = fig.z - v.body.z;
      const r = v.def.length * 0.42;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 1e-3) {
        fig.x = v.body.x + (dx / d) * r; fig.z = v.body.z + (dz / d) * r;
        if (v.body.speed > 9 && v !== this.vehicle) this.damage((v.body.speed - 6) * 3, 'vehicle');
      }
    }
    if (surfaceAt(fig.x, fig.z) === 'water') { fig.y = -1.6; this.damage(dt * 12, 'drowning'); }
    else fig.y = Math.max(0, fig.y - dt * 4);
    fig.speed = Math.hypot(this.vx, this.vz);
    fig.aim = this.aiming;
    fig.holster = false;
    if (this.aiming) fig.yaw = Math.atan2(f.x, f.z);
    else if (fig.speed > 0.3) fig.yaw += wrapAngle(Math.atan2(this.vx, this.vz) - fig.yaw) * damp(12, dt);
    fig.aimPitch = clamp(-(cam.pitch - 0.2) * 0.8, -0.6, 0.6);
    const wantsFire = WEAPONS[game.state.weapon].auto ? input.mouseHeld(0) : input.mouseClicked(0);
    if (wantsFire && this.fireCooldown <= 0) this.fire();
    if (fig.speed > 4 && surfaceAt(fig.x, fig.z) === 'sand' && game.rng() < 0.3) game.particles.dust(fig.x, fig.z);
    game.state.stats.distance += fig.speed * dt;
  }

  /** Fire the current weapon along the camera's aim (or punch). */
  fire() {
    const game = this.game;
    const w = WEAPONS[game.state.weapon];
    this.fireCooldown = 1 / w.rate;
    const fig = this.figure;
    if (!w.melee) {
      if (game.state.ammo[game.state.weapon] <= 0) { game.audio?.click(); return; }
      game.state.ammo[game.state.weapon] -= 1;
    } else {
      fig.punch = 0.25;
    }
    const f = this.game.cameraRig.forward();
    const yaw = this.aiming || w.melee ? Math.atan2(f.x, f.z) : fig.yaw;
    if (!this.aiming) fig.yaw = yaw;
    fig.holster = true;
    game.combat.fire({ shooter: 'player', x: fig.x, y: fig.y + 1.45, z: fig.z, yaw, pitch: fig.aimPitch || 0, weapon: game.state.weapon, figure: fig });
  }

  tryEnterVehicle() {
    if (this.enterCooldown > 0) return;
    const fig = this.figure;
    const v = this.game.vehicles.nearest(fig.x, fig.z, 5.5, (c) => !c.dead && c.role !== 'player');
    if (!v) return;
    this.enterVehicle(v, true);
  }

  enterVehicle(v, steal) {
    const game = this.game;
    if (steal && v.driver === 'npc' && v.role !== 'parked') {
      game.events.emit('carjack', { vehicle: v, x: v.body.x, z: v.body.z });
      if (v.def.police) game.police.reportCrime('stolePolice', v.body.x, v.body.z);
      else game.police.reportCrime('carjack', v.body.x, v.body.z);
    }
    if (v.ai) v.ai.released = true;
    v.ai = null;
    v.role = 'player';
    v.driver = 'player';
    v.siren = false;
    this.vehicle = v;
    this.figure.visible = false;
    this.enterCooldown = 0.6;
    this.aiming = false;
    game.cameraRig.snapBehind(v.body.heading);
    game.events.emit('enteredVehicle', v);
  }

  exitVehicle() {
    const v = this.vehicle;
    if (!v || this.enterCooldown > 0) return;
    if (v.def.kind === 'boat' && surfaceAt(v.body.x, v.body.z) === 'water') {
      // jump onto the nearest dry land within reach, else stay aboard
      const land = this.findLandNear(v.body.x, v.body.z);
      if (!land) return;
      this.placeAt(land.x, land.z, v.body.heading);
    } else {
      const left = { x: Math.cos(v.body.heading), z: -Math.sin(v.body.heading) };
      this.placeAt(v.body.x + left.x * (v.def.width / 2 + 0.9), v.body.z + left.z * (v.def.width / 2 + 0.9), v.body.heading);
    }
    v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true;
    v.role = 'parked';
    v.driver = null;
    this.vehicle = null;
    this.vx = this.vz = 0;
    this.enterCooldown = 0.6;
    this.game.events.emit('exitedVehicle', v);
  }

  findLandNear(x, z) {
    for (let r = 4; r <= 14; r += 2) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (surfaceAt(px, pz) !== 'water') return { x: px, z: pz };
      }
    }
    return null;
  }

  drive(dt, input) {
    const v = this.vehicle;
    const throttle = clamp(input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp'), -1, 1);
    const steer = clamp(input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight'), -1, 1);
    v.input.throttle = throttle;
    v.input.steer = steer;
    v.input.handbrake = input.down('Space');
    if (input.pressed('KeyH')) this.game.audio?.horn();
    // drive-by: aim sideways with the right mouse, fire with the left
    this.aiming = false;
    if (input.mouseHeld(2) && this.game.state.weapon !== 'fists' && input.mouseClicked(0) && this.fireCooldown <= 0) {
      const f = this.game.cameraRig.forward();
      this.fireCooldown = 1 / WEAPONS[this.game.state.weapon].rate;
      if (this.game.state.ammo[this.game.state.weapon] > 0) {
        this.game.state.ammo[this.game.state.weapon] -= 1;
        this.game.combat.fire({ shooter: 'player', x: v.body.x, y: v.body.y + 1.4, z: v.body.z, yaw: Math.atan2(f.x, f.z), pitch: 0, weapon: this.game.state.weapon, vehicle: v });
      }
    }
    const b = v.body;
    this.figure.x = b.x; this.figure.z = b.z;
    const st = this.game.state.stats;
    st.distance += b.speed * dt;
    st.maxSpeed = Math.max(st.maxSpeed, b.speed * 3.6);
    if (v.dead) {
      if (v.body.sunk) this.exitSinking();
      else { this.damage(80, 'explosion'); this.exitVehicleForced(); }
    }
  }

  exitSinking() {
    const v = this.vehicle;
    const land = this.findLandNear(v.body.x, v.body.z) || { x: v.body.x, z: v.body.z };
    this.exitVehicleForced(land);
  }

  exitVehicleForced(at = null) {
    const v = this.vehicle;
    if (!v) return;
    const p = at || { x: v.body.x + 3, z: v.body.z };
    this.placeAt(p.x, p.z, v.body.heading);
    v.role = 'wreck';
    v.driver = null;
    this.vehicle = null;
  }

  damage(amount, source = 'gunfire') {
    const st = this.game.state;
    if (!this.alive || this.game.godMode) return;
    let left = amount;
    if (st.armour > 0) {
      const absorbed = Math.min(st.armour, left * 0.7);
      st.armour -= absorbed;
      left -= absorbed;
    }
    st.health = Math.max(0, st.health - left);
    this.lastDamage = this.game.clock;
    this.game.events.emit('playerHurt', { amount, source });
    if (st.health <= 0) this.die('WASTED');
  }

  die(kind) {
    const fig = this.figure;
    if (this.vehicle) this.exitVehicleForced();
    fig.state = 'dead';
    fig.deathTime = 0;
    this.deadTimer = 4;
    this.outcome = kind;
    this.game.state.stats.bustedOrWasted += 1;
    this.game.events.emit('playerDown', kind);
  }

  checkBusted(dt) {
    const game = this.game;
    if (game.state.wanted === 0 || this.vehicle && this.vehicle.body.speed > 2) { this.bustTimer = 0; return; }
    const cop = game.police.nearestOfficer(this.x, this.z, this.vehicle ? 4 : 2.6);
    if (cop && this.speed < 2.5) {
      this.bustTimer += dt;
      if (this.bustTimer > 1.6) {
        game.state.health = 0;
        this.die('BUSTED');
      }
    } else this.bustTimer = Math.max(0, this.bustTimer - dt);
  }

  updateDead(dt) {
    this.deadTimer -= dt;
    if (this.deadTimer <= 0) this.game.respawnPlayer(this.outcome);
  }
}
