// The crew strip on the HUD: one compact card per crew member with a portrait, the ability,
// the name and role, the hotkey, and a cooldown sweep (or the chapter they join in).
import { CREW } from '../missions/crewAbilities.js';
import { portraitDataUrl } from '../render/proceduralTextures.js';

export class CrewCards {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('crew-cards');
    this.cards = CREW.map((member) => {
      const who = game.cast[member.id];
      const el = document.createElement('div');
      el.className = 'crew-card';
      el.innerHTML = `<img alt="" src="${portraitDataUrl(who.portrait)}"><div class="cc-text"><b>${member.ability}</b>`
        + `<span>${who.name.split(' ')[0]} · ${member.role}</span></div><kbd>${member.keyLabel}</kbd><i class="cc-sweep"></i><em class="cc-time"></em>`;
      this.root.appendChild(el);
      return { member, el, sweep: el.querySelector('.cc-sweep'), time: el.querySelector('.cc-time'), state: '' };
    });
  }

  update() {
    const crew = this.game.crew;
    for (const c of this.cards) {
      const left = crew.cooldowns[c.member.id];
      let state = 'ready';
      if (!crew.joined(c.member)) state = 'locked';
      else if (c.member.id === 'rafa' && crew.jamming) state = 'active';
      else if (left > 0) state = 'cooling';
      if (state !== c.state) { c.el.dataset.state = state; c.state = state; }
      if (state === 'locked') c.time.textContent = `CH.${c.member.joinsAt + 1}`;
      else if (state === 'active') c.time.textContent = `${Math.ceil(crew.jam)}s`;
      else if (state === 'cooling') c.time.textContent = `${Math.ceil(left)}s`;
      else c.time.textContent = '';
      c.sweep.style.width = state === 'cooling' ? `${(left / c.member.cooldown) * 100}%` : '0%';
    }
  }
}
