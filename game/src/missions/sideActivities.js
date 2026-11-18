// Things to do between story chapters: street races against the clock, taxi fares in any
// Solenne Cab, van deliveries for Gizmo, and 24 golden Sun Tokens hidden around the city.
// Each pays cash and respect; records are kept in the game state.
import * as THREE from 'three';
import { Beacon, CheckpointGate } from '../render/worldMarkers.js';
import { createRandom } from '../core/seededRandom.js';
import { groundHeight, PLACES, GRID_LINES, ROAD_WIDTH } from '../world/cityLayout.js';
import { fmtTime } from '../ui/hudOverlay.js';

export const RACES = [
  { id: 'lumen-loop', name: 'Calle Lumen Loop', start: [-500, -110], par: 75, prize: 900,
    points: [[-500, -200], [-500, -400], [-300, -400], [-300, -100], [-500, -100]] },
  { id: 'coastline', name: 'Coastline Sprint', start: [500, 380], par: 70, prize: 1200,
    points: [[500, 200], [500, -100], [500, -400], [500, -650], [300, -700]] },
  { id: 'causeway-dash', name: 'Causeway Dash', start: [300, -310], par: 60, prize: 1500,
    points: [[500, -300], [700, -300], [860, -300], [860, -190], [1100, -190], [1100, -430]] },
];

export class SideActivities {
  constructor(game) {
    this.game = game;
    this.mode = null; // 'race' | 'taxi' | 'delivery'
    this.raceBeacons = RACES.map(() => new Beacon(game.scene, 0x5dff9b, 30));
    this.gate = new CheckpointGate(game.scene, 0x5dff9b);
    this.jobBeacon = new Beacon(game.scene, 0xff4fd8, 30);
    this.tokens = this.placeTokens();
  }

