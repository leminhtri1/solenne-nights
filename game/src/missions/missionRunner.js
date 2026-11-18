// Plays the story. Between missions it shows the next contact's beacon; stepping into it
// starts the chapter. Each step (talk, steal, drive, chase, eliminate, race, lose the cops)
// is checked every frame; the HUD reads `objective` for its mission panel and GPS route.
// Failing (wasted, busted, out of time, target car destroyed) offers a retry at the beacon.
import { STORY } from './storyMissions.js';
import { HostileActors } from './hostileActors.js';
import { PLACES, groundHeight } from '../world/cityLayout.js';
import { Beacon, CheckpointGate } from '../render/worldMarkers.js';

export class MissionRunner {
  constructor(game) {
    this.game = game;
    this.hostiles = new HostileActors(game);
    this.mission = null;
    this.stepIndex = 0;
    this.step = null;
    this.timer = 0;
    this.vehicles = {};
    this.startBeacon = new Beacon(game.scene, 0xffd166, 60);
    this.targetBeacon = new Beacon(game.scene, 0x4fe8ff, 40);
    this.gate = new CheckpointGate(game.scene);
    this.cooldown = 0;
    this.banner = null;
    game.events.on('playerDown', (kind) => { if (this.mission) this.fail(kind === 'BUSTED' ? 'You were busted.' : 'You were wasted.'); });
  }

  get actors() { return this.hostiles.active; }
  get storyIndex() { return this.game.state.storyIndex; }
  get nextMission() { return STORY[this.storyIndex] ?? null; }
  get chapterCount() { return STORY.length; }

  placePos(key) { return PLACES[key].door; }

  /** What the HUD shows in the mission panel. */
  get objective() {
    if (!this.mission) {
      const next = this.nextMission;
      if (!next) return { chapter: 'EPILOGUE', title: 'Solenne is yours', text: 'Free roam: races, fares, deliveries and Sun Tokens', progress: 1, next: '' };
      const [x, z] = this.placePos(next.start);
      return { chapter: `CHAPTER ${this.storyIndex + 1}`, title: next.title, text: `Meet ${this.game.cast[next.giver].name} at ${PLACES[next.start].name}`, progress: 0, next: next.blurb, target: { x, z } };
    }
    const steps = this.mission.steps;
    const s = this.step;
    const upcoming = steps.slice(this.stepIndex + 1).find((x) => x.text);
    return {
      chapter: `CHAPTER ${this.storyIndex + 1}`,
      title: this.mission.title,
      text: s.text || (s.type === 'talk' ? 'Listen' : ''),
      progress: this.stepIndex / steps.length,
      stage: `${this.stepIndex + 1}/${steps.length}`,
      next: s.next || upcoming?.text || '',
      timer: s.timeLimit ? Math.max(0, s.timeLimit - this.timer) : null,
      target: this.targetPos,
      counter: s.type === 'eliminate' ? `${this.hostiles.aliveCount} left` : s.type === 'checkpoints' ? `${this.cpIndex}/${s.points.length}` : null,
    };
  }

  start(index) {
    const mission = STORY[index];
    if (!mission) return;
    this.mission = mission;
    this.vehicles = {};
    this.stepIndex = -1;
    this.startBeacon.hide();
    this.game.hud?.flashTitle(`CHAPTER ${index + 1}`, mission.title.toUpperCase());
    this.game.audio?.sting('start');
    this.advance();
  }

  advance() {
    this.stepIndex += 1;
    this.timer = 0;
    this.targetPos = null;
    this.targetBeacon.hide();
    this.gate.hide();
    if (this.stepIndex >= this.mission.steps.length) return this.complete();
    const s = this.step = this.mission.steps[this.stepIndex];
    const g = this.game;
    switch (s.type) {
      case 'talk': g.dialogue.play(s.lines, g.cast); break;
      case 'spawnVehicle': {
        const [x, z] = s.at;
        const v = g.vehicles.spawn(s.vehicle, x, z, s.heading ?? 0, { role: 'mission', paint: s.paint ?? null });
        v.driver = s.flee ? 'npc' : null;
        if (s.flee) {
          const from = g.roads.nearestNode(x - Math.sin(s.heading) * 50, z - Math.cos(s.heading) * 50);
          const to = g.roads.nearestNode(x + Math.sin(s.heading) * 60, z + Math.cos(s.heading) * 60);
          v.ai = { from: from.id, to: to.id, cruise: 24, wait: 0, honk: 0 };
          v.flee = true;
        }
        this.vehicles[s.id] = v;
        return this.advance();
      }
      case 'eliminate':
        for (const [x, z] of s.spawn) this.hostiles.spawn(x, z);
        if (s.boss) this.hostiles.spawn(s.boss[0], s.boss[1], true);
        break;
      case 'destroy':
      case 'checkpoints':
        if (s.wanted) g.police.setWanted(Math.max(g.state.wanted, s.wanted));
        this.cpIndex = 0;
        break;
      default: break;
    }
    if (s.chatter) g.dialogue.play(s.chatter, g.cast);
    this.game.events.emit('missionStep', { mission: this.mission, step: s });
  }

