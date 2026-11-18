// Captures the game's screenshot scenes with headless Chrome (SwiftShader WebGL) over the
// DevTools protocol. Reads shots.json ([{ name, query }]), serves game/ with serve.ts, loads
// each ?shot= URL, waits for window.__shotReady, and saves a 1280x800 JPEG no larger than
// 256 KiB. Usage: node tools/captureShots.mjs [--out dir] [--only name] [--quality 88]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const repo = resolve(import.meta.dirname, '..');
const outDir = resolve(opt('out', join(repo, 'screenshots')));
const only = opt('only', null);
let quality = Number(opt('quality', 90));
const port = 8000 + Math.floor(Math.random() * 900);
const debugPort = 9300 + Math.floor(Math.random() * 500);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8')).filter((s) => !only || s.name.includes(only));
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, [join(repo, 'serve.ts'), '--port', String(port)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'solenne-chrome-'));
const browser = spawn(chrome, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome did not start');
}

let ws;
let failed = false;
let nextId = 1;
const pending = new Map();
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}

try {
  const url = await connect();
  ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      failed = true;
      console.log('PAGE EXCEPTION:', msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
    } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
      console.log(`PAGE ${msg.params.type}:`, msg.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400));
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  for (const shot of shots) {
    const t0 = Date.now();
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html${shot.query}` });
    let ready = false;
    failed = false;
    for (let i = 0; i < 600 && !ready && !failed; i += 1) {
      await sleep(500);
      const r = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
      ready = r.result.value === true;
    }
    if (!ready) { console.log(`${shot.name}: timed out`); continue; }
    await sleep(400);
    let q = quality;
    let data;
    for (;;) {
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: q, clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 } });
      data = Buffer.from(r.data, 'base64');
      if (data.length <= 256 * 1024 || q <= 40) break;
      q -= 4;
    }
    writeFileSync(join(outDir, shot.name), data);
    console.log(`${shot.name}: ${(data.length / 1024).toFixed(1)} KiB at q${q} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
} finally {
  try { ws?.close(); } catch { /* closing */ }
  browser.kill();
  server.kill();
}
