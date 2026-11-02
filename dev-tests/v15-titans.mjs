import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: 'export { World } from "./src/world"; export * from "./src/titans"; export * from "./src/mega-swim"; export * from "./src/hull-combat"; export * from "./src/handling";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, krakenUfoArmPose, stepKrakenArmPoses, megaWhipEnvelope, markTitanThrow, stepCraftCrashes, kickCraft } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

assert.ok(Math.abs(megaWhipEnvelope(0, 0)) === 0);
assert.ok(megaWhipEnvelope(.55, 0) < -.6, 'the body winds against the strike');
assert.ok(megaWhipEnvelope(.9, 0) > 1, 'the stored stroke releases quickly');
assert.equal(megaWhipEnvelope(2, 0), 0, 'the stroke settles');

const target = { x: 500, y: 400 };
const stub = { time: 10, kraken: { ufoTarget: target, ufoStrike: 9, ufoHeld: false }, ufo: target, ufos: [target], subs:[] };
stepKrakenArmPoses(stub);
for (let i = 0; i < 15; i++) { stub.time += .1; stepKrakenArmPoses(stub); }
const reached = krakenUfoArmPose(stub);
assert.ok(reached.extension > .9);
stub.kraken.ufoStrike = null;
stub.ufos = [];
stub.time += .1;
stepKrakenArmPoses(stub);
const retracting = krakenUfoArmPose(stub);
assert.ok(retracting.extension > .7 && retracting.extension < reached.extension, 'lost targets retract continuously');
assert.equal(retracting.x, 500, 'retraction retains the last contact position');
for (let i = 0; i < 15; i++) { stub.time += .1; stepKrakenArmPoses(stub); }
assert.equal(krakenUfoArmPose(stub), null);

const w = new World([{ kind: 'classic', size: .8 }], 24);
w.resize(1800, 1200, 13, 19); w.time = 100; w.sharks = [];
w.spawnMegalodon(0); w.spawnKraken(true, true);
const m = w.sharks.find(s => s.mega), k = w.kraken;
assert.ok(m && k);
Object.assign(k, { state: 'wrap', stateAt: w.time, until: Infinity, wrapping: m, maul: true, biteAt: w.time, coiled: true, lunging: false, nextShake: Infinity, wrapFor: 20, x: 800, y: 500, heading: .7, inkAt: w.time, landAt: w.time - 2 });
for (let i = 0; i < m.nodes.length; i += 2) { m.nodes[i] = 795 - i * 3; m.nodes[i + 1] = 500; }
m.heading = 0;
const heading = k.heading, x = k.x, y = k.y;
w.time += 1 / 60; w.stepKraken(1 / 60);
assert.ok(Math.abs(k.heading - heading) < .02, 'a landed bite does not rotate the victim into a fixture');
assert.ok(Math.hypot(k.x - x, k.y - y) < 14, 'contact begins at the actual impact point');

w.kraken = null; w.sharks = []; w.ufos = []; w.attackDrones = [];
w.spawnUfo(true);
const u = w.ufos[0]; assert.ok(u);
Object.assign(u, { x: 900, y: 500, state: 'seek', held: false });
w.attackDrones.push({ id: 1, x: 900, y: 500, hp: 3, stunned: 0, nextShot: Infinity }, { id: 2, x: 960, y: 500, hp: 3, stunned: 0, nextShot: Infinity });
markTitanThrow(w, u); kickCraft(w, u, 620, 0);
stepCraftCrashes(w);
assert.ok(w.attackDrones.every(d => d.hp <= 0), 'a thrown saucer breaks a nearby drone cluster');
assert.equal(u.hits, 4, 'the thrown saucer takes its own collision damage');
const hp = w.attackDrones.map(d => d.hp);
stepCraftCrashes(w);
assert.deepEqual(w.attackDrones.map(d => d.hp), hp, 'one throw creates only one cluster impact');
assert.equal(u.hits, 4, 'impact damage is not applied again on later frames');

w.ufos = []; w.attackDrones = [];
w.spawnSub('codex');
const commander = w.subs.at(-1);
Object.assign(commander, { x: 900, y: 500, hull: 1, arrival: undefined });
w.attackDrones.push({ id: 3, x: 900, y: 500, hp: 3, stunned: 0, nextShot: Infinity });
markTitanThrow(w, commander); kickCraft(w, commander, 620, 0);
stepCraftCrashes(w);
assert.ok(!w.subs.includes(commander), 'a critically damaged commander can die on a drone impact');
const wrecks = w.ufoBlasts.length;
stepCraftCrashes(w);
assert.equal(w.ufoBlasts.length, wrecks, 'a destroyed thrown commander creates its wreck once');
console.log('PASS: v1.5 weighted titan strokes, contact-based bites, continuous arms, and heavy throws');
