import { sharkSpinePoint } from "./mega-swim";
import { angleDiff, clamp } from "./math";
import { KRAKEN_ARC, type Shark } from "./types";
import type { World, Kraken } from "./world";
import type { Offender } from "./provocation";
import { bodyPoints, segmentHit } from "./collision-bodies";
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

/** The resting curve is shared by the simulation and renderer, including each
 * limb's root, length, curl and travelling wave. */
export function krakenFreeArm(k: Kraken, arm: number, time: number, anger = 0) {
  const feeder = arm >= 6;
  const psi = feeder ? [-.75, -.25, .25, .75][arm - 6] : (arm / 5 - .5) * 2;
  const back = k.heading + Math.PI;
  const radius = k.size * .085 * (1 + .04 * Math.sin(k.phase * 1.1));
  const root = { x: k.x + Math.cos(back + psi) * radius, y: k.y + Math.sin(back + psi) * radius };
  const stretch = time < (k.rageStretchUntil ?? 0) ? Math.sin(Math.PI * clamp(1 - ((k.rageStretchUntil ?? 0) - time) / 2.4, 0, 1)) : 0;
  const attack = k.lunging || k.hunt ? clamp(k.jet, 0, 1) : 0;
  const spread = (k.stroke !== undefined ? 1 + .9 * k.stroke : 1 + 1.1 * attack * (1 - Math.sin(k.phase * 1.1)) / 2) + stretch * .35;
  const age = k.hullStrike ? time - k.hullStrike.at : -1;
  const fade = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const coil = arm >= 8 || age < 0 ? 0 : !k.hullStrike?.launched ? fade(age / 1.2) : Math.max(0, 1 - (time - (k.hullStrike.launchedAt ?? time)) / .6);
  const length = (1 + .3 * stretch) * (1 - .35 * coil) * (feeder ? k.size * (1.2 + .18 * Math.abs(psi)) : k.size * (.5 + .25 * Math.sin((arm + .5) * 1.9) ** 2)) * (1 + .3 * k.jet);
  const curl = (psi < 0 ? -1 : 1) * coil * 6 + (1 - .7 * stretch) * (feeder ? (psi < 0 ? -1 : 1) * (3.4 + 1.2 * Math.abs(psi)) * (1 - .6 * k.jet) : -psi * .6);
  const hit = clamp(1 - (time - (k.blastAt ?? -99)) / 2.5, 0, 1);
  const points = [root.x, root.y];
  let x = root.x, y = root.y;
  for (let i = 0; i < 90; i++) {
    const t = i / 90;
    const wave = (Math.sin(k.wave - t * (5 + 4 * k.jet) + arm * .9) * (feeder ? .6 : .45) + Math.sin(k.phase * .8 + arm * 1.7 - t * 2) * (feeder ? .3 : .12) + Math.sin(k.wave * 1.6 - t * 9 + arm * 2) * (feeder ? .55 : .3) * Math.pow(t, 2.4)) * (1 + (k.stroke !== undefined ? .15 : 1.3) * k.jet + 1.6 * hit + 1.1 * anger) * (.2 + 1.5 * Math.pow(t, 1.4));
    const angle = back + clamp(psi * spread * (feeder ? .7 : .9 - .4 * t) + curl * Math.pow(t, feeder ? 2.2 : 2) - k.bend * .9 * Math.pow(t, 1.3) + wave, -KRAKEN_ARC, KRAKEN_ARC);
    x += Math.cos(angle) * length / 90;
    y += Math.sin(angle) * length / 90;
    points.push(x, y);
  }
  return { root, points, length };
}

interface Reach {
  x: number; y: number; px: number; py: number; at: number; start: number; speed: number;
  arm: number; points: number[]; root: { x: number; y: number }; activeAt: number;
  retracting: boolean; heldAt?: number;
  target: Offender;
}
const reaches=new WeakMap<Kraken,Map<object,Reach>>();
export const krakenArmSlots = new WeakMap<Kraken, Map<object, number[]>>();
export const krakenReachVisual=(k:Kraken,target:object)=>reaches.get(k)?.get(target);
export const krakenReachPoses = (k: Kraken) => [...(reaches.get(k)?.values() ?? [])];

export function resizeKrakenReaches(k: Kraken, sx: number, sy: number) {
  for (const r of reaches.get(k)?.values() ?? []) {
    r.x *= sx; r.y *= sy; r.px *= sx; r.py *= sy;
    r.root.x *= sx; r.root.y *= sy;
    for (let i = 0; i < r.points.length; i += 2) { r.points[i] *= sx; r.points[i + 1] *= sy; }
  }
}

function moveReach(r: Reach, root: { x: number; y: number }, wanted: number[], dt: number) {
  const dx = root.x - r.root.x, dy = root.y - r.root.y;
  let distance = 0;
  for (let i = 0; i < r.points.length; i += 2)
    distance = Math.max(distance, Math.hypot(wanted[i] - r.points[i] - dx, wanted[i + 1] - r.points[i + 1] - dy));
  const blend = distance > 0 ? Math.min(1, r.speed * dt / distance) : 1;
  for (let i = 0; i < r.points.length; i += 2) {
    const x = r.points[i] + dx, y = r.points[i + 1] + dy;
    r.points[i] = x + (wanted[i] - x) * blend;
    r.points[i + 1] = y + (wanted[i + 1] - y) * blend;
  }
  r.root = root;
  r.px = r.x; r.py = r.y;
  r.x = r.points.at(-2)!; r.y = r.points.at(-1)!;
}

