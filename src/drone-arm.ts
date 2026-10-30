import type { World, Kraken } from "./world";
import type { AttackDrone } from "./encounters";
import { clamp } from "./math";

export const DRONE_RELEASE_TIME = 1.55;
const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/** Match the kraken renderer's four long tentacle roots, including its body pulse. */
export function droneArmFrame(w: World, k: Kraken, d: AttackDrone) {
  const r = d.returned!;
  const arm = r.arm ?? 6;
  const psi = arm < 6 ? (arm / 5 - .5) * 2 : [-.75, -.25, .25, .75][arm - 6];
  const wrapped = k.state === "wrap" && !!k.wrapping && !k.maul;
  const grip = k.state === "grab" || wrapped;
  const anger = w.krakenRage();
  const shudder = k.maul && k.biteAt !== undefined ? 16 : (wrapped ? (w.time < k.shakeUntil ? 9 : 5) : 3) * (1 + .9 * anger);
  const hit = clamp(1 - (w.time - (k.blastAt ?? -99)) / 2.5, 0, 1);
  const hx = k.x + (grip ? Math.sin(k.phase * 3.6) * shudder : 0) + Math.sin(w.time * 31) * k.size * .014 * hit;
  const hy = k.y + (grip ? Math.cos(k.phase * 4.4) * shudder : 0) + Math.cos(w.time * 27) * k.size * .014 * hit;
  const rootAngle = k.heading + Math.PI + psi;
  const radius = k.size * .085 * (1 + .04 * Math.sin(k.phase * 1.1));
  const rootX = hx + Math.cos(rootAngle) * radius;
  const rootY = hy + Math.sin(rootAngle) * radius;
  const age = w.time - r.at;
  const aim = Math.atan2(r.vy, r.vx);
  const side = (r.arm ?? 6) % 2 ? -1 : 1;
  const finishAngle = aim - side * Math.PI / 2;
  const startAngle = finishAngle - side * 1.9;
  const reach = k.size * .6;
  const cockX = rootX + Math.cos(startAngle) * reach;
  const cockY = rootY + Math.sin(startAngle) * reach;
  const startX = r.startX ?? d.x, startY = r.startY ?? d.y;
  let tipX: number, tipY: number;
  if (age < .65) {
    const t = smooth(age / .65);
    tipX = rootX + (startX - rootX) * t;
    tipY = rootY + (startY - rootY) * t;
  } else if (age < 1.1) {
    const t = smooth((age - .65) / .45);
    tipX = startX + (cockX - startX) * t;
    tipY = startY + (cockY - startY) * t;
  } else {
    const angle = startAngle + side * 1.9 * smooth((age - 1.1) / .45);
    tipX = rootX + Math.cos(angle) * reach;
    tipY = rootY + Math.sin(angle) * reach;
  }
  if (age >= DRONE_RELEASE_TIME) {
    const retract = smooth((age - DRONE_RELEASE_TIME) / .3);
    tipX += (rootX - tipX) * retract;
    tipY += (rootY - tipY) * retract;
  }
  const bend = Math.min(k.size * .25, Math.hypot(tipX - rootX, tipY - rootY) * .35);
  return {
    rootX, rootY, tipX, tipY,
    controlX: (rootX + tipX) / 2 - Math.sin(rootAngle) * bend,
    controlY: (rootY + tipY) / 2 + Math.cos(rootAngle) * bend,
    gripping: age >= .65,
  };
}

/** Where an enraged kraken throws a drone it has caught: at the craft that is shooting it, else back at the mothership. */
export function droneThrowTarget(w: World, k: Kraken, d: { x: number; y: number }) {
  if (w.krakenRage() > 0) {
    const provoked = w.provocations.get(k)?.target;
    const craft = [...w.ufos, ...w.subs].filter(c => !("hull" in c && c.seizedByKraken) && !("maxBeams" in c && c.held));
    const target = provoked && craft.includes(provoked as never) ? provoked as { x: number; y: number }
      : craft.filter(c => "maxBeams" in c && c.pilot?.alive).sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
    if (target) return { x: target.x, y: target.y };
  }
  return w.mothership ? { x: w.mothership.x, y: w.mothership.y } : null;
}

