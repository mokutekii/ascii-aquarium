import { bodyPoints, bodiesOverlap } from "./collision-bodies";
import { isCraftDriven, cancelCraftMotion } from "./handling";
import { angleDiff, clamp } from "./math";
import type { Fish, World, Shark, Kraken, Whale, Ufo } from "./world";
import type { Leviathan, Sub } from "./deep";
import type { AttackDrone, Mothership } from "./encounters";
export type Offender = Fish | Shark | Kraken | Whale | Ufo | Sub | AttackDrone | Mothership | Leviathan;
export interface Provocation {
  target: Offender;
  until: number;
  strikeAt: number;
  touchAt: number;
}

export const actorPosition = (o: Offender) => "nodes" in o ? { x: o.nodes[0], y: o.nodes[1] } : { x: o.x, y: o.y };
export function actorAlive(w: World, o: Offender): boolean {
  if (o === w.mothership)
    return o.hp > 0 && o.phase !== "collapse" && (!o.warp || o.warp.moved);
  return o === w.leviathan || o === w.kraken || w.fish.includes(o as Fish) && !!(o as Fish).alive
    || w.sharks.includes(o as Shark) || w.whales.includes(o as Whale) || w.ufos.includes(o as Ufo)
    || w.subs.includes(o as Sub) && (o as Sub).hull > 0 || w.attackDrones.includes(o as AttackDrone) && (o as AttackDrone).hp > 0;
}

export function provoke(w: World, titan: Shark | Kraken, source: Offender) {
  if (titan === source)
    return;
  const old = w.provocations.get(titan);
  titan.rageUntil = Math.max(titan.rageUntil ?? 0, w.time + 10);
  w.provocations.set(titan, { target: source, until: w.time + 10, strikeAt: old?.strikeAt ?? w.time + .8, touchAt: w.time });
}
/** Agitation means rage and a focus on the offender; blood moon can sustain it. */
export function stepProvocations(w: World, dt: number) {
  const titans: (Shark | Kraken)[] = [...w.sharks.filter(s => s.mega), ...(w.kraken ? [w.kraken] : [])];
  const actors: Offender[] = [...w.subs, ...w.ufos, ...w.whales, ...w.attackDrones, ...w.fish.filter(f => f.alive && !f.riding && !f.seized && !f.eoeBound), ...w.sharks.filter(s => !s.mega && !s.grabbed && !s.lifted)];
  for (const titan of titans) {
    const point = actorPosition(titan), mega = "nodes" in titan;
    if (mega && (titan.grabbed || titan.lifted || w.kraken?.wrapping === titan))
      continue;
    if (!mega && (titan.state === "wrap" || titan.maul))
      continue;
    const radius = mega ? titan.length * .09 : titan.size * .22;
    const current = w.provocations.get(titan);
    if (!current || w.time > current.until || !actorAlive(w, current.target)) {
      w.provocations.delete(titan);
      for (const actor of actors) {
        if (mega && "nodes" in actor) continue;
        const p = actorPosition(actor), padding = "hull" in actor ? 70 : "maxBeams" in actor ? 65 : 25;
        let near = Math.hypot(p.x - point.x, p.y - point.y) < radius + padding
          || (("hull" in actor || "maxBeams" in actor) && bodiesOverlap(bodyPoints(w, titan), bodyPoints(w, actor)));
        if (mega && !near)
          for (let n = 3; n < titan.nodes.length / 2; n += 3)
            if (Math.hypot(p.x - titan.nodes[n * 2], p.y - titan.nodes[n * 2 + 1]) < titan.length * .07 + padding) {
              near = true;
              break;
            }
        if (near) {
          provoke(w, titan, actor);
          if (("hull" in actor || "maxBeams" in actor) && isCraftDriven(w, actor)) w.provocations.get(titan)!.strikeAt = w.time;
          break;
        }
      }
    }
    const ag = w.provocations.get(titan);
    if (!ag)
      continue;
    if (w.time > ag.until || !actorAlive(w, ag.target)) {
      w.provocations.delete(titan);
      continue;
    }
    const target = actorPosition(ag.target), dx = target.x - point.x, dy = target.y - point.y, d = Math.hypot(dx, dy);
    if (mega) {
      if (w.fish.includes(ag.target as Fish))
        titan.biteTarget = { fish: ag.target as Fish, until: ag.until };
    }
    else {
      const aim = Math.atan2(dy, dx) + Math.PI;
      // Nearby threats are handled by independent arms; locomotion owns body rotation.
      if (ag.target === w.mothership) titan.hullUntil = ag.until;
      if (d > titan.size * 1.2 && w.mothership?.grapple?.kraken !== titan) {
        const step = Math.min(d, 30 * dt);
        titan.x += dx / (d || 1) * step;
        titan.y += dy / (d || 1) * step;
      }
      if (w.fish.includes(ag.target as Fish) && !titan.strike && d < titan.size * 1.2)
        titan.strike = { f: ag.target as Fish, at: w.time };
    }
    const reach = mega ? titan.length * .07 + 70 : titan.size * 1.15;
    // Mothership strikes require physical contact, resolved once by hull combat.
    if (ag.target === w.mothership)
      continue;
    // Craft damage is resolved once by full-body contact, including the jaws.
    if (mega && (w.subs.includes(ag.target as Sub) || w.ufos.includes(ag.target as Ufo))) continue;
    if (d > reach || w.time < ag.strikeAt)
      continue;
    ag.strikeAt = w.time + 3;
    w.retaliationArcs.push({ x0: point.x, y0: point.y, x1: target.x, y1: target.y, born: w.time, kraken: !mega });
    if (w.attackDrones.includes(ag.target as AttackDrone))
      (ag.target as AttackDrone).hp = 0;
    else if (ag.target === w.mothership)
      w.mothership!.hp -= mega ? 12 : 8;
    else if (w.subs.includes(ag.target as Sub)) {
      const sub = ag.target as Sub;
      if (!mega && !sub.seizedByKraken && (titan.state === "grab" || titan.state === "enter")) {
        cancelCraftMotion(w, sub);
        sub.seizedByKraken = true;
        sub.seizedAt = w.time;
        sub.crushAt = w.time + 5.5;
        sub.nextTorp = Math.min(sub.nextTorp, w.time + 3);
        w.callout(sub.x, sub.y - 40, "SUBMARINE SEIZED", "255,220,170");
        continue;
      }
      if (sub.seizedByKraken)
        continue;
      sub.hull -= mega ? 2 : 1;
      sub.hitAt = w.time;
      sub.fleeUntil = w.time + 4;
      sub.fleeFrom = point;
      if (sub.hull <= 0)
        w.destroySub(sub, "a titan has broken a submarine...");
    }
    else if (w.ufos.includes(ag.target as Ufo)) {
      const u = ag.target as Ufo;
      if (!mega && !titan.ufoHeld) {
        cancelCraftMotion(w, u); titan.ufoTarget = u; titan.ufoHeld = true;
        titan.ufoUntil = w.time + 5; u.held = true;
        w.callout(u.x, u.y - 35, "UFO CAUGHT", "255,220,170");
      } else if (mega) w.destroyUfo("crushed", u);
    }
    else if (w.sharks.includes(ag.target as Shark)) {
      const sh = ag.target as Shark;
      sh.heading = Math.atan2(target.y - point.y, target.x - point.x);
      sh.speed = 150;
      sh.target = null;
    }
  }
  w.retaliationArcs = w.retaliationArcs.filter(a => w.time - a.born < .55).slice(-12);
  for (const titan of w.provocations.keys())
    if (!titans.includes(titan as Shark | Kraken))
      w.provocations.delete(titan);
}
