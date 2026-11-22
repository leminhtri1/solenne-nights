// Nico's crew: three specialists who join as the story goes on, each with one ability on a
// hotkey and a cooldown. Rafa (lookout) jams the police scanner so units lose the player;
// Gizmo (mechanic) patches the car, or tops up armour on foot; Mara (driver) sends a decoy car
// the other way, dragging the search off and knocking a star off the wanted level.

export const CREW = [
  {
    id: 'rafa', key: 'KeyZ', keyLabel: 'Z', role: 'Lookout', ability: 'SCANNER JAM', joinsAt: 2, cooldown: 55,
    says: 'Scanner’s full of static now. They’re flying blind, go!',
  },
  {
    id: 'gizmo', key: 'KeyX', keyLabel: 'X', role: 'Mechanic', ability: 'ROADSIDE PATCH', joinsAt: 1, cooldown: 45,
    says: 'Patched. Try to bring it back with four wheels this time.',
  },
  {
    id: 'mara', key: 'KeyC', keyLabel: 'C', role: 'Driver', ability: 'DECOY RUN', joinsAt: 4, cooldown: 90,
    says: 'Same paint, same plates. I’ll take half of Solenne on a tour of Port Sable.',
  },
];

const JAM_SECONDS = 9;

export class CrewAbilities {
  constructor(game) {
    this.game = game;
    this.cooldowns = Object.fromEntries(CREW.map((c) => [c.id, 0]));
    this.jam = 0;
    this.lastUsed = null;
  }

  /** A crew member is on the team once the story reaches their chapter. */
  joined(member) { return this.game.state.storyIndex >= member.joinsAt; }

  ready(member) { return this.joined(member) && this.cooldowns[member.id] <= 0; }

  update(dt) {
    for (const id of Object.keys(this.cooldowns)) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    this.jam = Math.max(0, this.jam - dt);
    const g = this.game;
    if (!g.player.alive) return;
    for (const member of CREW) if (g.input.pressed(member.key)) this.use(member);
  }

  /** Try to use a crew ability. Returns true when it fired. */
  use(member) {
    const g = this.game;
    if (!this.joined(member)) { g.hud.toast(`${g.cast[member.id].name} joins in chapter ${member.joinsAt + 1}`, 2); return false; }
    if (this.cooldowns[member.id] > 0) { g.hud.toast(`${member.ability} ready in ${Math.ceil(this.cooldowns[member.id])}s`, 1.5); return false; }
    const effect = this[member.id](g);
    if (!effect) return false;
    this.cooldowns[member.id] = member.cooldown;
    this.lastUsed = member.id;
    g.hud.toast(`${member.ability}: ${effect}`, 2.5);
    g.dialogue.play([[member.id, member.says]], g.cast);
    return true;
  }

  rafa(g) {
    if (g.state.wanted === 0) { g.hud.toast('No heat to jam right now', 1.5); return null; }
    this.jam = JAM_SECONDS;
    g.police.inSight = false;
    g.police.unseenTime += 4;
    return `police blind for ${JAM_SECONDS}s`;
  }

  gizmo(g) {
    const v = g.player.vehicle;
    if (v && !v.dead) {
      v.body.health = v.def.health;
      g.particles.sparks(v.body.x, 1, v.body.z, 10);
      return `${v.def.name} repaired`;
    }
    if (g.state.armour >= 100) { g.hud.toast('Armour is already full', 1.5); return null; }
    g.state.armour = Math.min(100, g.state.armour + 40);
    return 'armour +40';
  }

  mara(g) {
    const police = g.police;
    if (g.state.wanted === 0) { g.hud.toast('Nobody is chasing you', 1.5); return null; }
    // the decoy breaks away from the player; the search follows it
    const p = g.player;
    const away = Math.atan2(p.x, p.z) + Math.PI + (g.rng() - 0.5);
    police.lastSeen = { x: p.x + Math.sin(away) * 180, z: p.z + Math.cos(away) * 180 };
    police.inSight = false;
    police.unseenTime += 3;
    police.setWanted(g.state.wanted - 1);
    return 'one star off, the search turns away';
  }

  /** True while Rafa's jam keeps the police from spotting the player. */
  get jamming() { return this.jam > 0; }
}
