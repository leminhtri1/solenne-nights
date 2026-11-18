// Everything about the player's run that a save slot keeps: cash, respect and its rank,
// health and armour, the arsenal, story progress, side-activity records, collectibles and
// the clock. Systems read and change it; saveSlots serialises it.

export const RESPECT_RANKS = [
  { at: 0, title: 'Nobody' }, { at: 100, title: 'Street Runner' }, { at: 300, title: 'Wheelman' },
  { at: 650, title: 'Fixer' }, { at: 1100, title: 'Lieutenant' }, { at: 1800, title: 'Boss of the Bay' },
];

export function createGameState() {
  return {
    money: 1250,
    respect: 40,
    health: 100,
    armour: 0,
    wanted: 0,
    hour: 18.3,
    day: 1,
    weapons: { fists: true, pistol: true, smg: false, shotgun: false },
    ammo: { pistol: 48, smg: 0, shotgun: 0 },
    weapon: 'pistol',
    storyIndex: 0,
    missionsDone: [],
    tokens: [],
    races: {},
    taxiFares: 0,
    deliveries: 0,
    garage: [],
    safehousePos: null,
    stats: { kills: 0, crashes: 0, bustedOrWasted: 0, distance: 0, maxSpeed: 0, shots: 0 },
    settings: { volume: 0.7, music: 0.6, sensitivity: 1, invertY: false, quality: 'high', minimapRotate: true },
  };
}

export function rankFor(respect) {
  let r = RESPECT_RANKS[0];
  for (const rank of RESPECT_RANKS) if (respect >= rank.at) r = rank;
  const next = RESPECT_RANKS[RESPECT_RANKS.indexOf(r) + 1];
  return { title: r.title, level: RESPECT_RANKS.indexOf(r) + 1, progress: next ? (respect - r.at) / (next.at - r.at) : 1 };
}
