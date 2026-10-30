import { UFO_HITS_TO_BREAK } from "./types";
import type { Fish, World, Shark, Ufo, Kraken, Whale } from "./world";
import type { Leviathan, Sub, GhostTarget } from "./deep";
import type { Mothership, AttackDrone, EncounterShot } from "./encounters";
import { actorAlive, actorPosition, provoke, type Offender } from "./provocation";
import { teamOf, laserColor } from "./factions";
import { provokeSharkDrone, provokeSharkCraft, provokeDrone } from "./drones";
import { bodyPoints, segmentHit } from "./collision-bodies";
import { interruptTractor } from "./tractor";
import { hullPoint } from "./ufo-motion";
export type Combatant = Fish | Sub | Ufo | Shark | Kraken | Mothership | AttackDrone | Leviathan | Whale;
const muzzle = (w: World, o: Combatant) => {
  const p = actorPosition(o);
  if (o === w.mothership)
    return hullPoint(w.mothership!, 0, w.mothership!.size * .171);
  if ("maxBeams" in o)
    return { x: p.x, y: p.y + Math.max(40, Math.min(w.width, w.height) * .07) * .18 };
  if (w.fish.includes(o as Fish)) {
    const f = o as Fish, cw = Math.max(8, Math.min(13, Math.round(w.width / 124))), a = Math.atan2(f.vy, f.vx || 1);
    const front = f.dkind === "photo" ? .1 : 1.9, side = f.dkind === "photo" ? 2.2 : 1.1;
    return { x: p.x + Math.cos(a) * cw * front + Math.sin(a) * cw * side, y: p.y + Math.sin(a) * cw * front - Math.cos(a) * cw * side };
  }
  return p;
};
export function queueShot(w: World, source: Combatant, target: Combatant, hostile: boolean, damage = 1, flash = false) {
  if (w.encounterShots.length >= 64)
    return;
  const a = muzzle(w, source), b = actorPosition(target);
  w.encounterShots.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y, born: w.time, fireAt: w.time + (hostile ? 1.1 : .12), hostile, resolved: false, source, target, damage, flash, team: teamOf(w, source), rgb: laserColor(w, source) });
}

const radius = (w: World, o: Combatant) => o === w.mothership ? w.mothership!.size * .22 : "nodes" in o ? o.length * .08 : "hull" in o ? 50 : "maxBeams" in o ? 65 : "size" in o ? o.size * .22 : 28;
/** The active ray hits the first visible body, including allies dragged into its path. */
export function resolveShots(w: World) {
  let bodies: { actor: Combatant; points: ReturnType<typeof bodyPoints> }[] | undefined;
  for (const shot of w.encounterShots) {
    if (!shot.resolved) {
      if (shot.source) {
        if (!actorAlive(w, shot.source)) { shot.resolved = true; shot.fireAt = Math.min(shot.fireAt, w.time - .4); continue; }
        const team = teamOf(w, shot.source);
        if (shot.team && team !== shot.team || shot.target && team !== "wild" && team === teamOf(w, shot.target)) {
          shot.resolved = true; shot.fireAt = w.time - .4; continue;
        }
        const point = muzzle(w, shot.source);
        if (!shot.fixedOrigin) { shot.x0 = point.x; shot.y0 = point.y; }
      }
      if (shot.target && actorAlive(w, shot.target) && (w.time - shot.born < .4 || !shot.hostile)) {
        const point = actorPosition(shot.target);
        shot.x1 = point.x; shot.y1 = point.y;
      }
      if (w.time < shot.fireAt) continue;
    } else if (w.time - shot.fireAt > .18 || shot.flash) continue;
    shot.resolved = true;
    shot.hit ??= new Set();
    bodies ??= [
      ...w.fish.filter(f => f.alive && !f.riding), ...w.ufos, ...w.subs,
      ...w.sharks, ...w.whales, ...w.attackDrones,
      ...(w.kraken ? [w.kraken] : []), ...(w.leviathan ? [w.leviathan] : []),
      ...(w.mothership ? [w.mothership] : []),
    ].filter(actor => actorAlive(w, actor)).map(actor => ({ actor, points: bodyPoints(w, actor) }));
    let victim: Combatant | undefined, first = Infinity;
    for (const body of bodies) {
      if (body.actor === shot.source || !actorAlive(w, body.actor)) continue;
      // Allied saucers can cross mothership beams while defending their fleet.
      if (shot.source === w.mothership && "maxBeams" in body.actor && teamOf(w, body.actor) === "alien") continue;
      const distance = segmentHit(shot.x0, shot.y0, shot.x1, shot.y1, body.points);
      if (distance < first) { first = distance; victim = body.actor; }
    }
    if (!victim || shot.hit.has(victim)) continue;
    shot.hit.add(victim);
    shot.x1 = shot.x0 + (shot.x1 - shot.x0) * first;
    shot.y1 = shot.y0 + (shot.y1 - shot.y0) * first;
    if (shot.source && teamOf(w, shot.source) !== "wild" && teamOf(w, shot.source) === teamOf(w, victim)) {
      if ("hull" in victim || "maxBeams" in victim || victim === w.mothership) {
        w.notices.push("friendly fire... a craft crossed a live laser!");
      }
    }
    applyShotDamage(w, shot, victim);
    w.events.push({ kind: "eat", x: shot.x1, y: shot.y1 });
  }
}

