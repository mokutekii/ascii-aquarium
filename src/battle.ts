import type { World, Fish, Ufo } from "./world";
import type { Combatant } from "./combat";
import { queueShot } from "./combat";
import { actorAlive, actorPosition } from "./provocation";
import { clamp, rand, TAU } from "./math";
import { isCraftHeld } from "./handling";
import { moveUfoToward } from "./ufo-motion";
import { tractorContains } from "./tractor";
export interface AttackProfile {
  distance: number;
  angle: number;
  pace: number;
  nextShot: number;
}

interface Squad {
  desired: number;
  members: Set<Combatant>;
  attempts: number;
  nextRecruit: number;
  pressureStage?: number;
}

interface BattleState {
  profiles: WeakMap<object, AttackProfile>;
  squads: Map<Combatant, Squad>;
}

const states = new WeakMap<World, BattleState>();
function state(w: World) {
  let s = states.get(w);
  if (!s) {
    s = { profiles: new WeakMap(), squads: new Map() };
    states.set(w, s);
  }
  return s;
}

export function attackProfile(w: World, actor: object): AttackProfile {
  const s = state(w);
  let p = s.profiles.get(actor);
  if (!p) {
    p = { distance: rand(180, 500), angle: rand(0, TAU), pace: rand(.75, 1.35), nextShot: w.time + rand(.4, 3.8) };
    s.profiles.set(actor, p);
  }
  return p;
}
/** Each shot rolls a fresh interval; distance changes cadence rather than synchronising a squad clock. */
export function nextAttackAt(w: World, actor: object, distance: number, base = 2) {
  const p = attackProfile(w, actor);
  const boss = w.mothership;
  const defender = boss?.phase === "battle" && actor !== boss && (w.fish.includes(actor as Fish) || w.subs.includes(actor as never) || w.ufos.some(u => u === actor && u.pilot?.alive));
  const pressure = defender ? Math.min(1, Math.max(0, w.time - boss.born - 10) / 120) : 0;
  return w.time + (base * p.pace * rand(.72, 1.35) + clamp(distance / 650, 0, 1.6)) / (1 + pressure * .6);
}

export function nearestOpponent<T extends Combatant>(w: World, from: {
  x: number;
  y: number;
}, choices: T[], range = 1050) {
  let best: T | undefined, distance = range;
  for (const actor of choices) {
    if (!actorAlive(w, actor))
      continue;
    const p = actorPosition(actor), d = Math.hypot(p.x - from.x, p.y - from.y);
    if (d < distance) {
      distance = d;
      best = actor;
    }
  }
  return best;
}

export function ufoOpponent(w: World, u: Ufo) {
  return nearestOpponent<Combatant>(w, u, u.pilot?.alive
    ? [...w.ufos.filter(v => v !== u && !v.pilot?.alive), ...w.attackDrones.filter(d => d.hp > 0), ...(w.mothership?.phase === "battle" ? [w.mothership] : [])]
    : [...w.ufos.filter(v => v !== u && v.pilot?.alive), ...w.subs.filter(s => !s.leaving), ...w.fish.filter(f => f.diver && f.alive && !f.riding && !f.held && !f.seized)]);
}

export function fireUfoBattle(w: World, u: Ufo) {
  const battle = w.mothership?.phase === "battle" || !!u.pilot?.alive || w.ufos.some(v => v !== u && v.pilot?.alive);
  if (!battle)
    return false;
  if (u.held || isCraftHeld(w, u) || u.y < 0 || u.pilot && !u.boarded)
    return true;
  const p = attackProfile(w, u), target = ufoOpponent(w, u);
  if (w.time < p.nextShot || !target)
    return true;
  const pos = actorPosition(target);
  p.nextShot = nextAttackAt(w, u, Math.hypot(pos.x - u.x, pos.y - u.y), u.pilot?.alive ? 2.6 : 3.4);
  u.nextShot = p.nextShot;
  queueShot(w, u, target, !u.pilot?.alive, u.pilot?.alive ? 2 : 1);
  return true;
}
/** Saucer dogfights orbit a stable personal offset instead of all pursuing one point. */
export function steerBattleUfo(w: World, u: Ufo, dt: number) {
  if (u.state === "enter" || u.state === "leave" || u.held || isCraftHeld(w, u) || u.pilot && !u.boarded)
    return false;
  if (!u.pilot?.alive && !w.ufos.some(v => v !== u && v.pilot?.alive))
    return false;
  const target = ufoOpponent(w, u);
  if (!target)
    return false;
  const p = attackProfile(w, u), pos = actorPosition(target), a = p.angle + w.time * .055;
  const tx = clamp(pos.x + Math.cos(a) * p.distance, 80, w.width - 80);
  const ty = clamp(pos.y + Math.sin(a) * p.distance * .6, 70, w.height - 90);
  moveUfoToward(u, tx, ty, 125, dt);
  u.hy = u.y;
  u.beamX = u.x;
  u.state = "seek";
  u.aim = null;
  if (u.targetShark)
    u.targetShark.lifted = false;
  u.targetShark = null;
  u.beamTarget = undefined;
  return true;
}