  complete() {
    const g = this.game;
    const m = this.mission;
    g.state.money += m.reward;
    g.state.respect += m.respect;
    g.state.missionsDone.push(m.id);
    g.state.storyIndex += 1;
    g.hud?.flashTitle('MISSION PASSED', `+$${m.reward.toLocaleString()}   +${m.respect} RESPECT`, '#ffd166');
    g.audio?.sting('pass');
    this.cleanup(false);
    this.mission = null;
    this.step = null;
    this.cooldown = 4;
    g.saves?.autosave();
  }

  fail(reason) {
    const g = this.game;
    g.hud?.flashTitle('MISSION FAILED', reason, '#ff4d6d');
    g.audio?.sting('fail');
    this.cleanup(true);
    this.mission = null;
    this.step = null;
    this.cooldown = 5;
  }

  cleanup(failed) {
    this.hostiles.clear();
    this.targetBeacon.hide();
    this.gate.hide();
    for (const v of Object.values(this.vehicles)) {
      if (v.removed) continue;
      if (v.role === 'player') continue;
      if (failed || v.dead) this.game.vehicles.remove(v);
      else { v.role = 'parked'; v.ai = null; }
    }
    this.vehicles = {};
    this.game.dialogue.stopIfFrom?.(failed);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.cooldown -= dt;
    this.hostiles.update(dt);
    this.startBeacon.update(dt);
    this.targetBeacon.update(dt);
    if (!this.mission) {
      const next = this.nextMission;
      if (!next) { this.startBeacon.hide(); return; }
      const [x, z] = this.placePos(next.start);
      this.startBeacon.show(x, z, 3, groundHeight(x, z));
      if (this.cooldown <= 0 && p.alive && Math.hypot(p.x - x, p.z - z) < 4.5 && p.speed < 6) this.start(this.storyIndex);
      return;
    }
    // drive fleeing mission vehicles
    for (const v of Object.values(this.vehicles)) if (v.flee && !v.dead && v.role === 'mission' && v.ai) g.traffic.drive(v, dt, true);
    this.timer += dt;
    const s = this.step;
    if (s.timeLimit && this.timer > s.timeLimit) return this.fail('Out of time.');
    const done = this.checkStep(s, dt);
    if (done) {
      if ((s.type === 'enter' || s.type === 'goto') && s.wanted) g.police.setWanted(Math.max(g.state.wanted, s.wanted));
      this.advance();
    }
  }

  checkStep(s, dt) {
    const g = this.game;
    const p = g.player;
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    switch (s.type) {
      case 'talk': return !g.dialogue.active;
      case 'enterAny': return !!p.vehicle;
      case 'enter': {
        const v = this.vehicles[s.id];
        if (!v || v.dead) { this.fail('The vehicle was destroyed.'); return false; }
        this.mark(v.body.x, v.body.z, 4);
        return p.vehicle === v;
      }
      case 'goto': {
        const [x, z] = s.place ? this.placePos(s.place) : s.target;
        const r = s.radius ?? 8;
        this.mark(x, z, Math.min(r, 8));
        if (s.inVehicle) {
          const v = this.vehicles[s.inVehicle];
          if (!v || v.dead) { this.fail('The car is wrecked.'); return false; }
          if (p.vehicle !== v) { this.mark(v.body.x, v.body.z, 4); return false; }
        }
        if (s.onFoot && p.vehicle) return false;
        return near(x, z, r) && (!p.vehicle || p.vehicle.body.speed < 10);
      }
      case 'gotoVehicle': {
        const v = this.vehicles[s.id];
        if (!v) return true;
        this.mark(v.body.x, v.body.z, 4);
        return !p.vehicle && near(v.body.x, v.body.z, s.radius ?? 6);
      }
      case 'loseWanted':
        this.targetPos = null;
        return g.state.wanted === 0;
      case 'eliminate': {
        const alive = this.hostiles.active.filter((a) => !a.dead);
        if (alive.length) {
          let cx = 0, cz = 0;
          for (const a of alive) { cx += a.fig.x; cz += a.fig.z; }
          this.targetPos = { x: cx / alive.length, z: cz / alive.length };
        }
        return alive.length === 0;
      }
      case 'destroy': {
        const v = this.vehicles[s.id];
        if (!v || v.removed) return true;
        this.targetPos = { x: v.body.x, z: v.body.z };
        this.targetBeacon.hide();
        return v.dead || v.body.health <= 0;
      }
      case 'checkpoints': {
        const pts = s.points;
        const [x, z] = pts[this.cpIndex];
        const prev = this.cpIndex > 0 ? pts[this.cpIndex - 1] : [p.x, p.z];
        this.gate.show(x, z, Math.atan2(x - prev[0], z - prev[1]) + Math.PI / 2, groundHeight(x, z));
        this.targetPos = { x, z };
        if (near(x, z, 14)) {
          this.cpIndex += 1;
          g.audio?.sting('checkpoint');
          if (this.cpIndex >= pts.length) return true;
        }
        void dt;
        return false;
      }
      default: return true;
    }
  }

  mark(x, z, size) {
    this.targetPos = { x, z };
    this.targetBeacon.show(x, z, size, groundHeight(x, z));
  }
}
