import { provoke } from "./provocation";
import { allocateKrakenArms, DRONE_RELEASE_TIME } from "./drone-arm";
import { spinLasers } from "./combat";
import { UFO_HITS_TO_BREAK, CRAFT_WEAKNESS } from "./types";
import { mothershipTactics } from "./mothership-behavior";
import type { World, Kraken, Shark } from "./world";
import type { Sub } from "./deep";
import type { Mothership, AttackDrone } from "./encounters";
import { angleDiff, clamp, rand } from "./math";
import { carry, pushRim } from "./rim-wave";
import { bodyPoints, bodiesOverlap } from "./collision-bodies";
import { sharkDroneTarget, provokeSharkCraft } from "./drones";
import { kickCraft, isCraftHeld, craftVelocity, isCraftDriven } from "./handling";
const contacts = new WeakMap<World, WeakMap<object, WeakMap<object, number>>>();
function once(w: World, a: object, b: object, seconds: number) {
  let map = contacts.get(w);
  if (!map) {
    map = new WeakMap();
    contacts.set(w, map);
  }
  let pairs = map.get(a);
  if (!pairs) {
    pairs = new WeakMap();
    map.set(a, pairs);
  }
  if (w.time < (pairs.get(b) ?? -Infinity))
    return false;
  pairs.set(b, w.time + seconds);
  return true;
}

export function touchesHull(b: Mothership, x: number, y: number, padding = 0) {
  const bank = b.attitude?.bank ?? 0;
  const dx = x - b.x, dy = y - b.y, c = Math.cos(bank), s = Math.sin(bank);
  return ((dx * c + dy * s) / (b.size * .95 + padding)) ** 2
    + ((-dx * s + dy * c) / (b.size * .26 + padding)) ** 2 <= 1;
}

