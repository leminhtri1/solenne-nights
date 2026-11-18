// Every vehicle class in Solenne with its maker, handling numbers and look. Speeds are m/s
// (the HUD shows km/h), accel in m/s², grip is how fast sideways slip dies away.

export const VEHICLES = {
  vireo: {
    name: 'Halcyon Vireo GT', short: 'VIREO GT', kind: 'car', body: 'sports', length: 4.6, width: 2.0, height: 1.2,
    maxSpeed: 64, accel: 19, brake: 34, grip: 9, steer: 0.6, mass: 1.0, health: 90, gears: 6,
    paints: [0xff3b3b, 0xffb000, 0x13c4ff, 0xf6f6f6, 0x8a2be2, 0x111111], price: 0,
  },
  brutus: {
    name: 'Ardent Brutus V8', short: 'BRUTUS V8', kind: 'car', body: 'muscle', length: 4.9, width: 2.05, height: 1.35,
    maxSpeed: 57, accel: 17, brake: 28, grip: 6.5, steer: 0.55, mass: 1.25, health: 120, gears: 5,
    paints: [0x1a1a1a, 0xc1121f, 0x2a9d8f, 0xe9c46a, 0x3a86ff], price: 0,
  },
  cab: {
    name: 'Solenne Cab', short: 'TAXI', kind: 'car', body: 'sedan', length: 4.7, width: 1.95, height: 1.5,
    maxSpeed: 46, accel: 12, brake: 26, grip: 8, steer: 0.55, mass: 1.1, health: 110, gears: 5,
    paints: [0xffc916], price: 0, taxi: true,
  },
  sedan: {
    name: 'Mareva Sedan', short: 'MAREVA', kind: 'car', body: 'sedan', length: 4.6, width: 1.9, height: 1.45,
    maxSpeed: 44, accel: 11, brake: 26, grip: 8, steer: 0.55, mass: 1.05, health: 100, gears: 5,
    paints: [0xe8e8e8, 0x6c757d, 0x264653, 0x9d0208, 0xa8dadc, 0xf4a261, 0x457b9d, 0xffafcc], price: 0,
  },
  van: {
    name: 'Pelican Van', short: 'PELICAN', kind: 'car', body: 'van', length: 5.4, width: 2.15, height: 2.4,
    maxSpeed: 36, accel: 8, brake: 22, grip: 7, steer: 0.5, mass: 1.7, health: 150, gears: 4,
    paints: [0xffffff, 0x8ecae6, 0xffb703, 0x90be6d], price: 0,
  },
  bike: {
    name: 'Zephyr 600', short: 'ZEPHYR 600', kind: 'bike', body: 'bike', length: 2.2, width: 0.8, height: 1.2,
    maxSpeed: 60, accel: 21, brake: 30, grip: 10, steer: 0.75, mass: 0.45, health: 60, gears: 6,
    paints: [0x00f5d4, 0xf15bb5, 0xfee440, 0x111111], price: 0,
  },
  police: {
    name: 'SPD Interceptor', short: 'INTERCEPTOR', kind: 'car', body: 'police', length: 4.8, width: 2.0, height: 1.5,
    maxSpeed: 60, accel: 17, brake: 32, grip: 9, steer: 0.6, mass: 1.3, health: 140, gears: 6,
    paints: [0xf4f4f4], price: 0, police: true,
  },
  swat: {
    name: 'Bastion Tactical', short: 'BASTION', kind: 'car', body: 'van', length: 5.6, width: 2.3, height: 2.5,
    maxSpeed: 44, accel: 11, brake: 24, grip: 8, steer: 0.5, mass: 2.2, health: 260, gears: 4,
    paints: [0x1d2733], price: 0, police: true, swat: true,
  },
  boat: {
    name: 'Riptide Speedboat', short: 'RIPTIDE', kind: 'boat', body: 'boat', length: 7, width: 2.6, height: 1.4,
    maxSpeed: 42, accel: 12, brake: 10, grip: 2.2, steer: 0.5, mass: 1.4, health: 120, gears: 3,
    paints: [0xffffff, 0xff006e, 0x00b4d8], price: 0,
  },
};

/** Weighted pick list for civilian traffic. */
export const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'cab', 'cab', 'van', 'brutus', 'vireo', 'sedan', 'bike'];
