import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({
  stdin: {
    contents: [
      'export { World } from "./src/world";', 'export { AsciiRenderer } from "./src/renderer";',
      'export * from "./src/battle";', 'export * from "./src/combat";', 'export * from "./src/handling";',
      'export * from "./src/hull-combat";', 'export * from "./src/encounters";', 'export * from "./src/encounters-draw";',
      'export * from "./src/drones";', 'export * from "./src/wreckage";', 'export * from "./src/saucer-draw";', 'export * from "./src/recovery";', 'export * from "./src/tractor";', 'export * from "./src/mothership-fx";', 'export * from "./src/meteor";',
      'export * from "./src/ufo-motion";',
    ].join('\n'), resolveDir: process.cwd()
  }, bundle: true, format: 'esm', platform: 'node', write: false
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const { World, stepBattles, attackProfile, nextAttackAt, fireUfoBattle, ufoOpponent, queueShot, resolveShots, stepEncounters, startMothership, startEoe, stepHullCombat, stepHammerheads, holdCraftAt, heldCraft, stepHandling, releaseCraft, kickCraft, stepRecovery, tractorContains, tractorCaptives, stepMothershipFx, meteorRadius } = api;
let seed = 92717;
const original = Math.random;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const make = () => { const w = new World([{ kind: 'classic', size: .8 }], 24); w.resize(1800, 1200, 13, 19); w.settings.events = 'off'; w.sharks = []; w.time = 10; return w; };
const divers = w => {
  for (const [i, f] of w.fish.entries())
    Object.assign(f, { diver: true, dkind: 'scuba', alive: true, x: 700 + i * 7, y: 600, vx: 0, vy: 0 }); return w.fish;
};
const ufo = (w, x = 900, y = 400) => { w.spawnUfo(); const u = w.ufos.at(-1); Object.assign(u, { x, y, hy: y, beamX: x, state: 'seek', hijackChecked: true }); return u; };
const boss = w => { startMothership(w); const b = w.mothership; Object.assign(b, { phase: 'battle', x: 900, y: 350, nextTeleport: Infinity, nextShot: Infinity, nextDrone: Infinity }); return b; };
let cases = 0;
try {
  // Real shot resolution, including both kinds of allegiance change while a shot is pending.
  {
    const w = make(), a = ufo(w, 650), b = ufo(w, 900), pilot = w.fish[0];
    Object.assign(pilot, { diver: true, riding: true, alive: true });
    a.pilot = pilot;
    a.boarded = true;
    assert.equal(ufoOpponent(w, a), b);
    assert.equal(ufoOpponent(w, b), a);
    attackProfile(w, a).nextShot = 0;
    fireUfoBattle(w, a);
    assert.equal(w.encounterShots[0].damage, 2);
    w.time += .2;
    resolveShots(w);
    assert.equal(b.hits, 2, 'hijacked saucer damages hostile saucer without a mothership');
    let glyphs = 0;
    api.drawEncounterShots(() => glyphs++, w, 13, 19);
    assert.ok(glyphs > 0, 'ordinary UFO fight has visible shots');
    queueShot(w, b, a, true);
    b.pilot = { ...pilot };
    w.time += 2;
    resolveShots(w);
    assert.equal(a.hits, undefined, 'new ally cancels its old hostile shot');
    b.pilot = null;
    queueShot(w, b, a, true);
    a.pilot = null;
    w.time += 2;
    resolveShots(w);
    assert.equal(a.hits, undefined, 'a changed target cannot receive friendly fire');
    const c = boss(w);
    a.pilot = pilot;
    Object.assign(a, { x: 900, y: 500 });
    Object.assign(b, { x: 100, y: 1000 });
    w.attackDrones = [{ id: 1, x: 200, y: 1000, hp: 3, stunned: 0, nextShot: 0 }];
    assert.equal(ufoOpponent(w, a), c, 'a nearby mothership wins over a distant first drone');
    cases++;
  }
  // Varying groups and persistent identities; dead members still consume the finite encounter budget.
  {
    const counts = new Set();
    for (let attempt = 0; attempt < 35; attempt++) {
      const w = make();
      divers(w);
      ufo(w);
      stepBattles(w, 1 / 60);
      const count = w.fish.filter(f => w.diverCombat.has(f)).length;
      counts.add(count);
      assert.ok(count >= 1 && count <= 5);
      const members = w.fish.filter(f => w.diverCombat.has(f));
      for (const f of members)
        f.alive = false;
      for (let i = 0; i < 20; i++) {
        w.time++;
        stepBattles(w, 1 / 60);
      }
      assert.equal(w.fish.filter(f => w.diverCombat.has(f)).length, count, 'no endless replacement of losses');
    }
    assert.ok(counts.size >= 4, 'small and larger groups both occur');
    const w = make();
    divers(w);
    boss(w);
    stepBattles(w, 1 / 60);
    const count = w.fish.filter(f => w.diverCombat.has(f)).length;
    assert.ok(count >= 2 && count <= 10);
    const a = attackProfile(w, w.fish[0]);
    assert.equal(attackProfile(w, w.fish[0]), a);
    const near = nextAttackAt(w, w.fish[0], 100);
    const far = nextAttackAt(w, w.fish[0], 900);
    assert.ok(far > near - 1);
    const intervals = new Set(Array.from({ length: 12 }, () => nextAttackAt(w, w.fish[0], 400)));
    assert.equal(intervals.size, 12);
    cases++;
  }
  {
    const w = make();
    w.disabledEvents.add('diver');
    w.disabledEvents.add('sub');
    ufo(w);
    for (let i = 0; i < 40; i++) {
      w.time++;
      stepBattles(w, 1 / 60);
    }
    assert.equal(w.diverQueue.length, 0);
    assert.equal(w.subs.length, 0);
    cases++;
  }
  // Contact damage has a cooldown and damages both hulls; teleports do not deal damage every frame.
  {
    const w = make(), b = boss(w);
    w.spawnSub();
    const s = w.subs[0];
    Object.assign(s, { x: b.x, y: b.y, hull: 8 });
    stepHullCombat(w, 1 / 60);
    assert.equal(s.hull, 6);
    assert.ok(b.hp < b.maxHp);
    stepHullCombat(w, 1 / 60);
    assert.equal(s.hull, 6);
    w.time += 2;
    kickCraft(w, b, 600, 0);
    stepHullCombat(w, 1 / 60);
    assert.equal(s.hull, 3, 'a fast thrown mothership has a heavier impact');
    cases++;
  }
  {
    const w = make(), b = boss(w);
    divers(w);
    for (const f of w.fish)
      Object.assign(f, { x: b.x + 100, y: b.y + 260 });
    b.nextSpin = 0;
    stepHullCombat(w, 1 / 60);
    assert.ok(b.spin?.turns >= 2 && b.spin.turns <= 3);
    assert.equal(w.fish[0].vx, 0, 'spin has a visible wind-up');
    w.time += 1.3;
    stepHullCombat(w, 1 / 60);
    const v = w.fish[0].vx;
    assert.ok(v > 0);
    stepHullCombat(w, 1 / 60);
    assert.equal(w.fish[0].vx, v, 'each sweep hits a body once');
    cases++;
  }
  {
    const w = make(), b = boss(w);
    w.spawnMegalodon(0);
    const sh = w.sharks.find(s => s.mega);
    sh.nodes[0] = b.x;
    sh.nodes[1] = b.y;
    const hp = b.hp;
    stepHullCombat(w, 1 / 60);
    assert.ok(b.hp < hp, 'a physical megalodon ram damages the mothership');
    const health = b.hp;
    stepHullCombat(w, 1 / 60);
    assert.equal(b.hp, health);
    cases++;
  }
  {
    const w = make(), b = boss(w);
    w.spawnKraken(true);
    const k = w.kraken;
    Object.assign(k, { x: b.x, y: b.y });
    stepHullCombat(w, 1 / 60);
    assert.equal(b.grapple, undefined, 'arms coil before making contact');
    assert.ok(k.hullStrike);
    w.time += .96; stepHullCombat(w, 1 / 60);
    assert.equal(b.grapple?.kraken, k);
    const hp = b.hp;
    w.time += 1.1;
    stepHullCombat(w, 1 / 60);
    assert.ok(b.hp < hp, 'crushing takes time');
    b.grapple = undefined;
    b.nextSpin = Infinity;
    b.x = 1350;
    k.x = 600;
    k.y = 500;
    const d = { id: 4, x: 600, y: 500, hp: 3, stunned: 0, nextShot: 0 };
    w.attackDrones = [d];
    stepHullCombat(w, 1 / 60);
    assert.ok(d.returned);
    for (let i = 0; i < 240 && d.hp > 0; i++) {
      w.time += 1 / 60;
      stepHullCombat(w, 1 / 60);
      api.stepReturningDrones(w, 1 / 60);
      api.stepDroneImpacts(w);
    }
    assert.ok(d.hp <= 0, 'returned drone eventually impacts or expires');
    cases++;
  }
  // Ghost contact never takes ownership of titan headings, even during sustained overlap.
  {
    const w = make();
    w.spawnLeviathan();
    w.spawnMegalodon(0);
    w.spawnKraken(true);
    const g = w.leviathan, k = w.kraken, sh = w.sharks.find(s => s.mega);
    Object.assign(g, { x: 900, y: 600, heading: 0 });
    for (let i = 0; i < g.spine.length; i++)
      Object.assign(g.spine[i], { x: 900 - i * 20, y: 600 });
    Object.assign(k, { x: 800, y: 600 });
    sh.nodes[0] = 800;
    sh.nodes[1] = 600;
    const headings = [sh.heading, k.heading];
    for (let i = 0; i < 120; i++) {
      w.time += 1 / 60;
      w.stepDeep(1 / 60);
    }
    assert.deepEqual([sh.heading, k.heading], headings);
    assert.ok(Number.isFinite(k.x + sh.nodes[0]));
    cases++;
  }
  {
    const w = make(), b = boss(w);
    assert.equal(holdCraftAt(w, b.x, b.y), false, 'boss cannot be grabbed');
    const f = w.fish[0]; Object.assign(f, { diver: true, alive: true, x: b.x, y: b.y, vx: 0, vy: 0 });
    stepHullCombat(w, 1 / 60);
    assert.equal(f.alive, false, 'stationary hull contact kills a diver');
    for (let i = 0; i < 6; i++) assert.ok(w.spawnSub(undefined, true));
    assert.equal(w.subs.length, 6);
    assert.equal(w.spawnSub(), false, 'automatic cap is preserved');
    cases++;
  }
  {
    const w = make(), f = w.fish[0];
    Object.assign(f, { alive: true, diver: true, dkind: 'scuba', alienArmor: true });
    w.popDiver(f); assert.equal(f.alive, true); assert.equal(f.alienArmor, false);
    w.popDiver(f); assert.equal(f.alive, true, 'one blast cannot consume the shield and kill on the same frame');
    w.time += 1; w.popDiver(f); assert.equal(f.alive, false, 'the next lethal event kills');
    const c = make(), b = boss(c), d = c.fish[0];
    Object.assign(d, { alive: true, diver: true, alienArmor: true, x: b.x, y: b.y });
    stepHullCombat(c, 1 / 60); assert.equal(d.alive, true); assert.equal(d.alienArmor, false);
    cases++;
  }
  {
    const w = make(), b = boss(w); b.hp = b.maxHp * .8;
    api.stepMothershipRegen(w, b, 1); const hp = b.hp;
    w.time += 9; api.stepMothershipRegen(w, b, 1); assert.equal(b.hp, hp);
    w.time += 1; api.stepMothershipRegen(w, b, 1); assert.ok(b.hp > hp);
    b.hp -= 2; const damaged = b.hp; api.stepMothershipRegen(w, b, 1); assert.equal(b.hp, damaged);
    w.time += 11; b.hp = b.maxHp * .5; api.stepMothershipRegen(w, b, 1);
    w.time += 11; api.stepMothershipRegen(w, b, 1); assert.equal(b.hp, b.maxHp * .5, 'no regeneration at half health');
    cases++;
  }
  // Actual holds move the whole craft and retain release momentum; cleanup handles disappearing craft.
  {
    for (const kind of ['sub', 'ufo', 'drone']) {
      const w = make();
      let a;
      if (kind === 'sub') {
        w.spawnSub();
        a = w.subs[0];
      }
      else if (kind === 'ufo')
        a = ufo(w);
      else if (kind === 'mothership')
        a = boss(w);
      else {
        a = { id: 1, x: 900, y: 400, hp: 3, stunned: 0, nextShot: 0 };
        w.attackDrones = [a];
      }
      Object.assign(a, { x: 900, y: 400 });
      assert.ok(holdCraftAt(w, 900, 400));
      assert.equal(heldCraft(w), a);
      w.holdTo = { x: 1200, y: 600 };
      for (let i = 0; i < 8; i++) {
        w.time += 1 / 60;
        stepHandling(w, 1 / 60);
      }
      assert.ok(a.x > 1000);
      const x = a.x;
      assert.ok(releaseCraft(w));
      stepHandling(w, 1 / 60);
      assert.ok(a.x > x);
      assert.equal(heldCraft(w), undefined);
    }
    cases++;
  }
  {
    const w = make();
    startEoe(w);
    w.time += 52;
    stepEncounters(w, 1 / 60);
    assert.equal(w.eoe, null);
    assert.equal(w.sharks.length, 0);
    assert.equal(w.fish.filter(f => f.alive).length, 0);
    w.resize(2000, 1300, 13, 19);
    assert.equal(w.sharks.length, 0, 'resize does not seed sharks during recovery');
    w.time += 1;
    stepRecovery(w);
    const fish = w.fish.filter(f => f.alive);
    assert.ok(fish.length > 0 && fish.length < w.fish.length);
    assert.ok(fish.every(f => f.x < 0 || f.x > w.width));
    w.time += 7;
    stepRecovery(w);
    assert.ok(w.sharks.length > 0);
    assert.ok(w.sharks.every(s => s.nodes[0] < 0 || s.nodes[0] > w.width));
    cases++;
  }
  {
    const w = make(), u = ufo(w, 900, 100), f = w.fish[0];
    Object.assign(u, { state: 'beam', beamTarget: f, aim: { x: 900, y: 500 } });
    Object.assign(f, { x: 900, y: 500 });
    assert.ok(tractorContains(w, u, f));
    assert.ok(!tractorContains(w, u, { x: 980, y: 500 }));
    assert.ok(tractorCaptives(w).has(f));
    u.state = 'seek';
    assert.ok(!tractorCaptives(w).has(f));
    cases++;
  }
  {
    const w = make(), styles = [];
    for (let i = 0; i < 12; i++) {
      w.meteorImpact(800, 600);
      styles.push(w.bombs.at(-1).style);
    }
    assert.ok(new Set(styles.map(s => s.fronts)).size > 1);
    assert.equal(new Set(styles.map(s => s.seed)).size, 12);
    assert.equal(meteorRadius(styles[0], .7), meteorRadius(styles[0], .7));
    w.bombs = [{ x: 900, y: 600, r: 400, born: w.time }];
    w.alienScrap = [{ x: 910, y: 600, vx: 0, vy: 0, born: w.time, fuse: w.time + 4, glyph: '@' }];
    stepMothershipFx(w, 1 / 60);
    assert.ok(w.alienScrap[0].fuse < w.time + .3, 'nearby blast primes an unstable core');
    w.time += .4;
    stepMothershipFx(w, 1 / 60);
    assert.equal(w.capacitorWaves.length, 1);
    stepMothershipFx(w, 1 / 60);
    assert.equal(w.capacitorWaves.length, 1);
    cases++;
  }
  {
    const w = make();
    w.addShark('hammerhead');
    const sh = w.sharks[0], u = ufo(w, 900, 600);
    sh.nodes[0] = 850;
    sh.nodes[1] = 600;
    sh.heading = 0;
    stepHammerheads(w);
    assert.equal(u.hits, 3, 'hammerhead bash is its weakness: 1.5x a normal head hit (2 becomes 3)');
    cases++;
  }
  {
    const w = make(), b = boss(w), d = { id: 1, x: 100, y: 100, hp: 3, stunned: 0, nextShot: 0 };
    w.attackDrones = [d];
    const old = { x: d.x, y: d.y };
    api.teleportImpact(w, b);
    assert.deepEqual({ x: d.x, y: d.y }, old, 'teleport leaves drones at their old positions');
    api.escortDrone(w, b, d, 1400, 800, 1 / 60);
    assert.ok(Math.hypot(d.x - old.x, d.y - old.y) <= 235 / 60 + .001, 'return flight has bounded speed');
    w.spawnMegalodon(0);
    const sh = w.sharks.find(s => s.mega);
    sh.nodes[0] = 600;
    sh.nodes[1] = 600;
    d.x = 600;
    d.y = 600;
    api.stepDroneImpacts(w);
    assert.ok(d.detonated);
    assert.ok(sh.rageUntil > w.time);
    assert.equal(w.provocations.get(sh).target, b);
    const n = w.bombs.length;
    api.stepDroneImpacts(w);
    assert.equal(w.bombs.length, n, 'each drone explodes once');
    cases++;
  }
  {
    const w = make();
    w.addShark('mako');
    const sh = w.sharks[0], d = { id: 2, x: 900, y: 600, hp: 3, stunned: 0, nextShot: 0 };
    w.attackDrones = [d];
    sh.nodes[0] = 800;
    sh.nodes[1] = 600;
    assert.equal(api.sharkDroneTarget(w, sh), d, 'close sharks can attack drones');
    d.x = 1200;
    api.provokeSharkDrone(w, sh, d);
    assert.equal(api.sharkDroneTarget(w, sh), d, 'a shot provokes pursuit beyond contact range');
    d.hp = 0;
    assert.equal(api.sharkDroneTarget(w, sh), undefined);
    cases++;
  }
  {
    for (const kind of ['ufo', 'sub', 'mothership']) {
      const w = make();
      api.spawnCraftDebris(w, kind, 900, 500, 400);
      assert.ok(w.debris.length >= 3);
      assert.equal(new Set(w.debris.map(d => d.part)).size, 3);
      let glyphs = 0;
      api.drawCraftDebris((x, y) => { assert.ok(Number.isFinite(x + y)); glyphs++; }, w, 13, 19);
      assert.ok(glyphs > 15);
    }
    const hull = [];
    api.drawClassicSaucer((x, y, g) => hull.push({ x, y, g }), 0, 0, 100, 13, 19, 0);
    assert.ok(hull.some(p => p.y < -19 && p.g === '^'));
    assert.ok(hull.some(p => p.y === 0 && p.g === '='));
    cases++;
  }
  {
    const w = make(), b = boss(w);
    w.spawnUfo();
    const u = w.ufos[0];
    u.x = b.x;
    u.y = b.y;
    kickCraft(w, u, 500, 0);
    const hp = b.hp;
    stepHullCombat(w, 1 / 60);
    assert.ok(!w.ufos.includes(u), 'hard saucer/mothership impact destroys the saucer');
    assert.ok(b.hp < hp);
    const c = make();
    startMothership(c);
    assert.ok(c.mothership.nextTeleport - c.time >= 25, 'first jump is less frequent');
    cases++;
  }
  {
    const w = make();
    for (let i = 0; i < 12; i++)
      w.spawnUfo();
    w.stepInvasion();
    assert.equal(w.ufos.length, 3);
    assert.equal(w.invasion, null, 'spamming U never starts an invasion');
    assert.equal(w.triggerEvent('invasion'), 'started');
    assert.equal(w.triggerEvent('invasion'), 'already');
    cases++;
  }
  {
    const w = make(), u = ufo(w, 900, 100), f = w.fish[0];
    w.fish = [f];
    Object.assign(f, { x: 900, y: 750, alive: true, diver: false });
    Object.assign(u, { state: 'beam', beamTarget: f, cargo: new Set([f]), aim: { x: 900, y: 750 }, beamUntil: w.time + 25, nextShot: Infinity, escapeAt: undefined, giveUpAt: undefined, ammo: 0 });
    for (let i = 0; i < 900 && f.alive; i++) {
      w.time += 1 / 60;
      w.stepUfo(1 / 60);
    }
    assert.equal(f.alive, false, 'a fish reaches the intake instead of stalling below the UFO');
    assert.ok(f.y < u.y, 'capture completes only after the whole fish reaches the saucer');
    cases++;
  }
  {
    const w = make(), u = ufo(w, 900, 100), f = divers(w)[0];
    Object.assign(f, { x: 900, y: 500, dkind: 'scuba' });
    Object.assign(u, { state: 'beam', beamTarget: f, cargo: new Set([f]), aim: { x: 900, y: 500 }, beamUntil: w.time + 25 });
    attackProfile(w, f).nextShot = 0;
    api.stepTractorDefense(w);
    assert.ok(w.encounterShots.length > 0, 'captured gunner can fire at its captor');
    w.time += .2;
    resolveShots(w);
    assert.equal(u.state, 'seek');
    assert.equal(f.alive, true);
    assert.ok(u.beamRestUntil > w.time);
    cases++;
  }
  {
    for (const blowsUp of [false, true]) {
      const w = make(), u = ufo(w, 900, 100), f = w.fish[0];
      w.fish = [f];
      Object.assign(f, { x: 900, y: 40, alive: true, diver: true, dkind: 'bomber', fuseAt: blowsUp ? 10 : undefined });
      Object.assign(u, { state: 'beam', beamTarget: f, cargo: new Set([f]), aim: { x: 900, y: 500 }, beamUntil: 100, nextShot: Infinity, ammo: 0, hy: 100 });
      const random = Math.random;
      Math.random = () => .9;
      try {
        w.stepUfo(1 / 60);
      }
      finally {
        Math.random = random;
      }
      if (blowsUp)
        assert.ok(!w.ufos.includes(u), 'a live bomber can explode aboard the UFO');
      else
        assert.ok(u.ammo >= 1, 'a safely abducted bomber becomes stored ammunition');
    }
    cases++;
  }
  {
    const u = ufo(make(), 900, 400);
    const step = (vx, vy, seconds, fps = 60) => {
      for (let i = 0; i < seconds * fps; i++) {
        u.x += vx / fps;
        u.y += vy / fps;
        api.updateUfoAttitude(u, 1 / fps);
        assert.ok(Number.isFinite(u.attitude.bank));
        assert.ok(Math.abs(u.attitude.bank) <= .34);
      }
      return u.attitude.bank;
    };

    const right = step(120, 0, 2);
    assert.ok(right > .08, 'rightward movement banks the leading edge');
    const left = step(-120, 0, 2);
    assert.ok(left < -.08, 'reversing direction reverses the bank');
    const climb = step(120, -80, 2);
    const dive = step(120, 80, 2);
    assert.ok(dive - climb > .1, 'climbs and dives change the attitude');

    // A stale steering velocity or animation phase cannot hold an idle UFO at a fixed slant.
    u.floatVx = 999;
    u.floatVy = 999;
    u.phase = 12;
    assert.ok(Math.abs(step(0, 0, 4)) < .005, 'the UFO settles level at rest');
    cases++;
  }
  {
    const poses = [15, 30, 60].map(fps => {
      const u = ufo(make(), 900, 400);
      for (let i = 1; i <= fps * 4; i++) {
        const t = i / fps;
        u.x = 900 + 150 * Math.sin(t * .8);
        u.y = 400 + 50 * Math.sin(t * .5);
        api.updateUfoAttitude(u, 1 / fps);
      }
      return u.attitude.bank;
    });
    assert.ok(Math.max(...poses) - Math.min(...poses) < .05, 'banking stays consistent across smooth and saver rates');
    cases++;
  }
  console.log(`PASS: ${cases} combat/movement scenarios with real shot resolution, factions, finite squads, disabled events, hull damage, spin, titans, ghost wakes, throws, LCL recovery, capture, meteor variation, chain reactions and motion-driven UFO banking`);
}
finally {
  Math.random = original;
}
