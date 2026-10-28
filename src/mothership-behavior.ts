import type { World } from "./world";
import type { Mothership } from "./encounters";
import { rand } from "./math";

/** Later phases remain active even if a repair eventually restores some health. */
export function mothershipTactics(b: Mothership) {
  const health = b.hp / b.maxHp;
  const stage = Math.max(b.defenseStage ?? 0, health <= .1 ? 3 : health <= .33 ? 2 : health <= .5 ? 1 : 0);
  return {
    stage,
    teleport: stage >= 3 ? rand(10, 15) : stage >= 2 ? rand(13, 19) : rand(25, 40),
    spin: stage >= 3 ? rand(9, 13) : stage >= 2 ? rand(14, 20) : rand(18, 27),
    drone: stage >= 1 ? rand(2.5, 4) : rand(4, 6),
    shot: stage >= 3 ? 2.2 : stage >= 2 ? 2.4 : stage >= 1 ? 2.8 : 4,
  };
}

export function advanceMothership(w: World, b: Mothership) {
  const { stage } = mothershipTactics(b), previous = b.defenseStage ?? 0;
  if (stage <= previous) return;
  b.defenseStage = stage;
  if (previous < 1) {
    b.reserveDrones = (b.reserveDrones ?? 0) + 3;
    b.nextDrone = Math.min(b.nextDrone, w.time + .4);
  }
  if (stage >= 2) {
    b.nextTeleport = Math.min(b.nextTeleport, w.time + rand(4, 7));
    b.nextSpin = Math.min(b.nextSpin ?? Infinity, w.time + rand(3, 5));
  }
  if (stage >= 3) b.nextSpin = Math.min(b.nextSpin ?? Infinity, w.time + rand(1.5, 3));
  // Large hits may skip a phase: announce the resulting response once.
  w.notices.push(stage >= 3 ? "the mothership overdrives its rim... stay clear!"
    : stage >= 2 ? "the damaged mothership arms its jump drives and rim..."
    : "the mothership calls its reserve drones...");
}
