import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
const result = await build({
  stdin: { contents: 'export { World } from "./src/world"; export * from "./src/tractor"; export * from "./src/ufo-blink"; export * from "./src/handling"; export * from "./src/lines"; export * from "./src/sandevistan";', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false
});
const { World, titanBlocksBeam, stepUfoBlink, kickCraft, hasLines, flavor, isBoss, oneLine } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
let seed = 31; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const make = () => { const w = new World([{ kind: 'classic', size: .8 }], 20); w.resize(2400, 1600, 13, 19); w.settings.events = 'off'; w.sharks = []; w.time = 100; return w; };

// 1. A titan in the column blocks the tractor beam.
{
  const w = make(); w.spawnUfo(); const u = w.ufos[0];
  Object.assign(u, { x: 1000, y: 200, hy: 200, beamX: 1000, state: 'beam', aim: { x: 1000, y: 900 } });
  assert.equal(titanBlocksBeam(w, u), false, 'clear water does not block');
  w.spawnKraken(true); Object.assign(w.kraken, { x: 1010, y: 700, heading: 0 });
  assert.equal(titanBlocksBeam(w, u), true, 'a kraken in the column blocks the beam');
  w.kraken = null;
  w.spawnMegalodon(0); const m = w.sharks.find(s => s.mega);
  for (let i = 0; i < m.nodes.length; i += 2) { m.nodes[i] = 1000 + i * 3; m.nodes[i + 1] = 800; }
  assert.equal(titanBlocksBeam(w, u), true, 'a megalodon in the column blocks the beam');
}

// 2. A saucer being dragged or flung leaves no afterimage; one flying on its own power still does.
{
  const w = make(); w.spawnUfo(); const u = w.ufos[0];
  u.state = 'seek'; u.attitude = { vx: 400, vy: 0, bank: 0 }; u.blink = { until: 0, readyAt: 99999, nextHop: 0, ghosts: [] };
  stepUfoBlink(w, u, 1 / 60); assert.ok(u.blink.ghosts.length > 0, 'self-powered speed leaves a trail');
  u.blink.ghosts.length = 0; u.blink.trailAt = -1;
  kickCraft(w, u, 600, 0);
  stepUfoBlink(w, u, 1 / 60); assert.equal(u.blink.ghosts.length, 0, 'a flung or dragged saucer leaves none');
}

// 3. The elite buff has no expiry.
{
  const w = make(); const f = w.fish[0]; Object.assign(f, { diver: true, alive: true, x: 500, y: 500 });
  w.drives.push({ x: 500, y: 500, born: w.time });
  for (let i = 0; i < 5; i++) { w.time += 1 / 30; w.step(1 / 30); }
  assert.ok(f.sande, 'the drive is plugged in'); assert.equal(f.sande.until, Infinity);
  w.time += 100000; assert.ok(f.sande.until > w.time, 'it never burns out');
}

// 4. Every fixed notice in the source has alternative tellings, and boss lines stay one sentence.
{
  const text = fs.readdirSync('src').filter(f => f.endsWith('.ts')).map(f => fs.readFileSync('src/' + f, 'utf8')).join('\n');
  const notices = [...text.matchAll(/notices\.push\("([^"]+)"\)/g)].map(m => m[1]);
  const exempt = new Set(['Congratulations...', 'Disgusting...']);
  const missing = [...new Set(notices)].filter(n => !hasLines(n) && !exempt.has(n));
  assert.deepEqual(missing, [], 'notices without variants: ' + missing.join(' | '));
  for (const key of ['the kraken has awoken!', 'the megalodon has awoken!', 'the megalodon is hunting', 'the kraken has seized the commander']) {
    const line = flavor(key); assert.ok(isBoss(line), 'titan lines take the boss style'); assert.equal(oneLine(line), line);
  }
}
console.log('PASS: titan-blocked beams, no drag afterimages, permanent elite buff and complete toast coverage');
