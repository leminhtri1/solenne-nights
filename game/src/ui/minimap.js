// The round radar in the bottom-left: a rotating window onto the painted city map, the GPS
// route to the current objective along real streets, the police search area, flashing police
// blips, the helicopter, contacts and shops, and the player arrow.
import { MAP, MAP_SCALE, toMap } from './mapPainter.js';
import { PLACES } from '../world/cityLayout.js';

export function gatherBlips(game) {
  const blips = [];
  const obj = game.missions.objective;
  if (obj?.target) blips.push({ x: obj.target.x, z: obj.target.z, color: '#ffd166', shape: 'target', size: 9, edge: true });
  if (game.waypoint) blips.push({ x: game.waypoint.x, z: game.waypoint.z, color: '#ff4fd8', shape: 'diamond', size: 8, edge: true });
  for (const [key, place] of Object.entries(PLACES)) {
    if (key === 'marina' || key === 'lighthouse' || key === 'villa') continue;
    blips.push({ x: place.door[0], z: place.door[1], color: place.color, shape: 'icon', label: place.icon, size: 8 });
  }
  for (const a of game.activities?.blips ?? []) blips.push(a);
  for (const u of game.police.units) {
    if (u.vehicle.dead || u.leaving) continue;
    const phase = Math.floor(game.clock * 6 + u.vehicle.id) % 2;
    blips.push({ x: u.vehicle.body.x, z: u.vehicle.body.z, color: phase ? '#ff2a4a' : '#2a6bff', shape: 'dot', size: 5 });
  }
  for (const o of game.police.officers) if (!o.dead) blips.push({ x: o.fig.x, z: o.fig.z, color: '#7aa2ff', shape: 'dot', size: 3 });
  for (const a of game.missions.actors) if (!a.dead) blips.push({ x: a.fig.x, z: a.fig.z, color: '#ff3b3b', shape: 'dot', size: 4 });
  if (game.police.heli.active) blips.push({ x: game.police.heli.x, z: game.police.heli.z, color: '#e8f4ff', shape: 'heli', size: 7 });
  return blips;
}

export class Minimap {
  constructor(canvas, game, cityMap) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.game = game;
    this.cityMap = cityMap;
    this.routeTimer = 0;
    this.route = [];
  }

  /** Recompute the GPS path to the objective along the street graph. */
  updateRoute(dt) {
    this.routeTimer -= dt;
    if (this.routeTimer > 0) return;
    this.routeTimer = 0.8;
    const game = this.game;
    const target = game.waypoint || game.missions.objective?.target;
    if (!target) { this.route = []; return; }
    const roads = game.roads;
    const from = roads.nearestNode(game.player.x, game.player.z);
    const to = roads.nearestNode(target.x, target.z);
    this.route = [{ x: game.player.x, z: game.player.z }, ...roads.route(from.id, to.id).map((id) => roads.nodes[id]), target];
  }

  draw(dt) {
    const game = this.game;
    this.updateRoute(dt);
    const g = this.g;
    const W = this.canvas.width;
    const R = W / 2;
    const px = game.player.x, pz = game.player.z;
    const speed = game.player.speed;
    const metersAcross = 260 + Math.min(speed, 50) * 3;
    const zoom = W / (metersAcross * MAP_SCALE);
    const rot = game.cameraRig.yaw;
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(R, R, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2479c4';
    g.fillRect(0, 0, W, W);
    g.translate(R, R);
    g.rotate(rot);
    g.scale(zoom, zoom);
    const [mx, mz] = toMap(px, pz);
    g.drawImage(this.cityMap, -mx, -mz);
    // police search zone: centred on the player while seen, left at the last sighting otherwise
    const pol = game.police;
    if (game.state.wanted > 0) {
      const [sx, sz] = toMap(pol.lastSeen.x, pol.lastSeen.z);
      const pulse = 0.5 + 0.5 * Math.sin(game.clock * 5);
      const radius = (pol.inSight ? 55 + game.state.wanted * 12 : 70 + game.state.wanted * 20) * MAP_SCALE;
      g.fillStyle = pol.inSight ? `rgba(255,30,60,${0.2 + pulse * 0.12})` : 'rgba(255,40,70,0.2)';
      g.strokeStyle = pol.inSight ? `rgba(80,120,255,${0.6 + pulse * 0.4})` : 'rgba(255,80,110,0.85)';
      g.lineWidth = 4 / zoom;
      g.beginPath();
      g.arc(sx - mx, sz - mz, radius, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    // GPS route
    if (this.route.length > 1) {
      g.strokeStyle = game.waypoint ? '#ff4fd8' : '#ffd166';
      g.lineWidth = 7 / zoom;
      g.lineJoin = 'round';
      g.globalAlpha = 0.9;
      g.beginPath();
      this.route.forEach((p, i) => {
        const [x, z] = toMap(p.x, p.z);
        if (i === 0) g.moveTo(x - mx, z - mz); else g.lineTo(x - mx, z - mz);
      });
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
    // blips (drawn unrotated so icons stay upright)
    const blips = gatherBlips(game);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    for (const b of blips) {
      let dx = (b.x - px) * MAP_SCALE * zoom, dz = (b.z - pz) * MAP_SCALE * zoom;
      let rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      const d = Math.hypot(rx, rz);
      if (d > R - 10) {
        if (!b.edge) continue;
        rx *= (R - 12) / d; rz *= (R - 12) / d;
      }
      drawBlip(g, R + rx, R + rz, b, 2);
    }
    // player arrow
    g.save();
    g.translate(R, R);
    const heading = game.player.vehicle ? game.player.vehicle.body.heading : game.player.figure.yaw;
    g.rotate(-(heading - rot) + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // north marker
    g.save();
    g.translate(R + Math.sin(rot) * (R - 16), R - Math.cos(rot) * (R - 16));
    g.fillStyle = 'rgba(10,8,24,0.8)';
    g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 17px Segoe UI, Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', 0, 1);
    g.restore();
    void MAP;
  }
}

export function drawBlip(g, x, y, b, k = 1) {
  const s = b.size * k;
  g.save();
  g.translate(x, y);
  g.fillStyle = b.color;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 2 * k * 0.8;
  switch (b.shape) {
    case 'target':
      g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#111'; g.beginPath(); g.arc(0, 0, s * 0.4, 0, Math.PI * 2); g.fill();
      break;
    case 'diamond':
      g.beginPath(); g.moveTo(0, -s); g.lineTo(s, 0); g.lineTo(0, s); g.lineTo(-s, 0); g.closePath(); g.fill(); g.stroke();
      break;
    case 'icon':
      g.beginPath(); g.arc(0, 0, s * 1.15, 0, Math.PI * 2); g.fillStyle = 'rgba(10,8,24,0.9)'; g.fill();
      g.strokeStyle = b.color; g.lineWidth = 2.2 * k * 0.7; g.stroke();
      g.fillStyle = b.color; g.font = `900 ${s * 1.3}px Segoe UI, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(b.label, 0, s * 0.08);
      break;
    case 'heli':
      g.beginPath(); g.arc(0, 0, s * 0.6, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = b.color; g.lineWidth = 2 * k * 0.7;
      g.beginPath(); g.moveTo(-s * 1.4, 0); g.lineTo(s * 1.4, 0); g.moveTo(0, -s * 1.4); g.lineTo(0, s * 1.4); g.stroke();
      break;
    default:
      g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.restore();
}
