// The story of SOLENNE NIGHTS in nine chapters. Nico Arden comes home from four years upstate
// to find Victor Kessane buying up the bay, block by block, with the police on his payroll.
// Each mission is a list of steps the mission runner plays in order; `talk` lines run as a
// dialogue box with portraits while the player keeps control.

export const STORY = [
  {
    id: 'homecoming', title: 'Homecoming', giver: 'celeste', start: 'safehouse', reward: 500, respect: 60,
    blurb: 'Four years gone. Tía Celeste wants to see you at the laundromat.',
    steps: [
      { type: 'talk', lines: [['celeste', 'Nico, mijo. They let you out early, and you did not call your tía?'], ['nico', 'Bus got in an hour ago. Solenne looks... taller.'], ['celeste', 'Kessane money. Get some wheels and come to the laundromat. We talk there.']] },
      { type: 'enterAny', text: 'Get a vehicle: steal one from the street (F)' },
      { type: 'goto', place: 'laundromat', text: 'Drive to Lavandería Celeste in Calle Lumen', next: 'Meet Celeste' },
      { type: 'talk', lines: [['celeste', 'Kessane bought the block across the street. Next he buys mine, or burns it.'], ['celeste', 'Go see Gizmo at the docks. He needs a driver, and you need money.']] },
    ],
  },
  {
    id: 'chopshop', title: 'Chop Shop Blues', giver: 'gizmo', start: 'garage', reward: 1200, respect: 80,
    blurb: 'Gizmo has a buyer for a brand-new Halcyon Vireo GT.',
    steps: [
      { type: 'talk', lines: [['gizmo', 'The famous Nico Arden. I have a buyer for a Vireo GT, red, no scratches.'], ['gizmo', 'One is parked by Kessane Tower. Alarm is loud. Be louder.']] },
      { type: 'spawnVehicle', id: 'vireo', vehicle: 'vireo', at: [-150, -392], heading: Math.PI / 2, paint: 0xff3b3b },
      { type: 'goto', target: [-150, -392], radius: 14, text: 'Go to the Vireo GT in Meridian Heights', next: 'Steal the Vireo GT' },
      { type: 'enter', id: 'vireo', text: 'Steal the Vireo GT', wanted: 2, next: 'Deliver it to Gizmo' },
      { type: 'loseWanted', text: 'Lose the police before you bring heat to the garage', next: "Deliver the car to Gizmo's" },
      { type: 'goto', place: 'garage', inVehicle: 'vireo', text: "Deliver the Vireo GT to Gizmo's Chop Garage", next: 'Get paid' },
      { type: 'talk', lines: [['gizmo', 'Not a scratch. Okay, maybe one. Here is your cut.']] },
    ],
  },
  {
    id: 'faregame', title: 'Fare Game', giver: 'juno', start: 'radio', reward: 900, respect: 70,
    blurb: 'Juno Vale needs a ride nobody can trace. Drive a cab.',
    steps: [
      { type: 'talk', lines: [['juno', 'You are the driver? Good. Taxis are invisible in this town.'], ['juno', 'There is a cab out front. Take me to the Puerto Azul docks, fast.']] },
      { type: 'spawnVehicle', id: 'cab', vehicle: 'cab', at: [338, 5], heading: Math.PI / 2 },
      { type: 'enter', id: 'cab', text: 'Get in the Solenne Cab', next: 'Drive Juno to the docks' },
      { type: 'goto', place: 'marina', timeLimit: 110, text: 'Drive Juno to Puerto Azul before her contact leaves', next: 'Drop off Juno',
        chatter: [['juno', 'Kessane is buying the marina next. The whole waterfront, through shell companies.'], ['nico', 'And you know this how?'], ['juno', 'People confess things to the night DJ. Watch the light!']] },
      { type: 'talk', lines: [['juno', 'Smooth. Keep the fare. I will call you when I have a name.']] },
    ],
  },
  {
    id: 'collections', title: 'Neon Collections', giver: 'celeste', start: 'laundromat', reward: 1500, respect: 90,
    blurb: 'Three shopkeepers on Calle Lumen stopped paying Celeste and started paying Kessane.',
    steps: [
      { type: 'talk', lines: [['celeste', 'Three of my shops pay Kessane now. His boys collect at night.'], ['celeste', 'Remind the street who keeps the lights on.']] },
      { type: 'goto', target: [-487.5, -250], radius: 6, onFoot: true, text: 'Visit the first shop on foot', next: 'Second shop' },
      { type: 'goto', target: [-412.5, -150], radius: 6, onFoot: true, text: 'Visit the second shop', next: 'Kessane collectors' },
      { type: 'eliminate', spawn: [[-318, -60], [-306, -48], [-322, -40], [-300, -66]], text: "Deal with Kessane's collectors", next: 'Report back to Celeste' },
      { type: 'goto', place: 'laundromat', text: 'Return to Lavandería Celeste', next: 'Collect your cut' },
      { type: 'talk', lines: [['celeste', 'The street remembers whose lights these are. Good boy.']] },
    ],
  },
  {
    id: 'static', title: 'Dockside Static', giver: 'gizmo', start: 'garage', reward: 2000, respect: 110,
    blurb: "Kessane's Pelican van is full of bribes for the harbour board. Stop it.",
    steps: [
      { type: 'talk', lines: [['gizmo', 'A Pelican van is moving cash to the harbour board. Kessane buys votes.'], ['gizmo', 'Wreck it. I mean wreck it. Fire is fine.']] },
      { type: 'spawnVehicle', id: 'van', vehicle: 'van', at: [-450, 405], heading: Math.PI / 2, paint: 0xffd166, flee: true },
      { type: 'destroy', id: 'van', text: "Destroy Kessane's cash van", wanted: 2, next: 'Lose the cops' },
      { type: 'loseWanted', text: 'Lose your wanted level', next: 'Back to Gizmo' },
      { type: 'goto', place: 'garage', text: "Return to Gizmo's", next: 'Paid' },
      { type: 'talk', lines: [['gizmo', 'I heard that explosion from here. Beautiful.']] },
    ],
  },
  {
    id: 'causeway', title: 'The Causeway Run', giver: 'juno', start: 'radio', reward: 2500, respect: 130,
    blurb: 'A ledger is leaving Isla Verano tonight. Beat it to the lighthouse.',
    steps: [
      { type: 'talk', lines: [['juno', 'Kessane keeps a second ledger at Faro Verano. It moves tonight.'], ['juno', 'Cross the causeway and get there first. Cops will be on the bridge.']] },
      { type: 'checkpoints', points: [[480, -300], [600, -300], [720, -300], [860, -300], [860, -430], [1100, -430], [1100, -190]], timeLimit: 120, wanted: 2, text: 'Race across the Halcyon Causeway to Faro Verano', next: 'Grab the ledger',
        chatter: [['dispatch', 'All units, speeding vehicle westbound... correction, eastbound on the causeway.'], ['juno', 'Ha! They cannot even tell east from west. Floor it!']] },
      { type: 'goto', place: 'lighthouse', radius: 10, onFoot: true, text: 'Grab the ledger at the lighthouse door', next: 'Lose the police' },
      { type: 'loseWanted', text: 'Lose the police', next: 'Done' },
    ],
  },
  {
    id: 'papertrail', title: 'Paper Trail', giver: 'halloran', start: 'kessane', reward: 3000, respect: 150,
    blurb: 'Detective Halloran wants to switch sides. First, a test.',
    steps: [
      { type: 'talk', lines: [['halloran', 'Arden. I am the cop on Kessane’s payroll, and I want off it.'], ['halloran', 'His bagman just left in a black Brutus with the ledger copy. Stop him.']] },
      { type: 'spawnVehicle', id: 'bagman', vehicle: 'brutus', at: [-5, -150], heading: 0, paint: 0x111111, flee: true },
      { type: 'destroy', id: 'bagman', text: 'Chase down the bagman’s Brutus V8 and wreck it', next: 'Take the ledger' },
      { type: 'gotoVehicle', id: 'bagman', radius: 7, onFoot: true, text: 'Take the ledger from the wreck', next: 'Lose the cops' },
      { type: 'loseWanted', text: 'Lose your wanted level', next: 'Done' },
      { type: 'talk', lines: [['halloran', 'That is a lot of signatures. Enough for a warrant, if I live long enough to file it.']] },
    ],
  },
  {
    id: 'glasstowers', title: 'Glass Towers', giver: 'celeste', start: 'laundromat', reward: 6000, respect: 220,
    blurb: 'Hit Kessane Tower and take the drive with his real books.',
    steps: [
      { type: 'talk', lines: [['celeste', 'Halloran says the real books are on a drive in Kessane Tower.'], ['gizmo', 'I parked a Brutus outside for the getaway. Do not scratch it.']] },
      { type: 'goto', place: 'kessane', radius: 12, text: 'Go to Kessane Tower in Meridian Heights', next: 'Clear the lobby' },
      { type: 'eliminate', spawn: [[-62, -292], [-38, -292], [-50, -298], [-70, -296], [-30, -296]], text: 'Take out the tower security', next: 'Grab the drive' },
      { type: 'goto', place: 'kessane', radius: 5, onFoot: true, text: 'Grab the drive from the lobby', wanted: 4, next: 'Escape 4 stars' },
      { type: 'loseWanted', text: 'Escape the police: four stars', next: 'Return to the safehouse' },
      { type: 'goto', place: 'safehouse', text: 'Lie low at Casa Aurora', next: 'Done' },
      { type: 'talk', lines: [['juno', 'It is on every station. "Kessane Tower robbed." Folks are dancing in Calle Lumen.']] },
    ],
  },
  {
    id: 'lastlight', title: 'Last Light at Solenne', giver: 'nico', start: 'marina', reward: 15000, respect: 400,
    blurb: 'Kessane is running for his island. End it at Villa Kessane.',
    steps: [
      { type: 'talk', lines: [['halloran', 'Warrant is signed. Kessane is running for his villa on Isla Verano.'], ['nico', 'Then I am taking the boat.']] },
      { type: 'spawnVehicle', id: 'boat', vehicle: 'boat', at: [240, 562], heading: Math.PI / 2, paint: 0xff006e },
      { type: 'enter', id: 'boat', text: 'Take the Riptide speedboat', next: 'Cross the bay' },
      { type: 'goto', target: [960, -480], radius: 30, text: 'Cross the bay to Isla Verano', next: 'Storm the villa' },
      { type: 'eliminate', spawn: [[965, -362], [995, -362], [950, -318], [1010, -318], [980, -372], [940, -350]], boss: [985, -330], text: 'Storm Villa Kessane', next: 'The end' },
      { type: 'talk', lines: [['kessane', 'You think this city is yours? It belongs to whoever pays for it.'], ['nico', 'Tonight it belongs to whoever is still standing.'], ['celeste', 'Come home, mijo. The lights are on in Calle Lumen.']] },
    ],
  },
];
