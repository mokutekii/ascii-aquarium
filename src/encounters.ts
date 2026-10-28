import { advanceMothership, mothershipTactics } from "./mothership-behavior";
import { queueShot, type Combatant } from "./combat";
import { clamp, TAU } from "./math";
import type { Fish, World } from "./world";
import { stepMothershipFx, beginWreck, teleportImpact, dropDrone } from "./mothership-fx";
import { attackProfile, nextAttackAt, clearBattles } from "./battle";
import { isCraftDriven, clearHandling } from "./handling";
import { beginRecovery } from "./recovery";
import { escortDrone, droneRage } from "./drones";
import { actorAlive } from "./provocation";
import { teamOf } from "./factions";
import { beginDeparture, stepDeparture } from "./mothership-departure";
import { moveHullToward } from "./ufo-motion";
export interface AttackDrone {
  id: number;
  x: number;
  y: number;
  hp: number;
  stunned: number;
  nextShot: number;
  returned?: {
    at: number;
    vx: number;
    vy: number;
    arm?: number;
    startX?: number;
    startY?: number;
    released?: boolean;
    dodge?: boolean;
  };
  detonated?: boolean;
  impactAt?: number;
  rageUntil?: number;
  aggressor?: import("./provocation").Offender;
}

export interface EncounterShot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  fireAt: number;
  hostile: boolean;
  resolved: boolean;
  fixedOrigin?: boolean;
  source?: Combatant;
  target?: Combatant;
  damage?: number;
  flash?: boolean;
  team?: import("./factions").Team;
  rgb?: string;
  hit?: Set<object>;
}

export interface Mothership {
  x: number;
  y: number;
  size: number;
  hp: number;
  maxHp: number;
  born: number;
  until?: number;
  floatVx?: number;
  floatVy?: number;
  attitude?: import("./types").CraftAttitude;
  phase: "arrive" | "battle" | "collapse" | "leave";
  phaseAt: number;
  nextDrone: number;
  defenseStage?: number;
  reserveDrones?: number;
  nextShot: number;
  emptyAt: number;
  serial: number;
  nextTeleport: number;
  warp?: {
    at: number;
    x: number;
    y: number;
    moved: boolean;
  };
  volley: number;
  nextSpin?: number;
  spin?: {
    at: number;
    turns: number;
    hit: Set<object>;
  };
  grapple?: {
    kraken: import("./types").Kraken;
    at: number;
    nextCrush: number;
    dx: number;
    dy: number;
    /** How it gets out of the grip: jump away, or send drones to drive the kraken off (then jump if that has not worked). */
    escape: "teleport" | "drones";
    escapeAt: number;
    dispatched?: boolean;
  };
  cruise?: {
    x: number;
    y: number;
    until: number;
  };
  departure?: {
    mode: "jet" | "warp";
    vx: number;
    vy: number;
    emitted: boolean;
  };
}

export interface EoeCross {
  actor: object;
  locate: () => {
    x: number;
    y: number;
  };
  merge: () => void;
  x: number;
  y: number;
  scale: number;
  vx: number;
  vy: number;
  sourceX?: number;
  sourceY?: number;
  turnAt: number;
  converted: boolean;
}

export interface Eoe {
  pops?: { x: number; y: number; born: number; scale: number }[];
  born: number;
  until: number;
  crosses: EoeCross[];
  seen: Set<object>;
  converted: number;
  cleared: boolean;
  endingShown: boolean;
  slots: Set<number>;
  cols: number;
  rows: number;
}

export interface DiverCombat {
  nextShot: number;
  hits: number;
  hitAt: number;
  nextRepair: number;
}

