// Headless simulation check. Run from the repo root: node dev-tests/crew.mjs
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('./', import.meta.url));
await build({ entryPoints: [dir + '../src/world.ts'], bundle: true, format: 'esm', outfile: dir + 'crew.bundle.mjs', logLevel: 'error' });
const { World } = await import(pathToFileURL(dir + 'crew.bundle.mjs').href);
const seed = Number(process.env.AQUARIUM_TEST_SEED ?? 20261020) >>> 0;
let randomState = seed;
Math.random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
console.log('crew simulation seed:', seed);
const mk = () => { const w = new World([{kind:'sawshark',size:.95},{kind:'hammerhead',size:.8},{kind:'nurse',size:.7},{kind:'mako',size:.6}]); w.settings.events = 'off'; w.resize(1400, 800, 12, 17); for (let i=0;i<300;i++) w.step(1/60); return w; };
const ufoOnly = process.argv.includes('--ufo-only');
// Observe deaths inside the shark-feeding phase only. A UFO, a departing pilot,
// or a diver leaving the tank must never count as a shark meal.
function trackMeals(w) {
  const stats = { normal: 0, mega: 0 };
  const step = w.stepSharks.bind(w);
  w.stepSharks = (dt) => {
    const live = w.fish.filter(f => f.diver && f.alive);
    const fed = new Map(w.sharks.filter(s => !s.mega).map(s => [s, s.fedUntil ?? 0]));
    step(dt);
    const meals = live.filter(f => !f.alive).length;
    let normal = 0;
    for (const [sh, previous] of fed) {
      if ((sh.fedUntil ?? 0) === previous) continue;
      assert.ok(previous <= w.time, 'a shark ate a second diver during its cooldown');
      assert.equal(sh.fedUntil, w.time + 40, 'diver meal starts a 40-second cooldown');
      normal++;
    }
    assert.ok(meals >= normal, 'each new cooldown corresponds to a diver meal');
    if (!w.sharks.some(s => s.mega)) assert.equal(meals, normal, 'every normal-shark meal starts a cooldown');
    stats.normal += normal;
    stats.mega += meals - normal;
  };
  return stats;
}
if (!ufoOnly) {
// Regression: a diver taken below the surface by a UFO fooled the old check.
{
  const w = mk(); const stats = trackMeals(w);
  w.sharks = [];
  const d = { ...w.fish[0], x: 500, y: 125, vx: 0, vy: 0, alive: true, diver: true, temp: w.time + 150, respawnAt: Infinity };
  w.fish = [d];
  assert.equal(w.triggerEvent('ufo'), 'started');
  Object.assign(w.ufo, { x: 500, y: 100, hy: 100, state: 'beam', beamX: 500, beamUntil: w.time + 10 });
  w.stepUfo(1/60);
  assert.ok(!d.alive && d.y > 0, 'reproduce the old false-positive condition');
  w.stepSharks(1/60);
  assert.deepEqual(stats, { normal: 0, mega: 0 }, 'UFO abduction is not a shark meal');
  console.log('PASS: underwater UFO abduction excluded from shark meals');
}
// Regression: overlapping divers allow only one meal until the cooldown ends.
{
  const w = mk(); w.sharks = [w.sharks[0]];
  const sh = w.sharks[0]; const stats = trackMeals(w);
  w.fish = Array.from({ length: 5 }, () => ({ ...w.fish[0], x: 700, y: 450, alive: true, diver: true, respawnAt: Infinity }));
  const bite = () => {
    for (let n = 0; n < sh.nodes.length; n += 2) { sh.nodes[n] = 700 - n * 2; sh.nodes[n + 1] = 450; }
    for (const f of w.fish) if (f.alive) { f.x = 700; f.y = 450; }
    sh.heading = 0; sh.hunger = 1;
    if ((sh.fedUntil ?? 0) <= w.time) sh.target = w.fish.find(f => f.alive) ?? null;
    sh.retargetAt = w.time + 2;
    w.rebuildHash(); w.stepSharks(1/60);
  };
  bite(); assert.equal(stats.normal, 1);
  const until = sh.fedUntil;
  w.time = until - 0.001; bite(); assert.equal(stats.normal, 1);
  w.time = until + 0.001; bite(); assert.equal(stats.normal, 2);
  console.log('PASS: one diver per bite, no second meal during cooldown, feeding resumes afterward');
}
// 1) diver counts
const hist = {}; for (let n = 0; n < 400; n++) { const w = mk(); w.triggerEvent('diver'); hist[w.diverQueue.length] = (hist[w.diverQueue.length]||0)+1; }
console.log('diver count histogram:', JSON.stringify(hist));
// 2) one diver per shark; mega eats all
let eatenByShark = 0;
for (let r = 0; r < 20; r++) { const w = mk(); const stats = trackMeals(w); w.triggerEvent('diver');
  for (let i = 0; i < 60*80; i++) w.step(1/60);
  eatenByShark += stats.normal; }
console.log('PASS: cooldown checks across 20 runs; actual normal-shark diver meals:', eatenByShark);
let megaAte = 0, megaTotal = 0;
for (let r = 0; r < 10; r++) { const w = mk(); const stats = trackMeals(w); w.triggerEvent('diver'); const total = w.diverQueue.length; for (let i = 0; i < 60*8; i++) w.step(1/60); assert.equal(w.triggerEvent('mega'), 'started');
  for (let i = 0; i < 60*80; i++) w.step(1/60);
  megaTotal += total; megaAte += stats.mega; }
console.log('megalodon meals:', megaAte, 'of', megaTotal, 'spawned divers (normal-shark meals excluded)');
}
// 3) hijack + saw cut
// Give these visits their own random sequence so --ufo-only repeats the same cases.
randomState = seed;
let hijacks = 0, broke = 0, cuts = 0, ufoRuns = 40, charged = 0, eligible = 0, beamed = 0, sharkHunts = 0;
for (let r = 0; r < ufoRuns; r++) { const w = mk(); trackMeals(w); w.triggerEvent('diver'); for (let i = 0; i < 60*8; i++) w.step(1/60); assert.equal(w.triggerEvent('ufo'), 'started'); if (w.sharks.some(s => s.ufoCharge)) charged++;
  let hadChance = false, lifted = false, hunted = false;
  const stepUfo = w.stepUfo.bind(w);
  w.stepUfo = dt => {
    if (w.ufo?.state === 'seek' && !w.ufo.pilot && !w.ufo.hijackChecked && w.fish.some(f => f.diver && f.alive && !f.riding && f.y > 40)) hadChance = true;
    // A blocked beam can lift and release its shark inside the same step.
    if (w.ufo?.state === 'beam' && w.ufo.targetShark) lifted = true;
    stepUfo(dt);
    if (w.ufo?.pilot && w.ufo.huntSharks) hunted = true;
    if (w.sharks.some(s => s.lifted)) lifted = true;
  };
  for (let i = 0; i < 60*70; i++) { w.step(1/60); if (!w.ufo) break; }
  const n = w.notices.join('|'); if (hadChance) eligible++; if (hunted) sharkHunts++; if (lifted) beamed++; if (n.includes('took over')) hijacks++; if (n.includes('broke free')) broke++; if (n.includes('cut the ufo')) cuts++;
  if (!w.ufo) assert.ok(w.sharks.every(s => !s.lifted), 'no shark stays lifted after UFO disappears');
  if (n.includes('broke free')) assert.ok(lifted, 'escape follows an observed shark beam');
}
assert.ok(hijacks > 0 && hijacks < eligible, 'the seeded visits exercise successful and declined hijacks');
assert.ok(sharkHunts > 0 && sharkHunts < hijacks, 'some pilots hunt sharks and others keep ordinary behavior');
assert.ok(beamed > 0 && broke > 0, 'the seeded visits exercise shark lifting and escape');
console.log(`ufo visits ${ufoRuns}: eligible for hijack ${eligible}, sawshark charging ${charged}, saw cuts ${cuts}, diver hijacks ${hijacks}, pilots hunting sharks ${sharkHunts}, shark beamed ${beamed}, shark broke free ${broke}`);
if (!ufoOnly) {
// 4) whirlpool displacement of divers and sharks
function whirlTest(on) { const w = mk(); w.triggerEvent('diver'); for (let i = 0; i < 60*14; i++) w.step(1/60); const dv = w.fish.filter(f => f.diver && f.alive); if (!dv.length) return null; if (on) { w.triggerEvent('whirl'); w.whirl.x = dv[0].x + 90; w.whirl.y = dv[0].y; w.whirl.born = w.time - 5; w.whirl.until = w.time + 20; }
  const sh0 = w.sharks[0]; const start = { dx: dv[0].x, dy: dv[0].y, sx: sh0.nodes[0], sy: sh0.nodes[1] }; for (let i = 0; i < 60*3; i++) w.step(1/60); return { diver: Math.hypot(dv[0].x - start.dx, dv[0].y - start.dy) }; }
const a = whirlTest(true), b = whirlTest(false); console.log('diver moved in 3s near a whirlpool:', a && Math.round(a.diver), 'px vs without:', b && Math.round(b.diver), 'px');
// 5) long busy stability
const w = mk(); w.settings.events = 'busy'; for (let i = 0; i < 60*1500; i++) { w.step(1/60); for (const s of w.sharks) if (!Number.isFinite(s.nodes[0])) { console.log('NaN'); process.exit(1); } for (const f of w.fish) if (!Number.isFinite(f.x)) { console.log('NaN fish'); process.exit(1); } }
console.log('25 min busy run ok');
}
