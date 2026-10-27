// Night controls and ecology. Run from the repo root: node dev-tests/night.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = fileURLToPath(new URL('./', import.meta.url));
await build({ stdin: { contents: 'export { World } from "../src/world"; export { isGhost, GHOST_LINES } from "../src/lines";', resolveDir: dir }, bundle: true, format: 'esm', platform: 'node', outfile: dir + 'night.bundle.mjs', logLevel: 'error' });
const { World, isGhost, GHOST_LINES } = await import(pathToFileURL(dir + 'night.bundle.mjs').href);
const make = () => {
  const w = new World([{ kind: 'classic', size: 0.8 }], 30);
  w.settings.events = 'off'; w.resize(1800, 1000, 12, 17);
  return w;
};
const w = make();
assert.equal(w.night, 0);
assert.equal(w.triggerEvent('night'), 'started');
assert.equal(w.night, 1, 'N reaches full night immediately instead of the edge of dusk');
assert.equal(w.eventStatus('night'), 'running');
w.settings.night = false;
assert.equal(w.night, 0);
assert.equal(w.triggerEvent('night'), 'off');
w.settings.night = true; w.dayOffset = 0; w.time = 540;
assert.equal(w.night, 0, 'the automatic cycle returns to daylight');
assert.equal(isGhost('a blue shadow approaches...'), true);
for (const text of Object.values(GHOST_LINES)) assert.equal(isGhost(text), false, 'only the entrance gets the special glow');

function fishSpeed(night) {
  const g = make(); g.sharks = [];
  g.settings.night = night; if (night) g.triggerEvent('night');
  const f = g.fish[0];
  g.fish = [f];
  Object.assign(f, { x: 900, y: 500, vx: 36, vy: 0, alive: true, alarm: 0, turn: 0, species: 0 });
  const random = Math.random;
  Math.random = () => 0.5;
  try { for (let i = 0; i < 120; i++) { g.rebuildHash(); g.stepFish(1 / 60); } }
  finally { Math.random = random; }
  return Math.hypot(f.vx, f.vy);
}
assert.ok(fishSpeed(true) < fishSpeed(false), 'undisturbed fish actually swim more slowly at night');
console.log('PASS: night control, day/night cycle, night fish behavior and entrance-only glow');
