// Run from the repo root: node dev-tests/chaos.mjs
// Sandbox stress: spam every event by hand while random events run busy; nothing may go non-finite or unbounded.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const r = await build({ entryPoints: [fileURLToPath(new URL('../src/world.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
const { World } = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const kinds = ['chase', 'mega', 'kraken', 'saga', 'bait', 'jelly', 'whale', 'whirl', 'fight', 'ufo', 'diver', 'night', 'moon', 'meteor', 'maelstrom', 'bloom', 'migration', 'current'];
let bad = 0;
for (let seed = 1; seed <= 8; seed++) {
  let st = seed * 104729 >>> 0; const orig = Math.random;
  Math.random = () => ((st = (Math.imul(1664525, st) + 1013904223) >>> 0) / 0x100000000);
  try {
    const w = new World([{ kind: 'classic', size: 0.8 }, { kind: 'nurse', size: 0.7 }, { kind: 'classic', size: 0.9 }], 14);
    w.settings.events = 'busy'; w.resize(1400, 800, 12, 17);
    for (let i = 0; i < 60 * 240; i++) {
      if (i % 90 === 0) w.triggerEvent(kinds[Math.floor(Math.random() * kinds.length)]);
      w.step(1 / 60);
      if (i % 60 === 0) {
        for (const s of w.sharks) for (const n of s.nodes) assert.ok(Number.isFinite(n), 'shark spine');
        for (const wh of w.whales) assert.ok(Number.isFinite(wh.x + wh.y), 'whale');
        assert.ok(w.ripples.length <= 64 && w.sagas.length <= 6, 'bounded');
        if (w.titanPair?.() || (w.kraken && w.sharks.some((s) => s.mega))) assert.ok(w.sagas.every((s) => true));
      }
    }
  } catch (e) { bad++; console.log(`FAIL seed ${seed}: ${e.message}`); }
  finally { Math.random = orig; }
}
assert.equal(bad, 0);
console.log('PASS: chaos sandbox');
