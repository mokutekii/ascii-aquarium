// Run from the repo root: node dev-tests/release-133.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/world.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'error',
});
const { World } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

const kinds = [
  'chase', 'mega', 'kraken', 'saga', 'bait', 'jelly', 'whale', 'whirl',
  'fight', 'ufo', 'diver', 'night', 'yeat', 'moon', 'meteor', 'maelstrom',
  'bloom', 'migration', 'current',
];
const regressions = [];
function regression(label, action) {
  try { action(); }
  catch (error) { regressions.push(`${label}: ${error.message}`); }
}

function seeded(seed, action) {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 0x100000000);
  try { return action(); } finally { Math.random = original; }
}

function world(fishCount = 12) {
  const w = new World([{ kind: 'classic', size: 0.8 }, { kind: 'nurse', size: 0.7 }], fishCount);
  w.settings.events = 'off';
  w.resize(1400, 800, 12, 17);
  return w;
}

function setWhale(whale, x, y) {
  Object.assign(whale, { x, y, heading: 0, speed: 0, traveled: 0, songAt: Infinity });
}

function assertFiniteWorld(w, label) {
  const point = (name, x, y) => {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `${label}: ${name} has non-finite position (${x}, ${y})`);
  };
  for (const [i, f] of w.fish.entries()) point(`fish ${i}`, f.x, f.y);
  for (const [i, s] of w.sharks.entries()) {
    for (const n of s.nodes) assert.ok(Number.isFinite(n), `${label}: shark ${i} has non-finite spine`);
  }
  for (const [i, wh] of w.whales.entries()) point(`whale ${i}`, wh.x, wh.y);
  if (w.kraken) point('kraken', w.kraken.x, w.kraken.y);
  for (const [i, u] of w.ufos.entries()) point(`ufo ${i}`, u.x, u.y);
  for (const name of ['jellies', 'vortices', 'meteors', 'mess', 'inks', 'events']) {
    for (const [i, item] of w[name].entries()) point(`${name} ${i}`, item.x, item.y);
  }
  for (const name of ['baitBall', 'whirl']) {
    if (w[name]) point(name, w[name].x, w[name].y);
  }
  for (const [i, rp] of w.ripples.entries()) point(`ripple ${i}`, rp.x, rp.y);
  assert.ok(w.ripples.length <= 64, `${label}: unbounded ripples (${w.ripples.length})`);
}

seeded(133, () => {
  // W must report success on its first press, and the second press adds a second whale.
  const w = world();
  assert.equal(w.eventStatus('whale'), 'ready');
  assert.equal(w.triggerEvent('whale'), 'started', 'first W press');
  assert.equal(w.whales.length, 1);
  assert.equal(w.eventStatus('whale'), 'running');
  assert.equal(w.triggerEvent('whale'), 'started', 'second W press');
  assert.equal(w.whales.length, 2);
  assert.equal(w.triggerEvent('whale'), 'started', 'manual W presses have no cap');
  assert.equal(w.whales.length, 3);
  w.whales.pop();

  // The mega must pick the closer whale, even when it is not the oldest.
  const [far, near] = w.whales;
  setWhale(far, 350, 220);
  setWhale(near, 1000, 550);
  assert.equal(w.triggerEvent('mega'), 'started');
  const mega = w.sharks.find(s => s.mega);
  assert.ok(mega);
  mega.whaleAttack = true;
  mega.born = -20;
  w.time = 20;
  for (let i = 0; i < mega.nodes.length; i += 2) {
    mega.nodes[i] = 800 - i * 8;
    mega.nodes[i + 1] = 550;
  }
  w.stepSharks(1 / 60);
  assert.equal(w.whaleFight?.whale, near, 'mega fights the nearby second whale');
  assert.equal(far.fleeing, undefined, 'the far whale is untouched');

  // Removing the held whale must end the fight, without transferring its state.
  w.whales = [far];
  w.stepWhaleFight(1 / 60);
  assert.equal(w.whaleFight, null);
  assert.equal(far.fleeing, undefined);
  assert.equal(w.whales[0], far);
  assertFiniteWorld(w, 'removed fight whale');
});

seeded(134, () => {
  const w = world();
  w.triggerEvent('whale');
  w.triggerEvent('whale');
  const [other, held] = w.whales;
  setWhale(other, 300, 200);
  setWhale(held, 1000, 550);
  assert.equal(w.triggerEvent('kraken'), 'started');
  const k = w.kraken;
  assert.ok(k);
  k.whaleTarget = held;
  k.whaleUntil = w.time + 10;
  w.whales = [other];
  w.stepKraken(1 / 60);
  assert.equal(k.whaleTarget, undefined, 'kraken drops its removed whale');
  assert.equal(k.whaleUntil, 0);
  assert.equal(other.fleeing, undefined, 'another whale does not inherit the wrap');
});