function applyShotDamage(w: World, shot: EncounterShot, target: Combatant) {
  const damage = shot.damage ?? 1;
  const p = actorPosition(target), r = radius(w, target);
    if (w.attackDrones.includes(target as AttackDrone)) {
      const drone = target as AttackDrone;
      drone.hp -= damage;
      if (damage > 0) provokeDrone(w, drone, shot.source);
      if (shot.flash)
        drone.stunned = w.time + 2.5;
    }
    else if (target === w.mothership)
      w.mothership!.hp -= damage;
    else if (w.subs.includes(target as Sub)) {
      const sub = target as Sub;
      sub.hull -= damage;
      sub.hitAt = w.time;
      sub.fleeUntil = w.time + 3;
      sub.fleeFrom = { x: shot.x0, y: shot.y0 };
      if (sub.hull <= 0)
        w.destroySub(sub, "alien fire has breached a submarine...");
    }
    else if (w.ufos.includes(target as Ufo)) {
      const u = target as Ufo;
      u.hits = (u.hits ?? 0) + damage;
      if (damage > 0) u.hitAt = w.time;
      if (u.hits >= UFO_HITS_TO_BREAK)
        w.destroyUfo("shot", u);
      else if (damage > 0)
        interruptTractor(w, u);
    }
    else if (w.sharks.includes(target as Shark)) {
      const sh = target as Shark;
      if (sh.mega && damage > 0) sh.hitAt = w.time;
      if (sh.mega && shot.source)
        provoke(w, sh, w.attackDrones.includes(shot.source as AttackDrone) && w.mothership ? w.mothership : shot.source as Offender);
      else if (shot.source && (shot.source === w.mothership || w.ufos.includes(shot.source as Ufo)))
        provokeSharkCraft(w, sh, shot.source as import("./encounters").Mothership | Ufo);
      else if (shot.source && w.attackDrones.includes(shot.source as AttackDrone))
        provokeSharkDrone(w, sh, shot.source as AttackDrone);
      else {
        sh.heading = Math.atan2(p.y - shot.y0, p.x - shot.x0);
        sh.speed = 150;
        sh.target = null;
        sh.alertUntil = w.time + 1.5;
      }
    }
    else if (target === w.kraken && shot.source) {
      w.kraken!.hitAt = w.time;
      provoke(w, w.kraken!, shot.source as Offender);
    }
    else if (target === w.leviathan && shot.source) {
      const source = shot.source;
      if (source === w.mothership || w.attackDrones.includes(source as AttackDrone) || w.ufos.includes(source as Ufo) || w.subs.includes(source as Sub) || w.fish.includes(source as Fish)) {
        w.agitateLeviathan(p.x, p.y, r, source as GhostTarget);
      }
    }
    else if (w.whales.includes(target as Whale)) {
      const whale = target as Whale;
      whale.fleeing = true;
      whale.fleeHeading = Math.atan2(whale.y - shot.y0, whale.x - shot.x0);
    }
    else if (w.fish.includes(target as Fish)) {
      const f = target as Fish;
      if (!f.diver) {
        f.alarm = 1;
        if (damage > 0) { f.alive = false; f.respawnAt = w.time + 6; }
        return;
      }
      if (w.absorbDiverShield(f)) return;
      let state = w.diverCombat.get(f);
      if (!state) {
        state = { nextShot: w.time + 1, hits: 0, hitAt: -99, nextRepair: w.time + 4 };
        w.diverCombat.set(f, state);
      }
      if (w.time - state.hitAt < 2)
        return;
      state.hits++;
      state.hitAt = w.time;
      f.stunUntil = w.time + 1.2;
      if (state.hits >= 3)
        w.popDiver(f, "blast");
      else
        w.callout(f.x, f.y - 30, "HIT", "255,150,100");
    }

}

// Sweeping radial volleys use the normal ray collision and damage path.
const spinShots = new WeakMap<Mothership, number>();
export function spinLasers(w: World, b: Mothership, age: number) {
  if (w.time < (spinShots.get(b) ?? 0)) return;
  spinShots.set(b, w.time + .28);
  for (let i = 0; i < 6 && w.encounterShots.length < 64; i++) {
    const a = age * 2.4 + i * Math.PI / 3, reach = Math.hypot(w.width, w.height);
    w.encounterShots.push({ x0: b.x + Math.cos(a) * b.size * .96, y0: b.y + Math.sin(a) * b.size * .3,
      x1: b.x + Math.cos(a) * reach, y1: b.y + Math.sin(a) * reach,
      born: w.time, fireAt: w.time + .22, hostile: true, resolved: false, damage: 1, source: b, fixedOrigin: true, rgb: laserColor(w, b) });
  }
}
