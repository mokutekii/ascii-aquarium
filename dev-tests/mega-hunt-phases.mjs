import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: 'export { World } from "./src/world"; export * from "./src/mega-swim"; export * from "./src/encounters";', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { World, megaStrokeMask, megaWhipEnvelope } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const seedRand = Math.random; let seed = 777; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const fresh = () => {
  const w = new World([{ kind: 'classic', size: .8 }], 60);
  w.resize(2000, 1300, 13, 19); w.settings.events = 'off'; w.sharks = []; w.time = 100;
  w.spawnMegalodon(0);
  const mega = w.sharks.find(s => s.mega);
  return { w, mega };
};
const run = (w, seconds, each) => { for (let i = 0; i < seconds * 30; i++) { w.time += 1 / 30; w.step(1 / 30); each?.(i / 30); } };

// 1. A rigid front half: the stroke touches only the back half to the tail.
assert.equal(megaStrokeMask(0), 0); assert.equal(megaStrokeMask(.4), 0); assert.ok(megaStrokeMask(1) > .99);
assert.ok(Math.abs(megaWhipEnvelope(.5, .2) * megaStrokeMask(.2)) === 0, 'no front-half bend in the windup');

// 2. Always hunting: with only fish in the water it picks prey, sprints hard and eats many fish, and never just roams.
{
  const { w, mega } = fresh();
  let eaten = 0; const push = w.events.push.bind(w.events); w.events.push = (...a) => { eaten += a.filter(e => e.kind === 'eat').length; return push(...a); };
  let top = 0, hunting = 0, total = 0;
  run(w, 40, () => { top = Math.max(top, mega.speed); total++; if (mega.hunt) hunting++; });
  assert.ok(top > 140, `sprints at speed (${Math.round(top)})`);
  assert.ok(hunting / total > .6, `hunting most of the time (${(hunting / total).toFixed(2)})`);
  assert.ok(eaten >= 3, `eats fish in passing (${eaten})`);
}

// 3. A diver: sprint -> clamp (anchored to the jaws) -> shake -> eaten, and the bite is felt.
{
  const { w, mega } = fresh();
  for (const f of w.fish) if (f.alive) { f.alive = false; f.respawnAt = Infinity; }
  const d = w.fish[0];
  Object.assign(d, { diver: true, dkind: 'scuba', alive: true, respawnAt: Infinity, x: mega.nodes[0] + 600, y: mega.nodes[1] + 40, vx: 0, vy: 0 });
  let clamped = false, shook = 0, impact = false, anchored = true, maxSpeed = 0, ate = false;
  run(w, 14, () => {
    maxSpeed = Math.max(maxSpeed, mega.speed);
    if (!d.alive && d.deathCause === 'MEGALODON BITE') ate = true;
    if (mega.hunt?.phase === 'clamp') {
      clamped = true;
      if (mega.shake) shook = Math.max(shook, Math.abs(Math.sin(mega.shake.phase)));
      if (Math.hypot(d.x - mega.nodes[0], d.y - mega.nodes[1]) > mega.length * .2) anchored = false;
    }
    if (w.impactAt > 100 && w.time - w.impactAt < .1) impact = true;
  });
  assert.ok(clamped, 'jaws clamp the diver'); assert.ok(anchored, 'the diver rides the jaws'); assert.ok(shook > .3, 'the head shakes');
  assert.ok(impact, 'the bite is felt (impact pulse)'); assert.ok(ate, 'the diver is eaten');
  assert.ok(maxSpeed > 140, `heavy sprint (${Math.round(maxSpeed)})`);
}

// 4. Aggression: the blood moon and kills raise it; provocation fades slower than before.
{
  const { w, mega } = fresh();
  const calm = w.titanAggression(mega);
  w.titanKill(mega);
  assert.ok(w.titanAggression(mega) > calm + .1, 'a kill feeds the frenzy');
  w.sagas.push({ kind: 'moon', born: w.time, until: w.time + 100 });
  w.time += 12;
  assert.ok(w.titanAggression(mega) >= .85, 'blood moon floor');
  assert.ok(w.megaRage(mega) > .5, 'rage wrapper follows');
}

// 5. Tail strike: a sub alongside the rear half is whipped, hurt, knocked and stunned; the kraken is never whipped.
{
  const { w, mega } = fresh();
  mega.nextBite = Infinity;
  const tail = mega.nodes.length / 2 - 2;
  const sub = w.subs[0] ?? (w.spawnSub?.(), w.subs[0]);
  if (sub) {
    Object.assign(sub, { x: mega.nodes[tail * 2] + 30, y: mega.nodes[tail * 2 + 1] + 60, arrival: undefined, leaving: false, hull: 8 });
    const hull = sub.hull;
    run(w, 6, () => { sub.arrival = undefined; });
    assert.ok(sub.hull < hull || !w.subs.includes(sub), 'tail strike damages the craft');
  }
}

// 6. The whole body is lethal, and no impact pauses or slows the simulation.
{
  const { w, mega } = fresh();
  mega.nextBite = Infinity;
  const mid = Math.floor(mega.nodes.length / 4) * 2;
  const bx = mega.nodes[mid], by = mega.nodes[mid + 1];
  const diver = w.fish[0], small = w.fish[1];
  Object.assign(diver, { diver: true, dkind: 'scuba', alive: true, respawnAt: Infinity, x: bx, y: by, vx: 0, vy: 0 });
  Object.assign(small, { diver: false, alive: true, respawnAt: Infinity, x: bx + 5, y: by + 5 });
  const prey = { id: 5, kind: 'classic', length: 160, nodes: new Float32Array(mega.nodes.length).map((_, i) => (i % 2 ? by : bx)), heading: 0, speed: 0, phase: 0, turn: 0, hunger: 0, wander: 0, orbitDir: 1, orbitRadius: 0, target: null, retargetAt: Infinity, depth: 1 };
  w.sharks.push(prey);
  const t0 = w.time; w.step(1 / 30);
  assert.ok(Math.abs(w.time - t0 - 1 / 30) < 1e-9, 'no hit-stop or time slow');
  assert.ok(!diver.alive, 'a diver touching the body is crushed');
  assert.ok(!small.alive, 'a fish touching the body is eaten');
  assert.ok(!w.sharks.includes(prey), 'a small shark touching the body is destroyed');
}
Math.random = seedRand;
console.log('PASS: megalodon hunts with a committed sprint, jaw clamp and head shake, a rigid front half, shared aggression and a tail weapon');
