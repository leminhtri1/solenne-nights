// The four weapon slots: fists, the Kestrel 9 pistol, the Hornet SMG and the Breaker
// shotgun. Damage is per pellet; spread is in radians; rate is shots per second.

export const WEAPONS = {
  fists: { name: 'Fists', slot: 1, damage: 18, range: 1.8, rate: 2.5, spread: 0, pellets: 1, melee: true, icon: '✊', price: 0 },
  pistol: { name: 'Kestrel 9', slot: 2, damage: 34, range: 70, rate: 4, spread: 0.02, pellets: 1, clip: 12, icon: '▬', price: 300, ammoPrice: 60, ammoPack: 24 },
  smg: { name: 'Hornet SMG', slot: 3, damage: 22, range: 60, rate: 11, spread: 0.05, pellets: 1, clip: 30, icon: '≡', price: 1500, ammoPrice: 120, ammoPack: 60, auto: true },
  shotgun: { name: 'Breaker 12', slot: 4, damage: 16, range: 28, rate: 1.3, spread: 0.12, pellets: 8, clip: 6, icon: '▰', price: 2400, ammoPrice: 140, ammoPack: 16 },
};

export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];