const diverPaths = new WeakMap<World, WeakMap<object, { b: Mothership; x: number; y: number }>>();
function diverTouchesHull(w: World, b: Mothership, f: World["fish"][number]) {
  let paths = diverPaths.get(w);
  if (!paths) { paths = new WeakMap(); diverPaths.set(w, paths); }
  const bank = b.attitude?.bank ?? 0, dx = f.x - b.x, dy = f.y - b.y;
  const x = (dx * Math.cos(bank) + dy * Math.sin(bank)) / (b.size * .95 + 14);
  const y = (-dx * Math.sin(bank) + dy * Math.cos(bank)) / (b.size * .26 + 14);
  const old = paths.get(f); paths.set(f, { b, x, y });
  if (x * x + y * y <= 1) return true;
  if (!old || old.b !== b || b.warp) return false;
  const vx = x - old.x, vy = y - old.y;
  const t = clamp(-(old.x * vx + old.y * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return (old.x + vx * t) ** 2 + (old.y + vy * t) ** 2 <= 1;
}

export function impactSub(w: World, b: Mothership, s: Sub, damage = 2) {
  if (!once(w, b, s, 1.4))
    return;
  s.hull -= damage;
  s.hitAt = w.time;
  s.fleeUntil = w.time + 4;
  s.fleeFrom = { x: b.x, y: b.y };
  b.hp -= b.maxHp * .015 * damage;
  const dx = s.x - b.x, dy = s.y - b.y, d = Math.hypot(dx, dy) || 1;
  kickCraft(w, s, dx / d * 150, dy / d * 180);
  w.callout(s.x, s.y - 30, "HULL IMPACT", "255,150,100");
  if (s.hull <= 0)
    w.destroySub(s, "the mothership smashed through a submarine!");
}

function shoveTitan(w: World, actor: Shark | Kraken, x: number, y: number, power: number) {
  const p = "nodes" in actor ? { x: actor.nodes[0], y: actor.nodes[1] } : actor;
  const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
  carry(w, actor, dx / d * power * 2, dy / d * power * 2);
}

const repairs = new WeakMap<Mothership, { hp: number; damagedAt: number; active: boolean }>();
export function stepMothershipRegen(w: World, b: Mothership, dt: number) {
  let state = repairs.get(b);
  if (!state) { state = { hp: b.hp, damagedAt: w.time, active: false }; repairs.set(b, state); }
  if (b.hp < state.hp) state.damagedAt = w.time;
  const healing = b.phase === "battle" && b.hp > b.maxHp * .5 && b.hp < b.maxHp && w.time - state.damagedAt >= 10;
  if (healing) {
    if (!state.active) w.callout(b.x, b.y - b.size * .4, "HULL REGENERATING", "125,225,255");
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * .008 * dt);
  }
  state.active = healing; state.hp = b.hp;
}

export function stepHullCombat(w: World, dt: number) {
  const b = w.mothership;
  if (!b || b.phase !== "battle" || b.warp && !b.warp.moved)
    return;
  stepMothershipRegen(w, b, dt);
  const tactics = mothershipTactics(b);
  b.nextSpin ??= w.time + (tactics.stage >= 2 ? tactics.spin : rand(14, 22));
  const nearby = w.fish.filter(f => f.diver && f.alive && !f.riding && Math.hypot(f.x - b.x, f.y - b.y) < b.size + 500).length
    + w.ufos.filter(u => u.pilot?.alive && Math.hypot(u.x - b.x, u.y - b.y) < b.size + 500).length + w.subs.filter(s => Math.hypot(s.x - b.x, s.y - b.y) < b.size + 500).length;
  if (!b.spin && !b.warp && !isCraftDriven(w, b) && w.time >= b.nextSpin && (nearby >= 3 || !!b.grapple || b.hp < b.maxHp * .5)) {
    b.spin = { at: w.time, turns: tactics.stage >= 3 ? 3 : Math.random() < .65 ? 2 : 3, hit: new Set() };
    b.grapple = undefined;
    b.nextSpin = w.time + tactics.spin;
    w.callout(b.x, b.y - b.size * .4, "RIM CHARGING", "180,255,220");
  }
  if (b.spin) {
    const spin = b.spin, age = w.time - spin.at, duration = 1.2 + spin.turns * 1.6;
    if (age >= 1.2) {
      const reach = b.size * .95 + Math.min(1, (age - 1.2) / 1.1) * 400;
      pushRim(w, spin.hit, b.x, b.y, reach);
      spinLasers(w, b, age);
    }
    if (age >= duration)
      b.spin = undefined;
  }
  // Warp damage and moving hull damage share the same pair cooldown.
  for (const sub of [...w.subs])
    if (!sub.seizedByKraken && touchesHull(b, sub.x, sub.y, 55)) {
      const bv = craftVelocity(w, b), sv = craftVelocity(w, sub);
      const speed = Math.hypot((sv?.vx ?? sub.vx) - (bv?.vx ?? 0), (sv?.vy ?? sub.vy) - (bv?.vy ?? 0));
      impactSub(w, b, sub, speed > 250 ? 3 : 2);
    }
  for (const u of [...w.ufos])
    if (!u.held && touchesHull(b, u.x, u.y, 35) && once(w, b, u, 1.5)) {
      const bv = craftVelocity(w, b), uv = craftVelocity(w, u);
      const fast = Math.hypot((uv?.vx ?? 0) - (bv?.vx ?? 0), (uv?.vy ?? 0) - (bv?.vy ?? 0)) > 250;
      u.hits = (u.hits ?? 0) + (fast ? UFO_HITS_TO_BREAK : 1);
      u.hitAt = w.time;
      b.hp -= b.maxHp * (fast ? .035 : .008);
      kickCraft(w, u, (u.x < b.x ? -1 : 1) * 180, (u.y < b.y ? -1 : 1) * 160);
      if (u.hits >= UFO_HITS_TO_BREAK)
        w.destroyUfo("blasted", u);
    }
  // A diver thrown into the hull dies on it. A bomber's pack goes off there, which costs the mothership far more than a laser shot (1 hp).
  for (const f of [...w.fish]) {
    if (!f.diver || !f.alive || f.riding || f.seized || f.dragger || f.held || f.eoeBound) continue;
    if (!diverTouchesHull(w, b, f)) continue;
    if (w.absorbDiverShield(f)) {
      const sign = f.y < b.y ? -1 : 1;
      f.y = b.y + sign * (b.size * .4 + 65); f.vy = sign * 200;
      continue;
    }
    if (f.dkind === "bomber") {
      b.hp -= b.maxHp * .06;
      w.explode(f.x, f.y, f);
      w.callout(f.x, f.y - 40, "BOMBER DETONATES ON THE HULL", "255,190,70");
    }
    else {
      b.hp -= 1;
      w.callout(f.x, f.y - 40, "DIVER SMASHED ON THE HULL", "255,110,100");
      w.popDiver(f, "crushed");
    }
  }
  for (const sh of w.sharks.filter(s => s.mega && !s.grabbed && !s.lifted)) {
    if (w.kraken?.wrapping === sh || w.whaleFight?.mega === sh)
      continue;
    const ag = w.provocations.get(sh), head = touchesHull(b, sh.nodes[0], sh.nodes[1], sh.length * .05);
    const tail = sh.nodes.length - 2, tailHit = touchesHull(b, sh.nodes[tail], sh.nodes[tail + 1], sh.length * .035);
    if ((head || tailHit) && once(w, sh, b, 3.5)) {
      const damage = head ? .08 : .05;
      b.hp -= b.maxHp * damage;
      const nx = b.x - sh.nodes[head ? 0 : tail], ny = b.y - sh.nodes[head ? 1 : tail + 1], d = Math.hypot(nx, ny) || 1;
      kickCraft(w, b, nx / d * (head ? 150 : 210), ny / d * (head ? 150 : 210));
      shoveTitan(w, sh, b.x, b.y, 40);
      w.callout(b.x, b.y, "TITAN HULL STRIKE", "255,210,150");
    }
    if (head) {
      const dx = b.x - sh.nodes[0], dy = b.y - sh.nodes[1], a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      const reach = 1 / Math.hypot(Math.cos(a) / (b.size * .95 + sh.length * .05), Math.sin(a) / (b.size * .26 + sh.length * .05));
      const separation = Math.min(25, Math.max(0, reach - d));
      b.x += Math.cos(a) * separation;
      b.y += Math.sin(a) * separation;
    }
    // Body contact is solid too, with a small separation that never rewrites its heading.
    if (!head)
      for (let i = 4; i < sh.nodes.length - 4; i += 6)
        if (touchesHull(b, sh.nodes[i], sh.nodes[i + 1], sh.length * .045)) {
          kickCraft(w, b, 0, b.y < sh.nodes[i + 1] ? -45 : 45);
          break;
        }
  }
  const k = w.kraken;
  if (k) allocateKrakenArms(w, k);
  // Eight arms engulf the hull; two long arms stay free for defense.

  if (b.grapple && (b.grapple.kraken !== k || k?.wrapping || k?.whaleTarget))
    b.grapple = undefined;
  if (k && !k.maul) {
    const withinReach = (touchesHull(b, k.x, k.y, k.size * .23) || touchesHull(b, k.x - Math.cos(k.heading) * k.size * .6, k.y - Math.sin(k.heading) * k.size * .6, k.size * .12));
    if (k.hullStrike && (k.hullStrike.target !== b || b.warp || b.spin || w.time - k.hullStrike.at > 5)) k.hullStrike = undefined;
    if (!k.wrapping && !k.whaleTarget && !b.grapple && !b.spin && !b.warp && withinReach && !k.hullStrike) {
      k.hullStrike = { target: b, at: w.time };
      k.hullUntil = w.time + 6;
      k.pushAt = undefined;
    }
    if (!k.wrapping && !k.whaleTarget && !b.grapple && !b.spin && withinReach && k.hullStrike && w.time - k.hullStrike.at >= .95 && once(w, k, b, 12)) {
      k.hullStrike = undefined;
      // Once caught, the mothership gets out one of two ways: jump away, or send drones to shoot the kraken off.
      const escape = Math.random() < .5 ? "teleport" : "drones";
      k.gripArms = 8;
      b.grapple = { kraken: k, at: w.time, nextCrush: w.time + 1, dx: b.x - k.x, dy: b.y - k.y, escape, escapeAt: w.time + rand(4, 7) };
      b.nextSpin = Math.min(b.nextSpin, w.time + (b.hp <= b.maxHp * .2 ? 6 : 5));
      w.callout(b.x, b.y, "KRAKEN SEIZES MOTHERSHIP", "255,220,170");
    }
    if (b.grapple) {
      b.x = k.x + b.grapple.dx;
      b.y = k.y + b.grapple.dy;
      if (w.time >= b.grapple.nextCrush) {
        b.hp -= b.maxHp * .04;
        b.grapple.nextCrush = w.time + 1;
      }
    }
    for (const d of w.attackDrones) {
      const firstFree = b.grapple || k.whaleTarget || k.wrapping ? k.gripArms ?? 10 : 6;
      const occupied = new Set(w.attackDrones.filter(o => o.returned && w.time - o.returned.at < DRONE_RELEASE_TIME + .3).map(o => o.returned!.arm));
      const freeArm = Array.from({ length: 10 - firstFree }, (_, i) => firstFree + i).find(a => !occupied.has(a));
      if (d.hp <= 0 || freeArm === undefined)
        continue;
      if (!d.returned && Math.hypot(d.x - k.x, d.y - k.y) < k.size * .9 && once(w, k, d, 8) && once(w, k, k, 2.5)) {
        const a = Math.atan2(b.y - k.y, b.x - k.x);
        d.returned = { at: w.time, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, arm: freeArm, dodge: Math.random() < (w.krakenRage() > 0 ? .08 : .38), startX: d.x, startY: d.y };
        d.stunned = w.time + 6;
      }
    }
  }
  // Hammerheads ram hulls deliberately when they are close enough; ordinary species keep their existing behaviors.
}

function motionVelocity(w: World, actor: Sub | import("./types").Ufo) {
  if (isCraftHeld(w, actor)) return w.holdVel;
  const thrown = craftVelocity(w, actor);
  return thrown ? { x: thrown.vx, y: thrown.vy }
    : "hull" in actor ? { x: actor.vx, y: actor.vy }
    : { x: actor.floatVx ?? 0, y: actor.floatVy ?? 0 };
}

function craftName(actor: Sub | import("./types").Ufo) {
  return "hull" in actor ? "submarine" : actor.pilot?.alive ? "hijacked UFO" : "UFO";
}

export function stepCraftCrashes(w: World) {
  const craft = [...w.subs.filter(s => !s.seizedByKraken), ...w.ufos.filter(u => !u.held)];
  const shapes = craft.map(actor => bodyPoints(w, actor));
  for (let i = 0; i < craft.length; i++) {
    for (let j = i + 1; j < craft.length; j++) {
      const a = craft[i], b = craft[j];
      if (!("hull" in a ? w.subs.includes(a) : w.ufos.includes(a))
        || !("hull" in b ? w.subs.includes(b) : w.ufos.includes(b))) continue;
      const manual = isCraftDriven(w, a) || isCraftDriven(w, b);
      const av = motionVelocity(w, a), bv = motionVelocity(w, b);
      const vx = av.x - bv.x, vy = av.y - bv.y, speed = Math.hypot(vx, vy);
      const opposing = "pilot" in a && "pilot" in b && !!a.pilot?.alive !== !!b.pilot?.alive;
      // Ordinary alien saucers use avoidance; a player can still force an impact.
      const bothAlien = "pilot" in a && "pilot" in b && !a.pilot?.alive && !b.pilot?.alive;
      if (!manual && (bothAlien || !opposing && speed < 65)) continue;
      if (!bodiesOverlap(shapes[i], shapes[j]) || !once(w, a, b, 1.5)) continue;
      const message = `a ${craftName(a)} crashed into a ${craftName(b)}...`;
      w.notices.push(message);
      const damage = speed > 350 ? 3 : speed > 180 ? 2 : 1;
      for (const actor of [a, b]) {
        if ("hull" in actor) {
          actor.hull -= damage;
          actor.hitAt = w.time;
          if (actor.hull <= 0) w.destroySub(actor, "the collision breached a submarine's hull...");
        } else {
          actor.hits = (actor.hits ?? 0) + damage; actor.hitAt = w.time;
          if (actor.hits >= UFO_HITS_TO_BREAK) w.destroyUfo("blasted", actor, "a UFO broke apart in the collision...");
        }
      }
      kickCraft(w, a, -vx * .35, -vy * .35);
      kickCraft(w, b, vx * .35, vy * .35);
      w.splash((a.x + b.x) / 2, (a.y + b.y) / 2, 1.3);
    }
  }
}

/** Forced contact counts even while the pointer is holding the craft. */
export function stepSharkCraftContacts(w: World, dt = 1 / 60) {
  const craft = [...w.ufos.filter(u => !u.held), ...w.subs.filter(s => !s.seizedByKraken)];
  const shapes = craft.map(actor => bodyPoints(w, actor));
  for (const shark of w.sharks) {
    if (shark.mega || shark.grabbed || shark.lifted || shark.dragging) continue;
    const hammer = shark.kind === "hammerhead" || shark.kind === "greathammer";
    const saw = shark.kind === "sawshark";
    const x = shark.nodes[0], y = shark.nodes[1];
    const body = bodyPoints(w, shark);
    const snout = [{ x, y, r: shark.length * .055 + 8 }];
    for (let i = 0; i < craft.length; i++) {
      const target = craft[i];
      if (!("hull" in target ? w.subs.includes(target) : w.ufos.includes(target))) continue;
      if (hammer || saw) {
        const distance = Math.hypot(target.x - x, target.y - y);
        const angle = Math.atan2(target.y - y, target.x - x);
        if (distance < shark.length * .65 + 100 && Math.abs(angleDiff(shark.heading, angle)) < 1.15) {
          shark.heading += clamp(angleDiff(shark.heading, angle), -dt * 2, dt * 2);
          shark.speed = Math.max(shark.speed, 125);
        }
      }
      if (!bodiesOverlap(body, shapes[i]) || !once(w, shark, target, 4)) continue;
      if ("hull" in target) w.agitate(shark, "attack", target, 10, target);
      else provokeSharkCraft(w, shark, target);
      const headHit = bodiesOverlap(snout, shapes[i]);
      // Hammers and saws are the craft's weakness: the same blow lands about half again as hard.
      const damage = Math.ceil((headHit && saw ? 3 : headHit && hammer ? 2 : 1) * ((hammer || saw) ? CRAFT_WEAKNESS : 1));
      const species = saw ? "sawshark" : hammer ? "hammerhead" : "shark";
      const verb = headHit && saw ? "sliced into" : headHit && hammer ? "smashed into" : "bumped into";
      const notice = `a ${species} ${verb} a ${craftName(target)}...`;
      w.splash(x, y, damage > 1 ? 1.4 : .7);
      kickCraft(w, target, Math.cos(shark.heading) * 140, Math.sin(shark.heading) * 140);
      if ("hull" in target) {
        target.hull -= damage;
        target.hitAt = w.time;
        if (target.hull <= 0) w.destroySub(target, notice);
        else w.notices.push(notice);
      } else {
        target.hits = (target.hits ?? 0) + damage; target.hitAt = w.time;
        if (target.hits >= UFO_HITS_TO_BREAK) w.destroyUfo(saw ? "sawed" : "smashed", target, notice);
        else w.notices.push(notice);
      }
    }
    const boss = w.mothership;
    if (boss?.phase === "battle" && (!boss.warp || boss.warp.moved)
      && (sharkDroneTarget(w, shark) === boss || isCraftDriven(w, boss))
      && bodiesOverlap(body, bodyPoints(w, boss)) && once(w, shark, boss, 4)) {
      boss.hp -= boss.maxHp * (saw ? .025 : hammer ? .018 : .008);
      provokeSharkCraft(w, shark, boss);
      w.notices.push(`a ${saw ? "sawshark" : hammer ? "hammerhead" : "shark"} struck the mothership's hull...`);
    }
  }
}

// Compatibility for callers that used the original hammerhead-only entry point.
export const stepHammerheads = stepSharkCraftContacts;

/** Titan body impacts use the same visible collision shapes as shots and ordinary craft. */
export function stepTitanCraftContacts(w: World) {
  const craft = [...w.subs.filter(s => !s.seizedByKraken), ...w.ufos.filter(u => !u.held)];
  for (const sh of w.sharks) {
    if (!sh.mega || sh.grabbed || sh.lifted || w.kraken?.wrapping === sh) continue;
    const body = bodyPoints(w, sh);
    for (const a of craft) {
      if ("hull" in a ? !w.subs.includes(a) : !w.ufos.includes(a)) continue;
      if (!bodiesOverlap(body, bodyPoints(w, a))) continue;
      provoke(w, sh, a);
      if (!once(w, sh, a, 2)) continue;
      if ("hull" in a) {
        a.hull -= 2; a.hitAt = w.time;
        if (a.hull <= 0) w.destroySub(a, "the megalodon smashed a submarine's hull...");
      } else {
        a.hits = (a.hits ?? 0) + 2; a.hitAt = w.time;
        if (a.hits >= UFO_HITS_TO_BREAK) w.destroyUfo("smashed", a, "the megalodon's body smashed a UFO...");
      }
    }
    for (const d of w.attackDrones) {
      if (d.hp <= 0 || !bodiesOverlap(body, bodyPoints(w, d))) continue;
      provoke(w, sh, w.mothership ?? d);
      d.hp = 0;
    }
  }
}