seeded(135, () => {
  const w = world();
  assert.equal(w.queueEvent('current'), 'queued');
  assert.equal(w.queueEvent('current'), 'already');
  assert.equal(w.eventStatus('current'), 'queued');
  w.cancelQueuedEvent('current');
  assert.equal(w.eventStatus('current'), 'ready');
  assert.deepEqual(w.eventQueue, []);

  assert.equal(w.queueEvent('current'), 'queued');
  w.stepInvasion();
  assert.equal(w.eventStatus('current'), 'running', 'queued event eventually starts');
  assert.deepEqual(w.eventQueue, []);
  assert.equal(w.triggerEvent('current'), 'already');
  w.time = w.currentUntil + 1;
  assert.equal(w.eventStatus('current'), 'ready');

  // A running saga can have a second run queued; cancellation clears that request.
  assert.equal(w.triggerEvent('meteor'), 'started');
  assert.equal(w.triggerEvent('meteor'), 'queued');
  assert.equal(w.eventStatus('meteor'), 'queued');
  w.cancelQueuedEvent('meteor');
  assert.equal(w.eventStatus('meteor'), 'running');

  assert.equal(w.queueEvent('whale'), 'queued');
  w.setEventEnabled('whale', false);
  assert.equal(w.eventStatus('whale'), 'disabled');
  assert.equal(w.queueEvent('whale'), 'off');
  assert.equal(w.triggerEvent('whale'), 'off');
  assert.ok(!w.eventQueue.includes('whale'));
  w.setEventEnabled('whale', true);
  assert.equal(w.eventStatus('whale'), 'ready');
});

seeded(136, () => {
  const w = world();
  w.settings.events = 'busy';
  for (const kind of kinds) w.setEventEnabled(kind, false);
  const originalTrigger = w.triggerEvent;
  w.triggerEvent = () => { throw Error('disabled random event reached triggerEvent'); };
  w.nextEventAt = 0;
  for (let i = 0; i < 12; i++) {
    w.time += 100;
    w.stepEvents(1 / 30);
  }
  w.triggerEvent = originalTrigger;
  for (const kind of kinds) {
    assert.equal(w.eventStatus(kind), 'disabled', `disabled ${kind} status`);
    assert.equal(w.triggerEvent(kind), 'off', `disabled manual ${kind}`);
    assert.equal(w.queueEvent(kind), 'off', `disabled queue ${kind}`);
  }
  assert.equal(w.eventQueue.length, 0);
});

seeded(137, () => {
  // Every advertised key has an executable public path on an otherwise clear board.
  for (const kind of kinds) {
    const w = world(80);
    const before = w.eventStatus(kind);
    assert.equal(before, 'ready', `${kind} initial status`);
    const outcome = w.triggerEvent(kind);
    regression(`public ${kind}`, () => assert.equal(outcome, 'started', `${kind} first key press reports a start`));
    w.step(1 / 30);
    assertFiniteWorld(w, `public ${kind}`);
  }
});

seeded(138, () => {
  // Exercise the event constructors together, including two whales and both titans.
  const w = world(80);
  w.spawnRunner(2);
  w.spawnBaitBall();
  assert.ok(w.baitBall, 'forced bait ball has enough fish to form');
  w.spawnJellies();
  w.spawnWhale();
  w.spawnWhale();
  w.spawnWhirl();
  w.spawnFight();
  w.spawnUfo();
  w.spawnDivers();
  for (const kind of ['moon', 'meteor', 'maelstrom', 'bloom', 'migration']) w.startSaga(kind);
  w.spawnMegalodon();
  w.spawnKraken();
  assert.equal(w.whales.length, 2);
  assert.ok(w.kraken && w.sharks.some(s => s.mega), 'both titans spawned');
  for (let i = 0; i < 3600; i++) {
    w.step(1 / 30);
    // The renderer consumes these visual effects once per frame.
    w.events.length = 0;
    if (i % 60 === 0) assertFiniteWorld(w, `forced events frame ${i}`);
  }
  assertFiniteWorld(w, 'forced events final');
});

