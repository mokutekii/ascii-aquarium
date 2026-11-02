import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r = await build({ stdin: { contents: 'export { World } from "./src/world"; export { stepUfoBlink } from "./src/ufo-blink";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, stepUfoBlink } = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const run = (hits, seconds, shoot) => {
  const w = new World([{ kind: 'classic', size: .8 }], 24); w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; w.fish = [];
  w.spawnUfo(); const u = w.ufos[0]; Object.assign(u, { state: 'seek', enterAt: 0, x: 900, y: 400, hy: 400, hits });
  let active = 0, present = 0, hops = 0, last = [u.x, u.y], far = 0;
  const dt = 1 / 30;
  for (let i = 0; i < seconds * 30; i++) {
    w.time += dt; present++; u.hits = hits; if (u.state !== 'seek') u.state = 'seek';
    if (shoot && i % 120 === 0) w.encounterShots.push({ x0: 0, y0: 0, x1: u.x, y1: u.y, born: w.time, fireAt: w.time + 1.1, hostile: true, resolved: false, target: u, damage: 1 });
    stepUfoBlink(w, u, dt);
    if (u.blink?.until > w.time) active++;
    const moved = Math.hypot(u.x - last[0], u.y - last[1]);
    if (moved > 70) hops++;
    if (moved > 400) far++;
    last = [u.x, u.y];
  }
  return { share: active / present, hops, far, u };
};
const healthy = run(2, 90, true);
assert.equal(healthy.hops, 0, 'a healthy saucer never phases');
const hurt = run(6, 240, false);
assert.ok(hurt.share > .03, `a damaged saucer phases now and then (${hurt.share})`);
assert.ok(hurt.share < .25, `but under a quarter of the time (${hurt.share})`);
assert.ok(hurt.hops > 4, 'phasing moves in short hops');
const hunted = run(6, 120, true);
assert.ok(hunted.share < .25, `phasing stays under a quarter even under fire (${hunted.share})`);
assert.ok(hunted.u.blink.ghosts.length <= 14);
console.log('PASS: damaged saucers phase erratically under a quarter of the time and leave afterimages');
