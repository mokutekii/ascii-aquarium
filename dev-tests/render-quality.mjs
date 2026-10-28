import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ stdin: { contents: 'export { World } from "./src/world"; export { AsciiRenderer } from "./src/renderer"; export { OceanEngine } from "./src/engine";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, AsciiRenderer, OceanEngine } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const noop = () => {};
const context = new Proxy({}, { get: (obj, key) => obj[key] ?? (String(key).startsWith('create') ? () => ({ addColorStop: noop }) : noop), set: (obj, key, value) => (obj[key] = value, true) });
const canvas = () => ({ style: {}, getContext: () => context });
globalThis.document = { createElement: canvas };
const renderer = new AsciiRenderer(canvas());
for (const [tier, limit] of [[0,240], [1,180], [2,128]]) {
  renderer.setQuality(tier); renderer.resize(5760, 3240, 1 / 3);
  assert.ok(renderer.cols <= limit, 'large windows keep bounded drawing detail');
}
renderer.resize(1680, 1140, 1 / 3);
const world = new World(); world.resize(1680, 1140, 13, 19);
world.currentUntil = 100; world.time = 65;
const points = [];
renderer.painter = () => ({ put: (x,y) => points.push([x,y]), flush: noop });
renderer.drawCurrent(world);
assert.ok(points.length > 10, 'living light remains visible in saver mode');
const first = JSON.stringify(points); points.length = 0;
world.time += 1; renderer.drawCurrent(world);
assert.notEqual(JSON.stringify(points), first, 'living light moves');
points.length = 0; renderer.sharkFlag.fill(1); renderer.drawCurrent(world);
assert.equal(points.length, 0, 'living light cannot bleed through shark silhouettes');
console.log('PASS: bounded 4K detail, visible moving light, creature occlusion');

// A simulated slow computer must shed detail and bound catch-up work.
let clock = 0;
globalThis.performance = { now: () => clock };
globalThis.getComputedStyle = () => ({ fontFamily: 'monospace' });
globalThis.window = { outerWidth: 560, innerWidth: 560, devicePixelRatio: 1, addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }) };
globalThis.ResizeObserver = globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = noop;
document.documentElement = { style: { setProperty: noop }, addEventListener: noop, removeEventListener: noop };
document.hasFocus = () => true;
const engineCanvas = { ...canvas(), getBoundingClientRect: () => ({ width: 560, height: 380 }) };
const engine = new OceanEngine(engineCanvas);
let steps = 0;
engine.world.step = () => { steps++; clock += 4; };
engine.renderer.render = () => { clock += 40; };
for (let i = 0; i < 240; i++) { clock += 34; engine.frame(clock); }
assert.equal(engine.qualityTier, 2, 'auto reduces quality under sustained load');
engine.setQuality('high'); assert.equal(engine.qualityTier, 0);
engine.setQuality('saver'); assert.equal(engine.qualityTier, 2);
engine.setSpeed(4); engine.acc = 10; steps = 0; clock += 100;
engine.frame(clock);
assert.ok(steps <= 3, 'catch-up stops after reaching its CPU budget');
assert.equal(engine.acc, 0, 'overdue time cannot accumulate');
console.log('PASS: automatic quality, manual overrides and bounded catch-up on a slow computer');
