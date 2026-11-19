// The Game object: builds Solenne (renderer, sky, sea, roads, blocks, landmarks), creates
// every system, and runs them on a fixed 60 Hz step: input, player, traffic, police, people,
// missions, activities, effects. It also owns the clock and day/night look, the pause and
// map screens, respawning after WASTED or BUSTED, and new / continue / quit.
import * as THREE from 'three';
import { createRandom } from './seededRandom.js';
import { InputControls } from './inputControls.js';
import { EventBus } from './eventBus.js';
import { createGameState } from './gameState.js';
import { smoothstep } from './mathUtils.js';
import { SkyAndLighting } from '../render/skyAndLighting.js';
import { OceanWater } from '../render/oceanWater.js';
import { GlowPoints } from '../render/glowPoints.js';
import { PostEffects } from '../render/postEffects.js';
import { ParticleEffects } from '../render/particleEffects.js';
import { CameraRig } from '../render/cameraRig.js';
import { CollisionGrid } from '../world/collisionGrid.js';
import { RoadNetwork } from '../world/roadNetwork.js';
import { StreetProps } from '../world/streetProps.js';
import { CityGenerator } from '../world/cityGenerator.js';
import { Landmarks } from '../world/landmarks.js';
import { PLACES, groundHeight } from '../world/cityLayout.js';
import { CharacterRig } from '../actors/characterRig.js';
import { PlayerController } from '../actors/playerController.js';
import { PedestrianCrowd } from '../actors/pedestrianCrowd.js';
import { VehicleManager } from '../vehicles/vehicleManager.js';
import { CombatSystem } from '../combat/combatSystem.js';
import { TrafficAI } from '../ai/trafficAI.js';
import { PoliceDispatch } from '../ai/policeDispatch.js';
import { MissionRunner } from '../missions/missionRunner.js';
import { SideActivities } from '../missions/sideActivities.js';
import { CAST } from '../missions/castOfCharacters.js';
import { HudOverlay } from '../ui/hudOverlay.js';
import { DialogueBox } from '../ui/dialogueBox.js';
import { paintCityMap } from '../ui/mapPainter.js';
import { Minimap } from '../ui/minimap.js';
import { MapScreen } from '../ui/mapScreen.js';
import { GameMenus } from '../ui/gameMenus.js';
import { ShopMenu } from '../ui/shopMenu.js';
import { SoundEffects } from '../audio/soundEffects.js';
import { SaveSlots } from '../save/saveSlots.js';

const STEP = 1 / 60;

export class Game {
  constructor({ seed = 7, shotMode = false } = {}) {
    this.seed = seed;
    this.shotMode = shotMode;
    this.rng = createRandom(seed);
    this.clock = 0;
    this.state = createGameState();
    this.events = new EventBus();
    this.cast = CAST;
    this.running = false;
    this.paused = false;
    this.waypoint = null;
    this.buildRenderer();
    this.buildWorld();
    this.buildSystems();
    this.wireEvents();
  }

