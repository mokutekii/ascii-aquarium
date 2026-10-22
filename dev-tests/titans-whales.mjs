// Run from the repo root: node dev-tests/titans-whales.mjs
// Two whales in the water while the titans arrive: nothing may break, and the titans must pick targets sensibly.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const r = await build({ entryPoints: [fileURLToPath(new URL('../src/world.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
const { World } = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const out = [];
for (const kinds of [['saga'], ['mega'], ['kraken'], ['kraken', 'mega'], ['migration', 'saga']]) {
  for (let seed = 1; seed <= 6; seed++) {
    let st = seed * 7919 >>> 0; const orig = Math.random;
    Math.random = () => ((st = (Math.imul(1664525, st) + 1013904223) >>> 0) / 0x100000000);
    try {
      const w = new World([{ kind: 'classic', size: 0.8 }, { kind: 'nurse', size: 0.7 }, { kind: 'classic', size: 0.9 }], 14);
      w.settings.events = 'off'; w.resize(1400, 800, 12, 17);
      w.triggerEvent('whale'); w.triggerEvent('whale');
      let fights = 0, grabs = 0, maxWhales = 0;
      for (const k of kinds) w.triggerEvent(k);
      for (let i = 0; i < 60 * 90; i++) {
        w.step(1 / 60);
        if (w.whaleFight) fights++;
        if (w.kraken?.whaleTarget && w.kraken.whaleUntil > w.time) grabs++;
        maxWhales = Math.max(maxWhales, w.whales.length);
        for (const wh of w.whales) assert.ok(Number.isFinite(wh.x + wh.y), 'whale position');
        if (w.kraken) assert.ok(Number.isFinite(w.kraken.x + w.kraken.y), 'kraken position');
        for (const s of w.sharks) for (const n of s.nodes) assert.ok(Number.isFinite(n), 'shark spine');
        if (w.whaleFight) assert.ok(w.whales.includes(w.whaleFight.whale), 'fight whale is a live whale');
        if (w.kraken?.whaleTarget) assert.ok(w.whales.includes(w.kraken.whaleTarget) || w.kraken.whaleUntil <= w.time, 'kraken holds a live whale');
      }
      out.push(`${kinds.join('+')} seed ${seed}: whales<=${maxWhales} fightFrames=${fights} krakenGrabFrames=${grabs} left=${w.whales.length}`);
    } catch (e) { out.push(`FAIL ${kinds.join('+')} seed ${seed}: ${e.message}`); }
    finally { Math.random = orig; }
  }
}
console.log(out.join('\n'));
assert.ok(!out.some((l) => l.startsWith('FAIL')), 'titans + two whales regressions');
console.log('PASS: titans with two whales');
