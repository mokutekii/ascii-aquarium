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

/** Reassign one arm at a time; a dangerous rival keeps the Kraken's grip committed. */
export function allocateKrakenArms(w: World, k: Kraken) {
  const hull = w.mothership?.grapple?.kraken === k;
  const whale = !!k.whaleTarget && k.whaleUntil > w.time;
  const mega = !!k.wrapping?.mega;
  const threats = w.attackDrones.filter(d => d.hp > 0 && (d.aggressor === k || d.returned ||
    w.encounterShots.some(s => s.source === d && s.target === k && w.time - s.fireAt < 2)));
  let desired = hull ? Math.max(4, 8 - threats.length) : whale && w.krakenRage() > 0 ? Math.max(6, 10 - threats.length) : 10;
  if (mega) {
    if (w.krakenRage() > 0 && threats.length >= 2 && w.time >= (k.nextDefenseAt ?? 0)) {
      k.nextDefenseAt = w.time + 8;
      if (Math.random() < .12) k.defenseUntil = w.time + 1.8;
    }
    desired = w.time < (k.defenseUntil ?? 0) ? 8 : 10;
  }
  // An arm already reaching or swinging a drone cannot also wrap the hull.
  for (const d of threats) if (d.returned && w.time - d.returned.at < DRONE_RELEASE_TIME + .3)
    desired = Math.min(desired, Math.max(4, d.returned.arm ?? 6));
  k.gripArms ??= hull ? 8 : 10;
  if (w.time >= (k.nextGripArmAt ?? 0) && k.gripArms !== desired) {
    k.gripArms += Math.sign(desired - k.gripArms);
    k.nextGripArmAt = w.time + .45;
  }
}