seeded(139, () => {
  for (const kind of kinds) regression(`queued ${kind} starts`, () => {
    const w = world(80);
    assert.equal(w.queueEvent(kind), 'queued');
    assert.equal(w.eventStatus(kind), 'queued');
    w.stepInvasion();
    assert.ok(!w.eventQueue.includes(kind), `${kind} left the front of the ready queue`);
    assert.equal(w.eventStatus(kind), 'running', `${kind} is actually running after dequeue`);
  });

  regression('held first whale removal', () => {
    const w = world();
    w.triggerEvent('whale');
    w.triggerEvent('whale');
    const [held, other] = w.whales;
    setWhale(held, 700, 400);
    setWhale(other, 1100, 620);
    w.triggerEvent('mega');
    const mega = w.sharks.find(s => s.mega);
    mega.whaleAttack = true;
    mega.born = -20;
    w.time = 20;
    for (let i = 0; i < mega.nodes.length; i += 2) {
      mega.nodes[i] = 500 - i * 8;
      mega.nodes[i + 1] = 400;
    }
    w.stepSharks(1 / 60);
    assert.equal(w.whaleFight?.whale, held);
    held.traveled = 1e6;
    w.stepCritters(1 / 60);
    assert.deepEqual(w.whales, [other], 'only the first whale leaves the array');
    assert.equal(w.whale, other, 'the surviving whale becomes the oldest');
    assert.equal(w.whaleFight, null, 'the fight does not transfer');
    assert.equal(other.fleeing, undefined);
    assert.equal(w.nearestWhale(other.x, other.y), other);
  });

  regression('held first kraken whale removal', () => {
    const w = world();
    w.triggerEvent('whale');
    w.triggerEvent('whale');
    const [held, other] = w.whales;
    w.triggerEvent('kraken');
    const k = w.kraken;
    k.whaleTarget = held;
    k.whaleUntil = w.time + 5;
    held.traveled = 1e6;
    w.stepCritters(1 / 60);
    assert.deepEqual(w.whales, [other]);
    assert.equal(k.whaleTarget, undefined);
    assert.equal(k.whaleUntil, 0);
    assert.equal(other.fleeing, undefined);
  });

  regression('queued night progresses past blocked whale', () => {
    const w = world();
    w.triggerEvent('mega');
    w.triggerEvent('kraken');
    assert.ok(w.kraken && w.sharks.some(s => s.mega));
    w.queueEvent('whale');
    w.queueEvent('night');
    w.stepInvasion();
    assert.equal(w.eventStatus('night'), 'running', 'night is allowed during a titan clash');
    assert.ok(w.eventQueue.includes('whale'), 'blocked whale request stays queued');
  });

  regression('migration waits for open water, other shows stack freely', () => {
    const w = world();
    assert.equal(w.triggerEvent('meteor'), 'started');
    assert.equal(w.triggerEvent('maelstrom'), 'started');
    assert.equal(w.triggerEvent('moon'), 'started', 'no cap on announced events');
    assert.equal(w.sagas.length, 3);
    assert.equal(w.triggerEvent('mega'), 'started');
    assert.equal(w.triggerEvent('migration'), 'blocked', 'the herd needs open water');
  });

  regression('queued night and yeat progress', () => {
    const w = world();
    w.queueEvent('night');
    w.queueEvent('yeat');
    w.stepInvasion();
    assert.equal(w.eventStatus('night'), 'running');
    assert.equal(w.eventStatus('yeat'), 'queued');
    w.time += 8;
    w.stepInvasion();
    assert.equal(w.eventStatus('yeat'), 'running');
    assert.deepEqual(w.eventQueue, []);
  });

  regression('manual kraken promise survives disabling saga', () => {
    const w = world();
    w.triggerEvent('whale');
    w.triggerEvent('mega');
    const mega = w.sharks.find(s => s.mega);
    w.whaleFight = { whale: w.whales[0], mega, start: w.time, until: Infinity, nextHit: Infinity, doomed: false, bite: 0.3, locked: true };
    const outcome = w.triggerEvent('kraken');
    regression('manual kraken reports queue', () => assert.equal(outcome, 'queued', 'kraken cannot arrive until the whale fight ends'));
    assert.equal(w.eventStatus('kraken'), 'queued');
    w.setEventEnabled('saga', false);
    assert.equal(w.eventStatus('kraken'), 'queued', 'Saga switch does not cancel Kraken request');
    w.whaleFight = null;
    w.stepKrakenQueue();
    assert.ok(w.kraken, 'Kraken eventually arrives');
  });

  regression('disabled kraken blocks saga dependency', () => {
    const w = world();
    w.setEventEnabled('kraken', false);
    w.triggerEvent('saga');
    assert.equal(w.kraken, null, 'a disabled kraken cannot be summoned by saga');
  });

  regression('disabled mega cannot announce impossible clash', () => {
    const w = world();
    w.setEventEnabled('mega', false);
    const outcome = w.triggerEvent('saga');
    assert.ok(outcome !== 'started' || w.sharks.some(s => s.mega), 'TITANS CLASH promises both titans');
  });

  regression('impossible event is unavailable to the controls', () => {
    const w = world();
    w.setEventEnabled('mega', false);
    assert.equal(w.triggerEvent('saga'), 'off');
    assert.equal(w.eventStatus('saga'), 'disabled', 'Saga control reflects disabled prerequisite');
    assert.equal(w.queueEvent('saga'), 'off', 'Saga cannot promise an impossible queue arrival');
    w.settings.night = false;
    assert.equal(w.triggerEvent('night'), 'off');
    assert.equal(w.eventStatus('night'), 'disabled', 'Nightfall control reflects daytime-only preference');
    assert.equal(w.queueEvent('night'), 'off', 'Nightfall cannot queue when night is unavailable');
  });

  regression('disabled UFO allows active invasion to finish', () => {
    const w = world();
    w.spawnUfo(); w.spawnUfo(); w.spawnUfo();
    w.stepInvasion();
    assert.ok(w.invasion);
    w.setEventEnabled('ufo', false);
    w.ufos.length = 0; // The saucers already in flight leave.
    w.time += 120;
    w.stepInvasion();
    assert.equal(w.invasion, null, 'no remaining UFO can arrive');
  });

  regression('resize carries active encounters', () => {
    const w = world();
    w.triggerEvent('whale');
    w.triggerEvent('kraken');
    w.triggerEvent('ufo');
    const whale = w.whales[0], kraken = w.kraken, ufo = w.ufos[0];
    const before = { whale: [whale.x, whale.y], kraken: [kraken.x, kraken.y], ufo: [ufo.x, ufo.y] };
    w.resize(700, 400, 12, 17);
    for (const [name, item] of Object.entries({ whale, kraken, ufo })) {
      assert.ok(Math.abs(item.x - before[name][0] / 2) < 0.01, `${name} x scales with tank`);
      assert.ok(Math.abs(item.y - before[name][1] / 2) < 0.01, `${name} y scales with tank`);
    }
    assertFiniteWorld(w, 'resized encounters');
  });
});

