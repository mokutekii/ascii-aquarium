import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r = await build({ stdin: { contents: 'export { World } from "./src/world"; export { stepSandevistans, isSande } from "./src/sandevistan";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, stepSandevistans, isSande } = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const make = () => { const w = new World([{ kind: 'classic', size: .8 }], 24); w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; w.fish = []; w.time = 30; return w; };
const used = new Set();
{
  const w=make();w.drives=[{x:500,y:500,born:w.time}];w.time+=14;
  stepSandevistans(w,0);assert.equal(w.drives.length,1,'uncollected drive remains through 14 seconds');
  w.time+=2;stepSandevistans(w,0);assert.equal(w.drives.length,0,'uncollected drive expires after 15 seconds');
}
const diver = (w, x, y) => { w.spawnDivers(true); for (let i = 0; i < 150; i++) { w.time += 1 / 30; w.step(1 / 30); } const f = w.fish.find(o => o.diver && o.alive && !used.has(o)); used.add(f); Object.assign(f, { x, y, docked: false, riding: false, vx: 0, vy: 0, alienArmor: false }); return f; };
{
  // Only a saucer that has phased drops a drive.
  const w = make(); w.spawnUfo(); const plain = w.ufos[0]; w.destroyUfo('shot', plain);
  assert.equal(w.drives.length, 0, 'an undamaged saucer leaves no drive');
  w.spawnUfo(); const elite = w.ufos[0]; elite.blink = { until: 0, readyAt: 0, nextHop: 0, ghosts: [], phased: true }; Object.assign(elite, { x: 500, y: 500 });
  const roll = Math.random; Math.random = () => 0;
  w.destroyUfo('shot', elite);
  Math.random = roll;
  assert.equal(w.drives.length, 1, 'a phasing saucer drops a drive');
}
{
  // A diver that reaches it plugs in; at most two can run drives.
  const w = make();
  const f = diver(w, 900, 600); w.drives.push({ x: f.x, y: f.y, born: w.time });
  stepSandevistans(w, 1 / 30);
  assert.ok(isSande(f, w.time), 'the nearest diver plugs in');
  assert.equal(w.drives.length, 0, 'the drive is consumed');
}
{
  // Reflex: a blast that would kill is dodged once, then the drive recharges. A grab is shaken off.
  const w = make(); const f = diver(w, 900, 600);
  f.sande = { until: w.time + 100, burstUntil: 0, nextHop: 0, readyAt: w.time + 99, dodgeReady: 0, ghosts: [] };
  const x = f.x, y = f.y;
  w.popDiver(f, 'blast');
  assert.ok(f.alive, 'the first lethal event is dodged');
  assert.ok(Math.hypot(f.x - x, f.y - y) > 35, 'it jumps clear');
  w.popDiver(f, 'blast');
  assert.ok(!f.alive, 'the reflex has to recharge');
  const g = diver(w, 900, 600), h = diver(w, 900, 600);
  for (const o of [g, h]) if (!w.fish.includes(o)) w.fish.push(o);
  Object.assign(g, { x: 900, y: 600, docked: false, riding: false, alive: true, held: undefined, seized: undefined }); Object.assign(h, { x: 400, y: 300, docked: false, riding: false });
  g.sande = { until: w.time + 100, burstUntil: 0, nextHop: 0, readyAt: w.time + 99, dodgeReady: 0, ghosts: [] };
  const shark = { dragging: g, nodes: new Array(40).fill(0), speed: 0, mega: false };
  g.dragger = shark; w.sharks = [shark];
  stepSandevistans(w, 1 / 30);
  assert.ok(!g.dragger && !shark.dragging, 'it slips out of a grab ' + JSON.stringify({ alive: g.alive, docked: g.docked, riding: g.riding, sande: !!g.sande, until: g.sande?.until, time: w.time }));
  h.sande = { until: w.time + 100, burstUntil: 0, nextHop: 0, readyAt: w.time, dodgeReady: 0, ghosts: [] };
  let active = 0, n = 30 * 120;
  for (let i = 0; i < n; i++) { w.time += 1 / 30; stepSandevistans(w, 1 / 30); if (h.sande?.burstUntil > w.time) active++; }
  assert.ok(active / n < .3 && active / n > .05, `idle bursts stay occasional (${active / n})`);
}
console.log('PASS: sandevistan drives drop from phasing saucers and give divers time-bending evasion');
