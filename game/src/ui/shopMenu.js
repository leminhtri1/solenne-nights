// Shops and services at their doors: Brass & Barrel Arms (weapons, ammo, body armour),
// Chromatica Customs (repair, engine / tyre / armour stages, respray, which also shakes off a
// wanted level the police have not seen), and the Casa Aurora safehouse (sleep to heal and pass time, save the game).
import { WEAPONS } from '../combat/weaponCatalog.js';
import { PLACES } from '../world/cityLayout.js';
import { TUNING, tuneOf } from '../vehicles/vehicleTuning.js';

const $ = (id) => document.getElementById(id);
const PAINTS = [[0xff3b3b, 'Solenne Red'], [0x13c4ff, 'Bay Blue'], [0xffd23f, 'Sundrop Yellow'], [0xf6f6f6, 'Pearl White'], [0x8a2be2, 'Lumen Violet'], [0x111111, 'Midnight Black'], [0x2ec4b6, 'Lagoon Teal'], [0xff7ad9, 'Flamingo Pink']];

export class ShopMenu {
  constructor(game) {
    this.game = game;
    this.open = null;
    $('shop').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.action === 'shop-close') return this.close();
      const item = this.items?.[Number(btn.dataset.index)];
      if (item) { item.buy(); this.render(); }
    });
  }

  /** Which shop door the player is standing at, if any. */
  nearbyShop() {
    const p = this.game.player;
    for (const key of ['gunshop', 'customs', 'safehouse']) {
      const [x, z] = PLACES[key].door;
      if (Math.hypot(p.x - x, p.z - z) < (key === 'customs' ? 9 : 4)) return key;
    }
    return null;
  }

  show(key) {
    this.open = key;
    this.game.setPaused(true, 'shop');
    $('shop').classList.remove('hidden');
    this.render();
  }

  close() {
    this.open = null;
    $('shop').classList.add('hidden');
    this.game.setPaused(false);
  }

  pay(cost) {
    const st = this.game.state;
    if (st.money < cost) { this.game.hud.toast('Not enough cash'); return false; }
    st.money -= cost;
    this.game.audio?.sting('cash');
    return true;
  }

  render() {
    const g = this.game;
    const st = g.state;
    const key = this.open;
    const items = [];
    if (key === 'gunshop') {
      $('shop-title').textContent = 'BRASS & BARREL ARMS';
      $('shop-sub').textContent = 'Licensed? Do not ask, we do not ask.';
      for (const id of ['pistol', 'smg', 'shotgun']) {
        const w = WEAPONS[id];
        if (!st.weapons[id]) items.push({ label: `${w.name}`, note: `$${w.price}`, buy: () => { if (this.pay(w.price)) { st.weapons[id] = true; st.ammo[id] += w.ammoPack; st.weapon = id; } } });
        else items.push({ label: `${w.name} ammo ×${w.ammoPack}`, note: `$${w.ammoPrice} · have ${st.ammo[id]}`, buy: () => { if (this.pay(w.ammoPrice)) st.ammo[id] += w.ammoPack; } });
      }
      items.push({ label: 'Body armour', note: st.armour >= 100 ? 'full' : '$400', buy: () => { if (st.armour < 100 && this.pay(400)) st.armour = 100; } });
    } else if (key === 'customs') {
      $('shop-title').textContent = 'CHROMATICA CUSTOMS';
      const v = g.player.vehicle;
      $('shop-sub').textContent = v ? `${v.def.name} · condition ${Math.round((v.body.health / v.def.health) * 100)}%` : 'Bring a vehicle into the bay.';
      if (v) {
        items.push({ label: 'Repair bodywork and engine', note: '$250', buy: () => { if (this.pay(250)) v.body.health = v.def.health; } });
        const tune = tuneOf(v.body);
        for (const [part, spec] of Object.entries(TUNING)) {
          const next = tune[part] + 1;
          if (next >= spec.stages.length) { items.push({ label: `${spec.name}: ${spec.stages[tune[part]]}`, note: 'maxed', buy: () => {} }); continue; }
          items.push({ label: `${spec.name}: ${spec.stages[tune[part]]} → ${spec.stages[next]}`, note: `$${spec.prices[next].toLocaleString('en-US')}`, buy: () => {
            if (!this.pay(spec.prices[next])) return;
            tune[part] = next;
            g.state.respect += 10;
            g.hud.toast(`${spec.name} upgraded: ${spec.stages[next]}`);
          } });
        }
        for (const [color, name] of PAINTS) {
          items.push({ label: `Respray: ${name}`, note: '$150', swatch: color, buy: () => {
            if (!this.pay(150)) return;
            v.mesh.userData.paint.color.setHex(color);
            v.paint = color;
            if (g.state.wanted > 0 && !g.police.inSight) { g.police.setWanted(0); g.hud.toast('New paint. The cops lost you.'); }
          } });
        }
      }
    } else if (key === 'safehouse') {
      $('shop-title').textContent = 'CASA AURORA';
      $('shop-sub').textContent = 'Home, for now. Save, rest, change the clock.';
      for (const slot of ['1', '2', '3']) {
        const d = g.saves.describe(slot);
        items.push({ label: `Save to ${d.label}`, note: d.detail || '', buy: () => g.saves.save(slot) });
      }
      items.push({ label: 'Sleep until golden hour (18:00)', note: 'heals', buy: () => { st.health = 100; st.hour = 18; st.day += 1; } });
      items.push({ label: 'Sleep until night (22:30)', note: 'heals', buy: () => { st.health = 100; st.hour = 22.5; } });
    }
    this.items = items;
    $('shop-list').innerHTML = items.map((it, i) => `<button data-index="${i}"><span>${it.swatch !== undefined ? `<i style="display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:8px;background:#${it.swatch.toString(16).padStart(6, '0')}"></i>` : ''}${it.label}</span><small>${it.note}</small></button>`).join('');
  }
}
