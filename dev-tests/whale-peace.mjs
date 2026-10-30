import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: 'export { World } from "./src/world"; export * from "./src/craft-blast";', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { World, damageCraftInBlast } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const make = () => { const w = new World([{ kind: 'classic', size: .8 }], 24); w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; return w; };
// Craft and whales clip through each other: nothing is pushed.
{
  const w = make();
  w.spawnWhale(true);
  const wh = w.whales[0];
  Object.assign(wh, { x: 900, y: 600, heading: 0, speed: 0 });
  const m = w.whaleMid(wh);
  w.spawnSub(); w.spawnUfo();
  const sub = w.subs[0], ufo = w.ufos.at(-1);
  Object.assign(sub, { x: m.x, y: m.y, vx: 0, vy: 0 });
  Object.assign(ufo, { x: m.x + 20, y: m.y, state: 'seek' });
  const before = { x: wh.x, y: wh.y, sx: sub.x, sy: sub.y, ux: ufo.x, uy: ufo.y };
  for (let i = 0; i < 30; i++) { w.separateTraffic?.(1 / 60); w.stepUfoCollisions(1 / 60); }
  assert.equal(wh.x, before.x); assert.equal(wh.y, before.y);
  assert.equal(ufo.x, before.ux); assert.equal(ufo.y, before.uy);
  assert.equal(wh.fleeing, undefined, 'passing through a whale never scares it');
  console.log('PASS: craft clip through whales without pushing them');
}
// A blast frightens a nearby whale into fleeing away from it; a distant one is untouched.
{
  const w = make();
  w.spawnWhale(true);
  const wh = w.whales[0];
  Object.assign(wh, { x: 900, y: 600, heading: 0, speed: 20 });
  const m = w.whaleMid(wh);
  damageCraftInBlast(w, { x: m.x, y: m.y - 200, r: 150 });
  assert.equal(wh.fleeing, true);
  assert.ok(Math.cos(wh.fleeHeading - Math.PI / 2) > .5, 'flees away from the blast');
  assert.ok(wh.speed >= 110, 'recoils');
  const far = make(); far.spawnWhale(true);
  Object.assign(far.whales[0], { x: 900, y: 600 });
  damageCraftInBlast(far, { x: 0, y: 0, r: 100 });
  assert.equal(far.whales[0].fleeing, undefined);
  console.log('PASS: blasts scare nearby whales away');
}
