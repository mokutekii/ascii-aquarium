// Run from the repo root: node dev-tests/encounters.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundle = new URL('./encounters.bundle.mjs', import.meta.url);
await build({ entryPoints: [fileURLToPath(new URL('../src/world.ts', import.meta.url))], bundle: true, format: 'esm', outfile: fileURLToPath(bundle), logLevel: 'error' });
const { World } = await import(bundle.href);
const withRandom = (values, action) => {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try { return action(); } finally { Math.random = original; }
};
function makeWorld() {
  const w = new World([{ kind: 'classic', size: 0.8 }, { kind: 'nurse', size: 0.7 }, { kind: 'mako', size: 0.6 }]);
  w.settings.events = 'off'; w.resize(1400, 800, 12, 17);
  w.time = 5;
  for (const [i, s] of w.sharks.entries()) {
    for (let n = 0; n < s.nodes.length; n += 2) { s.nodes[n] = 700 + i * 100 - n * 2; s.nodes[n + 1] = 450; }
    s.heading = 0; s.retargetAt = 100; s.target = null;
  }
  const d = { ...w.fish[0], x: 720, y: 450, vx: 0, vy: 0, diver: true, alive: true, temp: 200, respawnAt: Infinity };
  w.fish = [d];
  return { w, d };
}
{
  const { w, d } = makeWorld();
  withRandom([0.1], () => w.stepDivers(1/60));
  const hunter = w.sharks.find(s => s.target === d);
  assert.ok(hunter);
  assert.equal(w.sharks.filter(s => s.target === d).length, 1);
  assert.equal(w.sharks.filter(s => (s.alertUntil ?? 0) > w.time).length, 1);
  const alert = hunter.alertUntil;
  withRandom([0.1], () => { for (let i = 0; i < 60; i++) { w.time += 1/60; w.stepDivers(1/60); } });
  assert.equal(w.sharks.filter(s => s.target === d).length, 1);
  assert.equal(hunter.alertUntil, alert, 'keeping a claim does not retrigger the alert');
  hunter.fedUntil = w.time + 40;
  withRandom([0.1], () => w.stepDivers(1/60));
  assert.notEqual(hunter.target, d, 'fed shark releases the diver');
  assert.equal(hunter.alertUntil, 0);
  assert.equal(w.sharks.filter(s => s.target === d).length, 1, 'only one replacement hunter');
  d.riding = true;
  w.stepDivers(1/60);
  assert.equal(w.sharks.filter(s => s.target === d).length, 0, 'pilot is not chased');
  console.log('PASS: one hunter and alert per diver, stable claim, cooldown handoff, pilot release');
}
{
  const { w, d } = makeWorld();
  withRandom([0.9], () => w.stepDivers(1/60));
  withRandom([0.1], () => { for (let i = 0; i < 60; i++) w.stepDivers(1/60); });
  assert.ok(w.sharks.every(s => s.target !== d && !(s.alertUntil > w.time)), 'ignored visitor is not rerolled every frame');
  w.rebuildHash();
  assert.equal(w.findPrey(w.sharks[0]), null, 'ordinary fish targeting cannot bypass diver claims');
  for (const s of w.sharks) { s.nodes[0] = d.x; s.nodes[1] = d.y; s.hunger = 1; }
  w.stepSharks(1/60);
  assert.ok(d.alive, 'unassigned sharks cannot steal an ignored diver at their mouth');
  const mega = w.sharks[0]; mega.mega = true; mega.nodes[0] = d.x; mega.nodes[1] = d.y; mega.hunger = 1;
  w.stepSharks(1/60);
  assert.equal(d.alive, false, 'megalodon still eats unclaimed divers');
  console.log('PASS: some divers stay ignored, no incidental theft, megalodon exception');
}
{
  const { w, d } = makeWorld();
  w.fish.push({ ...d, x: 900, y: 450 });
  withRandom([0.1], () => w.stepDivers(1/60));
  assert.equal(new Set(w.sharks.map(s => s.target).filter(Boolean)).size, 2);
  assert.equal(w.sharks.filter(s => s.target?.diver).length, 2, 'different divers can have different hunters');
  console.log('PASS: separate divers can each have one hunter');
}
for (const mode of ['ordinary', 'pilot-fish', 'pilot-sharks']) {
  const { w, d } = makeWorld();
  w.fish.push({ ...d, x: 250, y: 400, diver: undefined, temp: undefined });
  w.triggerEvent('ufo');
  Object.assign(w.ufo, { x: 400, y: 100, hy: 100, state: 'seek', aim: null });
  const rolls = mode === 'ordinary' ? [0.9] : mode === 'pilot-fish' ? [0.1, 0, 0.9] : [0.1, 0, 0.1];
  withRandom(rolls, () => w.stepUfo(1/60));
  assert.equal(w.ufo.hijackChecked, true);
  if (mode !== 'pilot-sharks') assert.ok(w.ufo.aim, 'ordinary behavior still finds something to abduct');
  if (mode === 'ordinary') {
    assert.equal(w.ufo.pilot, null);
    // Give a failed visit another seeking opportunity with a guaranteed low roll.
    w.ufo.state = 'seek'; w.ufo.aim = null;
    withRandom([0], () => w.stepUfo(1/60));
    assert.equal(w.ufo.pilot, null, 'failed hijack is not retried every tick');
  } else {
    assert.equal(w.ufo.pilot, d);
    assert.equal(w.ufo.huntSharks, mode === 'pilot-sharks');
  }
  assert.equal(!!w.ufo.targetShark, mode === 'pilot-sharks');
  console.log(`PASS: UFO ${mode}`);
}
