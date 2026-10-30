import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: 'export { World } from "./src/world"; export * from "./src/encounters"; export * from "./src/hull-combat";', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { World, startMothership, stepHullCombat } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const w = new World([{ kind: 'classic', size: .8 }], 24);
w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; w.time = 100;
w.spawnMegalodon(0);
const mega = w.sharks.find(s => s.mega);
startMothership(w);
const b = w.mothership; Object.assign(b, { phase: 'battle', x: 900, y: 400, nextTeleport: Infinity, nextShot: Infinity, nextSpin: Infinity, until: Infinity });
const dx = b.x - mega.nodes[0], dy = b.y - mega.nodes[1];
for (let i = 0; i < mega.nodes.length; i += 2) { mega.nodes[i] += dx; mega.nodes[i + 1] += dy; }
const start = b.hp, bites = new Set();
for (let i = 0; i < 30 * 2; i++) { w.time += 1 / 30; stepHullCombat(w, 1 / 30); bites.add(mega.chompAt); }
assert.ok(mega.hullClamp, 'the jaws clamp onto the mothership');
assert.ok(bites.size >= 3, `repeated bites (${bites.size})`);
assert.ok(b.hp < start - b.maxHp * .06, 'every bite hurts');
const headX = mega.nodes[0];
for (let i = 0; i < 15; i++) { for (let n = 0; n < mega.nodes.length; n += 2) mega.nodes[n] += 6; w.time += 1 / 30; stepHullCombat(w, 1 / 30); }
assert.ok(Math.abs(b.x - mega.nodes[0]) < b.size, 'the mothership is carried at the snout');
for (let i = 0; i < 30 * 3; i++) { w.time += 1 / 30; stepHullCombat(w, 1 / 30); }
assert.equal(mega.hullClamp, undefined, 'the clamp ends');
console.log('PASS: megalodon clamps and bites the mothership');
