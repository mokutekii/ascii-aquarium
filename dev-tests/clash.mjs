// Run from the repo root: node dev-tests/clash.mjs
// A titans clash must bring the megalodon even while other announced events run, and the kraken grabs sharks one at a time.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const r = await build({ entryPoints: [fileURLToPath(new URL('../src/world.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
const { World } = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const lines = [];
for (const others of [[], ['meteor'], ['meteor', 'maelstrom', 'moon'], ['bloom', 'ufo']]) {
  for (let seed = 1; seed <= 4; seed++) {
    let st = seed * 6151 >>> 0; const orig = Math.random;
    Math.random = () => ((st = (Math.imul(1664525, st) + 1013904223) >>> 0) / 0x100000000);
    try {
      const specs = Array.from({ length: 6 }, (_, i) => ({ kind: i % 2 ? 'nurse' : 'classic', size: 0.7 + (i % 3) * 0.1 }));
      const w = new World(specs, 14); w.settings.events = 'off'; w.resize(1400, 800, 12, 17);
      for (const o of others) w.triggerEvent(o);
      w.triggerEvent('saga');
      let megaAt = -1, maxHeld = 0, jump = 0, prev = 0;
      for (let i = 0; i < 60 * 70; i++) {
        w.step(1 / 60);
        if (megaAt < 0 && w.sharks.some((s) => s.mega)) megaAt = w.time;
        const held = w.kraken ? w.kraken.grabbed.length : 0;
        jump = Math.max(jump, held - prev); prev = held; maxHeld = Math.max(maxHeld, held);
      }
      lines.push(`${others.join('+') || 'alone'} seed ${seed}: megaAt=${megaAt.toFixed(0)}s maxHeld=${maxHeld} biggestJump=${jump}`);
      assert.ok(megaAt >= 0, 'megalodon never arrived');
      assert.ok(jump <= 1, 'kraken grabbed several sharks at once');
    } catch (e) { lines.push(`FAIL ${others.join('+') || 'alone'} seed ${seed}: ${e.message}`); }
    finally { Math.random = orig; }
  }
}
console.log(lines.join('\n'));
assert.ok(!lines.some((l) => l.startsWith('FAIL')));
console.log('PASS: clash brings the megalodon; grabs are sequential');
