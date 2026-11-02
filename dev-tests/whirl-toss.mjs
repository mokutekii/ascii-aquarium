import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ stdin: { contents: 'export { World } from "./src/world";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const make = () => { const w = new World([{ kind: 'classic', size: .8 }], 24); w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.fish = []; w.whales = []; return w; };
const dt = 1 / 30;
{
  // A shark is carried around the funnel and thrown out, not left at the core.
  const w = make(); w.time = 10;
  const wp = { x: 900, y: 600, r: 150, born: 0, until: 60, dir: 1, rippleAt: 10, spin: 1, suction: 1 };
  w.whirlpools = [wp];
  const sh = w.sharks[0]; sh.mega = false;
  const move = (x, y) => { const dx = x - sh.nodes[0], dy = y - sh.nodes[1]; for (let n = 0; n < sh.nodes.length / 2; n++) { sh.nodes[n * 2] += dx; sh.nodes[n * 2 + 1] += dy; } };
  move(900 + 200, 600); sh.heading = Math.PI; sh.speed = 40; sh.target = null;
  let turned = 0, last = Math.atan2(sh.nodes[1] - 600, sh.nodes[0] - 900), flung = false, minD = Infinity;
  for (let i = 0; i < 30 * 12; i++) {
    w.time += dt; w.stepCritters(dt);
    const a = Math.atan2(sh.nodes[1] - 600, sh.nodes[0] - 900);
    turned += Math.abs(Math.atan2(Math.sin(a - last), Math.cos(a - last))); last = a;
    minD = Math.min(minD, Math.hypot(sh.nodes[0] - 900, sh.nodes[1] - 600));
    if (w.time < (sh.nextFling ?? 0)) flung = true;
  }
  assert.ok(flung, 'a shark that rides the funnel is flung out');
  assert.ok(turned > Math.PI, 'it is spun around before being thrown');
  assert.ok(minD > 1, 'finite path');
  const d = Math.hypot(sh.nodes[0] - 900, sh.nodes[1] - 600);
  assert.ok(d > wp.r * 1.3 || w.time < (sh.nextFling ?? 0) + 6, 'it does not stay stuck at the core');
}
{
  // Craft inside the funnel lose one hit point per second.
  const w = make(); w.time = 10;
  const wp = { x: 900, y: 600, r: 150, born: 0, until: 60, dir: 1, rippleAt: 10, spin: 1, suction: 1 };
  w.whirlpools = [wp];
  w.sharks = [];
  w.spawnSub(); const sb = w.subs[0]; Object.assign(sb, { x: 900, y: 600, hull: 8 });
  const start = sb.hull;
  for (let i = 0; i < 30 * 3; i++) { w.time += dt; Object.assign(sb, { x: 900, y: 600 }); w.stepCritters(dt); }
  assert.ok(start - sb.hull >= 2 && start - sb.hull <= 4, `sub lost ${start - sb.hull} hull in 3 seconds`);
}
console.log('PASS: whirlpools spin sharks around and throw them out, and damage craft one point per second');
