import { UFO_HITS_TO_BREAK } from "./types";
import type { World, Shark, Ufo } from "./world";
import type { AttackDrone, Mothership } from "./encounters";
import { touchesHull } from "./hull-combat";
import { isCraftHeld, isCraftDriven, kickCraft } from "./handling";
import { provoke, actorAlive } from "./provocation";
import { ghostBlobs } from "./leviathan";
import { clamp } from "./math";
import { interruptTractor } from "./tractor";
import { bodyPoints, segmentHit } from "./collision-bodies";
import { droneArmFrame, DRONE_RELEASE_TIME } from "./drone-arm";
const hunts = new WeakMap<World, WeakMap<Shark, {
  target: AttackDrone | Mothership | Ufo;
  until: number;
}>>();
export function provokeSharkDrone(w: World, sh: Shark, target: AttackDrone) {
  provokeSharkCraft(w, sh, target);
}

export function provokeSharkCraft(w: World, sh: Shark, target: AttackDrone | Mothership | Ufo) {
  let map = hunts.get(w);
  if (!map) {
    map = new WeakMap();
    hunts.set(w, map);
  }
  map.set(sh, { target, until: w.time + 10 });
  sh.rageUntil = Math.max(sh.rageUntil ?? 0, w.time + 10);
  sh.target = null;
  sh.alertUntil = w.time + 2;
}

export function sharkDroneTarget(w: World, sh: Shark) {
  if (sh.mega || sh.grabbed || sh.lifted || sh.dragging || w.fight && (w.fight.a === sh || w.fight.b === sh))
    return;
  const hunt = hunts.get(w)?.get(sh);
  if (hunt && hunt.until > w.time && actorAlive(w, hunt.target))
    return hunt.target;
  const near = w.attackDrones.find(d => d.hp > 0 && !d.returned && Math.hypot(d.x - sh.nodes[0], d.y - sh.nodes[1]) < sh.length * .45 + 85);
  if (near) {
    provokeSharkDrone(w, sh, near);
    return near;
  }
}
/** Fly to an escort station; an intersected hull gets a side waypoint rather than a position jump. */
export function escortDrone(w: World, b: Mothership, d: AttackDrone, tx: number, ty: number, dt: number) {
  let blocked = false;
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    if (touchesHull(b, d.x + (tx - d.x) * t, d.y + (ty - d.y) * t, 48)) {
      blocked = true;
      break;
    }
  }
  if (blocked) {
    const side = d.x < b.x ? -1 : 1;
    if (Math.abs(d.x - b.x) < b.size + 70) {
      tx = clamp(b.x + side * (b.size + 100), 30, w.width - 30);
      ty = d.y + (d.y < b.y ? -20 : 20);
    }
    else {
      tx = d.x;
      ty = b.y + b.size * .3 + 100;
    }
  }
  // Other large bodies are obstacles, while local fish and divers can still be hit accidentally.
  let dx = tx - d.x, dy = ty - d.y;
  const avoid = (x: number, y: number, r: number) => {
    const ox = d.x - x, oy = d.y - y, len = Math.hypot(ox, oy) || 1;
    if (len < r) {
      dx += ox / len * (r - len) * 3;
      dy += oy / len * (r - len) * 3;
    }
  };
  for (const s of w.subs)
    avoid(s.x, s.y, 180);
  for (const u of w.ufos)
    avoid(u.x, u.y, 145);
  for (const wh of w.whales)
    for (const u of [.15, .45, .8]) {
      const p = w.whalePoint(wh, u);
      avoid(p.x, p.y, wh.length * .12 + 45);
    }
  if (w.kraken)
    avoid(w.kraken.x, w.kraken.y, w.kraken.size * .35 + 70);
  for (const sh of w.sharks)
    if (sh.mega)
      for (let i = 0; i < sh.nodes.length; i += 8)
        avoid(sh.nodes[i], sh.nodes[i + 1], sh.length * .09 + 60);
  for (const other of w.attackDrones)
    if (other !== d)
      avoid(other.x, other.y, 80);
  const distance = Math.hypot(dx, dy) || 1, speed = Math.min(235 * (1 + droneRage(w, d) * .65), distance * 1.5);
  d.x += dx / distance * speed * dt;
  d.y += dy / distance * speed * dt;
}

