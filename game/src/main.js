// SOLENNE NIGHTS entry point. Builds the game, shows the title screen and runs the frame
// loop. With ?shot=<name>&seed=<n> it instead stages a deterministic scene for a screenshot
// (see shots/screenshotDirector.js) and raises window.__shotReady when the frame is final.
import { Game } from './core/game.js';
import { stageShot } from './shots/screenshotDirector.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') ?? 7) || 7;

function boot() {
  const game = new Game({ seed, shotMode: !!shot });
  window.solenne = game;
  document.getElementById('loading').classList.add('hidden');
  if (shot) {
    stageShot(game, shot).then(() => { window.__shotReady = true; });
    return;
  }
  game.menus.showTitle();
  let last = performance.now();
  const loop = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    window.__fps = (window.__fps || 30) * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    game.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// let the loading screen paint before the city is built
requestAnimationFrame(() => setTimeout(boot, 30));
