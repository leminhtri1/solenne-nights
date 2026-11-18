// Scripted headless playtest: opens the real game (no ?shot), clicks New Game, then plays a
// sequence of key presses through the DevTools protocol, printing page errors and a probe of
// game state after each step, and saving a screenshot per step to out/playtest/.
// Usage: node tools/playtest.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const outDir = join(repo, 'out', 'playtest');
mkdirSync(outDir, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const debugPort = 9300 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, [join(repo, 'serve.ts'), '--port', String(port)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'solenne-play-'));
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--mute-audio', '--no-first-run', 'about:blank',
], { stdio: 'ignore' });

let ws; let nextId = 1; const pending = new Map();
const send = (method, params = {}) => { const id = nextId++; ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => pending.set(id, { res, rej })); };
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyM: 'm', KeyE: 'e', KeyT: 't', Escape: 'Escape', Space: ' ', KeyR: 'r', Digit3: '3' };
async function key(code, type) { await send('Input.dispatchKeyEvent', { type, code, key: KEYS[code] ?? code, windowsVirtualKeyCode: code === 'Escape' ? 27 : (KEYS[code] ?? 'x').toUpperCase().charCodeAt(0) }); }
async function hold(code, ms) { await key(code, 'keyDown'); await sleep(ms); await key(code, 'keyUp'); }
const frames = (n) => send('Runtime.evaluate', { expression: `new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`, awaitPromise: true });
async function tap(code) { await key(code, 'keyDown'); await frames(2); await key(code, 'keyUp'); await frames(2); }
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  writeFileSync(join(outDir, `${name}.jpg`), Buffer.from(r.data, 'base64'));
}
const probe = () => evalJs(`(() => { const g = window.solenne; if (!g) return 'no game'; const p = g.player; return JSON.stringify({ running: g.running, paused: g.paused, x: Math.round(p.x), z: Math.round(p.z), vehicle: p.vehicle?.def.short ?? null, speed: Math.round(p.speed * 3.6), hp: Math.round(g.state.health), wanted: g.state.wanted, mission: g.missions.mission?.id ?? null, step: g.missions.stepIndex, cars: g.vehicles.list.length, peds: g.peds.people.filter(q => q.fig.visible).length, units: g.police.units.length, map: g.mapScreen.open, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, fps: Math.round(window.__fps || 0) }); })()`);

try {
  let url;
  for (let i = 0; i < 80 && !url; i += 1) {
    try { url = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ }
    await sleep(250);
  }
  ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION:', m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('console.error:', m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
  for (let i = 0; i < 120; i += 1) { await sleep(500); if (await evalJs('!!window.solenne')) break; }
  await sleep(1500);
  await shot('00-title');
  await evalJs(`document.querySelector('[data-action="new"]').click()`);
  await sleep(3000);
  console.log('new game', await probe());
  await shot('01-start');
  await sleep(4000);
  console.log('after intro', await probe());
  await hold('KeyW', 2500);
  console.log('walked', await probe());
  // find the nearest car and walk the player next to it, then press F
  await evalJs(`(() => { const g = window.solenne; const v = g.vehicles.nearest(g.player.x, g.player.z, 300, c => c.role === 'parked' || c.role === 'traffic'); if (v) { g.player.figure.x = v.body.x + 2.5; g.player.figure.z = v.body.z; } })()`);
  await sleep(300);
  await tap('KeyF');
  await sleep(600);
  console.log('entered', await probe());
  await hold('KeyW', 4000);
  console.log('drove', await probe());
  await shot('02-driving');
  await key('KeyW', 'keyDown'); await key('KeyD', 'keyDown'); await key('Space', 'keyDown');
  await sleep(1200);
  await key('Space', 'keyUp'); await key('KeyD', 'keyUp'); await key('KeyW', 'keyUp');
  console.log('drift', await probe());
  await shot('03-drift');
  await tap('KeyM');
  await sleep(1200);
  console.log('map', await probe());
  await shot('04-map');
  await tap('KeyM');
  await sleep(500);
  await tap('Escape');
  await sleep(800);
  console.log('pause', await probe());
  await shot('05-pause');
  await tap('Escape');
  await sleep(500);
  // get out, shoot in the air near people to raise the wanted level
  await tap('KeyF');
  await sleep(800);
  await evalJs(`(() => { const g = window.solenne; g.state.weapon = 'pistol'; for (let i = 0; i < 4; i++) { g.player.fireCooldown = 0; g.player.fire(); } g.police.setWanted(3); })()`);
  await sleep(6000);
  console.log('wanted', await probe());
  await shot('06-wanted');
  await evalJs(`window.solenne.missions.fail('test')`);
  await sleep(500);
  console.log('done', await probe());
} finally {
  try { ws?.close(); } catch { /* closing */ }
  browser.kill();
  server.kill();
}
