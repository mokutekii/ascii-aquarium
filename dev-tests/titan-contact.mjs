import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r = await build({ stdin: { contents: 'export * from "./src/world"; export * from "./src/shark-safety"; export * from "./src/provocation";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, stepSharkSafety, stepProvocations } = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
let seed = 1475; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
function make() {
  const w = new World([{ kind: 'classic', size: .8 }], 4); w.resize(3000, 2100, 13, 19);
  w.settings.events = 'off'; w.time = 30; w.fish = []; w.sharks = [];
  w.spawnKraken(true); w.spawnMegalodon(); const k = w.kraken, m = w.sharks.find(s => s.mega);
  Object.assign(k, { x: 1300, y: 900, state: 'grab', stateAt: w.time, heading: 0, nextHunt: Infinity, megaSent: true });
  m.retreat = false; m.heading = Math.PI; m.megaHeading = Math.PI;
  moveHead(m, 2200, 900); return { w, k, m };
}
function moveHead(m, x, y) { const dx = x - m.nodes[0], dy = y - m.nodes[1]; for (let i = 0; i < m.nodes.length; i += 2) { m.nodes[i] += dx; m.nodes[i + 1] += dy; } }
{
  const { w, k, m } = make(); Object.assign(k, { state: 'wrap', stateAt: w.time - 8, wrapping: m, lunging: true, coiled: false, maul: false });
  moveHead(m, 2700, 1600); w.stepKraken(1 / 60);
  assert.equal(k.wrapping, null, 'a missed lunge never becomes a remote wrap');
  assert.equal(k.state, 'flee');
}
{
  const { w, k, m } = make(); Object.assign(k, { state: 'wrap', stateAt: w.time, wrapping: m, lunging: false, coiled: true, maul: true, biteAt: undefined, wrapFor: 10, winner: 'mega', nextShake: Infinity });
  moveHead(m, k.x + k.size * 1.1, k.y); w.stepKraken(1 / 60);
  assert.equal(k.biteAt, undefined, 'maul waits for actual jaw contact');
  moveHead(m, k.x + k.size * .05, k.y); w.time += 1 / 60; w.stepKraken(1 / 60);
  assert.equal(k.biteAt, w.time, 'the bite lands when the jaws arrive');
  assert.equal(k.wrapping, m);
}
{
  const { w, k, m } = make(); Object.assign(k, { state: 'flee', stateAt: w.time - 1, inkEscape: false, inkShown: false });
  moveHead(m, k.x + k.size * 1.2, k.y); w.stepKraken(1 / 60);
  assert.ok(m.chaseUntil > w.time && m.pounceUntil > w.time, 'Megalodon commits to chasing an exposed fleeing Kraken');
  moveHead(m, k.x + k.size * .5, k.y); w.time += 1 / 60; w.stepKraken(1 / 60);
  assert.equal(k.state, 'wrap'); assert.equal(k.maul, true, 'a chase can reconnect as a maul');
}
{
  const { w, k, m } = make(); m.retreat = true;
  moveHead(m, k.x + k.size * 2, k.y); k.harpoon = { target: m, at: w.time - 1 };
  const old = [...m.nodes], gap = Math.hypot(m.nodes[0] - k.x, m.nodes[1] - k.y);
  w.stepKraken(1 / 60);
  assert.ok(Math.hypot(m.nodes[0] - k.x, m.nodes[1] - k.y) < gap, 'a fleeing Megalodon can be hauled back');
  const dx = m.nodes[0] - old[0], dy = m.nodes[1] - old[1];
  assert.ok(Math.hypot(dx, dy) < 12, 'harpoon motion is gradual');
  for (let i = 2; i < old.length; i += 2) assert.ok(Math.abs((m.nodes[i] - old[i]) - dx) < .001 && Math.abs((m.nodes[i + 1] - old[i + 1]) - dy) < .001, 'harpoon carries the whole spine without stretching');
}
for (const maul of [false, true]) {
  const { w, k, m } = make(); w.resize(6000, 4000, 13, 19);
  assert.ok(w.sharks.includes(m) && w.kraken === k, "resizing an empty-fish tank preserves the clash");
  m.heading = 0; m.megaHeading = 0; m.speed = 12;
  for (let i = 0; i < m.nodes.length / 2; i++) { m.nodes[i * 2] = 3000 - i * m.length / (m.nodes.length / 2 - 1); m.nodes[i * 2 + 1] = 2000; }
  Object.assign(k, { x: m.nodes[8], y: 2000, state: 'wrap', stateAt: w.time, wrapping: m, lunging: false, coiled: true, maul, biteAt: maul ? w.time : undefined, wrapFor: 1000 });
  let rotation = 0, previous = m.heading;
  for (let i = 0; i < 2400; i++) {
    w.time += 1 / 60; k.x = m.nodes[maul ? 0 : 8]; k.y = m.nodes[maul ? 1 : 9]; w.stepSharks(1 / 60);
    rotation += Math.abs(m.heading - previous); previous = m.heading;
    assert.ok(m.nodes[0] > 0 && m.nodes[0] < w.width && m.nodes[1] > 0 && m.nodes[1] < w.height, 'attached struggle stays in frame');
  }
  assert.ok(rotation < .1, 'an attached Kraken never becomes a steering target on the Megalodon own body');
  assert.ok(m.thrash > 0, 'the body still thrashes without rotating its travel course');
}
{
  const { w, k, m } = make(); w.spawnRandomShark(); const small = w.sharks.find(s => !s.mega);
  moveHead(small, m.nodes[0] + 5, m.nodes[1]);
  const old = [...m.nodes]; stepSharkSafety(w, 1 / 60); stepProvocations(w, 1 / 60);
  assert.deepEqual([...m.nodes], old, 'ordinary sharks cannot translate the Megalodon');
  assert.notEqual(w.provocations.get(m)?.target, small, 'brushing a small shark does not hijack a titan clash');
}
console.log('PASS: missed-lunge disengagement, physical jaw contact, escape pursuit, chase reattachment and whole-body harpoon recovery, stable attached courses, shark mass priority and resize continuity');
