// Save games in localStorage: three manual slots and an autosave written after every story
// mission. A slot stores the game state plus where the player stood and the time of day.
import { createGameState } from '../core/gameState.js';
import { STORY } from '../missions/storyMissions.js';

const KEY = 'solenne-nights.slot.';
export const SLOT_IDS = ['auto', '1', '2', '3'];

export class SaveSlots {
  constructor(game) { this.game = game; }

  read(id) {
    try {
      const raw = localStorage.getItem(KEY + id);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** One-line description of a slot for the menu. */
  describe(id) {
    const s = this.read(id);
    if (!s) return { empty: true, label: id === 'auto' ? 'Autosave — empty' : `Slot ${id} — empty` };
    const chapter = STORY[s.state.storyIndex]?.title ?? 'Epilogue';
    const when = new Date(s.savedAt).toLocaleString();
    return { empty: false, label: `${id === 'auto' ? 'Autosave' : `Slot ${id}`} — Ch.${Math.min(s.state.storyIndex + 1, STORY.length)} ${chapter}`, detail: `$${Math.floor(s.state.money).toLocaleString()} · ${when}` };
  }

  save(id) {
    const g = this.game;
    const data = {
      version: 1,
      savedAt: Date.now(),
      state: g.state,
      player: { x: g.player.x, z: g.player.z },
    };
    try {
      localStorage.setItem(KEY + id, JSON.stringify(data));
      g.hud?.toast(id === 'auto' ? 'Autosaved' : `Saved to slot ${id}`);
      return true;
    } catch {
      g.hud?.toast('Could not save (storage unavailable)');
      return false;
    }
  }

  autosave() { this.save('auto'); }

  load(id) {
    const data = this.read(id);
    if (!data) return false;
    const g = this.game;
    const fresh = createGameState();
    g.state = Object.assign(fresh, data.state, { settings: { ...fresh.settings, ...data.state.settings } });
    g.teleportPlayer(data.player.x, data.player.z);
    g.hud?.toast(`Loaded ${id === 'auto' ? 'autosave' : `slot ${id}`}`);
    return true;
  }

  hasAny() { return SLOT_IDS.some((id) => this.read(id)); }

  latest() {
    let best = null;
    for (const id of SLOT_IDS) {
      const s = this.read(id);
      if (s && (!best || s.savedAt > best.savedAt)) best = { id, savedAt: s.savedAt };
    }
    return best?.id ?? null;
  }
}
