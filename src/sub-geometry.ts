import type { Sub } from "./deep";
import { clamp } from "./math";

export const SUB_BOW = 10.5;

/** Simulation dimensions do not change when rendering quality drops. */
export function subGeometry(width: number, sub: Sub) {
  const cell = clamp(Math.round(width / 124), 8, 13);
  const ch = Math.round(cell * 1.45);
  const scale = sub.crew ? 1.55 : 1;
  const pitch = clamp(Math.atan2(sub.vy, Math.max(30, Math.abs(sub.vx))) * .9, -.4, .4);
  return { cell, ch, scale, halfLength: (SUB_BOW - 1) * cell * scale, halfHeight: ch * 1.7, pitch };
}

/** Match the renderer's mirrored local frame, including pitch. */
export function subPoint(width: number, sub: Sub, x: number, y = 0) {
  const { pitch } = subGeometry(width, sub);
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return { x: sub.x + sub.face * (x * c - y * s), y: sub.y + x * s + y * c };
}

export function subMuzzle(width: number, sub: Sub) {
  const g = subGeometry(width, sub);
  return subPoint(width, sub, g.halfLength + g.cell, 0);
}
