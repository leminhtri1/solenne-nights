// Deterministic screenshot scenes, staged with the game's own systems and then simulated for
// a few seconds before the frame is taken:
//   chase  - golden hour, Vireo GT racing east down palm-lined Calle del Sol with SPD units,
//            HALO-1 and a roadblock, chapter 6 race checkpoints, Juno on the line, radio on
//   neon   - night in Calle Lumen, on foot with the Hornet SMG against Kessane's collectors
//            while patrol cars arrive and pedestrians scatter
//   bay    - sunset on the bay, the Riptide speedboat running for Isla Verano past the
//            causeway and the pier, the final chapter under way
//   title  - the title screen and its menu over the city
//   map    - the full map with the story so far
import * as THREE from 'three';
import { wrapAngle, clamp } from '../core/mathUtils.js';
import { RACES } from '../missions/sideActivities.js';
import { tuneOf } from '../vehicles/vehicleTuning.js';
import { PLACES } from '../world/cityLayout.js';

const STEP = 1 / 60;

function setup(game, hour) {
  game.state.hour = hour;
  game.freezeClock = true;
  game.godMode = true;
  game.running = true;
  game.hud.show(true);
  game.menus.hideTitle();
  game.audio.radio = { nowPlaying: null };
}

function simulate(game, seconds, cameraTail = 1.2) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    game.step(STEP);
    if (i >= n - cameraTail / STEP) {
      game.cameraRig.update(STEP, { vehicle: game.player.vehicle, position: game.player.figure, aiming: game.player.aiming });
      game.characters.update(STEP);
    }
  }
}

/** Keep a car in a lane at full throttle (used for the player's car while staging). */
function laneAutopilot(v, laneZ, heading, throttle = 1) {
  return () => {
    const b = v.body;
    const ahead = 18;
    const tx = b.x + Math.sin(heading) * ahead;
    const tz = laneZ !== null ? laneZ : b.z + Math.cos(heading) * ahead;
    const want = Math.atan2(tx - b.x, tz - b.z);
    v.input.steer = clamp(-wrapAngle(want - b.heading) * 2.5, -1, 1);
    v.input.throttle = throttle;
    v.input.handbrake = false;
  };
}

function addUnit(game, type, x, z, heading, speed, status) {
  const node = { x, z };
  const u = game.police.spawnUnit(type, node);
  const b = u.vehicle.body;
  b.x = x; b.z = z; b.heading = heading;
  b.setVelocityForward(speed);
  if (status) u.status = status;
  return u;
}

function finalFrames(game, count = 2, { wantedBanner = false } = {}) {
  game.input.endFrame();
  game.hud.bannerTime = 0;
  if (!wantedBanner) game.hud.wantedBanner.update(99);
  for (let i = 0; i < count; i += 1) game.frame(0);
}

