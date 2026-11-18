// Title screen, pause menu, save/load slot picker and settings. Buttons are built from small
// tables so each screen reads as a list of what it offers.
import { SLOT_IDS } from '../save/saveSlots.js';
import { rankFor } from '../core/gameState.js';

const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look / aim'], ['F', 'Enter · steal · exit'],
  ['Space', 'Handbrake'], ['Shift', 'Sprint'], ['RMB / LMB', 'Aim / fire'],
  ['1-4 · Wheel', 'Weapons'], ['R', 'Radio station'], ['E', 'Shop / interact'],
  ['T', 'Races · fares · jobs'], ['M', 'Map'], ['Esc', 'Pause'],
];

export class GameMenus {
  constructor(game) {
    this.game = game;
    $('controls-card').innerHTML = CONTROLS.map(([k, t]) => `<div><kbd>${k}</kbd>${t}</div>`).join('');
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (btn) this.act(btn.dataset.action, btn.dataset.slot);
    });
  }

  buttons(container, list) {
    $(container).innerHTML = list.map(([action, label, slot]) => `<button data-action="${action}"${slot ? ` data-slot="${slot}"` : ''}>${label}</button>`).join('');
  }

  showTitle() {
    $('title-screen').classList.remove('hidden');
    const list = [];
    if (this.game.saves.hasAny()) list.push(['continue', 'Continue']);
    list.push(['new', 'New Game'], ['load-menu', 'Load Game'], ['settings', 'Settings']);
    this.buttons('title-buttons', list);
  }

  hideTitle() { $('title-screen').classList.add('hidden'); }

  showPause(on) {
    $('pause-menu').classList.toggle('hidden', !on);
    if (!on) return;
    const st = this.game.state;
    const rank = rankFor(st.respect);
    const s = st.stats;
    $('pause-stats').innerHTML = [
      ['Rank', rank.title], ['Respect', st.respect], ['Story', `${st.storyIndex}/9`], ['Sun Tokens', `${st.tokens.length}/24`],
      ['Distance', `${(s.distance / 1000).toFixed(1)} km`], ['Top speed', `${Math.round(s.maxSpeed)} km/h`], ['Taxi fares', st.taxiFares], ['Deliveries', st.deliveries],
    ].map(([a, b]) => `<div>${a} <b>${b}</b></div>`).join('');
    this.buttons('pause-buttons', [['resume', 'Resume'], ['map', 'Map'], ['save-menu', 'Save Game'], ['load-menu', 'Load Game'], ['settings', 'Settings'], ['quit', 'Quit to Title']]);
  }

  showSlots(mode) {
    this.slotMode = mode;
    $('slot-menu').classList.remove('hidden');
    $('slot-title').textContent = mode === 'save' ? 'SAVE GAME' : 'LOAD GAME';
    const ids = mode === 'save' ? SLOT_IDS.filter((id) => id !== 'auto') : SLOT_IDS;
    $('slot-list').innerHTML = ids.map((id) => {
      const d = this.game.saves.describe(id);
      const disabled = mode === 'load' && d.empty ? 'disabled' : '';
      return `<button data-action="slot" data-slot="${id}" ${disabled}><span>${d.label}</span><small>${d.detail ?? ''}</small></button>`;
    }).join('');
  }

  showSettings() {
    const st = this.game.state.settings;
    $('settings-menu').classList.remove('hidden');
    $('settings-list').innerHTML = `
      <label>Master volume <input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-set="volume"></label>
      <label>Radio volume <input type="range" min="0" max="1" step="0.05" value="${st.music}" data-set="music"></label>
      <label>Mouse sensitivity <input type="range" min="0.3" max="2.5" step="0.1" value="${st.sensitivity}" data-set="sensitivity"></label>
      <label>Invert mouse Y <input type="checkbox" ${st.invertY ? 'checked' : ''} data-set="invertY"></label>
      <label>Graphics quality <select data-set="quality">${['low', 'medium', 'high'].map((q) => `<option ${q === st.quality ? 'selected' : ''}>${q}</option>`).join('')}</select></label>`;
    $('settings-list').oninput = (e) => {
      const key = e.target.dataset.set;
      if (!key) return;
      st[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : Number(e.target.value);
      this.game.applySettings();
    };
  }

  act(action, slot) {
    const g = this.game;
    g.audio.unlock();
    switch (action) {
      case 'new': this.hideTitle(); g.newGame(); break;
      case 'continue': this.hideTitle(); g.continueGame(g.saves.latest()); break;
      case 'resume': g.setPaused(false); break;
      case 'map': this.showPause(false); g.mapScreen.toggle(true); break;
      case 'save-menu': this.showSlots('save'); break;
      case 'load-menu': this.showSlots('load'); break;
      case 'settings': this.showSettings(); break;
      case 'settings-back': $('settings-menu').classList.add('hidden'); break;
      case 'slots-back': $('slot-menu').classList.add('hidden'); break;
      case 'slot':
        $('slot-menu').classList.add('hidden');
        if (this.slotMode === 'save') g.saves.save(slot);
        else { this.hideTitle(); g.continueGame(slot); }
        break;
      case 'quit': g.quitToTitle(); break;
      default: break;
    }
  }
}
