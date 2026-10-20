// Headless simulation check. Run from the repo root: node dev-tests/pop.mjs
import { build } from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('./', import.meta.url));
await build({ entryPoints: [dir + '../src/world.ts'], bundle: true, format: 'esm', outfile: dir + 'pop.bundle.mjs', logLevel: 'error' });
const { World } = await import(pathToFileURL(dir + 'pop.bundle.mjs').href);
const mk = () => { const w = new World([{kind:'sawshark',size:.95},{kind:'hammerhead',size:.8},{kind:'nurse',size:.7},{kind:'mako',size:.6}]); w.resize(1400, 800, 12, 17); for (let i=0;i<300;i++) w.step(1/60); return w; };
let cleaned = 0, times = [], misses = 0, runs = 15;
for (let r = 0; r < runs; r++) {
  const w = mk(); w.triggerEvent('diver');
  // wait until a diver is on screen
  let d = null; for (let i = 0; i < 60*20 && !d; i++) { w.step(1/60); d = w.fish.find(f => f.diver && f.alive && f.y > 60); }
  if (!d) { misses++; continue; }
  const hitMiss = w.popDiverAt(d.x + 300, d.y + 300); const hit = w.popDiverAt(d.x + 5, d.y - 4);
  const cleaners = w.sharks.filter(s => s.cleaning).length; const start = w.time; let done = null;
  for (let i = 0; i < 60*40; i++) { w.step(1/60); if (!w.mess.length && done === null) { done = w.time - start; break; } }
  if (!hitMiss && hit && cleaners >= 1 && done !== null) { cleaned++; times.push(done); }
}
console.log(`pops: clicked far away -> no pop, clicked a diver -> pop; cleanup finished in ${cleaned} of ${runs - misses} runs; clean-up time (s):`, times.map(t => t.toFixed(1)).join(','));