/** An enraged kraken holding a whale also snatches drones with a freed arm, to crush them or throw them at whatever is shooting it. */
export function stepKrakenSnatch(w: World, k: Kraken) {
  if (!k.whaleTarget || k.whaleUntil <= w.time || w.krakenRage() <= 0 || w.time < (k.nextSnatchAt ?? 0)) return;
  const firstFree = k.gripArms ?? 10;
  const occupied = new Set(w.attackDrones.filter(o => o.returned && w.time - o.returned.at < DRONE_RELEASE_TIME + .3).map(o => o.returned!.arm));
  const freeArm = Array.from({ length: 10 - firstFree }, (_, i) => firstFree + i).find(a => !occupied.has(a));
  if (freeArm === undefined) return;
  const d = w.attackDrones.find(o => o.hp > 0 && !o.returned && Math.hypot(o.x - k.x, o.y - k.y) < k.size * .9);
  const aim = d && droneThrowTarget(w, k, d);
  if (!d || !aim) return;
  const a = Math.atan2(aim.y - d.y, aim.x - d.x);
  d.returned = { at: w.time, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, arm: freeArm, action: Math.random() < .3 ? "crush" : "throw", dodge: false, startX: d.x, startY: d.y };
  d.stunned = w.time + 6;
  k.nextSnatchAt = w.time + 2.5;
}

/** Reassign one arm at a time; a dangerous rival keeps the Kraken's grip committed. */
export function allocateKrakenArms(w: World, k: Kraken) {
  const hull = w.mothership?.grapple?.kraken === k;
  const whale = !!k.whaleTarget && k.whaleUntil > w.time;
  const mega = !!k.wrapping?.mega;
  const threats = w.attackDrones.filter(d => d.hp > 0 && (d.aggressor === k || d.returned || Math.hypot(d.x - k.x, d.y - k.y) < k.size * .9 ||
    w.encounterShots.some(s => s.source === d && s.target === k && w.time - s.fireAt < 2)));
  // Holding a mothership or whale, every arm stays on it. Only an enraged kraken frees one to deal with whatever is provoking it
  // (a helping drone, saucer or diver); it never lets go of the hold just to flail.
  const holding = hull || whale;
  const provoker = threats.length > 0 || k.ufoHeld || k.ufoStrike !== null || !!k.strike;
  // Calm, it holds on with every arm. Provoked, it sheds more of them the more it is being attacked.
  let desired = holding && w.krakenRage() > 0 && provoker ? 10 - Math.min(3, Math.max(1, threats.length + (k.ufoHeld || k.ufoStrike !== null || k.strike ? 1 : 0))) : 10;
  if (mega) {
    if (w.krakenRage() > 0 && threats.length >= 2 && w.time >= (k.nextDefenseAt ?? 0)) {
      k.nextDefenseAt = w.time + 8;
      if (Math.random() < .12) k.defenseUntil = w.time + 1.8;
    }
    desired = w.time < (k.defenseUntil ?? 0) ? 8 : 10;
  }
  if (!mega && !holding && w.krakenRage() > 0 && w.time >= (k.nextRageStretch ?? 0)) {
    k.nextRageStretch = w.time + 6 + Math.random() * 6;
    if (Math.random() < .65) k.rageStretchUntil = w.time + 2.4;
  }
  if (!mega && w.time < (k.rageStretchUntil ?? 0)) desired = Math.min(desired, 8);
  // An arm already reaching or swinging a drone cannot also wrap the hull.
  for (const d of threats) if (d.returned && w.time - d.returned.at < DRONE_RELEASE_TIME + .3)
    desired = Math.min(desired, Math.max(4, d.returned.arm ?? 6));
  k.gripArms ??= 10;
  if (w.time >= (k.nextGripArmAt ?? 0) && k.gripArms !== desired) {
    k.gripArms += Math.sign(desired - k.gripArms);
    k.nextGripArmAt = w.time + .45;
  }
}