export function droneRage(w: World, d: AttackDrone) {
  return (w.sagas ?? []).some(s => s.kind === "moon") ? 1 : clamp(((d.rageUntil ?? 0) - w.time) / 3, 0, 1);
}

export function provokeDrone(w: World, d: AttackDrone, source?: import("./provocation").Offender) {
  d.rageUntil = Math.max(d.rageUntil ?? 0, w.time + 10);
  if (source) d.aggressor = source;
}

export function detonateDrone(w: World, d: AttackDrone, reason = "a drone struck something and exploded...") {
  if (d.detonated)
    return;
  d.detonated = true;
  w.notices.push(reason);
  d.hp = 0;
  const x = d.x, y = d.y, R = 160;
  w.bombs.push({ x, y, born: w.time, r: R, source: w.mothership ?? d });
  w.splash(x, y, 1.7, undefined, { max: 320, weight: 2 });
  w.callout(x, y - 25, "DRONE IMPACT", "255,175,85");
  for (const f of w.fish) {
    if (!f.alive || f.held || f.riding || f.seized || f.dragger)
      continue;
    const dx = f.x - x, dy = f.y - y, dist = Math.hypot(dx, dy) || 1;
    if (dist > R)
      continue;
    f.vx += dx / dist * 180;
    f.vy += dy / dist * 180;
    f.alarm = 1;
    if (!f.diver && dist < R * .45) {
      f.alive = false;
      f.respawnAt = w.time + 6;
    }
    if (f.diver) {
      const h = w.diverCombat.get(f) ?? { hits: 0, hitAt: -99, nextShot: w.time + 2, nextRepair: w.time + 4 };
      if (w.time - h.hitAt > 2) {
        h.hits++;
        h.hitAt = w.time;
        f.stunUntil = w.time + 1;
        w.diverCombat.set(f, h);
        if (h.hits >= 3)
          w.popDiver(f, "blast");
      }
    }
  }
  for (const s of [...w.subs]) {
    const dx = s.x - x, dy = s.y - y, dist = Math.hypot(dx, dy) || 1;
    if (dist > R + 40)
      continue;
    kickCraft(w, s, dx / dist * 140, dy / dist * 140);
    if (dist < R * .7) {
      s.hull--;
      s.hitAt = w.time;
      if (s.hull <= 0)
        w.destroySub(s, "a drone impact breached a submarine...");
    }
  }
  for (const u of [...w.ufos])
    if (Math.hypot(u.x - x, u.y - y) < R) {
      u.hits = (u.hits ?? 0) + 1;
      u.hitAt = w.time;
      if (u.hits >= UFO_HITS_TO_BREAK)
        w.destroyUfo("blasted", u);
      else
        interruptTractor(w, u);
    }
  const b = w.mothership;
  if (b && (!b.warp || b.warp.moved) && touchesHull(b, x, y, 60))
    b.hp -= b.maxHp * .025;
  const offender = b ?? d;
  w.agitateLeviathan(x, y, R, offender);
  for (const sh of w.sharks) {
    let near = false;
    for (let i = 0; i < sh.nodes.length; i += 4)
      if (Math.hypot(sh.nodes[i] - x, sh.nodes[i + 1] - y) < R + sh.length * .07) {
        near = true;
        break;
      }
    if (!near)
      continue;
    if (sh.mega) {
      sh.rageUntil = Math.max(sh.rageUntil ?? 0, w.time + 9);
      provoke(w, sh, offender);
    }
    else {
      sh.blastFlee = { x, y, until: w.time + 2 };
      sh.alertUntil = w.time + 2;
    }
  }
  if (w.kraken && Math.hypot(w.kraken.x - x, w.kraken.y - y) < R + w.kraken.size * .3) {
    w.kraken.rageUntil = Math.max(w.kraken.rageUntil ?? 0, w.time + 9);
    provoke(w, w.kraken, offender);
  }
  for (const other of w.attackDrones) {
    if (other === d || other.detonated) continue;
    const distance = Math.hypot(other.x - x, other.y - y);
    if (distance < R * 1.5) provokeDrone(w, other, offender);
    if (distance < R * .65) other.impactAt ??= w.time + .12;
  }
}

