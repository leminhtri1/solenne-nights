// Performance parts fitted at Chromatica Customs. Each car carries its own stages (0-3) of
// engine, tyres and armour plating; vehicle physics and damage read the multipliers here.
// Parts stay on the car, so a tuned getaway car is worth parking in the safehouse garage.

export const TUNING = {
  engine: { name: 'Engine', stages: ['Stock', 'Street', 'Sport', 'Race'], prices: [0, 1800, 4200, 9000] },
  tyres: { name: 'Tyres', stages: ['Stock', 'Grip+', 'Semi-slick', 'Slick'], prices: [0, 900, 2200, 4800] },
  armour: { name: 'Armour plating', stages: ['None', 'Light', 'Heavy', 'Bastion'], prices: [0, 1500, 3600, 7500] },
};

/** The stages fitted to a vehicle body (created on first use). */
export function tuneOf(body) {
  return (body.tune ||= { engine: 0, tyres: 0, armour: 0 });
}

/** Top speed multiplier: +6% a stage. */
export function topSpeedFactor(body) { return 1 + 0.06 * (body.tune?.engine ?? 0); }

/** Acceleration multiplier: +14% a stage. */
export function accelFactor(body) { return 1 + 0.14 * (body.tune?.engine ?? 0); }

/** Lateral grip multiplier: +9% a stage. */
export function gripFactor(body) { return 1 + 0.09 * (body.tune?.tyres ?? 0); }

/** Damage taken multiplier: each armour stage cuts it by a further quarter. */
export function damageFactor(body) { return 1 / (1 + 0.33 * (body.tune?.armour ?? 0)); }

/** A short "E2 T1 A3"-style tag for the HUD, or '' for a stock car. */
export function tuneTag(body) {
  const t = body.tune;
  if (!t || !(t.engine || t.tyres || t.armour)) return '';
  return `E${t.engine} T${t.tyres} A${t.armour}`;
}
