import type { Ufo, CraftAttitude } from "./types";
import { clamp } from "./math";

interface MovingHull {
  x: number;
  y: number;
  floatVx?: number;
  floatVy?: number;
  attitude?: CraftAttitude;
}

/** Damped acceleration gives a saucer a glide into and out of turns rather than a rigid slide. */
export function moveUfoToward(u: Ufo, tx: number, ty: number, speed: number, dt: number) {
  return moveHullToward(u, tx, ty, speed, dt);
}

export function moveHullToward(u: MovingHull, tx: number, ty: number, speed: number, dt: number, response = 2.7) {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1, desired = Math.min(speed, d * 1.8), ease = 1 - Math.exp(-dt * response);
  u.floatVx = (u.floatVx ?? 0) + (dx / d * desired - (u.floatVx ?? 0)) * ease;
  u.floatVy = (u.floatVy ?? 0) + (dy / d * desired - (u.floatVy ?? 0)) * ease;
  u.x += u.floatVx * dt;
  u.y += u.floatVy * dt;
  return d;
}

/** Bank into thrust and turns, then settle level when the craft stops moving. */
export function updateUfoAttitude(u: Ufo, dt: number) {
  updateHullAttitude(u, dt);
}

export function updateHullAttitude(u: MovingHull, dt: number, heaviness = 1) {
  if (dt <= 0) return;

  const pose = u.attitude ??= {
    x: u.x,
    y: u.y,
    vx: 0,
    vy: 0,
    bank: 0,
    rate: 0,
    face: 1,
  };

  const sampledVx = clamp((u.x - pose.x) / dt, -600, 600);
  const sampledVy = clamp((u.y - pose.y) / dt, -600, 600);
  const blend = 1 - Math.exp(-dt * 7);
  const vx = pose.vx + (sampledVx - pose.vx) * blend;
  const vy = pose.vy + (sampledVy - pose.vy) * blend;
  const ax = (vx - pose.vx) / dt;
  const ay = (vy - pose.vy) / dt;

  if (Math.abs(vx) > 15) pose.face = vx > 0 ? 1 : -1;

  // The leading edge pitches with climbs/dives; lateral thrust and curvature
  // bank the disc into veers and reversals before its velocity changes sign.
  const turn = clamp((vx * ay - vy * ax) / (vx * vx + vy * vy + 2500), -2, 2);
  const weight = Math.sqrt(heaviness);
  const target = clamp(
    (vx * .0011 + clamp(ax, -260, 260) * .00065
      + vy * pose.face * .001 + turn * .045) * weight,
    -.3 / weight,
    .3 / weight,
  );

  // A critically damped spring keeps direction changes fluid, without
  // spinning or snapping when a collision briefly changes the sampled speed.
  let remaining = Math.min(dt, .2);
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 60);
    pose.rate += ((target - pose.bank) * 36 / heaviness - pose.rate * 12 / weight) * step;
    pose.bank = clamp(pose.bank + pose.rate * step, -.34 / weight, .34 / weight);
    remaining -= step;
  }

  pose.x = u.x;
  pose.y = u.y;
  pose.vx = vx;
  pose.vy = vy;
}

export function hullPoint(hull: MovingHull, x: number, y: number) {
  const bank = hull.attitude?.bank ?? 0;
  const c = Math.cos(bank), s = Math.sin(bank);
  return { x: hull.x + x * c - y * s, y: hull.y + x * s + y * c };
}
