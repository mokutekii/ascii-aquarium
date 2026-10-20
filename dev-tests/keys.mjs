// Headless simulation check. Run from the repo root: node dev-tests/keys.mjs
import { build } from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('./', import.meta.url));
await build({ entryPoints: [dir + '../src/world.ts'], bundle: true, format: 'esm', outfile: dir + 'wk.bundle.mjs', logLevel: 'error' });
const { World } = await import(pathToFileURL(dir + 'wk.bundle.mjs').href);
const W = 1400, H = 800;
const keys = { k: 'kraken', m: 'mega', c: 'saga', r: 'chase', b: 'bait', j: 'jelly', w: 'whale', v: 'whirl', n: 'night', u: 'ufo', d: 'diver', f: 'fight' };
const onScreen = (x, y, pad = 0) => x > pad && x < W - pad && y > pad && y < H - pad;
function visible(w, kind) {
  switch (kind) {
    case 'kraken': case 'saga': return w.kraken && onScreen(w.kraken.x, w.kraken.y);
    case 'mega': { const m = w.sharks.find((s) => s.mega); return m && onScreen(m.nodes[0], m.nodes[1]); }
    case 'chase': return w.fish.some((f) => f.temp !== undefined && onScreen(f.x, f.y));
    case 'bait': return !!w.baitBall;
    case 'jelly': return w.jellies.some((j) => j.y < H);
    case 'whale': return w.whale && onScreen(w.whale.x, w.whale.y);
    case 'ufo': return !!w.ufo && w.ufo.y > 0;
    case 'diver': return w.fish.some((f) => f.diver && f.alive && f.y > 0);
    case 'fight': return !!w.fight;
    case 'whirl': return !!w.whirl;
    case 'night': return w.night > 0.05;
  }
}
for (const [key, kind] of Object.entries(keys)) {
  const w = new World();
  w.resize(W, H, 12, 17);
  for (let i = 0; i < 300; i++) w.step(1 / 60);
  const result = w.triggerEvent(kind);
  let t = 0;
  while (!visible(w, kind) && t < 120) { w.step(1 / 60); t += 1 / 60; }
  console.log(`${key.toUpperCase()} ${kind.padEnd(7)} result=${result} on-screen after ${t.toFixed(1)}s`);
}
// pressing a big event while another big one runs
const w2 = new World(); w2.resize(W, H, 12, 17);
console.log('K then M:', w2.triggerEvent('kraken'), w2.triggerEvent('mega'), '| K again:', w2.triggerEvent('kraken'));
