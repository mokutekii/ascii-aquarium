import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: 'export { World } from "./src/world"; export * from "./src/encounters"; export * from "./src/mothership-fx";', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { World, startMothership, beginWreck, stepMothershipFx } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const w = new World([{ kind: 'classic', size: .8 }], 24);
w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; w.time = 100;
startMothership(w);
const b = w.mothership; Object.assign(b, { phase: 'collapse', phaseAt: w.time, x: 900, y: 300 });
const [diver, shielded] = w.fish.slice(0, 2);
Object.assign(diver, { diver: true, dkind: 'scuba', alive: true, x: 1300, y: 500, vx: 0, vy: 0 });
Object.assign(shielded, { diver: true, dkind: 'scuba', alive: true, x: 500, y: 700, alienArmor: true, vx: 0, vy: 0 });
w.spawnSub(); w.spawnUfo(); w.spawnWhale(true);
Object.assign(w.subs[0], { x: 1000, y: 500 }); Object.assign(w.ufos.at(-1), { x: 700, y: 450, state: 'seek' });
w.jellies.push({ x: 1100, y: 600, size: 10, phase: 0, drift: 0, hue: 0 });
w.debris = []; w.alienScrap = []; w.mess = [];
beginWreck(w, b);
w.debris = []; w.alienScrap = [];
for (let i = 0; i < 90; i++) { w.time += 1 / 30; stepMothershipFx(w, 1 / 30); }
assert.equal(diver.alive, false, 'divers are killed');
assert.equal(shielded.alive, false, 'shields do not save a diver');
assert.equal(w.subs.length, 0, 'subs are vaporized');
assert.equal(w.ufos.length, 0, 'saucers are vaporized');
assert.equal(w.jellies.length, 0, 'jellyfish are vaporized');
assert.equal(w.debris.length, 0, 'no wreckage from vaporized craft');
assert.equal(w.alienScrap.length, 0, 'no scrap from vaporized craft');
assert.equal(w.whales[0].fleeing, true, 'whales are pushed away');
console.log('PASS: core death blast vaporizes craft without scrap, kills divers and scatters the rest');
