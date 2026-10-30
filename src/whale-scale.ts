import { clamp } from "./math";
import type { World } from "./world";
/** Larger than a saucer, below the smallest Megalodon at the same tank size. */
export function whaleLength(width: number, height: number) {
  const side=Math.min(width,height), ghost=clamp(side*1.2,700,2400);
  const mega=Math.min(ghost*.8,clamp(side*.75,360,3450));
  return Math.min(mega*.8,Math.max(260,side*.58));
}
/** Whales are peaceful: a blast near any part of the body only frightens them, and they recoil and swim clear. */
export function scareWhalesFromBlast(w: World, x: number, y: number, radius: number) {
  for (const wh of w.whales) {
    let near = false;
    for (let i = 0; i <= 8 && !near; i++) {
      const p = w.whalePoint(wh, i / 8);
      near = Math.hypot(p.x - x, p.y - y) < radius * 1.6 + 90;
    }
    if (!near) continue;
    const m = w.whaleMid(wh);
    wh.fleeing = true;
    wh.fleeHeading = Math.atan2(m.y - y, m.x - x);
    wh.speed = Math.max(wh.speed, 110);
  }
}
