import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: 'export { World } from "./src/world"; export * from "./src/encounters"; export * from "./src/drones"; export * from "./src/craft-blast";', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { World, startMothership, detonateDrone, damageCraftInBlast, stepDroneImpacts } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const w = new World([{ kind: 'classic', size: .8 }], 24);
w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; w.time = 100;
startMothership(w);
Object.assign(w.mothership, { phase: 'battle', x: 900, y: 300 });
const mk = (id, x) => ({ id, x, y: 700, hp: 3, stunned: 0, nextShot: 999 });
w.attackDrones = [mk(1, 800), mk(2, 850), mk(3, 900)];
detonateDrone(w, w.attackDrones[0]);
for (let i = 0; i < 30; i++) { w.time += .1; stepDroneImpacts(w); }
assert.equal(w.attackDrones[1].hp, 3, 'a drone explosion does not kill its neighbours');
assert.equal(w.attackDrones[2].hp, 3);
assert.ok(!w.attackDrones[1].detonated && !w.attackDrones[2].detonated, 'explosions do not chain between drones');
damageCraftInBlast(w, { x: 850, y: 700, r: 300, source: w.mothership });
assert.equal(w.attackDrones[1].hp, 3, 'mothership blasts spare its drones');
damageCraftInBlast(w, { x: 850, y: 700, r: 300 });
assert.ok(w.attackDrones[1].hp < 3, 'hostile blasts still hurt drones');
console.log('PASS: mothership drones survive their own side\'s explosions');

for (let i = 0; i < 8; i++) damageCraftInBlast(w, { x: 850, y: 700, r: 300 });
assert.equal(w.attackDrones[1].hp, 1, 'repeated collateral explosions cannot kill a surviving drone');
assert.equal(w.attackDrones[2].hp, 1, 'wreck chain reactions cannot wipe out a drone wing');
