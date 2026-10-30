import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: 'export { World } from "./src/world"; export * from "./src/encounters";', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { World, startMothership } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const seedRand = Math.random; let seed = 4242; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const w = new World([{ kind: 'classic', size: .8 }], 24);
w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; w.time = 100;
w.spawnMegalodon(0);
const mega = w.sharks.find(s => s.mega);
startMothership(w);
Object.assign(w.mothership, { phase: 'battle', x: 1500, y: 300, nextTeleport: Infinity, nextShot: Infinity, until: Infinity });
const dist = () => Math.hypot(mega.nodes[0] - w.mothership.x, mega.nodes[1] - w.mothership.y);
for (let i = 0; i < 120; i++) { w.time += 1 / 30; w.step(1 / 30); }
w.mothership.x = mega.nodes[0] < 900 ? 1650 : 150; w.mothership.y = 250;
const before = dist();
for (let i = 0; i < 30 * 12; i++) { w.time += 1 / 30; w.step(1 / 30); }
Math.random = seedRand;
assert.ok(dist() < before * .5, `megalodon should close on the mothership (${Math.round(before)} -> ${Math.round(dist())})`);
console.log(Math.round(before), Math.round(dist()));
console.log('PASS: megalodon hunts the mothership unprovoked');
