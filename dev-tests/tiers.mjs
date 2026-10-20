// Headless simulation check. Run from the repo root: node dev-tests/tiers.mjs
import { build } from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('./', import.meta.url));
await build({ entryPoints: [dir + '../src/world.ts'], bundle: true, format: 'esm', outfile: dir + 'tier.bundle.mjs', logLevel: 'error' });
const { World } = await import(pathToFileURL(dir + 'tier.bundle.mjs').href);
const mk = () => { const w = new World([{kind:'sawshark',size:.95},{kind:'hammerhead',size:.8},{kind:'nurse',size:.7},{kind:'mako',size:.6}]); w.resize(1400, 800, 12, 17); for (let i=0;i<300;i++) w.step(1/60); return w; };
// slices: count slice events over 120 s with a sawshark present
let slices = 0, runs = 8;
for (let r = 0; r < runs; r++) { const w = mk(); const saws = () => w.sharks.filter(s => s.kind === 'sawshark'); let seen = new Set(); for (let i = 0; i < 60*120; i++) { w.step(1/60); for (const s of saws()) { if ((s.sliceUntil ?? 0) > w.time && !seen.has(s.sliceUntil)) { seen.add(s.sliceUntil); slices++; } } } }
console.log('sawshark slices per 120s run:', (slices / runs).toFixed(1));
// ufo vs a chased diver
let stolen = 0, tries = 12;
for (let r = 0; r < tries; r++) { const w = mk(); w.triggerEvent('diver'); for (let i = 0; i < 60*6; i++) w.step(1/60); w.triggerEvent('ufo'); for (let i = 0; i < 60*45; i++) w.step(1/60); if (w.notices.some(n => n.includes('stole a diver'))) stolen++; }
console.log('ufo stole a shark-chased diver in', stolen, 'of', tries, 'runs');
// concurrency over a long busy run
const w = mk(); w.settings.events = 'busy'; let maxMajor = 0, maxMinor = 0, fightDuringMajor = 0, bothBaitWhirl = 0; const seenKinds = new Set();
for (let i = 0; i < 60*1800; i++) {
  w.step(1/60);
  const major = (w.kraken ? 1 : 0) + (w.whale ? 1 : 0) + (w.sharks.some(s => s.mega) ? 1 : 0);
  const minors = [w.baitBall, w.whirl, w.ufo, w.fight, w.jellies.length ? 1 : 0, w.fish.some(f => f.diver && f.alive) ? 1 : 0].filter(Boolean).length;
  maxMajor = Math.max(maxMajor, major); maxMinor = Math.max(maxMinor, minors);
  if (w.fight && major) fightDuringMajor++; if (w.baitBall && w.whirl) bothBaitWhirl++;
  if (w.kraken) seenKinds.add('kraken'); if (w.whale) seenKinds.add('whale'); if (w.ufo) seenKinds.add('ufo'); if (w.baitBall) seenKinds.add('bait'); if (w.fight) seenKinds.add('fight'); if (w.whirl) seenKinds.add('whirl'); if (w.jellies.length) seenKinds.add('jelly'); if (w.fish.some(f=>f.diver&&f.alive)) seenKinds.add('diver'); if (w.sharks.some(s=>s.mega)) seenKinds.add('mega');
  for (const s of w.sharks) if (!Number.isFinite(s.nodes[0])) { console.log('NaN'); process.exit(1); }
}
console.log('30 min busy run: max majors at once', maxMajor, '| max minors at once', maxMinor, '| fight during a major', fightDuringMajor, 'frames | bait+whirl together', bothBaitWhirl, 'frames');
console.log('kinds seen:', [...seenKinds].join(', '));
console.log('manual rules:', w.triggerEvent('kraken'), w.triggerEvent('mega'));
