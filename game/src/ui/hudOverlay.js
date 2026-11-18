// Drives the DOM HUD from game state: mission panel, police response roster, clock, cash,
// wanted stars with IN SIGHT / SEARCHING, weapon slots and ammo, health / armour / respect
// bars with the rank name, district label, the speedometer gauge with gear and condition,
// context prompts, toasts and the big MISSION PASSED / WASTED banners.
import { WEAPONS, WEAPON_ORDER } from '../combat/weaponCatalog.js';
import { rankFor } from '../core/gameState.js';
import { districtAt } from '../world/cityLayout.js';

const $ = (id) => document.getElementById(id);
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const WEAPON_ART = {
  fists: '<svg viewBox="0 0 44 24"><path d="M12 6h16a4 4 0 0 1 4 4v6a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V9a3 3 0 0 1 2-3z" fill="#ffd9b0"/><path d="M15 6v6M20 6v6M25 6v6" stroke="#8a5a3a" stroke-width="1.6"/></svg>',
  pistol: '<svg viewBox="0 0 44 24"><path d="M6 6h30v6H18l-2 10h-7l2-10H6z" fill="#e8e8f0"/><rect x="30" y="4" width="4" height="2" fill="#e8e8f0"/></svg>',
  smg: '<svg viewBox="0 0 44 24"><path d="M3 7h34v6H24v3h-4v-3h-4l-1 9H9l1-9H3z" fill="#e8e8f0"/><rect x="18" y="14" width="4" height="9" fill="#bbb"/><rect x="37" y="9" width="5" height="2" fill="#e8e8f0"/></svg>',
  shotgun: '<svg viewBox="0 0 44 24"><path d="M1 8h40v4H16l-3 3H4z" fill="#e8e8f0"/><rect x="18" y="12" width="10" height="3" fill="#b08a5e"/><path d="M1 12h10l-4 8H2z" fill="#b08a5e"/></svg>',
};

