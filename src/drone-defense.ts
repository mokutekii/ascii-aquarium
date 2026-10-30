import type { World, Shark } from "./world";
import type { AttackDrone } from "./encounters";
import { kickCraft } from "./handling";
const hits = new WeakMap<World, WeakMap<AttackDrone, WeakMap<Shark, number>>>();
/** One hit per attack run, shared by jaw, body and thrown-drone collision paths. */
export function hitDroneWithShark(w: World, shark: Shark, drone: AttackDrone) {
  if (drone.hp <= 0) return false;
  let world = hits.get(w); if (!world) { world = new WeakMap(); hits.set(w, world); }
  let pairs = world.get(drone); if (!pairs) { pairs = new WeakMap(); world.set(drone, pairs); }
  if (w.time < (pairs.get(shark) ?? -Infinity)) return false;
  pairs.set(shark, w.time + 1.2);
  const heavy = shark.kind === "hammerhead" || shark.kind === "greathammer" || shark.kind === "sawshark";
  drone.hp = Math.max(0, drone.hp - (heavy ? 2 : 1));
  const a = Math.atan2(drone.y - shark.nodes[1], drone.x - shark.nodes[0]);
  drone.bumpUntil = w.time + .8;
  kickCraft(w, drone, Math.cos(a) * 180, Math.sin(a) * 180);
  return true;
}