export function stepDroneImpacts(w: World) {
  if (!w.attackDrones.length) return;
  const actors: import("./provocation").Offender[] = [
    ...w.subs, ...w.ufos, ...w.sharks, ...w.whales,
    ...w.fish.filter(f => f.alive && !f.riding && !f.seized), ...w.attackDrones,
    ...(w.kraken ? [w.kraken] : []), ...(w.leviathan ? [w.leviathan] : []),
    ...(w.mothership?.phase === "battle" && (!w.mothership.warp || w.mothership.warp.moved) ? [w.mothership] : []),
  ];
  const bodies = actors.filter(actor => actorAlive(w, actor)).map(actor => ({ actor, points: bodyPoints(w, actor) }));
  for (const d of w.attackDrones) {
    if (d.detonated || d.hp <= 0) continue;
    if (d.impactAt !== undefined && w.time >= d.impactAt) {
      detonateDrone(w, d, "one drone explosion set off another...");
      continue;
    }
    if (d.returned && w.time - d.returned.at < DRONE_RELEASE_TIME) continue;
    if (isCraftDriven(w, d) && (d.x <= 20 || d.x >= w.width - 20 || d.y <= 25 || d.y >= w.height - 30)) {
      detonateDrone(w, d, "a drone hit the edge and exploded...");
      continue;
    }
    const hit = bodies.find(body => body.actor !== d && actorAlive(w, body.actor)
      && segmentHit(d.x, d.y, d.x, d.y, body.points.map(p => ({ ...p, r: p.r + 8 }))) < Infinity);
    if (!hit) continue;
    const actor = hit.actor;
    const name = actor === w.mothership ? "the mothership"
      : actor === w.kraken ? "the kraken" : actor === w.leviathan ? "the Ghost Leviathan"
      : "nodes" in actor ? actor.mega ? "the megalodon" : `a ${actor.kind}`
      : "hull" in actor ? "a submarine" : "maxBeams" in actor ? actor.pilot?.alive ? "a hijacked UFO" : "a UFO"
      : "alive" in actor ? actor.diver ? "a diver" : "a fish"
      : w.whales.includes(actor as never) ? "a whale" : "another drone";
    detonateDrone(w, d, `a drone struck ${name} and exploded...`);
  }
}

export function stepReturningDrones(w: World, dt: number) {
  for (const d of w.attackDrones) {
    if (!d.returned || d.hp <= 0 || isCraftHeld(w, d)) continue;
    const r = d.returned;
    const age = w.time - r.at;
    if (r.dodge && age >= .5 && age < DRONE_RELEASE_TIME && w.kraken) {
      const a = Math.atan2(d.y - w.kraken.y, d.x - w.kraken.x) + (d.id % 2 ? .7 : -.7);
      d.returned = undefined; d.stunned = w.time + .6;
      kickCraft(w, d, Math.cos(a) * 200, Math.sin(a) * 200);
      continue;
    }
    if (w.kraken && age < DRONE_RELEASE_TIME) {
      const frame = droneArmFrame(w, w.kraken, d);
      if (frame.gripping) { d.x = frame.tipX; d.y = frame.tipY; }
    } else {
      if (!r.released) {
        if (w.kraken) {
          const frame = droneArmFrame(w, w.kraken, d);
          d.x = frame.tipX; d.y = frame.tipY;
        }
        if (w.mothership) {
          const a = Math.atan2(w.mothership.y - d.y, w.mothership.x - d.x);
          r.vx = Math.cos(a) * 420;
          r.vy = Math.sin(a) * 420;
        }
        r.released = true;
      }
      d.x += r.vx * dt;
      d.y += r.vy * dt;
    }
    if (age > DRONE_RELEASE_TIME + 4.5) d.hp = 0;
  }
}
