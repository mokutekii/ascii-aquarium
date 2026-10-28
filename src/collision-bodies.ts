import type { World } from "./world";
import type { Offender } from "./provocation";
import { ghostBlobs } from "./leviathan";
import { hullPoint } from "./ufo-motion";

export interface BodyCircle { x: number; y: number; r: number }

/** A few circles follow the visible outline, shared by impacts and laser interception. */
export function bodyPoints(w: World, actor: Offender): BodyCircle[] {
  const cell = Math.max(8, Math.min(13, Math.round(w.width / 124)));
  if (actor === w.mothership) {
    return [-.75, -.35, 0, .35, .75].map(x => ({ ...hullPoint(actor, x * actor.size, 0), r: actor.size * .18 }));
  }
  if (actor === w.leviathan) return ghostBlobs(actor);
  if (actor === w.kraken) {
    return [0, .3, .6].map(u => ({
      x: actor.x + Math.cos(actor.heading) * actor.size * u,
      y: actor.y + Math.sin(actor.heading) * actor.size * u,
      r: actor.size * (u === 0 ? .2 : .26),
    }));
  }
  if ("nodes" in actor) {
    const points: BodyCircle[] = [];
    for (let i = 0; i < actor.nodes.length / 2; i += 3) {
      const u = i / (actor.nodes.length / 2 - 1);
      points.push({ x: actor.nodes[i * 2], y: actor.nodes[i * 2 + 1], r: actor.length * (.035 + .055 * Math.sin(Math.PI * u)) });
    }
    return points;
  }
  if ("hull" in actor) {
    const angle = Math.atan2(actor.vy, Math.max(30, Math.abs(actor.vx))) * .9;
    return [-.7, 0, .7].map(u => ({
      x: actor.x + Math.cos(angle) * actor.face * u * cell * 11,
      y: actor.y + Math.sin(angle) * u * cell * 11,
      r: cell * 3.3,
    }));
  }
  if ("maxBeams" in actor) {
    const half = Math.max(40, Math.min(w.width, w.height) * .07);
    return [-.7, 0, .7].map(u => ({ ...hullPoint(actor, u * half, -half * .06), r: half * .23 + 5 }));
  }
  if (w.whales.includes(actor as never)) {
    const whale = actor as World["whales"][number];
    return [.05, .25, .5, .75, .95].map(u => ({ ...w.whalePoint(whale, u), r: whale.length * .09 }));
  }
  if ("alive" in actor) {
    if (!actor.diver) return [{ x: actor.x, y: actor.y, r: cell * .7 }];
    const heading = Math.atan2(actor.vy, actor.vx || 1);
    return [0, 1.8, 3.5].map(back => ({
      x: actor.x - Math.cos(heading) * cell * back,
      y: actor.y - Math.sin(heading) * cell * back,
      r: cell,
    }));
  }
  return [{ x: actor.x, y: actor.y, r: cell * 2 }];
}

export function bodiesOverlap(a: BodyCircle[], b: BodyCircle[]) {
  return a.some(p => b.some(q => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= (p.r + q.r) ** 2));
}

export function segmentHit(x0: number, y0: number, x1: number, y1: number, circles: BodyCircle[]) {
  const dx = x1 - x0, dy = y1 - y0, length2 = dx * dx + dy * dy;
  let first = Infinity;
  for (const circle of circles) {
    const ox = x0 - circle.x, oy = y0 - circle.y;
    const c = ox * ox + oy * oy - circle.r * circle.r;
    if (c <= 0) { first = 0; continue; }
    if (length2 < .0001) continue;
    const b = 2 * (ox * dx + oy * dy);
    const discriminant = b * b - 4 * length2 * c;
    if (discriminant < 0) continue;
    const t = (-b - Math.sqrt(discriminant)) / (2 * length2);
    if (t >= 0 && t <= 1) first = Math.min(first, t);
  }
  return first;
}