const crew = (w: World) => w.fish.filter(f => f.diver && f.alive && !f.riding && !f.seized && !f.dragger && !f.held);
export function startMothership(w: World): boolean {
  if (w.mothership || w.eoe || !w.isEventEnabled("mothership"))
    return false;
  const hp = 220 + Math.min(30, crew(w).length) * 5;
  w.mothership = {
    x: w.width * 0.5, y: -180, size: Math.min(w.width * .44, clamp(Math.min(w.width, w.height) * 0.42, 160, 640)),
    hp, maxHp: hp, born: w.time, until: w.time + 110 + Math.random() * 64, phase: "arrive", phaseAt: w.time, nextDrone: w.time + 6,
    nextShot: w.time + 9, emptyAt: 0, serial: 0, nextTeleport: w.time + 25 + Math.random() * 15, volley: 0
  };
  w.attackDrones = [];
  w.encounterShots = [];
  w.diverCombat = new WeakMap();
  w.mothershipWreck = null;
  w.notices.push("the mothership has eclipsed the surface...");
  return true;
}

export function eoeReady(w: World): boolean {
  return !w.eoe && !w.eoePlayed && w.isEventEnabled("eoe");
}

export function startEoe(w: World): boolean {
  if (!eoeReady(w))
    return false;
  clearHandling(w);
  clearBattles(w);
  w.rimWaves = [];
  w.recovery = null;
  w.eoePlayed = true;
  for (const f of w.fish) {
    f.eoeBound = true;
    delete f.fuseAt;
    delete f.riding;
    delete f.seized;
    delete f.dragger;
    delete f.held;
  }
  w.heldDiver = null;
  // Preserve all living actors until their individual merger; stop encounter machinery only.
  w.invasion = null;
  w.sagas = [];
  w.encounterShots = [];
  w.mothershipWreck = null;
  w.alienScrap = [];
  w.capacitorWaves = [];
  w.meteors = [];
  w.fight = null;
  w.whirl = null;
  w.vortices = [];
  if (w.kraken) {
    w.kraken.caught = [];
    w.kraken.grabbed = [];
    w.kraken.ufoHeld = false;
  }
  for (const sh of w.sharks) {
    sh.grabbed = false;
    sh.lifted = false;
  }
  for (const u of w.ufos) {
    u.pilot = null;
    u.held = false;
  }
  w.eventQueue.length = 0;
  w.sagaQueue = [];
  w.pendingTitan = null;
  w.krakenQueued = false;
  w.diverQueue = [];
  w.techQueue = [];
  w.eoe = { born: w.time, until: w.time + 52, converted: 0, cleared: false, endingShown: false, crosses: [], seen: new Set(), slots: new Set(), cols: 1, rows: 1 };
  trackMergerLife(w);
  const count = Math.max(1, w.eoe.crosses.length) * 3;
  w.eoe.cols = Math.max(1, Math.ceil(Math.sqrt(count * w.width / Math.max(1, w.height))));
  w.eoe.rows = Math.max(1, Math.ceil(count / w.eoe.cols));
  w.cooldownUntil.eoe = w.time + 3600;
  w.notices.push("Disgusting...");
  return true;
}
/** Track living actors until submerged, then reserve a nearby position for each cross. */
function trackMergerLife(w: World) {
  const e = w.eoe!;
  const add = <T extends object>(actors: T[], retire: (a: T) => void, locate: (a: T) => {
    x: number;
    y: number;
  }, scale = 1) => {
    for (const actor of actors) {
      if (e.seen.has(actor))
        continue;
      e.seen.add(actor);
      const p = locate(actor);
      // Independent picks from every region: sparse first, then an accelerating final capture.
      const turnAt = Math.max(w.time, e.born + 4 + 20 * Math.sqrt(Math.random()));
      const a = actor as {
        vx?: number;
        vy?: number;
        heading?: number;
        speed?: number;
        face?: number;
      };
      const heading = a.heading ?? (a.face === -1 ? Math.PI : e.crosses.length % 2 ? 0 : Math.PI);
      const speed = clamp(a.speed ?? 35, 18, 100);
      const vx = Math.abs(a.vx ?? 0) > 2 ? clamp(a.vx!, -100, 100) : Math.cos(heading) * speed;
      const vy = Math.abs(a.vy ?? 0) > 2 ? clamp(a.vy!, -65, 65) : Math.sin(heading) * speed * .3;
      e.crosses.push({ actor, vx, vy, locate: () => locate(actor), merge: () => retire(actor), x: p.x, y: p.y, scale, turnAt, converted: false });
    }
  };
  const position = (a: {
    x: number;
    y: number;
  }) => ({ x: a.x, y: a.y });
  add(w.fish.filter(f => f.alive), f => {
    f.alive = false; f.respawnAt = Infinity; delete f.eoeBound; if (w.heldDiver === f)
      w.heldDiver = null;
  }, position, .8);
  add(w.sharks, a => { w.sharks = w.sharks.filter(b => a !== b); }, a => { const i = Math.floor(a.nodes.length / 4) * 2; return { x: a.nodes[i], y: a.nodes[i + 1] }; }, 1.5);
  add(w.whales, a => { w.whales = w.whales.filter(b => a !== b); }, a => w.whalePoint(a, .5), 1.8);
  add(w.jellies, a => { w.jellies = w.jellies.filter(b => a !== b); }, position, .8);
  add(w.ufos, a => { w.ufos = w.ufos.filter(b => a !== b); }, position, 1.2);
  add(w.subs, a => { w.subs = w.subs.filter(b => a !== b); }, position, 1.4);
  add(w.attackDrones, a => { w.attackDrones = w.attackDrones.filter(b => a !== b); }, position, .9);
  if (w.kraken)
    add([w.kraken], () => { w.kraken = null; }, position, 2.5);
  if (w.leviathan)
    add([w.leviathan], () => { w.leviathan = null; }, position, 2.8);
  if (w.mothership)
    add([w.mothership], () => { w.mothership = null; }, position, 2.5);
}
/** Keep unconverted creatures cruising, without combat or replenishing the population. */
export function stepMergerMotion(w: World, dt: number) {
  if (!w.eoe)
    return;
  for (const [i, c] of w.eoe.crosses.entries()) {
    if (c.converted)
      continue;
    const p = c.locate();
    if (p.x < 30)
      c.vx = Math.max(25, Math.abs(c.vx));
    if (p.x > w.width - 30)
      c.vx = -Math.max(25, Math.abs(c.vx));
    if (p.y < 40)
      c.vy = Math.max(40, Math.abs(c.vy));
    if (p.y > w.height - 40)
      c.vy = -Math.max(20, Math.abs(c.vy));
    const dx = c.vx * dt, dy = (c.vy + Math.sin(w.time * .7 + i * 2.4) * 7) * dt;
    const a = c.actor as {
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      nodes?: Float32Array;
      spine?: {
        x: number;
        y: number;
      }[];
      beamX?: number;
      hy?: number;
    };
    if (a.x !== undefined)
      a.x += dx;
    if (a.y !== undefined)
      a.y += dy;
    if (a.vx !== undefined)
      a.vx = c.vx;
    if (a.vy !== undefined)
      a.vy = c.vy;
    if (a.nodes)
      for (let j = 0; j < a.nodes.length; j += 2) {
        a.nodes[j] += dx;
        a.nodes[j + 1] += dy;
      }
    if (a.spine)
      for (const node of a.spine) {
        node.x += dx;
        node.y += dy;
      }
    if (a.beamX !== undefined)
      a.beamX += dx;
    if (a.hy !== undefined)
      a.hy += dy;
  }
}
/** Reserve the nearest free position in the flooded water; dense groups cannot stack crosses. */
function assignMergerCross(w: World, c: EoeCross, surface: number) {
  const e = w.eoe!, p = c.locate();
  if (p.y < surface)
    return false;
  let best = -1, distance = Infinity;
  for (let row = 0; row < e.rows; row++) {
    const y = (row + .5) * w.height / e.rows;
    if (y < surface + 12)
      continue;
    for (let col = 0; col < e.cols; col++) {
      const slot = row * e.cols + col;
      if (e.slots.has(slot))
        continue;
      const x = (col + .5 + ((row * .381966 % 1) - .5) * .8) * w.width / e.cols, d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < distance) {
        distance = d;
        best = slot;
      }
    }
  }
  if (best < 0)
    return false;
  e.slots.add(best);
  c.sourceX = p.x;
  c.sourceY = p.y;
  const row = Math.floor(best / e.cols);
  c.x = (best % e.cols + .5 + ((row * .381966 % 1) - .5) * .8) * w.width / e.cols;
  c.y = (row + .5) * w.height / e.rows;
  return true;
}