export function clearBattles(w: World) { states.delete(w); }
export function stepTractorDefense(w: World) {
  if (!w.ufos.length)
    return;
  const beams = w.ufos.filter(u => u.state === "beam" && !u.held);
  if (!beams.length)
    return;
  for (const f of w.fish) {
    if (!f.diver || !f.alive || f.riding || f.held || f.seized || f.dragger || !["tech", "scuba", "scooter"].includes(f.dkind ?? "scuba"))
      continue;
    const u = beams.find(u => !u.pilot?.alive && (tractorContains(w, u, f) || f.dkind === "tech" && Math.hypot(u.x - f.x, u.y - f.y) < 420));
    if (!u)
      continue;
    const p = attackProfile(w, f);
    if (w.time < p.nextShot)
      continue;
    p.nextShot = nextAttackAt(w, f, Math.hypot(u.x - f.x, u.y - f.y), 1.8);
    queueShot(w, f, u, false, 1);
    f.flashAt = w.time;
  }
}

export function battleStation(w: World, actor: Combatant) {
  for (const [target, squad] of state(w).squads) {
    if (!squad.members.has(actor) || !actorAlive(w, target))
      continue;
    const p = attackProfile(w, actor), pos = actorPosition(target), angle = p.angle + w.time * .035;
    const distance = p.distance + (target === w.mothership ? w.mothership!.size : 80);
    return { x: clamp(pos.x + Math.cos(angle) * distance, 90, w.width - 90), y: clamp(pos.y + Math.sin(angle) * distance * .6, 90, w.height - 90) };
  }
  return undefined;
}

