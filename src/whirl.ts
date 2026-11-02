import type { World } from "./world";
import type { Shark, Whirl } from "./types";
import { SHARK_NODES, UFO_HITS_TO_BREAK } from "./types";
import { clamp, rand } from "./math";
import { detonateDrone } from "./drones";

interface Ride { wp: Whirl; at: number; r0: number; a: number; dur: number }
const rides = new WeakMap<Shark, Ride>();
const damageClock = new WeakMap<object, number>();
const TOSS_IMMUNITY = 6;

export interface SharkPull { reach: number; spin: number; suction: number; mass: number }

/**
 * A shark is drawn in by the current, then carried around the funnel on a tightening spiral that speeds up, and
 * finally thrown out along the tangent. It never settles at the core, and cannot be caught again for a few seconds.
 */
export function stepWhirlShark(w: World, wp: Whirl, sh: Shark, dt: number, fade: number, pull: SharkPull) {
  if (sh.mega || sh.grabbed || sh.lifted) { rides.delete(sh); return; }
  const { time } = w;
  const head = { x: sh.nodes[0], y: sh.nodes[1] };
  const dx = head.x - wp.x, dy = head.y - wp.y, d = Math.hypot(dx, dy);
  let ride = rides.get(sh);
  if (ride && ride.wp !== wp) {
    if (time <= ride.wp.until) return;
    rides.delete(sh); ride = undefined;
  }
  const shift = (mx: number, my: number) => {
    for (let n = 0; n < SHARK_NODES; n++) { sh.nodes[n * 2] += mx; sh.nodes[n * 2 + 1] += my; }
  };
  if (!ride) {
    if (time < (sh.nextFling ?? 0) || d > pull.reach || d < 1e-3 || fade <= 0) return;
    const fall = Math.pow(1 - d / pull.reach, 0.8) * fade * pull.mass;
    shift(((-dy / d) * wp.dir * pull.spin * (wp.spin ?? 1) - (dx / d) * pull.suction * (wp.suction ?? 1)) * fall * dt,
          ((dx / d) * wp.dir * pull.spin * (wp.spin ?? 1) - (dy / d) * pull.suction * (wp.suction ?? 1)) * fall * dt);
    if (d < Math.min(wp.r * 1.3, pull.reach * .5) && fade > .4)
      rides.set(sh, { wp, at: time, r0: d, a: Math.atan2(dy, dx), dur: rand(2.2, 3.2) });
    return;
  }
  const k = clamp((time - ride.at) / ride.dur, 0, 1);
  if (k >= 1 || wp.until - time < .35) {
    rides.delete(sh);
    sh.nextFling = time + TOSS_IMMUNITY;
    sh.heading = ride.a + wp.dir * (Math.PI / 2 - .3);
    sh.speed = 260 * Math.sqrt(wp.suction ?? 1);
    sh.target = null;
    sh.alertUntil = time + 2;
    w.callout(head.x, head.y - 40, "FLUNG!", "150,210,255");
    return;
  }
  // Faster as it tightens, like water down a drain.
  ride.a += wp.dir * (1.5 + (wp.spin ?? 1) * .8) * (1 + k * 1.8) * dt;
  const r = ride.r0 + (wp.r * .5 - ride.r0) * Math.sin(k * Math.PI / 2);
  shift(wp.x + Math.cos(ride.a) * r - head.x, wp.y + Math.sin(ride.a) * r - head.y);
  sh.heading = ride.a + wp.dir * Math.PI / 2;
  sh.speed = Math.min(sh.speed, 70);
  sh.target = null;
}

/** Craft caught inside the funnel lose one hit point per second. */
export function whirlCraftDamage(w: World, wp: Whirl, dt: number) {
  const { time } = w;
  if (Math.min(time - wp.born, wp.until - time) < 1) return;
  const range = wp.r * 1.1;
  const tick = (c: { x: number; y: number }) => {
    if (Math.hypot(c.x - wp.x, c.y - wp.y) > range) { damageClock.delete(c); return false; }
    const t = (damageClock.get(c) ?? 0) + dt;
    if (t < 1) { damageClock.set(c, t); return false; }
    damageClock.set(c, t - 1);
    return true;
  };
  for (const sb of [...w.subs]) {
    if (sb.leaving || !tick(sb)) continue;
    sb.hull -= 1; sb.hitAt = time;
    if (sb.hull <= 0) w.destroySub(sb, "a whirlpool tore a submarine apart...");
  }
  for (const u of [...w.ufos]) {
    if (u.held || !tick(u)) continue;
    u.hits = (u.hits ?? 0) + 1; u.hitAt = time;
    if (u.hits >= UFO_HITS_TO_BREAK) w.destroyUfo("crushed", u, "a whirlpool crushed a flying saucer...");
  }
  for (const d of [...w.attackDrones]) {
    if (d.hp <= 0 || !tick(d)) continue;
    d.hp -= 1;
    if (d.hp <= 0) detonateDrone(w, d, "a drone was torn apart by a whirlpool...");
  }
}
