// The WANTED banner: when the wanted level rises, a big flashing "WANTED ★★★" plate drops in at
// the top centre of the screen with what the police are now cleared to do, then fades after a
// few seconds. Red and blue pulse across it like a light bar.

const $ = (id) => document.getElementById(id);

const ESCALATION = [
  '',
  'SPD patrols alerted',
  'Units cleared to ram',
  'HALO-1 airborne · units cleared to fire',
  'Bastion tactical teams deployed',
  'Every unit in Solenne is after you',
];

export class WantedBanner {
  constructor(game) {
    this.game = game;
    this.el = $('wanted-banner');
    this.time = 0;
    game.events.on('wantedUp', (level) => this.show(level));
  }

  show(level, seconds = 4.5) {
    this.time = seconds;
    this.el.classList.remove('hidden');
    $('wb-stars').innerHTML = '★★★★★'.split('').map((s, i) => (i < level ? `<b>${s}</b>` : s)).join('');
    $('wb-sub').textContent = ESCALATION[level] ?? '';
    this.el.dataset.level = String(level);
  }

  update(dt) {
    if (this.time <= 0) return;
    this.time -= dt;
    this.el.style.opacity = String(Math.min(1, this.time / 0.6));
    if (this.time <= 0) this.el.classList.add('hidden');
  }
}