export function stepBattles(w: World, dt: number) {
  const s = state(w);
  if (w.mothership?.phase !== "battle" && !w.ufos.some(u => !u.pilot?.alive && u.state !== "leave" && u.y >= 0)) {
    s.squads.clear();
    return;
  }
  const enemies: Combatant[] = [
    ...(w.mothership?.phase === "battle" ? [w.mothership] : []),
    ...w.ufos.filter(u => !u.pilot?.alive && u.state !== "leave" && u.y >= 0),
  ];
  for (const target of s.squads.keys())
    if (!enemies.includes(target))
      s.squads.delete(target);
  const claimed = new Set<Combatant>();
  for (const squad of s.squads.values())
    for (const member of squad.members)
      claimed.add(member);
  const available: Combatant[] = [
    ...w.fish.filter(f => f.diver && f.alive && !f.riding && !f.seized && !f.dragger && !f.held),
    ...w.subs.filter(sub => !sub.leaving && !sub.seizedByKraken), ...w.ufos.filter(u => u.pilot?.alive),
  ];
  for (const target of enemies) {
    let squad = s.squads.get(target);
    if (!squad) {
      const boss = target === w.mothership;
      squad = { desired: (boss ? 2 : 1) + Math.floor(Math.random() ** 1.8 * (boss ? 9 : 5)), members: new Set(), attempts: 0, nextRecruit: w.time + rand(3, 7) };
      s.squads.set(target, squad);
    }
    if (target === w.mothership) {
      const stage = Math.min(4, Math.floor(Math.max(0, w.time - w.mothership.born - 10) / 30));
      squad.desired += Math.max(0, stage - (squad.pressureStage ?? 0));
      squad.pressureStage = stage;
    }
    const pos = actorPosition(target);
    const nearby = available.filter(a => !claimed.has(a)).sort((a, b) => {
      const x = actorPosition(a), y = actorPosition(b);
      return Math.hypot(x.x - pos.x, x.y - pos.y) - Math.hypot(y.x - pos.x, y.y - pos.y);
    });
    for (const ally of nearby) {
      if (squad.members.size >= squad.desired)
        break;
      const p = actorPosition(ally);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) > 1500)
        continue;
      squad.members.add(ally);
      claimed.add(ally);
    }
    if (squad.members.size < squad.desired && squad.attempts < squad.desired && w.time >= squad.nextRecruit) {
      squad.attempts++;
      squad.nextRecruit = w.time + rand(3, 7);
      const subsBefore = w.subs.length;
      if (Math.random() < .2 && w.isEventEnabled("sub"))
        w.spawnSub();
      if (w.subs.length > subsBefore) {
        const sub = w.subs[w.subs.length - 1];
        squad.members.add(sub);
        claimed.add(sub);
      }
      else if (w.isEventEnabled("diver") && w.fish.filter(f => f.diver && f.alive).length + w.diverQueue.length < w.diverCap) {
        // One arrival at a time. The spent attempt remains spent even if an arrival is lost.
        w.diverQueue.push(w.time);
      }
    }
    for (const member of squad.members) {
      if (!w.fish.includes(member as Fish))
        continue;
      const f = member as Fish;
      if (!f.alive || !f.diver || f.riding || f.seized || f.dragger || f.held || (f.stunUntil ?? 0) > w.time)
        continue;
      const p = attackProfile(w, f);
      const angle = p.angle + w.time * .045;
      const radius = target === w.mothership ? w.mothership!.size + p.distance * .65 : p.distance;
      let tx = clamp(pos.x + Math.cos(angle) * radius, 45, w.width - 45);
      let ty = clamp(pos.y + Math.sin(angle) * radius * .6, 95, w.height - 60);
      for (const other of squad.members) {
        if (other === f || !actorAlive(w, other))
          continue;
        const q = actorPosition(other), dx = f.x - q.x, dy = f.y - q.y, d = Math.hypot(dx, dy);
        if (d < 95) {
          const a = d > .01 ? Math.atan2(dy, dx) : p.angle;
          tx += Math.cos(a) * (95 - d);
          ty += Math.sin(a) * (95 - d);
        }
      }
      f.x += clamp(tx - f.x, -105 * dt, 105 * dt);
      f.y += clamp(ty - f.y, -90 * dt, 90 * dt);
      let health = w.diverCombat.get(f);
      if (!health) {
        health = { nextShot: p.nextShot, hits: 0, hitAt: -99, nextRepair: w.time + rand(3, 5) };
        w.diverCombat.set(f, health);
      }
      for (const shot of w.encounterShots)
        if (shot.hostile && !shot.resolved && w.time < shot.fireAt && Math.hypot(f.x - shot.x1, f.y - shot.y1) < 75) {
          f.x += (f.x < pos.x ? -1 : 1) * dt * (f.dkind === "scooter" ? 210 : 145);
        }
      if (f.dkind === "tech" && w.time >= health.nextRepair) {
        health.nextRepair = w.time + 4;
        for (const ally of w.fish) {
          const h = w.diverCombat.get(ally);
          if (h && Math.hypot(ally.x - f.x, ally.y - f.y) < 220)
            h.hits = Math.max(0, h.hits - 1);
        }
      }
      const victim = nearestOpponent(w, f, [...w.attackDrones.filter(d => d.hp > 0), ...enemies], 950);
      if (!victim || w.time < p.nextShot)
        continue;
      const q = actorPosition(victim);
      p.nextShot = nextAttackAt(w, f, Math.hypot(q.x - f.x, q.y - f.y), f.dkind === "bomber" ? 3.5 : f.dkind === "photo" ? 2.5 : 1.8);
      health.nextShot = p.nextShot;
      queueShot(w, f, victim, false, f.dkind === "photo" ? 0 : f.dkind === "bomber" ? 3 : 1, f.dkind === "photo");
      f.flashAt = w.time;
    }
  }
}