export class HudOverlay {
  constructor(game) {
    this.game = game;
    this.root = $('hud');
    this.textTimer = 0;
    this.bannerTime = 0;
    this.toastTime = 0;
    this.hurt = 0;
    this.speedo = $('speedo-canvas').getContext('2d');
    this.lastWeaponKey = '';
    game.events.on('playerHurt', () => { this.hurt = 0.6; });
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  flashTitle(title, sub = '', color = '#ffd166', seconds = 3.5) {
    $('banner').classList.remove('hidden');
    $('banner-title').textContent = title;
    $('banner-title').style.color = color;
    $('banner-sub').textContent = sub;
    this.bannerTime = seconds;
  }

  toast(text, seconds = 3) {
    $('toast').classList.remove('hidden');
    $('toast').textContent = text;
    this.toastTime = seconds;
  }

  prompt(html) {
    const el = $('prompt');
    if (!html) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  update(dt) {
    const g = this.game;
    this.bannerTime -= dt;
    if (this.bannerTime <= 0) $('banner').classList.add('hidden');
    this.toastTime -= dt;
    if (this.toastTime <= 0) $('toast').classList.add('hidden');
    this.hurt = Math.max(0, this.hurt - dt);
    $('hit-vignette').style.opacity = String(Math.max(this.hurt * 1.4, g.state.health < 30 ? 0.35 + Math.sin(g.clock * 6) * 0.15 : 0));
    $('crosshair').classList.toggle('hidden', !g.player.aiming);
    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 0.1;
      this.updateText();
    }
    this.drawSpeedo();
  }

  updateText() {
    const g = this.game;
    const st = g.state;
    // mission panel
    const o = g.missions.objective;
    $('mp-chapter').textContent = o.chapter;
    $('mp-stage').textContent = o.stage ? `STAGE ${o.stage}` : (g.missions.nextMission ? 'NEW CONTACT' : '');
    $('mp-title').textContent = o.title;
    $('mp-text').textContent = o.text;
    $('mp-fill').style.width = `${Math.round((o.progress ?? 0) * 100)}%`;
    $('mp-next').textContent = o.next || '—';
    const extra = [];
    if (o.timer != null) extra.push(`⏱ ${fmtTime(o.timer)}`);
    if (o.counter) extra.push(o.counter);
    const act = g.activities?.hudLine;
    if (act) extra.push(act);
    $('mp-extra').textContent = extra.join('   ');
    // police roster
    const roster = g.police.roster;
    const pp = $('police-panel');
    if (st.wanted > 0 || roster.length) {
      pp.classList.remove('hidden');
      $('pp-title').textContent = `SPD RESPONSE · ${roster.length} UNIT${roster.length === 1 ? '' : 'S'}`;
      $('pp-list').innerHTML = roster.slice(0, 6).map((u) => `<div class="pp-row"><span class="ico ${u.kind === 'air' ? 'air' : ''}"></span><span class="cs">${u.callsign}</span><span class="dist">${Math.round(u.distance)}m</span><span class="st ${u.status.replace(' ', '-')}">${u.status}</span></div>`).join('');
      // nudge below the mission panel, however tall it is
      pp.style.top = `${$('mission-panel').offsetHeight + 26}px`;
    } else pp.classList.add('hidden');
    // status column
    const hour = st.hour;
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('day').textContent = DAYS[(st.day + 3) % 7];
    $('cash').textContent = `$${Math.floor(st.money).toLocaleString('en-US')}`;
    const w = $('wanted');
    w.innerHTML = '★'.repeat(5).split('').map((s, i) => (i < st.wanted ? `<b>${s}</b>` : s)).join('');
    w.classList.toggle('flash', g.police.flash > 0 || (st.wanted > 0 && !g.police.inSight));
    const sight = $('sight');
    if (st.wanted > 0) {
      sight.classList.remove('hidden');
      sight.textContent = g.police.inSight ? 'IN SIGHT' : `SEARCHING ${Math.max(0, Math.ceil(9 + st.wanted * 4 - g.police.unseenTime))}s`;
      sight.classList.toggle('search', !g.police.inSight);
    } else sight.classList.add('hidden');
    // weapons
    const key = WEAPON_ORDER.map((k) => `${k}${st.weapons[k] ? 1 : 0}${st.ammo[k] ?? ''}`).join() + st.weapon;
    if (key !== this.lastWeaponKey) {
      this.lastWeaponKey = key;
      $('weapons').innerHTML = WEAPON_ORDER.map((k, i) => {
        const def = WEAPONS[k];
        const cls = `wslot${st.weapons[k] ? ' owned' : ''}${st.weapon === k ? ' active' : ''}`;
        const ammo = def.melee ? '∞' : st.weapons[k] ? `${st.ammo[k]}` : '—';
        return `<div class="${cls}"><span class="key">${i + 1}</span>${WEAPON_ART[k]}<span class="ammo">${ammo}</span></div>`;
      }).join('');
    }
    // bars
    $('bar-health').style.width = `${st.health}%`;
    $('bar-armour').style.width = `${st.armour}%`;
    const rank = rankFor(st.respect);
    $('bar-respect').style.width = `${Math.round(rank.progress * 100)}%`;
    $('rank-label').textContent = `RESPECT · ${rank.title}`;
    $('district').textContent = districtAt(g.player.x, g.player.z).name;
    // vehicle
    const v = g.player.vehicle;
    $('speedo').classList.toggle('hidden', !v);
    if (v) {
      $('vehicle-name').textContent = v.def.short;
      $('condition-fill').style.width = `${Math.max(0, (v.body.health / v.def.health) * 100)}%`;
    }
    // radio card
    const radio = g.audio?.radio;
    const card = $('radio-card');
    if (radio?.nowPlaying && (v || g.showRadioOnFoot)) {
      card.classList.remove('hidden');
      const np = radio.nowPlaying;
      $('rc-station').textContent = np.station;
      $('rc-track').textContent = np.title;
      $('rc-artist').textContent = np.artist;
      $('rc-art').style.background = np.art;
    } else card.classList.add('hidden');
  }

  drawSpeedo() {
    const v = this.game.player.vehicle;
    if (!v) return;
    const g = this.speedo;
    const W = 400, R = 168, cx = 200, cy = 200;
    const kmh = v.body.speed * 3.6;
    const maxK = Math.ceil((v.def.maxSpeed * 3.6) / 40) * 40 + 40;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(cx, cy, R + 14, 0, Math.PI * 2);
    const bg = g.createRadialGradient(cx, cy, 20, cx, cy, R + 14);
    bg.addColorStop(0, 'rgba(30,14,50,0.85)'); bg.addColorStop(1, 'rgba(8,6,20,0.8)');
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.stroke();
    // track and value arc
    g.lineCap = 'round';
    g.lineWidth = 16; g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.beginPath(); g.arc(cx, cy, R - 12, a0, a1); g.stroke();
    const t = Math.min(1, kmh / maxK);
    const grad = g.createLinearGradient(0, W, W, 0);
    grad.addColorStop(0, '#4fe8ff'); grad.addColorStop(0.55, '#ffd166'); grad.addColorStop(1, '#ff3b5c');
    g.strokeStyle = grad;
    g.shadowColor = '#ff9a3d'; g.shadowBlur = 16;
    g.beginPath(); g.arc(cx, cy, R - 12, a0, a0 + (a1 - a0) * t); g.stroke();
    g.shadowBlur = 0;
    // ticks and labels
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = '700 21px Segoe UI, Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k <= maxK; k += 20) {
      const a = a0 + (a1 - a0) * (k / maxK);
      const major = k % 40 === 0;
      g.strokeStyle = major ? '#fff' : 'rgba(255,255,255,0.45)';
      g.lineWidth = major ? 4 : 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - 32), cy + Math.sin(a) * (R - 32));
      g.lineTo(cx + Math.cos(a) * (R - (major ? 46 : 40)), cy + Math.sin(a) * (R - (major ? 46 : 40)));
      g.stroke();
      if (major && k % 80 === 0) g.fillText(String(k), cx + Math.cos(a) * (R - 68), cy + Math.sin(a) * (R - 68));
    }
    // needle
    const an = a0 + (a1 - a0) * t;
    g.strokeStyle = '#ff4fa3'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * (R - 30), cy + Math.sin(an) * (R - 30)); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
    // digital readout
    g.fillStyle = '#fff';
    g.font = '900 64px Segoe UI, Arial';
    g.fillText(String(Math.round(kmh)), cx, cy + 62);
    g.font = '800 18px Segoe UI, Arial';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('KM/H', cx, cy + 102);
    g.font = '900 30px Segoe UI, Arial';
    g.fillStyle = '#ffd166';
    g.fillText(v.body.reversing ? 'R' : String(v.body.gear), cx + 92, cy + 30);
    g.font = '800 13px Segoe UI, Arial';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillText('GEAR', cx + 92, cy + 56);
    // rpm bar
    const rpm = v.body.rpm;
    g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.arc(cx, cy, R - 92, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.strokeStyle = rpm > 0.85 ? '#ff3b5c' : '#4fe8ff';
    g.beginPath(); g.arc(cx, cy, R - 92, Math.PI * 1.15, Math.PI * (1.15 + 0.7 * rpm)); g.stroke();
  }
}

export function fmtTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
