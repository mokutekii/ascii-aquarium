import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/lines.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { flavor, isBoss, isGhost, isClash, GHOST_ARRIVE, GHOST_LINES, oneLine } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const random = Math.random;
// Even an unhelpful random source cannot cause repeated lines before a deck is used.
Math.random = () => 0;
try {
  for (const [key, count, classify] of [
    [GHOST_ARRIVE[0], 10, isGhost],
    ['the kraken has awoken!', 8, isBoss],
    ['the megalodon has awoken!', 8, isBoss],
    ['the kraken rises... and something vast comes for it!!!', 6, isClash],
  ]) {
    let last;
    for (let round = 0; round < 3; round++) {
      const seen = new Set();
      for (let i = 0; i < count; i++) {
        const line = flavor(key);
        assert.ok(!seen.has(line), 'every line appears before repeating');
        assert.notEqual(line, last, 'no repeat across deck boundaries');
        assert.ok(classify(line), 'each variation retains its titan styling');
        assert.equal(oneLine(line), line, 'the toast cannot truncate the quip');
        seen.add(line); last = line;
      }
    }
  }
  for (const line of Object.values(GHOST_LINES)) assert.equal(isGhost(line), false);
} finally { Math.random = random; }
console.log('PASS: ghost/kraken/megalodon/clash variation, complete rotations, no adjacent repeats, styling and one-line wording');
