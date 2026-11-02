import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r = await build({ stdin: { contents: 'export * from "./src/world"; export * from "./src/shark-safety"; export * from "./src/provocation"; export * from "./src/kraken-reach";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, stepSharkSafety, stepProvocations, krakenFreeArm, krakenReachContact, krakenReachVisual, krakenReachPoses, stepKrakenReaches } = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
let seed = 1475; Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
function make() {
  const w = new World([{ kind: 'classic', size: .8 }], 4); w.resize(3000, 2100, 13, 19);
  w.settings.events = 'off'; w.time = 30; w.fish = []; w.sharks = [];
  w.spawnKraken(true); w.spawnMegalodon(); const k = w.kraken, m = w.sharks.find(s => s.mega);
  Object.assign(k, { x: 1300, y: 900, state: 'grab', stateAt: w.time, heading: 0, nextHunt: Infinity, megaSent: true });
  m.retreat = false; m.heading = Math.PI; m.megaHeading = Math.PI;
  moveHead(m, 2200, 900); return { w, k, m };
}
function moveHead(m, x, y) { const dx = x - m.nodes[0], dy = y - m.nodes[1]; for (let i = 0; i < m.nodes.length; i += 2) { m.nodes[i] += dx; m.nodes[i + 1] += dy; } }
// A wind-up must remain locomotion, even with prey behind or perpendicular.
// Compare equal simulated time rather than a fixed number of rendered frames.
const travellingCoils = [];
for (const hz of [15, 30, 60]) {
  for (const heading of [0, Math.PI / 2, Math.PI]) {
    const { w, k, m } = make();
    Object.assign(k, { heading, lastV: 85, state: 'wrap', stateAt: w.time,
      wrapping: m, lunging: true, coiled: false, pushAt: undefined });
    moveHead(m, 2900, 1800);
    let travelled = 0;
    for (let frame = 0; frame < hz * .8; frame++) {
      const x = k.x, y = k.y, h = k.heading, speed = k.lastV;
      w.time += 1 / hz; w.stepKraken(1 / hz);
      const dx = k.x - x, dy = k.y - y;
      travelled += Math.hypot(dx, dy);
      assert.ok(dx * Math.cos(h) + dy * Math.sin(h) > 20 / hz,
        'coil keeps forward travel instead of a parked turn or reverse launch');
      assert.ok(Math.abs(k.heading - h) <= .51 / hz, 'attack cannot snap the body heading');
      assert.ok(Math.abs(k.lastV - speed) <= 180 / hz + 1e-6, 'thrust changes gradually');
      assert.equal(k.lunging, true, 'a distant prey cannot be attached to finish the choreography');
    }
    travellingCoils.push({ hz, heading, travelled });
  }
}
for (const heading of [0, Math.PI / 2, Math.PI]) {
  const distances = travellingCoils.filter(p => p.heading === heading).map(p => p.travelled);
  assert.ok(Math.max(...distances) / Math.min(...distances) < 1.12, 'coil travel is consistent at 15/30/60 updates');
}
console.log('PASS: continuous moving wind-ups, bounded thrust and heading at 15/30/60 updates');
{
  const { w, k, m } = make();
  const dx = k.x + k.size * .2 - m.nodes[12], dy = k.y - m.nodes[13];
  moveHead(m, m.nodes[0] + dx, m.nodes[1] + dy);
  Object.assign(k, { heading: 0, state: 'wrap', stateAt: w.time, wrapping: m,
    lunging: true, coiled: false, pushAt: undefined });
  w.stepKraken(1 / 60);
  assert.equal(k.lunging, true, 'mantle proximity cannot force arms to grip through the body');
}
{
  const { w, k, m } = make();
  Object.assign(k, { heading: .7, state: 'wrap', stateAt: w.time,
    wrapping: m, lunging: false, coiled: true, maul: false,
    wrapFor: 100, nextShake: Infinity, shakeUntil: 0, winner: 'kraken' });
  const heading = k.heading;
  for (let frame = 0; frame < 60; frame++) { w.time += 1 / 60; w.stepKraken(1 / 60); }
  assert.equal(k.heading, heading, 'gripping arms conform without rotating the body to a preset pose');
}
{
  const { w, k, m } = make(); Object.assign(k, { state: 'wrap', stateAt: w.time - 8, wrapping: m, lunging: true, coiled: false, maul: false });
  moveHead(m, 2700, 1600); w.stepKraken(1 / 60);
  assert.equal(k.wrapping, null, 'a missed lunge never becomes a remote wrap');
  assert.equal(k.state, 'flee');
}
{
  const { w, k, m } = make(); Object.assign(k, { state: 'wrap', stateAt: w.time, wrapping: m, lunging: false, coiled: true, maul: true, biteAt: undefined, wrapFor: 10, winner: 'mega', nextShake: Infinity });
  moveHead(m, k.x + k.size * 1.1, k.y); w.stepKraken(1 / 60);
  assert.equal(k.biteAt, undefined, 'maul waits for actual jaw contact');
  moveHead(m, k.x + k.size * .025, k.y); w.time += 1 / 60; w.stepKraken(1 / 60);
  assert.equal(k.biteAt, w.time, 'the bite lands when the jaws arrive');
  assert.equal(m.chompAt, w.time, 'jaw contact triggers the chomp and recoil animation');
  assert.equal(k.wrapping, m);
}
{
  const { w, k, m } = make(); Object.assign(k, { state: 'flee', stateAt: w.time - 1, inkEscape: false, inkShown: false });
  moveHead(m, k.x + k.size * 1.2, k.y); w.stepKraken(1 / 60);
  assert.ok(m.chaseUntil > w.time && m.pounceUntil > w.time, 'Megalodon commits to chasing an exposed fleeing Kraken');
  moveHead(m, k.x + k.size * .5, k.y); w.time += 1 / 60; w.stepKraken(1 / 60);
  assert.equal(k.state, 'wrap'); assert.equal(k.maul, true, 'a chase can reconnect as a maul');
}
{
  const { w, k, m } = make(); m.retreat = true;
  k.heading = Math.PI;
  moveHead(m, k.x + k.size * 1.3, k.y);
  k.harpoon = { target: m, at: w.time };
  let pulled = false;
  for (let frame = 0; frame < 180 && k.harpoon; frame++) {
    const old = [...m.nodes];
    const hooked = k.harpoon.hookedAt;
    w.time += 1 / 60; w.stepKraken(1 / 60);
    const dx = m.nodes[0] - old[0], dy = m.nodes[1] - old[1];
    if (hooked === undefined) assert.ok(Math.hypot(dx, dy) < .001, 'harpoon cannot pull before visible contact');
    if (Math.hypot(dx, dy) > .01) pulled = true;
    assert.ok(Math.hypot(dx, dy) < 12, 'the pull takes up tension gradually');
    for (let i = 2; i < old.length; i += 2)
      assert.ok(Math.abs((m.nodes[i] - old[i]) - dx) < .001 && Math.abs((m.nodes[i + 1] - old[i + 1]) - dy) < .001,
        'the harpoon carries the whole spine without stretching');
  }
  assert.ok(pulled, 'a harpoon that physically reaches the head hauls Megalodon back');
}
for (const maul of [false, true]) {
  const { w, k, m } = make(); w.resize(12000, 4000, 13, 19);
  assert.ok(w.sharks.includes(m) && w.kraken === k, "resizing an empty-fish tank preserves the clash");
  m.heading = 0; m.megaHeading = 0; m.speed = 12;
  for (let i = 0; i < m.nodes.length / 2; i++) { m.nodes[i * 2] = 3000 - i * m.length / (m.nodes.length / 2 - 1); m.nodes[i * 2 + 1] = 2000; }
  Object.assign(k, { x: m.nodes[8], y: 2000, state: 'wrap', stateAt: w.time, wrapping: m, lunging: false, coiled: true, maul, biteAt: maul ? w.time : undefined, wrapFor: 1000 });
  let rotation = 0, previous = m.heading;
  for (let i = 0; i < 2400; i++) {
    w.time += 1 / 60; k.x = m.nodes[maul ? 0 : 8]; k.y = m.nodes[maul ? 1 : 9]; w.stepSharks(1 / 60);
    rotation += Math.abs(m.heading - previous); previous = m.heading;
    assert.ok(m.nodes[0] > 0 && m.nodes[0] < w.width && m.nodes[1] > 0 && m.nodes[1] < w.height, 'attached struggle stays in frame');
  }
  assert.ok(rotation < .1, 'an attached Kraken never becomes a steering target on the Megalodon own body');
  assert.ok(m.thrash > 0, 'the body still thrashes without rotating its travel course');
}
{
  const { w, k, m } = make(); w.spawnRandomShark(); const small = w.sharks.find(s => !s.mega);
  moveHead(small, m.nodes[0] + 5, m.nodes[1]);
  const old = [...m.nodes]; stepSharkSafety(w, 1 / 60); stepProvocations(w, 1 / 60);
  assert.deepEqual([...m.nodes], old, 'ordinary sharks cannot translate the Megalodon');
  assert.notEqual(w.provocations.get(m)?.target, small, 'brushing a small shark does not hijack a titan clash');
}
console.log('PASS: missed-lunge disengagement, physical jaw contact, escape pursuit, chase reattachment and whole-body harpoon recovery, stable attached courses, shark mass priority and resize continuity');

{
  const { w, k, m } = make();
  Object.assign(k, { state: 'wrap', stateAt: w.time - 4, wrapping: m, lunging: false, coiled: true, maul: true, biteAt: undefined, wrapFor: 1, winner: 'mega', fatal: true, nextShake: Infinity });
  moveHead(m, k.x + k.size, k.y);
  w.stepKraken(1 / 60);
  assert.equal(w.kraken, k, 'expired fight timer cannot kill before jaw contact');
}

// Exercise both moving animals together: the previous attached-only test hid pursuit loops.
for (const offset of [-300, 0, 300]) {
  const { w, k, m } = make();
  m.heading = 0; m.megaHeading = 0; m.speed = 55;
  for (let i = 0; i < m.nodes.length / 2; i++) {
    m.nodes[i * 2] = 1600 - i * m.length / (m.nodes.length / 2 - 1);
    m.nodes[i * 2 + 1] = 1050;
  }
  Object.assign(k, { x: 1100, y: 1050 + offset, heading: Math.PI,
    state: 'wrap', stateAt: w.time, wrapping: m, lunging: true,
    coiled: false, maul: false, pushAt: undefined, wrapFor: 100, nextShake: Infinity });
  let landed = false;
  for (let frame = 0; frame < 420; frame++) {
    w.time += 1 / 60;
    w.stepSharks(1 / 60);
    w.stepKraken(1 / 60);
    if (k.state === 'wrap' && !k.lunging) { landed = true; break; }
  }
  assert.ok(landed, `Kraken intercepts a swimming Megalodon at offset ${offset}`);
}
console.log('PASS: coupled moving Kraken interceptions at three approach offsets');

{
  const { w, k, m } = make();
  m.heading = 0; m.megaHeading = 0; m.speed = 125;
  for (let i = 0; i < m.nodes.length / 2; i++) {
    m.nodes[i * 2] = 1100 - i * m.length / (m.nodes.length / 2 - 1);
    m.nodes[i * 2 + 1] = 1050;
  }
  Object.assign(k, { x: 1300, y: 1050, heading: 0, state: 'wrap', stateAt: w.time,
    wrapping: m, lunging: false, coiled: true, maul: true, biteAt: undefined,
    wrapFor: 100, nextShake: Infinity, winner: 'mega' });
  let contactFrames = 0;
  for (let frame = 0; frame < 600; frame++) {
    w.time += 1 / 60; w.stepSharks(1 / 60); w.stepKraken(1 / 60);
    if (k.biteAt !== undefined) {
      contactFrames++;
      assert.ok(Math.hypot(k.x - m.nodes[0], k.y - m.nodes[1]) < k.size * .05,
        'closed jaws retain contact while both animals move');
    }
  }
  assert.ok(contactFrames > 60, 'moving pursuit reaches and maintains a bite');
}
console.log('PASS: moving pursuit closes and holds its bite');

{
  const { w, k, m } = make();
  m.speed = 40; m.pounceUntil = w.time + 30;
  let rotation = 0;
  for (let frame = 0; frame < 600; frame++) {
    const speed = m.speed, heading = m.heading, phase = m.phase;
    w.time += 1 / 60; w.stepSharks(1 / 60);
    rotation += Math.abs(m.heading - heading);
    assert.ok(m.speed - speed <= 40 / 60 + 1e-6, 'mass limits acceleration during a pounce');
    assert.ok(Math.abs(m.heading - heading) <= (.48 * 2.4) / 60 + 1e-6, 'mass limits angular speed');
    assert.ok(m.phase - phase <= 12 / 60 + 1e-6, 'stroke cadence remains bounded under pursuit (v1.5: tail beat now follows speed)');
    assert.ok(m.speed <= 270, 'pounce cannot bypass swim speed limit');
  }
  assert.ok(rotation < Math.PI * 2, 'ten seconds of pursuit cannot become a full spin');
}
console.log('PASS: massive shark acceleration, turn rate, tail cadence and pursuit rotation limits');

{
 const {w,k,m}=make();m.heading=Math.PI;m.megaHeading=Math.PI;m.speed=40;
 const before=Math.hypot(k.x-m.nodes[0],k.y-m.nodes[1]), point={x:k.x,y:k.y};
 for(let frame=0;frame<600;frame++){w.time+=1/60;w.stepSharks(1/60);}
 assert.deepEqual({x:k.x,y:k.y},point,'Megalodon pursuit never moves Kraken to assist the hunter');
 assert.ok(Math.hypot(k.x-m.nodes[0],k.y-m.nodes[1])<before*.6,'the hunter itself closes most of the gap');
 assert.ok(m.speed<=190,'the slower pursuit remains within its swim-speed ceiling');
}
console.log('PASS: active Megalodon pursuit without moving the prey');

{
  const { w, k, m } = make();
  Object.assign(k, { state: 'wrap', wrapping: m, lunging: true, coiled: false });
  const start = m.nodes[0];
  for (let i = 0; i < 30; i++) {
    w.time += 1 / 60;
    w.stepSharks(1 / 60);
    assert.equal(m.clashCourse, undefined, 'selecting a target does not freeze Megalodon on a grapple course');
  }
  assert.ok(Math.abs(m.nodes[0] - start) > 10, 'Megalodon swims during the wind-up');
}

for (const hz of [15, 30, 60]) {
  const { w, k, m } = make();
  w.resize(8000, 5000, 13, 19);
  Object.assign(k, { x: 4000, y: 2500, heading: .35, state: 'wrap', stateAt: w.time,
    wrapping: m, maul: true, biteAt: undefined, lunging: false, coiled: true, wrapFor: 100,
    nextShake: Infinity, until: Infinity });
  m.heading = .65; m.megaHeading = .65; m.speed = 125;
  const hx = k.x - 500, hy = k.y - 140;
  for (let i = 0; i < m.nodes.length / 2; i++) {
    m.nodes[i * 2] = hx - Math.cos(m.heading) * i * m.length / 19;
    m.nodes[i * 2 + 1] = hy - Math.sin(m.heading) * i * m.length / 19;
  }
  let turns = 0, hunterTurns = 0, bitten = 0, minJet = Infinity, maxJet = 0;
  for (let frame = 0; frame < hz * 12; frame++) {
    const x = k.x, y = k.y, heading = k.heading, mh = m.heading, held = k.biteAt !== undefined;
    w.time += 1 / hz;
    w.stepKraken(1 / hz); w.stepSharks(1 / hz);
    turns += Math.abs(k.heading - heading); hunterTurns += Math.abs(m.heading - mh);
    if (!held && k.biteAt === undefined) {
      const dx = k.x - x, dy = k.y - y;
      assert.ok(dx * Math.cos(heading) + dy * Math.sin(heading) > 20 / hz, 'pursued Kraken keeps swimming');
      assert.ok(Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading)) < .01, 'turning adds no sideways pivot translation');
    }
    if (k.biteAt !== undefined) {
      bitten++;
      minJet = Math.min(minJet, k.jet); maxJet = Math.max(maxJet, k.jet);
    }
  }
  assert.ok(bitten > hz, 'the hunter adapts its approach and reaches the moving victim');
  assert.ok(turns < .05, 'a chase and clamp cannot rotate the victim into the hunter');
  assert.ok(hunterTurns < Math.PI, 'Megalodon intercepts without circling the victim');
  assert.ok(maxJet - minJet > .05, 'swim strokes continue under the grip');
}
console.log('PASS: continuous independent swimming and bounded titan interception at 15/30/60 Hz');

for (const heading of [0, Math.PI / 2, Math.PI]) {
  const { w, k } = make(); w.sharks = [];
  Object.assign(k, { heading, size: 500, phase: .4, x: 1500, y: 1000 });
  const eyeRadius = k.size * .062 * (1 + .04 * Math.sin(k.phase * 1.1));
  const eyeX = k.x - Math.cos(k.heading) * k.size * .01;
  const eyeY = k.y - Math.sin(k.heading) * k.size * .01;
  for (let arm = 0; arm < 10; arm++) {
    const free = krakenFreeArm(k, arm, w.time, w.krakenRage());
    assert.ok(Math.hypot(free.root.x - eyeX, free.root.y - eyeY) > eyeRadius, 'all ten arm roots lie outside the eye');
  }
  const target = { x: k.x - Math.cos(heading) * 420, y: k.y - Math.sin(heading) * 420,
    alive: true, diver: true, vx: 0, vy: 0 };
  w.fish = [target];
  krakenReachContact(w, k, target, w.time, .4);
  const pose = krakenReachVisual(k, target);
  const resting = krakenFreeArm(k, pose.arm, w.time, w.krakenRage());
  assert.deepEqual(pose.points, resting.points, 'a reach starts at the existing limb curve');
  let contact = false;
  for (let i = 0; i < 150; i++) {
    const old = [...pose.points];
    w.time += 1 / 60;
    contact ||= krakenReachContact(w, k, target, 30, .4);
    if (contact) break;
    for (let n = 0; n < old.length; n += 2)
      assert.ok(Math.hypot(pose.points[n] - old[n], pose.points[n + 1] - old[n + 1]) <= pose.speed / 60 + .001,
        'every part of the arm has bounded travel');
  }
  assert.ok(contact, 'the visible tip can reach nearby prey');
  const before = [...pose.points];
  krakenReachContact(w, k, target, w.time, .4);
  assert.deepEqual(pose.points, before, 'a renewed strike cannot reset an extended arm to its root');
  for (let i = 0; i < 240 && krakenReachPoses(k).length; i++) {
    const old = [...pose.points];
    w.time += 1 / 60; stepKrakenReaches(w);
    for (let n = 0; n < old.length; n += 2)
      assert.ok(Math.hypot(pose.points[n] - old[n], pose.points[n + 1] - old[n + 1]) <= pose.speed / 60 + .001,
        'a released limb retracts without disappearing');
  }
  assert.equal(krakenReachPoses(k).length, 0, 'resting limbs become available again');
}
console.log('PASS: roots outside the eye, existing-limb reaches and continuous release');

for (const challenger of ['kraken', 'mega']) {
  const tilt = rechallenger => {
    const { w, k, m } = make();
    Object.assign(k, { state: 'wrap', stateAt: w.time, wrapping: m, lunging: false, coiled: true,
      maul: false, rechallenger, tilt: 0, wrapFor: 100, nextShake: Infinity });
    w.krakenRage = () => challenger === 'kraken' ? 1 : 0;
    w.megaRage = () => challenger === 'mega' ? 1 : 0;
    w.time += 1 / 60; w.stepKraken(1 / 60);
    return Math.abs(k.tilt);
  };
  assert.ok(Math.abs(tilt(challenger) / tilt(undefined) - .75) < 1e-8,
    'the returning challenger retains its 25 percent struggle penalty');
}
