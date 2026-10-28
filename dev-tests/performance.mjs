// Repeatable overlapping-event CPU benchmark. Canvas calls are stubbed: this measures
// simulation and drawing preparation, not browser text painting or GPU cost.
import { build } from 'esbuild';
import { Session } from 'node:inspector';
const result = await build({ stdin: { contents: 'export { World } from "./src/world"; export { AsciiRenderer } from "./src/renderer";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, AsciiRenderer } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
let seed = 20261027;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noop = () => {};
const gradient = { addColorStop: noop };
const context = new Proxy({}, { get: (obj, key) => obj[key] ?? (String(key).startsWith('create') ? () => gradient : key === 'measureText' ? () => ({ width: 8 }) : noop), set: (obj, key, value) => (obj[key] = value, true) });
const canvas = () => ({ getContext: () => context, style: {} });
globalThis.document = { createElement: canvas };
const world = new World();
const renderer = new AsciiRenderer(canvas());
const tier = process.argv.includes('--saver') ? 2 : 0;
renderer.setQuality(tier);
const width = process.argv.includes('--wide') ? 5760 : 1680;
renderer.resize(width, 1140, 1 / 3);
world.resize(width, 1140, 13, 19);
world.settings.events = 'busy';
world.setWorkers(true, true);
const events = ['leviathan', 'kraken', 'mega', 'sub', 'diver', 'jelly', 'ufo', 'whale', 'whirl', 'meteor', 'maelstrom', 'bloom'];
const inspector = new Session(); inspector.connect();
const post = (method) => new Promise((resolve, reject) => inspector.post(method, (error, value) => error ? reject(error) : resolve(value)));
await post('Profiler.enable'); await post('Profiler.start');
let simulation = 0, drawing = 0;
const frames = 360;
for (let frame = 0; frame < frames; frame++) {
  if (frame % 60 === 0) for (const event of events) world.triggerEvent(event);
  let at = performance.now();
  for (let i = 0; i < 3; i++) world.step(1 / 60);
  simulation += performance.now() - at;
  at = performance.now(); renderer.render(world, 1 / 30); drawing += performance.now() - at;
}
const { profile } = await post('Profiler.stop'); inspector.disconnect();
const counts = new Map();
for (const node of profile.nodes) { const name = node.callFrame.functionName; counts.set(name, (counts.get(name) ?? 0) + (node.hitCount ?? 0)); }
console.log(JSON.stringify({ frames, tier, width, simulationMs: Math.round(simulation), drawingMs: Math.round(drawing), hottest: [...counts].sort((a,b) => b[1]-a[1]).slice(0,12) }, null, 2));