const SCENES = {
  async chase(game) {
    setup(game, 18.72);
    game.teleportPlayer(300, -295, Math.PI / 2);
    const v = game.vehicles.spawn('vireo', 300, -295, Math.PI / 2, { role: 'mission', paint: 0xff2d55 });
    v.body.invulnerable = true;
    Object.assign(tuneOf(v.body), { engine: 2, tyres: 1, armour: 2 });
    game.player.enterVehicle(v, false);
    v.body.setVelocityForward(37);
    game.state.storyIndex = 5;
    game.state.money = 48210;
    game.state.respect = 820;
    game.state.armour = 60;
    game.state.health = 82;
    game.state.weapons.smg = true;
    game.state.ammo.smg = 184;
    game.state.weapon = 'smg';
    game.missions.start(5);
    game.dialogue.stopIfFrom();
    game.missions.advance();
    game.missions.cpIndex = 0;
    game.missions.timer = 31;
    game.police.setWanted(2);
    addUnit(game, 'patrol', 299, -302.5, Math.PI / 2 + 0.03, 39);
    addUnit(game, 'patrol', 297, -289.5, Math.PI / 2 - 0.04, 39);
    addUnit(game, 'patrol', 250, -303, Math.PI / 2, 38);
    addUnit(game, 'patrol', 240, -293, Math.PI / 2, 38);
    addUnit(game, 'patrol', 205, -298, Math.PI / 2, 38);
    addUnit(game, 'swat', 225, -297, Math.PI / 2, 34);
    game.police.heli.activate(game.player.x, game.player.z);
    game.police.heli.x = 360; game.police.heli.z = -330; game.police.heli.y = 40;
    game.police.heli.orbit = 2.2;
    game.autopilot = laneAutopilot(v, -295, Math.PI / 2);
    simulate(game, 1.6);
    game.police.placeRoadblock();
    simulate(game, 0.5, 0.5);
    game.autopilot = null;
    // the pursuit is pulled into a tight pack for the frame (their AI holds these slots in play)
    const pb = game.player.vehicle.body;
    pb.setVelocityForward(47);
    const pack = game.police.units.filter((u) => u.kind === 'patrol' || u.kind === 'swat');
    const slots = [[1.2, -298.6, 0.1, 'RAMMING'], [4.2, -291.4, -0.07, 'FIRING'], [10, -304.2, 0.04, 'PURSUIT'], [17, -291.2, -0.03, 'FIRING'], [-14, -303, 0.03, 'PURSUIT'], [-24, -296.5, 0, 'PURSUIT']];
    pack.forEach((u, k) => {
      const slot = slots[k];
      if (!slot) return;
      const b = u.vehicle.body;
      b.x = pb.x + slot[0]; b.z = slot[1]; b.heading = pb.heading + slot[2];
      b.setVelocityForward(pb.speed);
      u.status = slot[3];
      game.vehicles.syncMesh(u.vehicle);
    });
    game.police.setWanted(3);
    // the last fraction of a second of the chase: window fire, scraping sparks, tyre smoke
    const shooters = pack.filter((u) => u.status === 'FIRING');
    for (let i = 0; i < 14; i += 1) {
      for (const u of pack) { u.vehicle.body.setVelocityForward(pb.speed); }
      if (i % 5 === 0) for (const u of shooters) { u.fireCooldown = 0; game.police.windowFire(u, 8, 0); }
      const ram = pack[0].vehicle.body;
      game.particles.sparks(pb.x - Math.sin(pb.heading) * 1.6 + Math.cos(pb.heading) * 1.0, 0.7, (pb.z + ram.z) / 2 + 0.6, 4);
      const back = v.def.length * 0.36;
      for (const sd of [-1, 1]) game.particles.tyreSmoke(pb.x - Math.sin(pb.heading) * back, pb.z + sd * 0.9);
      game.step(STEP);
    }
    pack.forEach((u, k) => { if (slots[k]) u.status = slots[k][3]; });
    // people on both sidewalks ahead duck or scatter as the pursuit tears past
    const bystanders = game.peds.people.filter((q) => !q.dead).slice(0, 16);
    bystanders.forEach((q, k) => {
      const right = k % 2 === 0;
      q.fig.x = pb.x + 14 + k * 4.2 + (k % 3);
      q.fig.z = right ? -287.2 - (k % 4) * 0.6 : -312.8 + (k % 4) * 0.6;
      q.fig.y = 0.2; q.fig.visible = true;
      q.state = k % 3 === 0 ? 'cower' : 'flee';
      q.fear = 8;
      q.threat = { x: pb.x, z: -300 };
      q.fig.yaw = right ? 0.4 : Math.PI - 0.4;
    });
    for (let i = 0; i < 6; i += 1) game.peds.update(STEP);
    const heli = game.police.heli;
    heli.x = game.player.x + 24; heli.z = game.player.z + 5.5; heli.y = 8.6;
    heli.heading = Math.PI + 0.45;
    heli.aim.set(game.player.x + 5, 0, game.player.z - 1);
    heli.update(0, { x: game.player.x, z: game.player.z });
    for (let i = 0; i < 20; i += 1) game.cameraRig.update(STEP, { vehicle: v, position: game.player.figure });
    game.dialogue.pin('juno', 'Cops on the causeway! Stay on the gas, the lighthouse is past the bridge!', game.cast);
    game.audio.radio = { nowPlaying: { station: 'SOLAR FM 101.3', title: 'Causeway Lights', artist: 'VHS Lagoon', art: 'linear-gradient(135deg,#ff4fa3,#ffb347)' } };
    game.cameraRig.shake = 0;
    finalFrames(game, 2, { wantedBanner: true });
  },

  async neon(game) {
    setup(game, 22.6);
    game.teleportPlayer(-402, -215, Math.PI);
    game.state.storyIndex = 3;
    game.state.money = 9640;
    game.state.respect = 380;
    game.state.health = 74;
    game.state.armour = 35;
    game.state.weapons.smg = true;
    game.state.weapons.shotgun = true;
    game.state.ammo.smg = 87;
    game.state.ammo.shotgun = 12;
    game.state.weapon = 'smg';
    game.missions.start(3);
    game.dialogue.stopIfFrom();
    game.missions.advance(); game.missions.advance(); game.missions.advance();
    const h = game.missions.hostiles.active;
    const spots = [[-407, -225.5], [-398.5, -228], [-410.5, -232], [-395, -231]];
    h.forEach((a, k) => { if (spots[k]) { a.fig.x = spots[k][0]; a.fig.z = spots[k][1]; a.post = { x: spots[k][0], z: spots[k][1] }; a.alerted = true; } });
    if (h[3]) h[3].takeHit(500, 'player');
    // the collectors' getaway car takes a stray round to the tank
    const getaway = game.vehicles.spawn('sedan', -401, -244, Math.PI / 2 + 0.4, { role: 'parked', paint: 0x15151c });
    const wreck = game.vehicles.spawn('sedan', -409, -250, -0.5, { role: 'parked', paint: 0x2a2a30 });
    game.vehicles.explode(wreck);
    game.police.setWanted(2);
    const u = addUnit(game, 'patrol', -392, -254, 0.35, 4);
    u.status = 'ON FOOT';
    u.deployed = true;
    game.police.deployOfficers(u, 2);
    addUnit(game, 'patrol', -410, -262, 0.05, 12);
    addUnit(game, 'patrol', -397, -285, 0, 14);
    game.peds.scare(-402, -225, 60, false);
    const p = game.player;
    game.input.buttons = 4;
    game.cameraRig.yaw = -0.1;
    game.cameraRig.pitch = 0.1;
    simulate(game, 1.0);
    game.police.setWanted(3);
    // HALO-1 lights up the block; bystanders on the east sidewalk run back past the camera
    const heli = game.police.heli;
    heli.activate(p.x, p.z);
    heli.x = -396; heli.z = -262; heli.y = 26; heli.heading = Math.PI / 2 + 0.5;
    heli.aim.set(-402, 0, -229);
    const runners = game.peds.people.filter((q) => !q.dead).slice(0, 6);
    runners.forEach((q, k) => {
      q.fig.x = -391.5 - (k % 3) * 1.6; q.fig.z = -219 - k * 2.6; q.fig.visible = true;
      q.state = 'flee'; q.fear = 8; q.threat = { x: -402, z: -245 };
    });
    simulate(game, 0.25, 0.25);
    heli.x = -396; heli.z = -262; heli.y = 26;
    heli.aim.set(-402, 0, -229);
    heli.update(0, { x: p.x, z: p.z });
    for (const a of h) if (!a.dead) a.fig.aim = true;
    game.state.ammo.smg = 87;
    for (let k = 0; k < 3; k += 1) { p.fireCooldown = 0; p.fire(); game.step(STEP * 3); }
    game.vehicles.explode(getaway);
    for (let k = 0; k < 7; k += 1) game.step(STEP);
    p.fireCooldown = 0;
    p.fire();
    game.step(STEP);
    // the player swings the camera out to the right for a wider look at the street
    for (let i = 0; i < 40; i += 1) game.cameraRig.update(STEP, { position: p.figure, aiming: false });
    game.cameraRig.yaw = 0.34;
    game.cameraRig.pitch = 0.16;
    for (let i = 0; i < 40; i += 1) game.cameraRig.update(STEP, { position: p.figure, aiming: false });
    game.dialogue.pin('celeste', 'Those are Kessane’s boys. Remind them whose street this is, mijo.', game.cast);
    game.showRadioOnFoot = false;
    game.cameraRig.shake = 0;
    finalFrames(game, 1);
  },

  async bay(game) {
    setup(game, 19.25);
    game.teleportPlayer(300, 480, 0);
    game.state.storyIndex = 8;
    game.state.money = 76455;
    game.state.respect = 1650;
    game.state.health = 100;
    game.state.armour = 100;
    game.state.weapons.smg = true;
    game.state.weapons.shotgun = true;
    game.state.ammo.smg = 240;
    game.state.ammo.shotgun = 32;
    game.state.weapon = 'shotgun';
    game.missions.start(8);
    game.dialogue.stopIfFrom();
    game.missions.advance();
    const boat = game.missions.vehicles.boat;
    boat.body.x = 845; boat.body.z = 10; boat.body.heading = Math.PI - 0.08;
    game.player.enterVehicle(boat, false);
    boat.body.setVelocityForward(30);
    game.missions.advance();
    game.autopilot = laneAutopilot(boat, null, Math.PI - 0.08);
    simulate(game, 1.5);
    game.autopilot = null;
    game.dialogue.pin('halloran', 'Kessane’s yacht just docked at the villa. Every cop in Solenne is on the causeway. Go!', game.cast);
    game.audio.radio = { nowPlaying: { station: 'RADIO CALOR 94.7', title: 'Marea Alta', artist: 'La Sonora Neón', art: 'linear-gradient(135deg,#ff3b3b,#ffd166)' } };
    finalFrames(game);
  },

  async causeway(game) {
    setup(game, 19.45);
    game.teleportPlayer(560, -296, Math.PI / 2);
    // keep the eastbound lane of the causeway clear for the run
    for (const v of game.vehicles.list.slice()) if (Math.abs(v.body.z + 300) < 14 && v.body.x > 540 && v.body.x < 900) game.vehicles.remove(v);
    const bike = game.vehicles.spawn('bike', 600, -295, Math.PI / 2, { role: 'mission', paint: 0x00f5d4 });
    bike.body.invulnerable = true;
    Object.assign(tuneOf(bike.body), { engine: 3, tyres: 2, armour: 0 });
    game.player.enterVehicle(bike, false);
    bike.body.setVelocityForward(42);
    game.state.storyIndex = 6;
    game.state.money = 61380;
    game.state.respect = 1240;
    game.state.health = 91;
    game.state.armour = 80;
    game.state.weapons.smg = true;
    game.state.ammo.smg = 120;
    game.state.weapon = 'pistol';
    game.state.races = { 'lumen-loop': 71.2, coastline: 66.8 };
    game.activities.startRace(RACES[2]);
    game.activities.cp = 2;
    game.activities.time = 24.6;
    game.autopilot = laneAutopilot(bike, -295, Math.PI / 2);
    simulate(game, 1.4);
    game.autopilot = null;
    const pb = bike.body;
    game.police.setWanted(2);
    // the pack behind the bike, two lanes wide, and a tactical van at the back
    const slots = [[-6, -299.5, 0.05, 'RAMMING'], [-11, -305.5, 0.02, 'FIRING'], [-17, -293.5, -0.03, 'PURSUIT'], [-25, -301, 0, 'FIRING'], [-36, -296, 0, 'PURSUIT']];
    slots.forEach((s, k) => addUnit(game, k === 4 ? 'swat' : 'patrol', pb.x + s[0], s[1], Math.PI / 2 + s[2], pb.speed));
    const pack = game.police.units.slice();
    pack.forEach((u, k) => {
      const b = u.vehicle.body;
      b.x = pb.x + slots[k][0]; b.z = slots[k][1]; b.heading = pb.heading + slots[k][2];
      b.setVelocityForward(pb.speed);
      game.vehicles.syncMesh(u.vehicle);
    });
    game.police.setWanted(4);
    const heli = game.police.heli;
    heli.activate(pb.x, pb.z);
    game.police.inSight = true;
    game.police.lastSeen = { x: pb.x, z: pb.z };
    // the rider looks back over a shoulder: the camera swings round to the front of the bike
    for (let i = 0; i < 12; i += 1) {
      for (const u of pack) u.vehicle.body.setVelocityForward(pb.speed);
      if (i % 6 === 0) for (const u of pack) if (slots[pack.indexOf(u)][3] === 'FIRING') { u.fireCooldown = 0; game.police.windowFire(u, 12, 0); }
      game.particles.sparks(pb.x - 5, 0.6, -298.5, 3);
      game.step(STEP);
    }
    pack.forEach((u, k) => { u.status = slots[k][3]; });
    heli.x = pb.x - 30; heli.z = pb.z + 3; heli.y = 10; heli.heading = Math.PI / 2 - 0.9;
    heli.aim.set(pb.x - 1, 0, pb.z);
    heli.update(0, { x: pb.x, z: pb.z });
    game.player.seatRider(bike);
    game.cameraRig.yaw = pb.heading + 0.4;
    game.cameraRig.pitch = 0.02;
    game.cameraRig.orbitIdle = -10;
    for (let i = 0; i < 30; i += 1) game.cameraRig.update(STEP, { vehicle: bike, position: game.player.figure });
    game.dialogue.pin('dispatch', 'All units: motorcycle eastbound on the Halcyon Causeway. Close the island road!', game.cast);
    game.audio.radio = { nowPlaying: { station: 'RADIO CALOR 94.7', title: 'Noche de Verano', artist: 'Santa Brisa', art: 'linear-gradient(135deg,#ff3b3b,#ffd166)' } };
    game.cameraRig.shake = 0;
    finalFrames(game);
  },

  /** On foot along a busy sidewalk in the late afternoon (a playtest view of street life). */
  async stroll(game) {
    setup(game, 17.4);
    game.teleportPlayer(-330, -112.5, Math.PI / 2);
    simulate(game, 2);
    game.cameraRig.yaw = -Math.PI / 2 + 0.35;
    game.cameraRig.pitch = 0.25;
    simulate(game, 0.3, 0.3);
    finalFrames(game, 1);
  },

  /** In the Chromatica Customs bay with the upgrade menu open (a playtest view of the shop). */
  async customs(game) {
    setup(game, 18.2);
    const [x, z] = PLACES.customs.door;
    game.teleportPlayer(x, z - 6, 0);
    const car = game.vehicles.spawn('vireo', x, z - 6, Math.PI / 2, { role: 'mission', paint: 0x13c4ff });
    game.player.enterVehicle(car, false);
    Object.assign(tuneOf(car.body), { engine: 1, tyres: 1, armour: 0 });
    game.state.money = 23400;
    simulate(game, 0.5);
    finalFrames(game, 1);
    game.shop.show('customs');
  },

  async title(game) {
    game.state.hour = 19.0;
    game.menus.showTitle();
    game.clock = 30;
    for (let i = 0; i < 3; i += 1) game.frame(0.016);
  },

  async map(game) {
    setup(game, 20);
    game.teleportPlayer(210, -300, Math.PI / 2);
    const car = game.vehicles.spawn('vireo', 210, -295, Math.PI / 2, { role: 'mission', paint: 0xff2d55 });
    game.player.enterVehicle(car, false);
    game.state.storyIndex = 5;
    game.state.money = 48210;
    game.state.respect = 820;
    game.state.taxiFares = 4;
    game.state.tokens = [1, 4, 7, 9, 13, 18, 22, 2, 11];
    game.state.races = { 'lumen-loop': 71.2 };
    game.police.setWanted(3);
    addUnit(game, 'patrol', 120, -300, Math.PI / 2, 20);
    addUnit(game, 'patrol', 200, -205, Math.PI, 20);
    simulate(game, 0.5);
    game.waypoint = { x: 1100, z: -190 };
    game.hudMinimap.routeTimer = 0;
    game.hudMinimap.updateRoute(0);
    finalFrames(game, 1);
    game.mapScreen.toggle(true);
  },
};

export async function stageShot(game, name) {
  const scene = SCENES[name] ?? SCENES.title;
  await scene(game);
  void THREE;
}