export function stepEncounters(w: World, dt: number) {
  stepMothershipFx(w, dt);
  if (!w.eoe && w.settings.events !== "off" && w.time >= w.nextEoeAt) {
    w.nextEoeAt = w.time + 60;
    if (w.time >= (w.cooldownUntil.eoe ?? 0) && eoeReady(w) && Math.random() < 1 / 10000)
      startEoe(w);
  }
  const eoe = w.eoe;
  if (eoe) {
    const age = w.time - eoe.born;
    eoe.pops = (eoe.pops ?? []).filter(pop => w.time - pop.born < .5);
    if (!eoe.cleared)
      trackMergerLife(w);
    const surface = w.height * (1 - clamp(age / 20, 0, 1));
    for (const cross of eoe.crosses) {
      if (cross.converted || w.time < cross.turnAt)
        continue;
      if (!assignMergerCross(w, cross, surface))
        continue;
      cross.turnAt = w.time;
      cross.converted = true;
      eoe.pops.push({ x: cross.sourceX ?? cross.x, y: cross.sourceY ?? cross.y, born: w.time, scale: cross.scale });
      eoe.converted++;
      cross.merge();
    }
    if (age >= 29 && !eoe.cleared) {
      eoe.cleared = true;
      for (const f of w.fish) {
        f.alive = false;
        f.respawnAt = Infinity;
        delete f.eoeBound;
      }
      w.fish = [];
      w.sharks = [];
      w.whales = [];
      w.jellies = [];
      w.ufos = [];
      w.subs = [];
      w.torpedoes = [];
      w.kraken = null;
      w.leviathan = null;
      w.mothership = null;
      w.attackDrones = [];
      w.mess = [];
      w.debris = [];
      w.bombs = [];
      w.blasts = [];
      w.bolts = [];
      w.ripples = [];
      w.events = [];
      w.callouts = [];
      w.heldDiver = null;
      w.whaleFight = null;
      w.agitated.clear();
      w.provocations.clear();
      w.retaliationArcs = [];
      w.baitBall = null;
    }
    if (age >= 47 && !eoe.endingShown) {
      eoe.endingShown = true;
      w.notices.push("Congratulations...");
    }
    if (age >= 52) {
      w.eoe = null;
      beginRecovery(w);
      w.nextEventAt = w.time + 35;
      w.nextBusyDiverAt = w.time + 15;
      w.notices.push("individual lives return to the sea...");
    }
    return;
  }
  const boss = w.mothership;
  w.encounterShots = w.encounterShots.filter(s => w.time - s.fireAt < 0.4);
  if (!boss)
    return;
  const divers = crew(w);
  if (boss.phase === "battle" && boss.hp <= 0) {
    boss.phase = "collapse";
    boss.phaseAt = w.time;
    boss.warp = undefined;
    boss.spin = undefined;
    boss.grapple = undefined;
    w.notices.push("the core is collapsing... brace for the shockwave!");
  }
  if (boss.phase === "arrive") {
    boss.y += (w.height * 0.16 - boss.y) * Math.min(1, dt * 0.75);
    if (w.time - boss.born > 5) {
      boss.phase = "battle";
      boss.phaseAt = w.time;
    }
  }
  if (boss.phase === "leave") {
    w.encounterShots.length = 0;
    w.attackDrones.length = 0;
    stepDeparture(w, boss, dt);
    return;
  }
  if (boss.phase === "collapse") {
    for (const drone of w.attackDrones) dropDrone(w, drone);
    w.attackDrones.length = 0;
    w.encounterShots.length = 0;
    const age = w.time - boss.phaseAt;
    if (age >= 2.4 && !w.mothershipWreck) beginWreck(w, boss);
    if (age > 5) {
      w.notices.push("the mothership has fallen...");
      w.mothership = null;
    }
    return;
  }
  boss.until ??= boss.born + 110 + Math.random() * 64;
  if (boss.phase === "battle" && w.time >= boss.until) {
    beginDeparture(w, boss);
    return;
  }
  if (boss.phase !== "battle" || isCraftDriven(w, boss))
    return;
  advanceMothership(w, boss);
  const tactics = mothershipTactics(boss);
  // Caught in the kraken's arms, the mothership gets out after a few seconds: it sends drones to shoot the kraken off (and jumps
  // away if that does not work), or it jumps away straight off, to a spot as far from the kraken as it can find.
  if (boss.grapple && !boss.warp && !boss.spin && w.time >= boss.grapple.escapeAt) {
    const g = boss.grapple;
    if (g.escape === "drones" && !g.dispatched) {
      g.dispatched = true;
      g.escapeAt = w.time + 6;
      const count = Math.min(3, 8 - w.attackDrones.length);
      for (let i = 0; i < count; i++)
        w.attackDrones.push({
          id: ++boss.serial, x: boss.x + (i - 1) * boss.size * .3, y: boss.y + boss.size * .255 + 85,
          hp: 3, stunned: 0, nextShot: w.time + .8 + i * .4, aggressor: g.kraken
        });
      w.notices.push("the mothership dispatches drones to drive the kraken off!");
      w.callout(boss.x, boss.y - boss.size * .4, "DRONES DISPATCHED", "255,200,90");
    }
    else {
      const margin = Math.min(w.width * .45, boss.size * .95 + 15);
      const minY = boss.size * .32 + 20;
      const maxY = Math.max(minY, w.height - boss.size * .3 - 80);
      let spot = { x: w.width / 2, y: minY }, far = -1;
      for (let i = 0; i < 6; i++) {
        const x = clamp(margin + Math.random() * (w.width - 2 * margin), margin, w.width - margin);
        const y = clamp(minY + Math.random() * (maxY - minY), minY, maxY);
        const d = Math.hypot(x - g.kraken.x, y - g.kraken.y);
        if (d > far) {
          far = d;
          spot = { x, y };
        }
      }
      boss.grapple = undefined;
      boss.warp = { at: w.time, x: spot.x, y: spot.y, moved: false };
      boss.nextTeleport = w.time + tactics.teleport;
      w.encounterShots = [];
      w.notices.push("the mothership tears free of the kraken and jumps away!");
      w.callout(boss.x, boss.y - boss.size * .4, "MOTHERSHIP JUMPS AWAY", "130,240,255");
    }
  }
  if (w.time >= boss.nextTeleport && !boss.warp && !boss.spin && !boss.grapple) {
    const prey = [...divers, ...w.subs.filter(s => !s.leaving)];
    const target = prey[Math.floor(Math.random() * prey.length)];
    const margin = Math.min(w.width * .45, boss.size * .95 + 15);
    boss.warp = {
      at: w.time, x: clamp(target ? target.x + (Math.random() - .5) * 90 : w.width * (.2 + Math.random() * .6), margin, w.width - margin),
      y: clamp(target ? target.y : w.height * (.2 + Math.random() * .35), boss.size * .32 + 20, Math.max(boss.size * .32 + 20, w.height - boss.size * .3 - 80)), moved: false
    };
    boss.nextTeleport = w.time + tactics.teleport;
    w.encounterShots = [];
  }
  if (boss.warp) {
    const warp = boss.warp, age = w.time - warp.at;
    if (age >= 1.2 && !warp.moved) {
      boss.x = warp.x;
      boss.y = warp.y;
      warp.moved = true;
      teleportImpact(w, boss);
      if (boss.attitude) Object.assign(boss.attitude, { x: boss.x, y: boss.y, vx: 0, vy: 0, bank: 0, rate: 0 });
      boss.floatVx = 0;
      boss.floatVy = 0;
      boss.nextShot = w.time + .9;
    }
    if (age >= 2.4)
      boss.warp = undefined;
  }
  if (!boss.grapple && !boss.spin && !boss.warp) {
    const mx = Math.min(w.width * .45, boss.size * .98);
    if (!boss.cruise || w.time >= boss.cruise.until)
      boss.cruise = { x: mx + Math.random() * Math.max(0, w.width - 2 * mx), y: w.height * (.18 + Math.random() * .4), until: w.time + 10 + Math.random() * 8 };
    moveHullToward(boss, boss.cruise.x, boss.cruise.y, 38, dt, 1.2);
  }
  const defenders = divers.length + w.subs.length + w.ufos.filter(u => u.pilot?.alive).length + (w.kraken ? 1 : 0) + w.sharks.filter(s => s.mega).length;
  if (!defenders)
    boss.emptyAt ||= w.time;
  else
    boss.emptyAt = 0;
  if (boss.emptyAt > 0 && w.time - boss.emptyAt > 14) {
    beginDeparture(w, boss);
    return;
  }
  if (w.time >= boss.nextDrone && !boss.warp) {
    if (w.attackDrones.length < 8) {
      if (boss.reserveDrones) boss.reserveDrones--;
      w.attackDrones.push({
        id: ++boss.serial, x: boss.x + Math.sin(boss.serial * 2.39996) * boss.size * .6, y: boss.y + boss.size * .255 + 85,
        hp: 3, stunned: 0, nextShot: w.time + 2
      });
    }
    boss.nextDrone = w.time + ((boss.reserveDrones ?? 0) > 0 ? .8 : tactics.drone);
  }
  const targets: Combatant[] = [...divers, ...w.subs.filter(s => !s.leaving), ...w.ufos.filter(u => u.pilot?.alive), ...w.sharks.filter(s => !s.grabbed), ...(w.kraken ? [w.kraken] : []), ...(w.leviathan ? [w.leviathan] : [])];
  const warn = (source: Combatant, target: Combatant) => queueShot(w, source, target, true);
  if (targets.length && w.time >= boss.nextShot && !boss.spin && !boss.grapple && !boss.warp) {
    boss.nextShot = nextAttackAt(w, boss, 400, tactics.shot);
    const humanTargets: Combatant[] = [...divers, ...w.subs, ...w.ufos.filter(u => u.pilot?.alive)];
    const choices = humanTargets.length ? humanTargets : targets;
    const count = Math.min(choices.length, boss.hp < boss.maxHp * .5 ? 3 : 2);
    for (let i = 0; i < count; i++)
      warn(boss, choices[(boss.volley + i) % choices.length]);
    boss.volley += count;
  }
  for (const drone of w.attackDrones) {
    // Stations follow the new hull, but drones fly there from their existing positions.
    const flightFloor = boss.y + boss.size * .255 + 55;
    if (drone.stunned > w.time || isCraftDriven(w, drone) || drone.returned)
      continue;
    const profile = attackProfile(w, drone), angle = w.time * 0.18 + profile.angle;
    const tx = boss.x + Math.cos(angle) * (boss.size + profile.distance * .65);
    const ty = boss.y + 150 + Math.abs(Math.sin(angle)) * profile.distance;
    escortDrone(w, boss, drone, clamp(tx, 40, w.width - 40), clamp(ty, flightFloor, Math.max(flightFloor, w.height * .8)), dt);
    if (targets.length && w.time >= drone.nextShot) {
      const rage = droneRage(w, drone);
      const target = drone.aggressor && actorAlive(w, drone.aggressor) && teamOf(w, drone.aggressor) !== "alien"
        ? drone.aggressor : targets[(drone.id + Math.floor(w.time / (rage ? 4 : 8))) % targets.length];
      const pos = "nodes" in target ? { x: target.nodes[0], y: target.nodes[1] } : target;
      drone.nextShot = nextAttackAt(w, drone, Math.hypot(pos.x - drone.x, pos.y - drone.y), 3.5 * (1 - rage * .45));
      warn(drone, target as Combatant);
    }
  }
  for (const drone of w.attackDrones)
    if (drone.hp <= 0)
      dropDrone(w, drone);
  w.attackDrones = w.attackDrones.filter(d => d.hp > 0);
  if (boss.hp <= 0) {
    boss.phase = "collapse";
    boss.phaseAt = w.time;
    boss.warp = undefined;
    w.notices.push("the core is collapsing... brace for the shockwave!");
  }
}
