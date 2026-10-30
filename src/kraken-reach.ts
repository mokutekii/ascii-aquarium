import { angleDiff, clamp } from "./math";
import { KRAKEN_ARC } from "./types";
type Body = { x: number; y: number; heading: number; size: number; phase: number };
export function inKrakenReachArc(k: Body, target: { x: number; y: number }) {
  return Math.abs(angleDiff(k.heading + Math.PI, Math.atan2(target.y-k.y, target.x-k.x))) <= KRAKEN_ARC;
}
/** A reach keeps its root on the head; only its tip travels toward the catch. */
export function krakenArmRoot(k: Body, target: { x: number; y: number }) {
  const back = k.heading + Math.PI;
  const angle = back + clamp(angleDiff(back, Math.atan2(target.y-k.y,target.x-k.x)), -1.2, 1.2);
  const radius = k.size * .085 * (1 + .04 * Math.sin(k.phase * 1.1));
  return { x: k.x + Math.cos(angle)*radius, y: k.y + Math.sin(angle)*radius };
}