if (regressions.length) assert.fail(`release 1.3.3 regressions:\n${regressions.join('\n')}`);
console.log('PASS: v1.3.3 whale, titan, event control, queue, and stress regressions');

seeded(7, () => {
  const w = world();
  assert.equal(w.triggerEvent('saga'), 'started');
  for (let i = 0; i < 60 * 40 && !(w.kraken && w.sharks.some((x) => x.mega)); i++) w.step(1 / 60);
  assert.ok(w.kraken && w.sharks.some((x) => x.mega), 'titans meet');
  for (const k of ['kraken', 'mega', 'saga', 'whale', 'meteor', 'bait']) assert.equal(w.triggerEvent(k), 'blocked', `${k} is blocked while the titans clash`);
});
seeded(8, () => {
  const w = world();
  w.triggerEvent('saga');
  for (let i = 0; i < 60 * 40 && !(w.kraken && w.sharks.some((x) => x.mega)); i++) w.step(1 / 60);
  for (let i = 0; i < 3; i++) assert.equal(w.triggerEvent('ufo'), 'started', 'saucers may join a clash');
  for (let i = 0; i < 60 * 20; i++) w.step(1 / 60);
  assert.ok(w.ufos.length >= 1, 'saucers are in the water');
  assert.equal(w.invasion, null, 'no alien invasion during a clash');
  assert.equal(w.sharks.filter((x) => x.mega).length, 1, 'one megalodon');
});
seeded(9, () => {
  const w = world();
  w.triggerEvent('kraken'); w.triggerEvent('mega'); w.triggerEvent('mega'); w.triggerEvent('kraken'); w.triggerEvent('saga');
  for (let i = 0; i < 60 * 30; i++) { w.step(1 / 60); assert.ok(w.sharks.filter((x) => x.mega).length <= 1, 'max one megalodon'); }
});
console.log('PASS: titans clash blocks K and M, allows saucers, one kraken and one megalodon');