/** Aborted reaches return to their resting curve before the limb is freed. */
export function stepKrakenReaches(w: World) {
  const k = w.kraken;
  if (!k) return;
  const map = reaches.get(k);
  if (!map) return;
  for (const [target, r] of map) {
    const drone = w.attackDrones.find(d => d === target);
    const returning = drone?.returned;
    if (returning && w.time - returning.at >= 1.85) {
      map.delete(target); krakenArmSlots.get(k)?.delete(target); continue;
    }
    const held = k.caught.some(f => f === target) || k.grabbed.some(sh => sh === target)
      || k.ufoHeld && k.ufoTarget === target || w.subs.some(s => s === target && s.seizedByKraken)
      || k.wrapping === target && !k.lunging && !k.maul || w.mothership === target && w.mothership.grapple?.kraken === k || !!returning;
    if (held) {
      r.heldAt ??= w.time;
      const free = krakenFreeArm(k, r.arm, w.time, w.krakenRage());
      const dx = free.root.x - r.root.x, dy = free.root.y - r.root.y;
      for (let i = 0; i < r.points.length; i += 2) { r.points[i] += dx; r.points[i + 1] += dy; }
      if (returning && drone) {
        const tx = drone.x - r.points.at(-2)!, ty = drone.y - r.points.at(-1)!;
        for (let i = 0; i < r.points.length; i += 2) {
          const u = i / (r.points.length - 2);
          r.points[i] += tx * u; r.points[i + 1] += ty * u;
        }
      }
      r.root = free.root; r.x = r.points.at(-2)!; r.y = r.points.at(-1)!; r.at = w.time;
      continue;
    }
    if (r.activeAt === w.time) continue;
    r.heldAt = undefined;
    r.retracting = true;
    const dt = clamp(w.time - r.at, 0, .1); r.at = w.time;
    const free = krakenFreeArm(k, r.arm, w.time, w.krakenRage());
    moveReach(r, free.root, free.points, dt);
    if (r.points.every((p, i) => Math.abs(p - free.points[i]) < 1)) {
      map.delete(target);
      krakenArmSlots.get(k)?.delete(target);
    }
  }
}
/** One bounded tip path supplies both the visible reach and its swept contact. */
export function krakenReachContact(w:World,k:Kraken,target:Offender,start:number,duration:number, surface?: {x: number; y: number}) {
  let map=reaches.get(k);if(!map){map=new Map();reaches.set(k,map);}
  const p = surface ?? ("nodes" in target ? {x:target.nodes[0],y:target.nodes[1]} : target);
  let r=map.get(target);
  if(!r){
    let slots = krakenArmSlots.get(k);
    if (!slots) { slots = new Map(); krakenArmSlots.set(k, slots); }
    const used = new Set([...slots.values()].flat());
    const holding = !!k.whaleTarget || w.mothership?.grapple?.kraken === k;
    const available = holding ? k.gripArms ?? 10 : 0;
    const arm = [9, 8, 7, 6, 0, 1, 2, 3, 4, 5].find(index => index >= available && !used.has(index));
    if (arm === undefined) return false;
    const free = krakenFreeArm(k, arm, w.time, w.krakenRage());
    const x = free.points.at(-2)!, y = free.points.at(-1)!;
    r={x,y,px:x,py:y,at:w.time,start,speed:k.size*1.4,arm,points:free.points,root:free.root,activeAt:w.time,retracting:false,target};
    map.set(target,r);
    slots.set(target, [arm]);
  }
  r.start = start; r.activeAt = w.time; r.retracting = false;
  const dt=clamp(w.time-r.at,0,.1);r.at=w.time;
  const free = krakenFreeArm(k, r.arm, w.time, w.krakenRage());
  const dx = p.x - free.root.x, dy = p.y - free.root.y;
  const distance = Math.hypot(dx, dy) || 1;
  const limit = free.length * .94;
  const reach = Math.min(distance, limit);
  const tx = free.root.x + dx / distance * reach, ty = free.root.y + dy / distance * reach;
  r.speed = clamp(distance / Math.max(.2, duration), k.size * 1.4, k.size * 3);
  const wanted = [];
  for (let i = 0; i <= 90; i++) {
    const u = i / 90, curve = Math.sin(u * Math.PI) * Math.min(k.size * .08, reach * .08);
    wanted.push(free.root.x + (tx - free.root.x) * u - dy / distance * curve,
      free.root.y + (ty - free.root.y) * u + dx / distance * curve);
  }
  moveReach(r, free.root, wanted, dt);
  if (distance > limit) return false;
  if (surface) return inKrakenReachArc(k, p) && Math.hypot(r.x - p.x, r.y - p.y) <= 8;
  return inKrakenReachArc(k,p)&&Number.isFinite(segmentHit(r.px,r.py,r.x,r.y,bodyPoints(w,target).map(c=>({...c,r:c.r+8}))));
}

/** A grip follows the displaced spine used to draw the shark. */
export function megaFlank(sh: Shark, node: number, side: number, clearance = 0) {
  const center = sharkSpinePoint(sh, node);
  const front = sharkSpinePoint(sh, Math.max(0, node - 1));
  const back = sharkSpinePoint(sh, Math.min(sh.nodes.length / 2 - 1, node + 1));
  const angle = Math.atan2(front.y - back.y, front.x - back.x);
  const radius = sh.length * .09 + clearance;
  return { x: center.x - Math.sin(angle) * side * radius, y: center.y + Math.cos(angle) * side * radius };
}
