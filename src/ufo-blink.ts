import { safeEvasionPoint } from "./evasion";
import type { World } from "./world";
import type { Ufo } from "./types";
import { UFO_HITS_TO_BREAK } from "./types";
import { clamp, rand } from "./math";
import { isCraftDriven } from "./handling";

export interface UfoBlink {
  /** Burst end, or 0 while idle. */
  until: number;
  /** Earliest time the next burst can begin. */
  readyAt: number;
  nextHop: number;
  /** Last time a speed afterimage was left behind. */
  trailAt?: number;
  /** Set once the saucer has phased, which marks it as carrying a drive. */
  phased?: boolean;
  ghosts: { x: number; y: number; at: number; bank: number }[];
}

export const BLINK_GHOST_LIFE = .6;
/** A saucer in its last quarter of hull may phase away from fire. */
export const BLINK_HITS = Math.ceil(UFO_HITS_TO_BREAK * .75);

/** Bursts last 1 to 1.6 seconds with 5 to 8 seconds between them, so a damaged saucer phases under a quarter of the time. */
export function stepUfoBlink(w: World, u: Ufo, dt: number) {
  const time = w.time;
  const b = u.blink ??= { until: 0, readyAt: time + rand(.4, 1.6), nextHop: 0, ghosts: [] };
  b.ghosts = b.ghosts.filter(g => time - g.at < BLINK_GHOST_LIFE);
  // Any hard acceleration leaves a short afterimage trail behind the saucer.
  const speed = Math.hypot(u.attitude?.vx ?? 0, u.attitude?.vy ?? 0);
  // Only a saucer under its own power leaves one: being dragged by hand, held, flung or knocked about is not phasing.
  if (speed > 170 && u.state !== "leave" && !u.held && !isCraftDriven(w, u) && time - (b.trailAt ?? -1) > .05) {
    b.trailAt = time;
    b.ghosts.push({ x: u.x, y: u.y, at: time, bank: u.attitude?.bank ?? 0 });
    if (b.ghosts.length > 14) b.ghosts.shift();
  }
  const able = (u.hits ?? 0) >= BLINK_HITS && (u.state === "seek" || u.state === "enter") && !u.held && !u.emp
    && !(u.enterAt !== undefined && time < u.enterAt);
  if (!able) {
    if (b.until) { b.until = 0; b.readyAt = Math.max(b.readyAt, time + rand(2, 4)); }
    return;
  }
  const s = b;
  const attacker=w.encounterShots.find(shot=>!shot.resolved&&shot.target===u);
  const titan=w.kraken&&(w.kraken.ufoTarget===u||Math.hypot(w.kraken.x-u.x,w.kraken.y-u.y)<w.kraken.size*.9)?w.kraken:undefined;
  const giant=w.sharks.find(sh=>sh.mega&&Math.hypot(sh.nodes[0]-u.x,sh.nodes[1]-u.y)<sh.length*.4);
  const threatened=!!attacker||!!titan||!!giant;
  if (!s.until) {
    // A shot being lined up on the saucer is the usual reason to phase, though it also shifts on its own.
    if (time < s.readyAt || (!threatened && Math.random() > dt * .5)) return;
    s.phased = true;
    s.until = time + rand(1, 1.6);
    s.nextHop = time;
    w.whisper(u.x, u.y - 60, "*phase*", "130,230,255");
  }
  if (time >= s.until) {
    s.until = 0;
    s.readyAt = time + rand(5, 8);
    return;
  }
  if (time < s.nextHop) return;
  s.nextHop = time + rand(.09, .2);
  s.ghosts.push({ x: u.x, y: u.y, at: time, bank: u.attitude?.bank ?? 0 });
  if (s.ghosts.length > 14) s.ghosts.shift();
  // Erratic: any direction, long enough to clear a beam line, never off the tank.
  const a = rand(0, Math.PI * 2), d = rand(80, 210);
  const top = Math.max(70, w.height * .1), bottom = w.height * .6;
  const threat=titan??(giant?{x:giant.nodes[0],y:giant.nodes[1]}:attacker?{x:attacker.x0,y:attacker.y0}:{x:u.x-Math.cos(a)*30,y:u.y-Math.sin(a)*30});
  const safe=safeEvasionPoint(w,u,threat,d);if(!safe)return;
  const nx=safe.x,ny=safe.y;
  const dy = ny - u.y;
  u.x = nx; u.y = ny;
  u.hy = clamp(u.hy + dy, top, bottom);
  u.floatVx = (u.floatVx ?? 0) * .3;
  u.floatVy = (u.floatVy ?? 0) * .3;
}
