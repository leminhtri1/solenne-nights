// The full-screen map (M): the whole of Solenne with district names, story chapters where they
// start, every contact, shop, safehouse and race, uncollected Sun Tokens, police and the player,
// a click-to-set waypoint with its GPS route, and a side panel with the story so far,
// completion bars, the respect ladder and a legend.
import { MAP_SCALE, toMap, toWorld } from './mapPainter.js';
import { gatherBlips, drawBlip } from './minimap.js';
import { DISTRICTS, PLACES } from '../world/cityLayout.js';
import { STORY } from '../missions/storyMissions.js';
import { RESPECT_RANKS, rankFor } from '../core/gameState.js';

const $ = (id) => document.getElementById(id);
const LABELS = {
  meridian: [-60, -405], lumen: [-420, -250], palmera: [400, -175], coral: [-150, -600], sable: [-560, 360],
  azul: [260, 420], bellavista: [-200, 120], verano: [980, -330], bay: [800, 250],
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
      this.game.hudMinimap.routeTimer = 0;
      this.game.hudMinimap.updateRoute(0);
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
    this.drawDistrictNames(g);
    this.drawRoute(g);
    this.drawTokens(g);
    for (const b of gatherBlips(this.game)) {
      const [x, y] = toMap(b.x, b.z);
      drawBlip(g, x * this.k, y * this.k, b, 2.2);
    }
    this.drawPlaceNames(g);
    this.drawStoryMarkers(g);
    this.drawPlayer(g);
    this.drawScaleBar(g, W);
  }

  drawDistrictNames(g) {
    const k = this.k;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of DISTRICTS) {
      const at = LABELS[d.id];
      if (!at) continue;
      const [x, y] = toMap(at[0], at[1]);
      g.font = '900 25px Segoe UI, Arial';
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(10,8,30,0.85)';
      g.strokeText(d.name.toUpperCase(), x * k, y * k);
      g.fillStyle = '#ffffff';
      g.fillText(d.name.toUpperCase(), x * k, y * k);
      g.fillStyle = d.color;
      g.fillRect(x * k - 34, y * k + 15, 68, 3);
    }
  }

  drawRoute(g) {
    const k = this.k;
    const route = this.game.hudMinimap?.route ?? [];
    if (route.length < 2) return;
    for (const [w, c] of [[11, 'rgba(20,10,40,0.7)'], [6, this.game.waypoint ? '#ff4fd8' : '#ffd166']]) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.lineJoin = 'round';
      g.beginPath();
      route.forEach((p, i) => { const [x, y] = toMap(p.x, p.z); if (i) g.lineTo(x * k, y * k); else g.moveTo(x * k, y * k); });
      g.stroke();
    }
  }

  /** Uncollected Sun Tokens as small gold suns. */
  drawTokens(g) {
    const k = this.k;
    const got = this.game.state.tokens;
    for (const t of this.game.activities?.tokens ?? []) {
      if (got.includes(t.idx)) continue;
      const [x, y] = toMap(t.x, t.z);
      g.fillStyle = '#ffc83a';
      g.strokeStyle = 'rgba(60,30,0,0.9)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x * k, y * k, 5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }

  drawPlaceNames(g) {
    const k = this.k;
    g.textAlign = 'center';
    for (const place of Object.values(PLACES)) {
      const [x, y] = toMap(place.door[0], place.door[1]);
      g.font = '800 14px Segoe UI, Arial';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(10,8,30,0.85)';
      g.strokeText(place.name, x * k, y * k + 30);
      g.fillStyle = '#fff';
      g.fillText(place.name, x * k, y * k + 30);
    }
  }

  /** The current chapter as a big gold star pin, later chapters as small numbered pins. */
  drawStoryMarkers(g) {
    const k = this.k;
    const idx = this.game.state.storyIndex;
    const stacked = {};
    STORY.forEach((m, i) => {
      if (i < idx) return;
      const place = PLACES[m.start];
      if (!place) return;
      const n = (stacked[m.start] = (stacked[m.start] ?? -1) + 1);
      const [x0, y0] = toMap(place.door[0], place.door[1]);
      const x = x0 * k + 30 + n * 24, y = y0 * k - 34;
      const cur = i === idx;
      const r = cur ? 17 : 11;
      g.fillStyle = cur ? '#ffd166' : 'rgba(255,209,102,0.75)';
      g.strokeStyle = '#2a1400';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y + r + 9);
      g.arc(x, y, r, Math.PI * 0.72, Math.PI * 2.28);
      g.closePath();
      g.fill(); g.stroke();
      g.fillStyle = '#2a1400';
      g.font = `900 ${cur ? 18 : 13}px Segoe UI, Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(cur ? `★${i + 1}` : String(i + 1), x, y + 1);
      if (cur) {
        g.font = '900 15px Segoe UI, Arial';
        g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,30,0.9)';
        g.textAlign = 'left';
        g.strokeText(m.title.toUpperCase(), x + r + 6, y);
        g.fillStyle = '#ffd166';
        g.fillText(m.title.toUpperCase(), x + r + 6, y);
      }
    });
  }

  drawPlayer(g) {
    const k = this.k;
    const p = this.game.player;
    const [px, py] = toMap(p.x, p.z);
    g.save();
    g.translate(px * k, py * k);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
    g.rotate(Math.PI - (p.vehicle ? p.vehicle.body.heading : p.figure.yaw));
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(14, 14); g.lineTo(0, 7); g.lineTo(-14, 14); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  drawScaleBar(g, W) {
    const k = this.k;
    g.fillStyle = 'rgba(10,8,30,0.7)';
    g.fillRect(24, W - 54, 230, 34);
    g.fillStyle = '#fff';
    g.fillRect(36, W - 32, 500 * MAP_SCALE * k, 5);
    g.font = '700 14px Segoe UI, Arial';
    g.textAlign = 'left';
    g.fillText('500 m', 36 + 500 * MAP_SCALE * k + 10, W - 30);
  }

  sidebar() {
    const st = this.game.state;
    const raceCount = Object.keys(st.races).length;
    const pct = Math.round(((st.storyIndex / STORY.length) * 70 + (st.tokens.length / 24) * 15 + (raceCount / 3) * 15));
    const bar = (label, have, total, color) => `<div class="cbar-row"><span>${label}</span><div class="cbar"><i style="width:${Math.round((have / total) * 100)}%;background:${color}"></i></div><b>${have}/${total}</b></div>`;
    const rows = STORY.map((m, i) => {
      const done = i < st.storyIndex;
      const cur = i === st.storyIndex;
      return `<div class="story-row ${done ? 'done' : ''} ${cur ? 'current' : ''}"><span class="n">${i + 1}</span><span class="t">${m.title}</span><span class="s">${done ? '✔ DONE' : cur ? '★ NOW' : ''}</span></div>`;
    }).join('');
    const rank = rankFor(st.respect);
    const ladder = RESPECT_RANKS.map((r, i) => `<span class="rung ${i + 1 < rank.level ? 'past' : ''} ${i + 1 === rank.level ? 'here' : ''}">${r.title}</span>`).join('');
    $('map-story').innerHTML = `<div class="completion"><b>${pct}%</b> COMPLETE · $${Math.floor(st.money).toLocaleString('en-US')}</div>
      ${bar('Story', st.storyIndex, STORY.length, 'linear-gradient(90deg,#ffd166,#ff9a3d)')}
      ${bar('Sun Tokens', st.tokens.length, 24, 'linear-gradient(90deg,#ffe14a,#ffb000)')}
      ${bar('Street races', raceCount, 3, 'linear-gradient(90deg,#5dff9b,#2bd4a0)')}
      ${bar('Taxi fares', Math.min(st.taxiFares, 10), 10, 'linear-gradient(90deg,#ffd84a,#ff9a3d)')}
      <div class="side-h">STORY</div>${rows}
      <div class="side-h">RESPECT · LV ${rank.level}</div><div class="ladder">${ladder}</div>`;
    const legend = [['#ffd166', 'Story chapter'], ['#ff4fd8', 'Waypoint'], ['#5dff9b', 'Street race'], ['#ffc83a', 'Sun Token'], ['#ff5050', 'Gun shop'], ['#5ad1ff', 'Paint & repair'], ['#7dff9a', 'Safehouse'], ['#ffb347', 'Chop garage'], ['#ff2a4a', 'Police'], ['#e8f4ff', 'HALO-1']];
    $('map-legend').innerHTML = legend.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
  }
}
