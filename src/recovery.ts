import type { World, Fish, Shark } from "./world";
import { rand } from "./math";
export interface Recovery {
  born: number;
  fish: {
    actor: Fish;
    at: number;
    side: number;
    along: number;
  }[];
  sharks: {
    actor: Shark;
    at: number;
    side: number;
    along: number;
  }[];
}
/** Reuse normal population sizing, but admit each school and each full shark from outside the view. */
export function beginRecovery(w: World) {
  w.seed();
  const fish = w.fish.map((actor, i) => {
    actor.alive = false;
    actor.respawnAt = Infinity;
    return { actor, at: w.time + .8 + Math.floor(i / 12) * .5, side: Math.floor(i / 36) % 2, along: .15 + (Math.floor(i / 12) * .137) % .7 };
  });
  const sharks = w.sharks.map((actor, i) => ({ actor, at: w.time + 7 + i * rand(1.5, 2.7), side: i % 2, along: rand(.18, .82) }));
  w.sharks = [];
  w.recovery = { born: w.time, fish, sharks };
  w.nextSharkDrift = w.time + 40;
}

export function stepRecovery(w: World) {
  const recovery = w.recovery;
  if (!recovery)
    return;
  for (const entry of recovery.fish)
    if (w.time >= entry.at && !entry.actor.alive) {
      const f = entry.actor, dir = entry.side === 0 ? 1 : -1;
      f.x = dir > 0 ? -20 : w.width + 20;
      f.y = w.height * entry.along + rand(-22, 22);
      f.vx = dir * rand(38, 58);
      f.vy = rand(-8, 8);
      f.alive = true;
    }
  recovery.fish = recovery.fish.filter(e => w.time < e.at);
  for (const e of recovery.sharks)
    if (w.time >= e.at) {
      const sh = e.actor, dir = e.side === 0 ? 1 : -1, x = dir > 0 ? -sh.length * .3 : w.width + sh.length * .3, y = e.along * w.height;
      sh.heading = dir > 0 ? 0 : Math.PI;
      sh.speed = 55;
      for (let n = 0; n < sh.nodes.length / 2; n++) {
        sh.nodes[n * 2] = x - dir * n * sh.length / (sh.nodes.length / 2 - 1);
        sh.nodes[n * 2 + 1] = y;
      }
      w.sharks.push(sh);
    }
  recovery.sharks = recovery.sharks.filter(e => w.time < e.at);
  if (!recovery.fish.length && !recovery.sharks.length)
    w.recovery = null;
}
