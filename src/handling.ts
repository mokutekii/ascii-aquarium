import type { World, Ufo } from "./world";
import type { Sub } from "./deep";
import type { Mothership, AttackDrone } from "./encounters";
import { clamp } from "./math";
import { DRONE_MASS } from "./types";
export type Craft = Sub | Ufo | Mothership | AttackDrone;
interface Motion {
  vx: number;
  vy: number;
}

interface Hold {
  actor: Craft;
  dx: number;
  dy: number;
  x: number;
  y: number;
}

const holds = new WeakMap<World, Hold>();
const motions = new WeakMap<World, Map<Craft, Motion>>();
export const isCraftHeld = (w: World, actor: object) => holds.get(w)?.actor === actor;
export const cancelCraftMotion = (w: World, actor: Craft) => motions.get(w)?.delete(actor);
export const heldCraft = (w: World) => holds.get(w)?.actor;
export const isCraftDriven = (w: World, actor: object) => isCraftHeld(w, actor) || !!motions.get(w)?.has(actor as Craft);
export const craftVelocity = (w: World, actor: Craft) => motions.get(w)?.get(actor);
function live(w: World, a: Craft) {
  return a === w.mothership ? a.phase !== "collapse" && a.phase !== "leave"
    : w.subs.includes(a as Sub) || w.ufos.includes(a as Ufo) || w.attackDrones.includes(a as AttackDrone) && (a as AttackDrone).hp > 0;
}

export function moveCraft(w: World, a: Craft, dx: number, dy: number) {
  a.x += dx;
  a.y += dy;
  if ("maxBeams" in a) {
    a.hy += dy;
    a.tx += dx;
    a.beamX = a.x;
  }
  if ("pilot" in a && a.pilot?.alive) {
    a.pilot.x += dx;
    a.pilot.y += dy;
  }
}

export function kickCraft(w: World, a: Craft, vx: number, vy: number) {
  if (isCraftHeld(w, a))
    return;
  if ("stunned" in a) { vx /= DRONE_MASS; vy /= DRONE_MASS; }
  let map = motions.get(w);
  if (!map) {
    map = new Map();
    motions.set(w, map);
  }
  const old = map.get(a);
  map.set(a, { vx: clamp((old?.vx ?? 0) + vx, -800, 800), vy: clamp((old?.vy ?? 0) + vy, -800, 800) });
}

export function holdCraftAt(w: World, x: number, y: number) {
  const saucer = Math.max(40, Math.min(w.width, w.height) * .07);
  const cell = clamp(Math.round(w.width / 124), 8, 13);
  const choices: {
    a: Craft;
    rx: number;
    ry: number;
  }[] = [
      ...w.attackDrones.filter(d => d.hp > 0).map(a => ({ a, rx: cell * 3, ry: cell * 2.5 })),
      ...w.ufos.filter(a => !a.held).map(a => ({ a, rx: saucer, ry: saucer * .34 + 12 })),
      ...w.subs.filter(a => !a.seizedByKraken).map(a => ({ a, rx: cell * 12, ry: cell * 5 })),

    ];
  const hit = choices.find(({ a, rx, ry }) => ((a.x - x) / rx) ** 2 + ((a.y - y) / ry) ** 2 <= 1);
  if (!hit)
    return false;
  holds.set(w, { actor: hit.a, dx: hit.a.x - x, dy: hit.a.y - y, x: hit.a.x, y: hit.a.y });
  motions.get(w)?.delete(hit.a);
  w.holdTo = { x, y };
  w.holdVel = { x: 0, y: 0 };
  if ("targetShark" in hit.a && hit.a.targetShark) {
    hit.a.targetShark.lifted = false;
    hit.a.targetShark = null;
  }
  if ("stunned" in hit.a) { hit.a.returned = undefined; hit.a.stunned = w.time + .3; }
  if ("maxBeams" in hit.a) {
    hit.a.floatVx = 0;
    hit.a.floatVy = 0;
    hit.a.state = "seek";
    hit.a.beamTarget = undefined;
    hit.a.cargo?.clear();
  }
  return true;
}

export function releaseCraft(w: World) {
  const hold = holds.get(w);
  if (!hold)
    return false;
  holds.delete(w);
  if (!live(w, hold.actor))
    return true;
  const mass = hold.actor === w.mothership ? .58 : "hull" in hold.actor ? .8 : 1;
  kickCraft(w, hold.actor, w.holdVel.x * mass, w.holdVel.y * mass);
  return true;
}

export function clearHandling(w: World) { holds.delete(w); motions.delete(w); }
export function stepHandling(w: World, dt: number) {
  const hold = holds.get(w);
  if (hold) {
    if (!live(w, hold.actor))
      holds.delete(w);
    else {
      const x = clamp(w.holdTo.x + hold.dx, 15, w.width - 15), y = clamp(w.holdTo.y + hold.dy, 20, w.height - 25);
      const nx = hold.x + (x - hold.x) * Math.min(1, dt * 18), ny = hold.y + (y - hold.y) * Math.min(1, dt * 18);
      const ease = Math.min(1, dt * 12);
      w.holdVel.x += ((nx - hold.x) / Math.max(dt, .001) - w.holdVel.x) * ease;
      w.holdVel.y += ((ny - hold.y) / Math.max(dt, .001) - w.holdVel.y) * ease;
      moveCraft(w, hold.actor, nx - hold.actor.x, ny - hold.actor.y);
      hold.x = nx;
      hold.y = ny;
      if ("vx" in hold.actor) {
        hold.actor.vx = 0;
        hold.actor.vy = 0;
      }
    }
  }
  const map = motions.get(w);
  if (!map)
    return;
  for (const [a, m] of map) {
    if (!live(w, a) || isCraftHeld(w, a)) {
      map.delete(a);
      continue;
    }
    const freeHull = a === w.mothership;
    const nx = freeHull ? a.x + m.vx * dt : clamp(a.x + m.vx * dt, 15, w.width - 15);
    const ny = freeHull ? a.y + m.vy * dt : clamp(a.y + m.vy * dt, 20, w.height - 25);
    if (!freeHull && (nx === 15 || nx === w.width - 15))
      m.vx *= -.3;
    if (!freeHull && (ny === 20 || ny === w.height - 25))
      m.vy *= -.3;
    moveCraft(w, a, nx - a.x, ny - a.y);
    const damping = Math.exp(-dt * (a === w.mothership ? 1.15 : 1.8));
    m.vx *= damping;
    m.vy *= damping;
    if ("vx" in a) {
      a.vx = m.vx * .25;
      a.vy = m.vy * .25;
    }
    if (Math.hypot(m.vx, m.vy) < 6)
      map.delete(a);
  }
}
