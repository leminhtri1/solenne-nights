// The full-screen map (M): the whole of Solenne with district names, every contact, shop and
// race, police and the player, a click-to-set waypoint, a legend, and the story so far.
import { MAP_SCALE, toMap, toWorld } from './mapPainter.js';
import { gatherBlips, drawBlip } from './minimap.js';
import { DISTRICTS, PLACES } from '../world/cityLayout.js';
import { STORY } from '../missions/storyMissions.js';

const $ = (id) => document.getElementById(id);
const LABELS = {
  meridian: [-50, -250], lumen: [-400, -170], palmera: [380, -150], coral: [-150, -600], sable: [-560, 360],
  azul: [260, 420], bellavista: [-200, 120], verano: [980, -250], bay: [760, 200],
};

export class MapScreen {
  constructor(game, cityMap) {
    this.game = game;
    this.cityMap = cityMap;
    this.canvas = $('map-canvas');
    this.g = this.canvas.getContext('2d');
    this.open = false;
    this.canvas.addEventListener('click', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.canvas.width;
      const py = ((e.clientY - r.top) / r.height) * this.canvas.height;
      const [x, z] = toWorld(px / this.k, py / this.k);
      this.game.waypoint = this.game.waypoint && Math.hypot(this.game.waypoint.x - x, this.game.waypoint.z - z) < 40 ? null : { x, z };
      this.draw();
    });
  }

  toggle(on = !this.open) {
    this.open = on;
    $('map-screen').classList.toggle('hidden', !on);
    if (on) { this.draw(); this.sidebar(); }
  }

  draw() {
    const g = this.g;
    const W = this.canvas.width;
    this.k = W / this.cityMap.width;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.cityMap, 0, 0, W, W);
    const k = this.k;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of DISTRICTS) {
      const at = LABELS[d.id];
      if (!at) continue;
      const [x, y] = toMap(at[0], at[1]);
      g.font = '900 26px Segoe UI, Arial';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(d.name.toUpperCase(), x * k, y * k);
      g.fillStyle = d.color;
      g.fillText(d.name.toUpperCase(), x * k, y * k);
      g.font = '600 15px Segoe UI, Arial';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.strokeText(d.tag, x * k, y * k + 22);
      g.fillText(d.tag, x * k, y * k + 22);
    }
    const route = this.game.hudMinimap?.route ?? [];
    if (route.length > 1) {
      g.strokeStyle = this.game.waypoint ? '#ff4fd8' : '#ffd166';
      g.lineWidth = 6;
      g.beginPath();
      route.forEach((p, i) => { const [x, y] = toMap(p.x, p.z); if (i) g.lineTo(x * k, y * k); else g.moveTo(x * k, y * k); });
      g.stroke();
    }
    for (const b of gatherBlips(this.game)) {
      const [x, y] = toMap(b.x, b.z);
      drawBlip(g, x * k, y * k, b, 2.2);
    }
    for (const [key, place] of Object.entries(PLACES)) {
      const [x, y] = toMap(place.door[0], place.door[1]);
      g.font = '700 15px Segoe UI, Arial';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.strokeText(place.name, x * k, y * k + 30);
      g.fillStyle = '#fff';
      g.fillText(place.name, x * k, y * k + 30);
      void key;
    }
    const p = this.game.player;
    const [px, py] = toMap(p.x, p.z);
    g.save();
    g.translate(px * k, py * k);
    g.rotate(Math.PI - (p.vehicle ? p.vehicle.body.heading : p.figure.yaw));
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(14, 14); g.lineTo(0, 7); g.lineTo(-14, 14); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // scale bar
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(24, W - 54, 230, 34);
    g.fillStyle = '#fff';
    g.fillRect(36, W - 32, 500 * MAP_SCALE * k, 5);
    g.font = '700 14px Segoe UI, Arial';
    g.textAlign = 'left';
    g.fillText('500 m', 36 + 500 * MAP_SCALE * k + 10, W - 30);
  }

  sidebar() {
    const st = this.game.state;
    const rows = STORY.map((m, i) => {
      const done = i < st.storyIndex;
      const cur = i === st.storyIndex;
      return `<div class="story-row ${done ? 'done' : ''} ${cur ? 'current' : ''}"><span class="n">${i + 1}</span><span class="t">${m.title}</span><span class="s">${done ? 'DONE' : cur ? 'NEXT' : ''}</span></div>`;
    }).join('');
    const pct = Math.round(((st.storyIndex / STORY.length) * 70 + (st.tokens.length / 24) * 15 + (Object.keys(st.races).length / 3) * 15));
    $('map-story').innerHTML = `<div class="progress">Story <b>${st.storyIndex}/${STORY.length}</b> · Sun Tokens <b>${st.tokens.length}/24</b> · Races <b>${Object.keys(st.races).length}/3</b> · Completion <b>${pct}%</b></div>${rows}`;
    const legend = [['#ffd166', 'Objective'], ['#ff4fd8', 'Waypoint'], ['#5dff9b', 'Street race'], ['#ff5050', 'Gun shop'], ['#5ad1ff', 'Paint & repair'], ['#7dff9a', 'Safehouse'], ['#ff2a4a', 'Police'], ['#e8f4ff', 'HALO-1']];
    $('map-legend').innerHTML = legend.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
  }
}
