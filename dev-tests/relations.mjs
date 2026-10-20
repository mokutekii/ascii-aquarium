// Headless simulation check. Run from the repo root: node dev-tests/relations.mjs
import { build } from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('./', import.meta.url));
await build({ entryPoints: [dir + '../src/world.ts'], bundle: true, format: 'esm', outfile: dir + 'rel.bundle.mjs', logLevel: 'error' });
const { World } = await import(pathToFileURL(dir + 'rel.bundle.mjs').href);
const mk = () => { const w = new World([{kind:'hammerhead',size:.8},{kind:'sawshark',size:.95},{kind:'nurse',size:.7},{kind:'mako',size:.6}]); w.resize(1400, 800, 12, 17); for (let i=0;i<300;i++) w.step(1/60); return w; };
// diver counts
const hist = {};
for (let n = 0; n < 300; n++) { const w = mk(); w.triggerEvent('diver'); const c = w.fish.filter(f => f.diver).length; hist[c] = (hist[c] || 0) + 1; }
console.log('diver count histogram (300 spawns):', JSON.stringify(hist));
// alerts
let w = mk(); w.triggerEvent('diver'); let alerted = 0; let t0 = null;
for (let i = 0; i < 60 * 12; i++) { w.step(1 / 60); const a = w.sharks.filter(s => (s.alertUntil ?? 0) > w.time).length; if (a && t0 === null) { t0 = (i/60).toFixed(1); alerted = a; } }
console.log('first shark alert at', t0, 's, sharks alerted that moment:', alerted);
// sharks keep out of the beam
let minD = 1e9, inBeam = 0, samples = 0;
for (let run = 0; run < 6; run++) { w = mk(); w.triggerEvent('ufo'); for (let i = 0; i < 60 * 50; i++) { w.step(1 / 60); const u = w.ufo; if (!u) break; for (const s of w.sharks) { if (s.mega) continue; const d = Math.hypot(s.nodes[0] - u.x, s.nodes[1] - u.y); if (d < minD) minD = d; if (u.state === 'beam') { samples++; if (s.nodes[1] > u.y && Math.abs(s.nodes[0] - u.beamX) < 55) inBeam++; } } } }
console.log('closest shark head to saucer:', Math.round(minD), 'px; shark-head-in-beam samples:', inBeam, 'of', samples);
// mega eats ufo
w = mk(); w.triggerEvent('ufo'); w.triggerEvent('mega'); let eaten = null;
for (let i = 0; i < 60 * 90; i++) { w.step(1 / 60); if (!w.ufo && eaten === null) { eaten = (i/60).toFixed(1); break; } }
console.log('ufo gone at', eaten, 's; notices:', JSON.stringify(w.notices));
// fight + diver
w = mk(); w.triggerEvent('fight'); for (let i = 0; i < 120; i++) w.step(1/60); const fightBefore = !!w.fight; w.triggerEvent('diver'); w.step(1/60);
console.log('fight running before diver:', fightBefore, '| after diver:', !!w.fight);
// random-run stability
w = mk(); w.settings.events = 'busy'; for (let i = 0; i < 60 * 600; i++) { w.step(1/60); for (const s of w.sharks) if (!Number.isFinite(s.nodes[0])) { console.log('NaN shark'); process.exit(1); } }
console.log('600s busy run ok');
