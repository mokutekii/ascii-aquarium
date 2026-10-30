import type { World } from "./world";
import { bodyPoints } from "./collision-bodies";
import { angleDiff, clamp } from "./math";

/** Fear steers early; full-body projection prevents small sharks passing through titans. */
export function stepSharkSafety(w: World, dt: number) {
  const giants = [
    ...w.sharks.filter(s => s.mega),
    ...(w.kraken ? [w.kraken] : []),
    ...(w.mothership && w.mothership.phase === "battle" && (!w.mothership.warp || w.mothership.warp.moved) ? [w.mothership] : []),
  ];
  if (!giants.length) return;
  const hulls = giants.map(actor => ({ actor, points: bodyPoints(w, actor) }));

  for (const shark of w.sharks) {
    if (shark.mega || shark.grabbed || shark.lifted) continue;
    for (const { actor, points } of hulls) {
      let deepest = 0, nx = 0, ny = 0;
      let nearest = Infinity, fleeX = 0, fleeY = 0;
      for (let i = 0; i < shark.nodes.length; i += 6) {
        const x = shark.nodes[i], y = shark.nodes[i + 1];
        for (const p of points) {
          const dx = x - p.x, dy = y - p.y, distance = Math.hypot(dx, dy);
          const gap = distance - p.r - shark.length * .055;
          if (gap < nearest) { nearest = gap; fleeX = dx; fleeY = dy; }
          const overlap = -gap;
          if (overlap > deepest) {
            deepest = overlap;
            nx = distance > .001 ? dx / distance : -Math.sin(shark.heading);
            ny = distance > .001 ? dy / distance : Math.cos(shark.heading);
          }
        }
      }
      if (deepest > 0) {
        for (let i = 0; i < shark.nodes.length; i += 2) {
          shark.nodes[i] += nx * Math.min(deepest + 4, 65 * dt);
          shark.nodes[i + 1] += ny * Math.min(deepest + 4, 65 * dt);
        }
      }
      if (nearest < shark.length * .3 + 100) {
        const away = Math.atan2(fleeY, fleeX);
        shark.heading += clamp(angleDiff(shark.heading, away), -dt * 2.2, dt * 2.2);
        shark.target = null;
        shark.speed = Math.max(shark.speed, 115);
        shark.alertUntil = w.time + 1.8;
      }
    }
  }
}
