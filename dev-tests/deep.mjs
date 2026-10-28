// Run from the repo root: node dev-tests/deep.mjs
// The leviathan, and submarines run for a few minutes without breaking, and the leviathan actually crosses the tank.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
let seed = Number(process.env.AQUARIUM_TEST_SEED ?? 20261027) >>> 0;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const bundle = fileURLToPath(new URL('deep.bundle.mjs', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../src/world.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const { World } = await import(pathToFileURL(bundle).href);
const w = new World([{ kind: 'classic', size: 0.8 }, { kind: 'nurse', size: 0.7 }, { kind: 'classic', size: 0.9 }], 14);
w.settings.events = 'off'; w.resize(1400, 800, 12, 17);
assert.equal(w.triggerEvent('leviathan'), 'started');
assert.notEqual(w.triggerEvent('kraken'), 'blocked', 'a forced kraken may share the water with the ghost');
w.triggerEvent('sub'); w.triggerEvent('diver'); w.triggerEvent('jelly');
w.setWorkers(true, true);
let agit = 0, maxAg = 0, seen = 0, minX = Infinity, maxX = -Infinity;
for (let i = 0; i < 60 * 150; i++) {
  w.step(1 / 60);
  const lv = w.leviathan;
  if (lv) {
    assert.ok(Number.isFinite(lv.x) && Number.isFinite(lv.y), 'leviathan position stays finite');
    if (lv.x > -50 && lv.x < 1450) seen++;
    minX = Math.min(minX, lv.x); maxX = Math.max(maxX, lv.x);
  }
  maxAg = Math.max(maxAg, w.agitated.size); agit += w.agitated.size ? 1 : 0;
  for (const j of w.jellies) assert.ok(Number.isFinite(j.sq ?? 0));
}
console.log({ agitatedSteps: agit, maxAg, seen, minX: Math.round(minX), maxX: Math.round(maxX), subs: w.subs.length, left: !!w.leviathan });
assert.ok(seen > 600, 'leviathan spends time on screen');
w.setWorkers(false, false);
for (let i = 0; i < 60 * 40; i++) w.step(1 / 60);
assert.equal(w.subs.filter((s) => s.crew).length, 0, 'crew subs leave when work ends');
console.log('deep ok');

// An undisturbed ghost is peaceful. Yeat changes its light, never its temperament or scale.
{
  const g = new World([{ kind: 'classic', size: 0.8 }], 14);
  g.settings.events = 'off'; g.resize(1400, 800, 12, 17);
  assert.equal(g.triggerEvent('leviathan'), 'started');
  const lv = g.leviathan;
  const length = lv.length;
  g.sharks = [];
  g.triggerEvent('diver'); g.triggerEvent('sub');
  const fish = g.fish.filter(f => f.alive);
  const sub = g.subs[0];
  for (const mode of ['normal', 'yeat', 'fading', 'normal again']) {
    if (mode === 'yeat') { g.triggerEvent('yeat'); g.time += 4; }
    if (mode === 'fading') g.triggerEvent('yeat');
    if (mode === 'normal again') g.time += 4;
    for (let i = 0; i < 180; i++) {
      g.time += 1 / 60;
      for (const f of fish) { f.x = lv.x + 15; f.y = lv.y; }
      sub.x = lv.x + 10; sub.y = lv.y; sub.nextTorp = 0; sub.vx = 0; sub.vy = 0;
      g.stepDeep(1 / 60);
      assert.ok(fish.every(f => f.alive), `${mode}: no fish or divers are eaten`);
      assert.equal(sub.hull, 4, `${mode}: no damage to submarines`);
      assert.equal(g.torpedoes.length, 0, `${mode}: subs do not attack the ghost`);
      assert.equal(g.leviathan, lv, `${mode}: no creature replacement`);
      assert.equal(lv.length, length, `${mode}: no change of scale`);
      assert.equal(lv.state, 'drift', `${mode}: proximity alone does not provoke it`);
    }
  }
  assert.ok(fish.every(f => f.alarm === 1), 'nearby fish startle');
  assert.ok(sub.fleeUntil > 0, 'submarines flee the ghost');
  assert.ok(!g.titanEntry, 'the ghost never shakes the tank');
  g.torpedoes.push({ x: lv.x, y: lv.y, vx: 0, vy: 0, born: g.time, trail: [], owner: sub });
  g.stepDeep(1 / 60);
  assert.equal(g.torpedoes.length, 0, 'a torpedo hits its visible body');
  assert.equal(lv.state, 'warn', 'a shot provokes a warning before any attack');
  assert.equal(lv.target, sub, 'it remembers the human attacker');
  assert.equal(g.leviathan, lv);
  console.log('ghost normal/Yeat transitions, peaceful proximity and torpedo provocation ok');
}

// Attacks require provocation, a warning and actual jaw contact, then a recovery period.
{
  const g = new World([{ kind: 'classic', size: 0.8 }], 14);
  g.settings.events = 'off'; g.resize(1800, 1000, 12, 17);
  g.triggerEvent('leviathan'); g.triggerEvent('sub');
  g.sharks = [];
  const lv = g.leviathan;
  const sub = g.subs[0];
  g.time = 10;
  const pose = () => {
    lv.x = 900; lv.y = 500; lv.heading = 0; lv.phase = 0;
    lv.spine.forEach((p, i) => { p.x = lv.x - lv.length * i / (lv.spine.length - 1); p.y = lv.y; });
    sub.x = lv.x + lv.length * 0.06; sub.y = lv.y; sub.vx = 0; sub.vy = 0;
  };
  pose();
  assert.equal(g.agitateLeviathan(-10000, -10000, 10), false, 'a distant blast does not agitate it');
  assert.equal(g.agitateLeviathan(lv.x, lv.y, 30, sub), true);
  assert.equal(sub.hull, 4, 'provocation itself causes no damage');
  g.time += 2.4; g.stepDeep(0);
  assert.equal(sub.hull, 4, 'the warning gives time to escape');
  g.time += 0.2; pose(); g.stepDeep(0);
  assert.equal(sub.hull, 3, 'a charge damages the hull only at jaw contact');
  assert.equal(lv.state, 'recover');
  g.time += 1; pose(); g.stepDeep(0);
  assert.equal(sub.hull, 3, 'contact during recovery does not cause repeated damage');
  g.time = lv.rageUntil + 1; pose(); g.stepDeep(0);
  assert.equal(lv.state, 'drift', 'it calms down after the disturbance ends');
  assert.equal(lv.target, null);
  assert.ok(g.notices.includes('the ghost leviathan has awoken...'), 'the entrance is one simple glowing line');

  // Ordinary wildlife is never a retaliation target, even if it is the only nearby creature.
  g.subs = []; g.fish = g.fish.filter(f => !f.diver);
  pose(); g.agitateLeviathan(lv.x, lv.y, 30);
  g.time += 3; g.stepDeep(0);
  assert.equal(lv.target, null, 'it never hunts ordinary fish or sharks');
  assert.equal(lv.state, 'warn');
  const diver = { ...g.fish[0], x: lv.x + lv.length * 0.06, y: lv.y, alive: true, diver: true, dkind: 'scuba', temp: g.time + 100, respawnAt: Infinity };
  g.fish.push(diver);
  lv.target = diver;
  lv.nextAttack = g.time;
  pose(); g.stepDeep(0);
  assert.equal(diver.alive, false, 'an agitated charge can kill a diver on contact');
  assert.ok(g.fish.filter(f => !f.diver).every(f => f.alive), 'retaliation leaves ordinary fish alive');
  console.log('ghost warning, contact attack, recovery, calm and human-only targeting ok');
}

// Explosions provoke the whole body; a peaceful ghost never becomes a whale eater through shared collision logic.
{
  const g = new World([{ kind: 'classic', size: 0.8 }], 14);
  g.settings.events = 'off'; g.resize(2400, 1400, 12, 17);
  g.triggerEvent('whale'); g.triggerEvent('leviathan');
  const lv = g.leviathan, whale = g.whales[0];
  lv.x = 1200; lv.y = 700;
  lv.spine.forEach((p,i)=>{p.x=lv.x-lv.length*i/(lv.spine.length-1);p.y=lv.y;});
  whale.x = lv.x; whale.y = lv.y; whale.traveled = 0;
  g.stepCritters(1 / 60);
  assert.ok(g.whales.includes(whale), 'an overlapping ghost does not devour a whale');
  const tail = lv.spine[Math.floor(lv.spine.length * 0.7)];
  g.explode(tail.x, tail.y);
  assert.ok(lv.rageUntil > g.time, 'a blast against the flank provokes the ghost');
  assert.equal(lv.state, 'warn');
}

// A disabled encounter stays disabled, and a departing ghost eventually clears the tank.
{
  const g = new World([{ kind: 'classic', size: 0.8 }], 0);
  g.settings.events = 'off'; g.resize(640, 360, 10, 15);
  g.setEventEnabled('leviathan', false);
  assert.equal(g.triggerEvent('leviathan'), 'off');
  g.setEventEnabled('leviathan', true);
  assert.equal(g.triggerEvent('leviathan'), 'started');
  g.leviathan.until = -1;
  for (let i = 0; i < 60 * 120 && g.leviathan; i++) { g.time += 1 / 60; g.stepDeep(1 / 60); }
  assert.equal(g.leviathan, null, 'the entire ghost leaves the tank');
}
