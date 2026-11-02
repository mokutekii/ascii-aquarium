import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// The GUIDE key table must match the real key map in aquarium.ts, so the docs cannot drift from the controls.
const src = readFileSync('aquarium.ts', 'utf8');
const block = src.slice(src.indexOf('const keyEvents'), src.indexOf('};', src.indexOf('const keyEvents')));
const keys = new Map([...block.matchAll(/\b([a-z]): \['([a-z]+)'/g)].map(m => [m[1].toUpperCase(), m[2]]));
const guide = new Map([...readFileSync('GUIDE.md', 'utf8').matchAll(/^\| ([A-Z]) \| (.+) \|$/gm)].map(m => [m[1], m[2]]));
const words = { invasion: 'invasion', mothership: 'mothership', current: 'living light', kraken: 'kraken', mega: 'megalodon', saga: 'clash', chase: 'chasing', bait: 'bait ball', jelly: 'jellyfish', smite: 'lightning strike', storm: 'thunderstorm', whale: 'whale', whirl: 'whirlpool', night: 'nightfall', fight: 'duel', moon: 'blood moon', maelstrom: 'maelstrom', bloom: 'bloom', migration: 'migration', meteor: 'meteor', ufo: 'ufo', diver: 'divers', yeat: 'yeat', leviathan: 'leviathan', sub: 'submarine', shark: 'shark' };
for (const [key, kind] of keys) {
  const row = guide.get(key);
  assert.ok(row, `GUIDE.md has no row for ${key} (${kind})`);
  assert.ok(row.toLowerCase().includes(words[kind] ?? kind), `GUIDE.md row for ${key} should describe ${kind}: ${row}`);
}
for (const key of guide.keys()) if (key !== 'H') assert.ok(keys.has(key), `GUIDE.md lists ${key}, which is not a key in aquarium.ts`);
console.log('PASS: GUIDE key table matches the key map');
