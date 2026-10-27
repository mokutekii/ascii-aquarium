import { clamp } from "./math";
import type { Leviathan } from "./deep";

/** A moving cross-section of the ghost's long, gently undulating body. */
export function ghostFrame(lv: Leviathan, u: number) {
  const f = clamp(u, 0, 0.999) * (lv.spine.length - 1);
  const i = Math.floor(f);
  const k = f - i;
  const a = lv.spine[i];
  const b = lv.spine[i + 1];
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const heading = d > 0.001 ? Math.atan2(a.y - b.y, a.x - b.x) : lv.heading;
  // A small living yaw of the skull eases down the neck into the travelling body wave.
  const yaw = Math.sin(lv.phase * 0.85) * 0.065 * Math.exp(-u * 12);
  const tx = Math.cos(heading + yaw);
  const ty = Math.sin(heading + yaw);
  const bend = Math.sin(lv.phase - u * 5.5) * lv.length * 0.018 * Math.pow(u, 0.9)
    + Math.sin(lv.phase * 0.85) * lv.length * 0.005 * Math.exp(-u * 8);
  return { x: a.x + (b.x - a.x) * k - ty * bend, y: a.y + (b.y - a.y) * k + tx * bend, tx, ty, nx: -ty, ny: tx };
}

/** Broad shoulders and a substantial trunk under the membrane, tapering only toward the tail. */
export function ghostHalfWidth(length: number, u: number) {
  if (u < 0.18) return length * (0.045 + 0.052 * Math.sin((u / 0.18) * Math.PI / 2));
  return length * (0.004 + 0.093 * Math.pow(clamp((1 - u) / 0.82, 0, 1), 1.15));
}

/** Collision and avoidance follow the visible body and broad skull, including its gentle head sway. */
export function ghostBlobs(lv: Leviathan) {
  const pts: { x: number; y: number; r: number }[] = [];
  for (let u = 0.04; u < 1; u += 0.045) {
    const f = ghostFrame(lv, u);
    pts.push({ x: f.x, y: f.y, r: ghostHalfWidth(lv.length, u) });
  }
  const h = ghostFrame(lv, 0.035);
  for (const side of [-1, 1]) {
    for (let u = 0.12; u <= 1; u += 0.11) {
      const sweep = -lv.length * 0.065 * Math.sin(u * Math.PI) + lv.length * 0.035 * Math.pow(u, 5);
      const spread = side * lv.length * 0.36 * u;
      pts.push({ x: h.x + h.tx * sweep + h.nx * spread, y: h.y + h.ty * sweep + h.ny * spread,
        r: lv.length * (0.027 * Math.pow(1 - u, 0.8) + 0.015) });
    }
  }
  return pts;
}

/** First visible body section crossed by a laser segment. */
export function ghostRayHit(lv: Leviathan, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const d2 = dx * dx + dy * dy;
  let first = Infinity;
  let hit: { x: number; y: number } | null = null;
  for (const p of ghostBlobs(lv)) {
    const u = d2 > 0 ? clamp(((p.x - ax) * dx + (p.y - ay) * dy) / d2, 0, 1) : 0;
    const x = ax + dx * u, y = ay + dy * u;
    if (u < first && Math.hypot(x - p.x, y - p.y) < p.r) { first = u; hit = { x, y }; }
  }
  return hit;
}

