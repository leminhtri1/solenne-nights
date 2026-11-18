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

const STEP = 1 / 60;

function setup(game, hour) {
  game.state.hour = hour;
  game.freezeClock = true;
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

function finalFrames(game, count = 2) {
  game.input.endFrame();
  game.hud.bannerTime = 0;
  for (let i = 0; i < count; i += 1) game.frame(0);
}

const SCENES = {
  async chase(game) {
    setup(game, 18.72);
    game.teleportPlayer(300, -295, Math.PI / 2);
    const v = game.vehicles.spawn('vireo', 300, -295, Math.PI / 2, { role: 'mission', paint: 0xff2d55 });
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
    game.police.setWanted(3);
    addUnit(game, 'patrol', 292, -303.5, Math.PI / 2 + 0.04, 38);
    addUnit(game, 'patrol', 289, -289.5, Math.PI / 2 - 0.05, 38);
    addUnit(game, 'patrol', 250, -303, Math.PI / 2, 38);
    addUnit(game, 'swat', 225, -297, Math.PI / 2, 34);
    game.police.heli.activate(game.player.x, game.player.z);
    game.police.heli.x = 360; game.police.heli.z = -330; game.police.heli.y = 40;
    game.police.heli.orbit = 2.2;
    game.autopilot = laneAutopilot(v, -295, Math.PI / 2);
    simulate(game, 1.6);
    game.police.placeRoadblock();
    simulate(game, 0.5, 0.5);
    game.autopilot = null;
    game.dialogue.pin('juno', 'Cops on the causeway! Stay on the gas, the lighthouse is past the bridge!', game.cast);
    game.audio.radio = { nowPlaying: { station: 'SOLAR FM 101.3', title: 'Causeway Lights', artist: 'VHS Lagoon', art: 'linear-gradient(135deg,#ff4fa3,#ffb347)' } };
    game.cameraRig.shake = 0;
    finalFrames(game);
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
    const spots = [[-404, -248], [-396, -255], [-409, -262], [-392, -238]];
    h.forEach((a, k) => { if (spots[k]) { a.fig.x = spots[k][0]; a.fig.z = spots[k][1]; a.post = { x: spots[k][0], z: spots[k][1] }; a.alerted = true; } });
    if (h[2]) h[2].takeHit(500, 'player');
    if (h[3]) h[3].takeHit(500, 'player');
    game.police.setWanted(2);
    const u = addUnit(game, 'patrol', -397, -285, 0.1, 6);
    u.status = 'ON FOOT';
    u.deployed = true;
    game.police.deployOfficers(u, 2);
    addUnit(game, 'patrol', -380, -300, -Math.PI / 2, 14);
    game.peds.scare(-402, -230, 60, false);
    game.player.aiming = true;
    const p = game.player;
    game.cameraRig.yaw = 0.06;
    game.cameraRig.pitch = 0.16;
    simulate(game, 1.2);
    p.figure.yaw = Math.PI + 0.06;
    p.figure.aim = true;
    game.player.aiming = true;
    game.input.held.add('Mouse2');
    game.input.buttons = 4;
    game.state.ammo.smg = 87;
    for (let k = 0; k < 3; k += 1) { p.fireCooldown = 0; p.fire(); game.step(STEP * 3); }
    p.fireCooldown = 0;
    p.fire();
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

  async title(game) {
    game.state.hour = 19.0;
    game.menus.showTitle();
    game.clock = 30;
    for (let i = 0; i < 3; i += 1) game.frame(0.016);
  },

  async map(game) {
    setup(game, 20);
    game.teleportPlayer(-50, -280, 0);
    game.state.storyIndex = 5;
    game.state.tokens = [1, 4, 7, 9, 13, 18, 22];
    game.state.races = { 'lumen-loop': 71.2 };
    game.police.setWanted(2);
    simulate(game, 0.5);
    game.waypoint = { x: 1100, z: -200 };
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