  /** Spinning golden discs at fixed spots: kerbs, rooftops of low blocks, the beach, piers. */
  placeTokens() {
    const rng = createRandom(2024);
    const spots = [];
    for (let k = 0; k < 24; k += 1) {
      const i = rng.int(0, GRID_LINES.length - 2), j = rng.int(0, GRID_LINES.length - 2);
      const along = GRID_LINES[i] + 30 + rng() * 40;
      spots.push([along, GRID_LINES[j] + (rng() < 0.5 ? 1 : -1) * (ROAD_WIDTH / 2 + 2)]);
    }
    spots[3] = [600, -40]; spots[9] = [700, -100]; spots[15] = [1000, -250]; spots[21] = [330, 560];
    const geo = new THREE.CylinderGeometry(0.8, 0.8, 0.15, 20).rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffc83a, emissive: 0xffa000, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.25 });
    return spots.map(([x, z], idx) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, groundHeight(x, z) + 1.4, z);
      this.game.scene.add(mesh);
      return { idx, x, z, mesh };
    });
  }

  get blips() {
    const list = [];
    if (this.game.missions.mission) return list;
    if (!this.mode) for (const r of RACES) list.push({ x: r.start[0], z: r.start[1], color: '#5dff9b', shape: 'icon', label: '⚑', size: 8 });
    if (this.target) list.push({ x: this.target.x, z: this.target.z, color: '#ff4fd8', shape: 'target', size: 8, edge: true });
    return list;
  }

  get hudLine() {
    if (this.mode === 'race') return `${this.race.name} · ${this.cp}/${this.race.points.length} · ${fmtTime(this.time)} (par ${fmtTime(this.race.par)})`;
    if (this.mode === 'taxi') return this.passenger ? `FARE · ${fmtTime(this.time)} left` : 'TAXI · pick up the fare';
    if (this.mode === 'delivery') return `DELIVERY · ${fmtTime(this.time)} left`;
    return '';
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    for (const t of this.tokens) {
      if (g.state.tokens.includes(t.idx)) { t.mesh.visible = false; continue; }
      t.mesh.rotation.y += dt * 2.5;
      if (Math.abs(t.x - p.x) < 2.2 && Math.abs(t.z - p.z) < 2.2) {
        g.state.tokens.push(t.idx);
        g.state.money += 100;
        g.state.respect += 5;
        g.hud.toast(`Sun Token ${g.state.tokens.length}/24  +$100`);
        g.audio?.sting('cash');
      }
    }
    const busy = !!g.missions.mission;
    RACES.forEach((r, k) => {
      const b = this.raceBeacons[k];
      if (busy || this.mode) { b.hide(); return; }
      b.show(r.start[0], r.start[1], 4, groundHeight(...r.start));
      b.update(dt);
    });
    this.jobBeacon.update(dt);
    if (busy) { if (this.mode) this.end(null); return; }
    if (!this.mode) return this.idle();
    this.time += this.mode === 'race' ? dt : -dt;
    if (this.mode === 'race') this.updateRace();
    else this.updateJob();
  }

  idle() {
    const g = this.game;
    const p = g.player;
    let prompt = null;
    for (const r of RACES) {
      if (Math.hypot(p.x - r.start[0], p.z - r.start[1]) < 8) {
        prompt = p.vehicle ? `<kbd>T</kbd> Start race: ${r.name} (best ${g.state.races[r.id] ? fmtTime(g.state.races[r.id]) : '—'})` : `Get a vehicle to race ${r.name}`;
        if (p.vehicle && g.input.pressed('KeyT')) this.startRace(r);
      }
    }
    const v = p.vehicle;
    if (!prompt && v?.def.taxi) {
      prompt = '<kbd>T</kbd> Start taxi fares';
      if (g.input.pressed('KeyT')) this.startJob('taxi');
    } else if (!prompt && v?.type === 'van') {
      prompt = '<kbd>T</kbd> Start deliveries for Gizmo';
      if (g.input.pressed('KeyT')) this.startJob('delivery');
    }
    this.prompt = prompt;
  }

  startRace(r) {
    this.mode = 'race';
    this.race = r;
    this.cp = 0;
    this.time = 0;
    this.game.hud.flashTitle('STREET RACE', r.name.toUpperCase(), '#5dff9b', 2.5);
  }

  updateRace() {
    const g = this.game;
    const r = this.race;
    const [x, z] = r.points[this.cp];
    const prev = this.cp ? r.points[this.cp - 1] : r.start;
    this.gate.show(x, z, Math.atan2(x - prev[0], z - prev[1]) + Math.PI / 2, groundHeight(x, z));
    this.target = { x, z };
    if (!g.player.vehicle) return this.end('Race abandoned');
    if (Math.hypot(g.player.x - x, g.player.z - z) < 14) {
      this.cp += 1;
      g.audio?.sting('checkpoint');
      if (this.cp >= r.points.length) {
        const best = g.state.races[r.id];
        if (!best || this.time < best) g.state.races[r.id] = this.time;
        const beat = this.time <= r.par;
        const prize = beat ? r.prize : Math.round(r.prize * 0.3);
        g.state.money += prize;
        g.state.respect += beat ? 40 : 10;
        g.hud.flashTitle(beat ? 'RACE WON' : 'FINISHED', `${fmtTime(this.time)} · +$${prize}`, beat ? '#5dff9b' : '#ffd166');
        this.end(null);
      }
    }
  }

  startJob(kind) {
    this.mode = kind;
    this.passenger = false;
    this.jobs = 0;
    this.nextJob();
  }

  /** A random kerbside point 150-450 m away, for pickups and drop-offs. */
  randomStop(minD = 150, maxD = 450) {
    const g = this.game;
    for (let a = 0; a < 30; a += 1) {
      const e = g.roads.edges[Math.floor(g.rng() * g.roads.edges.length)];
      if (e.kind === 'bridge') continue;
      const p = g.roads.lanePoint(g.roads.nodes[e.a], g.roads.nodes[e.b], 0.5);
      const d = Math.hypot(p.x - g.player.x, p.z - g.player.z);
      if (d > minD && d < maxD) return { x: p.x, z: p.z, d };
    }
    return { x: PLACES.safehouse.door[0], z: PLACES.safehouse.door[1], d: 300 };
  }

  nextJob() {
    const stop = this.randomStop();
    this.target = stop;
    this.time = 25 + stop.d / 9;
    this.jobBeacon.show(stop.x, stop.z, 4);
  }

  updateJob() {
    const g = this.game;
    const p = g.player;
    const v = p.vehicle;
    if (!v || (this.mode === 'taxi' && !v.def.taxi) || (this.mode === 'delivery' && v.type !== 'van')) return this.end('Job cancelled');
    if (this.time <= 0) return this.end('Out of time');
    if (Math.hypot(p.x - this.target.x, p.z - this.target.z) < 9 && v.body.speed < 4) {
      if (this.mode === 'taxi' && !this.passenger) {
        this.passenger = true;
        g.hud.toast('Fare picked up. Destination marked.');
        this.nextJob();
        return;
      }
      const pay = Math.round(80 + this.time * 6);
      g.state.money += pay;
      g.state.respect += 6;
      if (this.mode === 'taxi') g.state.taxiFares += 1; else g.state.deliveries += 1;
      g.hud.toast(`${this.mode === 'taxi' ? 'Fare' : 'Delivery'} complete  +$${pay}`);
      g.audio?.sting('cash');
      this.passenger = false;
      this.nextJob();
    }
  }

  end(reason) {
    if (reason) this.game.hud.toast(reason);
    this.mode = null;
    this.target = null;
    this.gate.hide();
    this.jobBeacon.hide();
  }
}