  buildRenderer() {
    const canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: this.shotMode });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.shotMode ? 1 : 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 16 / 10, 0.3, 2600);
    this.post = new PostEffects(this.renderer);
    this.input = new InputControls(canvas);
    // Chrome swallows the first Esc to release pointer lock, so losing the lock pauses the game
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.running && !this.paused && !this.shotMode) this.setPaused(true);
    });
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  buildWorld() {
    this.sky = new SkyAndLighting(this.scene);
    this.water = new OceanWater(this.scene);
    this.collision = new CollisionGrid();
    this.staticGlow = new GlowPoints(6000);
    this.dynamicGlow = new GlowPoints(1500, { dynamic: true });
    this.scene.add(this.staticGlow.points, this.dynamicGlow.points);
    this.roads = new RoadNetwork();
    this.scene.add(this.roads.createMeshes());
    this.props = new StreetProps(this.collision, this.staticGlow, createRandom(this.seed + 11));
    this.city = new CityGenerator({ scene: this.scene, collision: this.collision, props: this.props, glow: this.staticGlow, seed: this.seed });
    this.scene.add(this.city.generate());
    this.landmarks = new Landmarks({ collision: this.collision, props: this.props, glow: this.staticGlow, rng: createRandom(this.seed + 5) });
    this.scene.add(this.landmarks.build());
    this.scene.add(this.props.build());
    this.staticGlow.commit();
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envHour = -10;
  }

  buildSystems() {
    this.particles = new ParticleEffects(this.scene, this.rng);
    this.characters = new CharacterRig(this.scene, 190);
    this.vehicles = new VehicleManager(this);
    this.cameraRig = new CameraRig(this.camera, this.collision);
    this.player = new PlayerController(this);
    this.combat = new CombatSystem(this);
    this.traffic = new TrafficAI(this, { moving: 38, parked: 30 });
    this.peds = new PedestrianCrowd(this, 100);
    this.police = new PoliceDispatch(this);
    this.dialogue = new DialogueBox(this);
    this.missions = new MissionRunner(this);
    this.activities = new SideActivities(this);
    this.hud = new HudOverlay(this);
    this.cityMap = paintCityMap(this.collision);
    this.hudMinimap = new Minimap(document.getElementById('minimap'), this, this.cityMap);
    this.mapScreen = new MapScreen(this, this.cityMap);
    this.audio = new SoundEffects(this);
    this.saves = new SaveSlots(this);
    this.menus = new GameMenus(this);
    this.shop = new ShopMenu(this);
  }

  wireEvents() {
    const e = this.events;
    e.on('crash', (c) => {
      this.particles.sparks(c.x, 0.8, c.z, Math.min(30, Math.floor(c.speed)));
      if (c.vehicle === this.player.vehicle || c.other === this.player.vehicle) {
        this.cameraRig.addShake(Math.min(1, c.speed / 30));
        this.state.stats.crashes += 1;
      }
      this.audio.crash(c.speed, c.x, c.z);
    });
    e.on('explosion', (x) => {
      this.audio.explosion(x.x, x.z);
      this.cameraRig.addShake(1);
      for (const v of this.vehicles.list) {
        const d = Math.hypot(v.body.x - x.x, v.body.z - x.z);
        if (v !== x.vehicle && d < x.radius) { v.body.health -= (x.radius - d) * 8; v.body.vx += (v.body.x - x.x) / (d + 1) * 6; v.body.vz += (v.body.z - x.z) / (d + 1) * 6; }
      }
      for (const t of this.combat.targets()) {
        const d = Math.hypot(t.fig.x - x.x, t.fig.z - x.z);
        if (d < x.radius) t.takeHit(120, x.vehicle?.role === 'player' ? 'player' : 'explosion');
      }
      const pd = Math.hypot(this.player.x - x.x, this.player.z - x.z);
      if (pd < x.radius && !this.player.vehicle) this.player.damage((x.radius - pd) * 12, 'explosion');
    });
    e.on('playerDown', (kind) => {
      this.hud.flashTitle(kind, kind === 'BUSTED' ? 'Bail: $500' : 'Hospital bill: $250', kind === 'BUSTED' ? '#4fa3ff' : '#ff3b5c', 4);
    });
    e.on('wantedUp', (level) => { if (level >= 3) this.dialogue.play([['dispatch', level >= 4 ? 'All units: tactical teams authorised. HALO-1 overhead.' : 'HALO-1 airborne. Suspect is armed.']], this.cast); });
  }

  /** Clock, sky, sea, lights and grade for the current hour. */
  updateAtmosphere() {
    const sky = this.sky;
    sky.setHour(this.state.hour);
    const n = sky.night;
    this.city.setNight(n);
    this.props.setNight(n);
    this.roads.setWetness(n * 0.85);
    const h = this.state.hour;
    const golden = smoothstep(16, 17.6, h) * (1 - smoothstep(19.4, 20.4, h));
    this.post.setGrade(n, golden);
    if (Math.abs(this.envHour - h) > 0.6) this.refreshEnvironment();
  }

  /** Reflections for paint and glass: a blurred capture of the sky dome. */
  refreshEnvironment() {
    this.envHour = this.state.hour;
    const skyScene = new THREE.Scene();
    const dome = this.sky.dome.clone();
    dome.position.set(0, 0, 0);
    skyScene.add(dome);
    const rt = this.pmrem.fromScene(skyScene, 0.04);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.55;
  }

  /** Populate the streets around a point (after a teleport or on start). */
  populate(x, z) {
    this.traffic.populate(x, z);
    this.peds.populate(x, z);
  }

  teleportPlayer(x, z, yaw = 0) {
    if (this.player.vehicle) this.player.exitVehicleForced({ x, z });
    this.player.placeAt(x, z, yaw);
    this.player.figure.y = groundHeight(x, z);
    this.cameraRig.yaw = yaw + Math.PI;
    this.cameraRig.initialised = false;
    for (const v of this.vehicles.list.slice()) if (v.role === 'traffic' || v.role === 'parked') this.vehicles.remove(v);
    this.populate(x, z);
  }

  newGame() {
    this.state = createGameState();
    const [x, z] = PLACES.safehouse.door;
    this.teleportPlayer(x, z - 3, Math.PI);
    this.start();
    this.hud.flashTitle('SOLENNE NIGHTS', 'Palmera Beach · Friday, 18:20', '#ffd166', 4);
  }

  continueGame(slot) {
    if (!slot || !this.saves.load(slot)) return this.newGame();
    this.start();
  }

  start() {
    this.running = true;
    this.paused = false;
    this.hud.show(true);
    this.menus.hideTitle();
    this.input.wantsLock = true;
    this.applySettings();
  }

  quitToTitle() {
    this.setPaused(false);
    this.running = false;
    this.hud.show(false);
    this.input.releasePointer();
    this.audio.radio?.stop();
    this.menus.showTitle();
  }

  setPaused(on, reason = 'menu') {
    this.paused = on;
    if (reason === 'menu') this.menus.showPause(on);
    if (on) this.input.releasePointer();
  }

  applySettings() {
    const s = this.state.settings;
    this.input.sensitivity = s.sensitivity;
    this.audio.setVolumes(s.volume, s.music);
    const quality = { low: 1024, medium: 1536, high: 2048 }[s.quality] ?? 2048;
    if (this.sky.sun.shadow.mapSize.x !== quality) {
      this.sky.sun.shadow.mapSize.set(quality, quality);
      this.sky.sun.shadow.map?.dispose();
      this.sky.sun.shadow.map = null;
    }
  }

  respawnPlayer(outcome) {
    const st = this.state;
    st.money = Math.max(0, st.money - (outcome === 'BUSTED' ? 500 : 250));
    st.health = 100;
    st.wanted = 0;
    this.police.standDown();
    const [x, z] = PLACES.safehouse.door;
    this.teleportPlayer(x, z - 3, Math.PI);
  }

  openMap(on) {
    this.mapScreen.toggle(on);
    this.paused = on;
    if (on) this.input.releasePointer();
  }

  /** Esc / P / M: pause menu, map and shop screens. Returns true when a key was used. */
  handleMenuKeys() {
    const input = this.input;
    if (input.pressed('Escape') || input.pressed('KeyP')) {
      if (this.mapScreen.open) this.openMap(false);
      else if (this.shop.open) this.shop.close();
      else this.setPaused(!this.paused);
      return true;
    }
    if (input.pressed('KeyM') && !this.shop.open && (this.mapScreen.open || !this.paused)) {
      this.openMap(!this.mapScreen.open);
      return true;
    }
    return false;
  }

  /** Handle menu-level and context keys while playing. */
  handleGlobalKeys() {
    const input = this.input;
    if (this.handleMenuKeys() || this.paused) return;
    if (input.pressed('KeyR') && this.player.vehicle) this.audio.radio?.nextStation();
    if (input.pressed('KeyV')) this.hud.toast(`Camera: ${this.cameraRig.cycleView()}`, 1.5);
    const shop = this.shop.nearbyShop();
    const p = this.player;
    let prompt = this.activities.mode ? null : this.activities.prompt;
    if (shop && !prompt) {
      prompt = `<kbd>E</kbd> ${PLACES[shop].name}`;
      if (input.pressed('KeyE')) this.shop.show(shop);
    }
    if (!prompt && !p.vehicle && p.alive) {
      const v = this.vehicles.nearest(p.x, p.z, 5.5, (c) => !c.dead && c.role !== 'player');
      if (v) prompt = `<kbd>F</kbd> ${v.driver === 'npc' ? 'Steal' : 'Enter'} ${v.def.name}`;
    }
    this.hud.prompt(prompt);
  }

  /** One fixed simulation step. */
  step(dt) {
    this.clock += dt;
    if (!this.freezeClock) this.state.hour = (this.state.hour + dt / 60) % 24;
    this.roads.updateSignals(this.clock);
    this.player.update(dt);
    if (this.autopilot) this.autopilot(dt);
    this.traffic.update(dt);
    this.police.update(dt);
    this.vehicles.update(dt);
    this.peds.update(dt);
    this.missions.update(dt);
    this.activities.update(dt);
    this.dialogue.update(dt);
    this.particles.update(dt);
    this.vehicleEffects(dt);
  }

  vehicleEffects() {
    const v = this.player.vehicle;
    for (const car of v ? [v] : []) {
      const b = car.body;
      if (car.def.kind === 'boat') {
        if (b.speed > 4) this.particles.wake(b.x - Math.sin(b.heading) * 3.5, b.z - Math.cos(b.heading) * 3.5);
        continue;
      }
      if (b.slip > 4.5 && b.speed > 7) {
        const rx = Math.cos(b.heading), rz = -Math.sin(b.heading);
        const back = car.def.length * 0.32;
        for (const s of [-1, 1]) this.particles.tyreSmoke(b.x - Math.sin(b.heading) * back + rx * s * 0.9, b.z - Math.cos(b.heading) * back + rz * s * 0.9);
      }
    }
  }

  /** Per rendered frame: simulation catch-up, camera, look, HUD, draw. */
  frame(realDt) {
    const dt = Math.min(realDt, 0.1);
    if (this.running && !this.paused) {
      this.handleGlobalKeys();
      this.cameraRig.orbit(this.input.mouseDX, this.input.mouseDY, this.input.sensitivity, this.state.settings.invertY);
      this.accumulator = (this.accumulator || 0) + dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 4) { this.step(STEP); this.accumulator -= STEP; steps += 1; }
      if (steps === 4) this.accumulator = 0;
      this.audio.update(dt);
    } else if (this.running && this.paused) {
      this.handleMenuKeys();
    } else {
      this.titleCamera(dt);
    }
    this.render(dt);
    this.input.endFrame();
  }

  /** Slow orbit over the city behind the title screen. */
  titleCamera(dt) {
    this.clock += dt;
    this.landmarks.update(dt, this.sky.night);
    const t = this.clock * 0.03;
    this.cameraRig.cinematic = { position: new THREE.Vector3(380 + Math.sin(t) * 140, 70, -120 + Math.cos(t) * 140), target: new THREE.Vector3(250, 20, -250), fov: 55, rate: 2 };
    this.cameraRig.update(dt, { position: this.player.figure });
  }

  render(dt) {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.updateAtmosphere();
    if (this.running) {
      this.cameraRig.cinematic = this.cinematicOverride ?? null;
      this.cameraRig.update(dt, { vehicle: this.player.vehicle, position: this.player.figure, aiming: this.player.aiming });
      this.landmarks.update(dt, this.sky.night);
      this.characters.update(this.paused ? 0 : dt);
    }
    const focus = this.running ? { x: this.player.x, z: this.player.z } : { x: 250, z: -250 };
    this.sky.follow(focus, this.camera, this.clock);
    this.water.update(this.clock, this.sky, this.scene.fog);
    this.dynamicGlow.clear();
    this.vehicles.pushGlows(this.dynamicGlow, this.camera.position, this.sky.night, this.clock);
    this.combat.update(this.paused ? 0 : dt);
    if (this.landmarks.lighthouseGlow) {
      const lg = this.landmarks.lighthouseGlow;
      this.dynamicGlow.push(lg.x + Math.sin(this.clock) * 2.5, lg.y, lg.z + Math.cos(this.clock) * 2.5, 0xfff0c0, 14, 1, 1.2);
    }
    this.police.heli.pushGlows(this.dynamicGlow, this.clock);
    this.dynamicGlow.commit();
    for (const glow of [this.staticGlow, this.dynamicGlow]) glow.sync(this.renderer, this.camera, this.sky.night, this.scene.fog);
    this.particles.sync(this.renderer, this.camera);
    this.post.composite.uniforms.flash.value = this.particles.screenFlash;
    const pv = this.running ? this.player.vehicle : null;
    this.post.setSpeed(pv ? (pv.body.speed - 24) / 26 : 0);
    this.post.render(this.scene, this.camera);
    if (this.running) {
      this.hud.update(dt);
      this.hudMinimap.draw(dt);
    }
  }
}
