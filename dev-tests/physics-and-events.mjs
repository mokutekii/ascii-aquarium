import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: [
  'export { World, SHARK_NODES } from "./src/world";',
  'export { OceanEngine } from "./src/engine";',
  'export * from "./src/handling";',
  'export * from "./src/collisions";',
  'export * from "./src/collision-bodies";',
  'export * from "./src/hull-combat";',
  'export * from "./src/rim-wave";',
  'export * from "./src/drones";',
  'export * from "./src/drone-arm";',
  'export * from "./src/fight-progress";',
  'export * from "./src/encounters";',
  'export * from "./src/encounters-draw";',
  'export * from "./src/mothership-behavior";',
  'export * from "./src/mothership-fx";',
  'export * from "./src/combat";',
  'export * from "./src/provocation";',
].join('\n'), resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const { World, SHARK_NODES, OceanEngine, holdCraftAt, stepHandling, separateTraffic, bodyPoints,
  bodiesOverlap, stepSharkCraftContacts, stepCraftCrashes, pushRim, stepRimMotion, kickCraft } = api;
let seed = 1475;
const random = Math.random;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const make = (width = 3000, height = 2100) => {
  const w = new World([{ kind: 'classic', size: .8 }], 8);
  w.resize(width, height, 13, 19); w.settings.events = 'off'; w.time = 10;
  w.sharks = []; w.notices = [];
  return w;
};
const shark = (w, kind = 'classic', x = 1200, y = 900, heading = 0) => {
  const before = new Set(w.sharks);
  w.spawnRandomShark(); const sh = w.sharks.find(s => !before.has(s));
  Object.assign(sh, { kind, length: 260, heading, grabbed: false, lifted: false });
  for (let i = 0; i < SHARK_NODES; i++) {
    sh.nodes[i * 2] = x - Math.cos(heading) * sh.length * i / (SHARK_NODES - 1);
    sh.nodes[i * 2 + 1] = y - Math.sin(heading) * sh.length * i / (SHARK_NODES - 1);
  }
  return sh;
};
const ufo = (w, x = 1400, y = 900) => {
  w.spawnUfo(); const u = w.ufos.at(-1);
  Object.assign(u, { x, y, hy: y, tx: x, state: 'seek', hijackChecked: true });
  return u;
};
try {
  for (const heading of [0, Math.PI / 2, Math.PI]) {
    const w = make(), a = shark(w, 'classic', 1200, 900), b = shark(w, 'classic', 1200, 900, heading);
    w.separateSharks(1 / 60);
    assert.ok(!bodiesOverlap(bodyPoints(w, a), bodyPoints(w, b)), `stacked/crossed heading=${heading} heads=${a.nodes[0]},${a.nodes[1]} / ${b.nodes[0]},${b.nodes[1]}`);
    assert.equal(a.heading, 0, 'projection does not spin the shark');
  }
  {
    const w = make(), a = shark(w), b = shark(w);
    w.fight = { a, b };
    const before = [...a.nodes]; w.separateSharks(1 / 60);
    assert.deepEqual([...a.nodes], before, 'intentional duels retain contact');
  }
  for (const piloted of [false, true]) {
    const w = make(), a = ufo(w, 1000), b = ufo(w, 1500);
    if (piloted) b.pilot = { ...w.fish[0], alive: true, diver: true, riding: true, x: b.x, y: b.y };
    assert.ok(holdCraftAt(w, a.x, a.y));
    w.holdTo = { x: b.x, y: b.y };
    for (let i = 0; i < 25; i++) {
      w.time += 1 / 60; stepHandling(w, 1 / 60); separateTraffic(w, 1 / 60);
      assert.ok(!bodiesOverlap(bodyPoints(w, a), bodyPoints(w, b)), 'dragged UFOs remain solid against either allegiance');
      if (b.pilot) assert.ok(Math.abs(b.pilot.x - b.x) < .01, 'pilot follows displaced UFO');
    }
    stepCraftCrashes(w);
    // Forced overlap still causes damage before final separation.
    b.x = a.x; b.y = a.y; stepCraftCrashes(w);
    assert.ok(a.hits > 0 && b.hits > 0, 'a forced collision damages both saucers');
  }
  for (const kind of ['sawshark', 'hammerhead', 'classic']) for (const vehicle of ['alien', 'hijacked', 'sub']) {
    const w = make(), sh = shark(w, kind);
    let craft;
    if (vehicle === 'sub') { w.spawnSub(); craft = w.subs[0]; Object.assign(craft, { x: 1400, y: 900, hull: 6 }); }
    else { craft = ufo(w); if (vehicle === 'hijacked') craft.pilot = { ...w.fish[0], alive: true, riding: true }; }
    assert.ok(holdCraftAt(w, craft.x, craft.y));
    w.holdTo = { x: sh.nodes[0], y: sh.nodes[1] };
    for (let i = 0; i < 8; i++) stepHandling(w, 1 / 60);
    w.notices = [];
    stepSharkCraftContacts(w);
    const damage = vehicle === 'sub' ? 6 - craft.hull : craft.hits;
    assert.equal(damage, kind === 'sawshark' ? 5 : kind === 'hammerhead' ? 3 : 1, 'hammers and saws hit 1.5x harder (rounded up)');
    assert.equal(w.notices.length, 1, 'contact and destruction share one notice');
    stepSharkCraftContacts(w);
    assert.equal(w.notices.length, 1, 'contact cooldown suppresses repeated damage');
  }
  {
    const w = make(), a = ufo(w);
    kickCraft(w, a, 400, 0); const x = a.x;
    for (let i = 0; i < 75; i++) { w.time += 1 / 60; stepHandling(w, 1 / 60); }
    assert.ok(a.x > x + 150 && api.isCraftDriven(w, a), 'shock momentum remains authoritative past the old .9s cutoff');
  }
  const travel = [];
  for (const fps of [15, 30, 60]) {
    const w = make(), sh = shark(w, 'classic', 1300, 900);
    w.spawnMegalodon(); const mega = w.sharks.find(s => s.mega);
    mega.nodes.set(sh.nodes); mega.heading = 0;
    const fish = w.fish[0]; Object.assign(fish, { alive: true, x: 1300, y: 900 });
    const hit = new Set(); pushRim(w, hit, 1000, 900, 500);
    assert.equal(fish.alive, false, 'the rim still vaporizes small fish');
    const x = sh.nodes[0], mx = mega.nodes[0], heading = mega.heading;
    for (let i = 0; i < fps; i++) { w.time += 1 / fps; stepRimMotion(w, 1 / fps); pushRim(w, hit, 1000, 900, 500); }
    assert.ok(sh.nodes[0] - x > 65 && sh.nodes[0] - x < 100, 'sharks visibly coast away from the pressure front');
    assert.ok(mega.nodes[0] - mx > 20 && mega.nodes[0] - mx < sh.nodes[0] - x, 'heavy titans recoil less');
    assert.equal(mega.heading, heading, 'recoil preserves titan steering');
    travel.push(sh.nodes[0] - x);
  }
  assert.ok(Math.max(...travel) - Math.min(...travel) < .1, 'pressure travel is frame-rate independent');
  for (const [width, height] of [[1680, 1140], [3840, 2160], [5760, 3240]]) {
    const w = make(width, height); w.spawnLeviathan(); w.spawnMegalodon(); w.spawnKraken(true);
    assert.ok(w.sharks.find(s => s.mega).length < w.leviathan.length);
    assert.ok(w.kraken.size * 1.7 < w.leviathan.length);
    if (height > 2000) { assert.ok(w.kraken.size > 850); assert.ok(w.sharks.find(s => s.mega).length > 1150); }
  }
  for (const event of ['current', 'sub', 'moon', 'meteor', 'maelstrom', 'bloom', 'migration', 'kraken', 'mega', 'saga', 'leviathan', 'yeat', 'mothership', 'invasion']) {
    const w = make(); w.notices.push('older pending event');
    const engine = { world: w };
    assert.equal(OceanEngine.prototype.trigger.call(engine, event), 'started', event);
    assert.equal(w.notices[0], 'older pending event', 'starting an event never consumes an unrelated notice');
    assert.equal(w.notices.length, 2, `${event} produces exactly one entrance`);
    assert.equal(engine.triggerAnnounced, true);
  }
  for (const [width, height] of [[900, 600], [3000, 2100]]) for (const fixedRandom of [false, true]) {
    const seeded = Math.random;
    if (fixedRandom) Math.random = () => .5;
    try {
      const w = make(width, height);
      for (let i = 0; i < 3; i++) { w.spawnUfo(); w.spawnSub(); }
      w.setWorkers(true, true);
      const craft = [...w.ufos, ...w.subs];
      for (let i = 0; i < craft.length; i++) for (let j = i + 1; j < craft.length; j++)
        assert.ok(!bodiesOverlap(bodyPoints(w, craft[i]), bodyPoints(w, craft[j])), 'incoming UFOs, subs and activity crews spawn in distinct spaces');
      const destinations = w.ufos.map(u => ({ x: u.tx, y: u.hy }));
      for (let i = 0; i < destinations.length; i++) for (let j = i + 1; j < destinations.length; j++)
        assert.ok(Math.hypot(destinations[i].x - destinations[j].x, destinations[i].y - destinations[j].y) > 70, 'incoming UFOs reserve different hover destinations');
    } finally { Math.random = seeded; }
  }
  {
    const w = make(); api.startMothership(w); const b = w.mothership;
    Object.assign(b, { phase: 'battle', x: 1500, y: 500, nextShot: Infinity, nextDrone: Infinity, nextTeleport: Infinity, nextSpin: Infinity });
    w.notices = []; b.hp = b.maxHp * .5;
    api.stepEncounters(w, 1 / 60);
    assert.equal(b.defenseStage, 1); assert.equal(b.reserveDrones, 3);
    assert.equal(w.notices.length, 1);
    for (let i = 0; i < 3; i++) { w.time += .85; api.stepEncounters(w, 1 / 60); }
    assert.equal(b.reserveDrones, 0); assert.equal(w.attackDrones.length, 3, 'reserves arrive as a staggered three-drone wave');
    b.hp = b.maxHp * .33; api.stepEncounters(w, 1 / 60);
    assert.equal(b.defenseStage, 2);
    assert.ok(b.nextTeleport <= w.time + 7 && b.nextSpin <= w.time + 5, 'one-third health arms jumps and rim defenses');
    b.hp = b.maxHp * .1; api.stepEncounters(w, 1 / 60);
    assert.equal(b.defenseStage, 3);
    const notices = w.notices.length;
    api.stepEncounters(w, 1 / 60);
    assert.equal(w.notices.length, notices, 'threshold notifications never repeat');
    b.nextSpin = 0; api.stepHullCombat(w, 1 / 60);
    assert.equal(b.spin.turns, 3, 'critical health uses a full three-turn sweep');
    assert.ok(b.nextSpin >= w.time + 9 && b.nextSpin <= w.time + 13);
    b.spin = undefined; b.warp = { at: w.time, moved: false, x: 1000, y: 500 }; b.nextSpin = 0;
    api.stepHullCombat(w, 1 / 60);
    assert.equal(b.spin, undefined, 'teleports and rim charging cannot overlap');
    b.hp = b.maxHp; api.advanceMothership(w, b);
    assert.equal(b.defenseStage, 3, 'repairs never farm reserve waves or replay earlier phases');
  }
  {
    const w = make(); api.startEoe(w);
    for (let i = 0; i < 1600 && !(w.eoe.pops?.length); i++) w.step(1 / 60);
    assert.ok(w.eoe.pops.length, 'individual mergers produce a white pop');
    let count = 0; api.drawEoe((x, y) => { assert.ok(Number.isFinite(x + y)); count++; }, w, 13, 19, false);
    assert.ok(count > 0);
  }
  // Every bomb style reaches nearby bodies once, without alarming distant wildlife.
  for (const style of [undefined, 'ring', 'seismic']) {
    const w = make(), near = shark(w), far = w.fish[0];
    Object.assign(far, { x: 2900, y: 1900, alarm: 0 });
    w.spawnKraken(); const k = w.kraken; Object.assign(k, { x: 1180, y: 900 });
    w.bombs.push({ x: 1100, y: 900, born: w.time, r: 400, style });
    w.time += .7; api.stepMothershipFx(w, 1 / 60);
    assert.ok(near.blastFlee?.until > w.time, 'nearby sharks flee bomb pressure through steering');
    assert.ok(k.rageUntil > w.time, 'bomb pressure angers the kraken');
    assert.equal(far.alarm, 0, 'distant fish are unaffected');
    const x = near.nodes[0]; api.stepMothershipFx(w, 1 / 60);
    assert.equal(near.nodes[0], x, 'pressure pushes a body only once');
  }
  {
    const w = make(); api.startMothership(w); const b = w.mothership;
    const mega = shark(w); mega.mega = true;
    w.spawnKraken(); const k = w.kraken; Object.assign(k, { x: 1200, y: 950 });
    pushRim(w, new Set(), 1000, 900, 600);
    assert.equal(w.provocations.get(mega)?.target, b, 'rim provokes megalodon retaliation');
    assert.equal(w.provocations.get(k)?.target, b, 'rim provokes kraken retaliation');
  }
  {
    const w = make(); w.fish = [];
    for (let i = 0; i < 10; i++) { w.triggerEvent('ufo'); w.triggerEvent('sub'); }
    assert.equal(w.ufos.length, 10, 'manual UFOs have no population cap');
    assert.equal(w.subs.length, 10, 'manual submarines have no population cap');
  }
  {
    const w = make(), sh = shark(w, 'classic', 1200, 900); sh.mega = true; sh.speed = 100;
    w.fish = []; api.startMothership(w); const b = w.mothership;
    Object.assign(b, { x: 2200, y: 900, phase: 'battle' });
    api.queueShot(w, b, sh, true); w.time += 1.2; api.resolveShots(w);
    assert.equal(w.provocations.get(sh)?.target, b, 'a real mothership shot provokes pursuit');
    const start = Math.hypot(b.x - sh.nodes[0], b.y - sh.nodes[1]);
    for (let i = 0; i < 240; i++) {
      const x = sh.nodes[0], y = sh.nodes[1]; w.time += 1 / 60; w.stepSharks(1 / 60);
      assert.ok(Math.hypot(sh.nodes[0] - x, sh.nodes[1] - y) < 5, 'shot response never teleports the head');
    }
    assert.ok(Math.hypot(b.x - sh.nodes[0], b.y - sh.nodes[1]) < start - 200, 'the provoked animal swims toward the hull');
  }
  {
    const w = make(), sh = shark(w, 'classic', -600, 900); sh.mega = true;
    w.bombs.push({ x: -650, y: 900, born: w.time, r: 400 }); w.time += .7;
    api.stepMothershipFx(w, 1 / 60);
    assert.equal(sh.nodes[0], -600, 'blast does not clamp an offshore titan across the map');
    stepRimMotion(w, 1 / 60);
    assert.ok(Math.abs(sh.nodes[0] + 600) < 2, 'recoil starts with a small continuous displacement');
  }
  {
    const w = make(); api.startMothership(w); w.spawnKraken(true); const k = w.kraken;
    w.mothership.grapple = { kraken: k, at: w.time, nextCrush: 99, dx: 0, dy: 0, escape: 'drones', escapeAt: 99 };
    k.gripArms = 8;
    w.attackDrones = Array.from({ length: 4 }, (_, id) => ({ id, x: k.x + 50, y: k.y, hp: 3, stunned: 0, nextShot: 99, aggressor: k }));
    for (let i = 0; i < 5; i++) { api.allocateKrakenArms(w, k); w.time += .5; }
    assert.equal(k.gripArms, 4, 'drone threats free arms while four keep crushing');
    const d = w.attackDrones[0];
    d.returned = { at: w.time - .55, vx: 100, vy: 0, arm: 8, dodge: true, startX: d.x, startY: d.y };
    api.stepReturningDrones(w, 1 / 60); assert.equal(d.returned, undefined, 'a successful dodge escapes before the grip closes');
  }
  for (const kind of ['sub', 'ufo']) {
    const w = make(); w.fish = []; w.spawnKraken(true); const k = w.kraken;
    Object.assign(k, { x: 1200, y: 900, state: 'grab' });
    let a;
    if (kind === 'sub') { w.spawnSub(undefined, true); a = w.subs[0]; }
    else { w.spawnUfo(true); w.spawnUfo(true); a = w.ufos[1]; }
    Object.assign(a, { x: 1210, y: 900 }); kickCraft(w, a, 200, 0);
    api.stepProvocations(w, 1 / 60);
    assert.ok(kind === 'sub' ? a.seizedByKraken : a.held, 'a thrown craft is caught on contact');
    assert.equal(api.isCraftDriven(w, a), false, 'catch cancels throw momentum');
    if (kind === 'ufo') assert.equal(k.ufoTarget, a, 'the grip tracks the actual UFO among multiple craft');
  }
  {
    const w = make(); w.fish = [];
    const sh = shark(w, 'classic', 1500, 900); sh.mega = true;
    w.spawnUfo(true); const u = w.ufos[0];
    w.spawnSub(undefined, true); const sub = w.subs[0];
    const mid = Math.floor(SHARK_NODES / 2) * 2;
    Object.assign(u, { x: sh.nodes[mid], y: sh.nodes[mid + 1] });
    Object.assign(sub, { x: sh.nodes[mid], y: sh.nodes[mid + 1], hull: 8 });
    const d = { id: 1, x: sh.nodes[mid], y: sh.nodes[mid + 1], hp: 3, stunned: 0, nextShot: 99 }; w.attackDrones = [d];
    api.stepTitanCraftContacts(w);
    assert.equal(u.hits, 2, 'the middle of the megalodon damages a UFO');
    assert.ok(w.ufos.includes(u), 'a fresh UFO survives one body impact');
    assert.equal(sub.hull, 6, 'body contact damages submarine hulls');
    assert.equal(d.hp, 0, 'body contact smashes drones');
    api.stepTitanCraftContacts(w); assert.equal(sub.hull, 6, 'persistent contact cannot damage every frame');
    w.time += 2.1; api.stepTitanCraftContacts(w);
    assert.ok(!w.ufos.includes(u), 'a second body impact breaks the UFO');
  }
  console.log('PASS: shark stacking/crossings, dragged UFO solidity, shark attacks against all craft, sustained momentum, rim recoil, scaled titans, single announcements, safe spawns, boss phases and merger pops');
} finally { Math.random = random; }
