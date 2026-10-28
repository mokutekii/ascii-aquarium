import type { World } from "./world";
import type { Mothership } from "./encounters";

export function beginDeparture(w: World, boss: Mothership, mode?: "jet" | "warp") {
  if (boss.phase === "leave") return;
  boss.phase = "leave";
  boss.phaseAt = w.time;
  boss.warp = undefined;
  boss.spin = undefined;
  boss.grapple = undefined;
  const side = boss.x < w.width / 2 ? -1 : 1;
  boss.departure = {
    mode: mode ?? (Math.random() < .5 ? "jet" : "warp"),
    vx: side * .97,
    vy: -.24,
    emitted: false,
  };
  w.encounterShots = [];
  w.notices.push("the mothership's rim charges for its final departure...");
}

/** Departure is separate from destruction: the outgoing ship leaves a pressure front behind. */
export function stepDeparture(w: World, boss: Mothership, dt: number) {
  if (!boss.departure) {
    boss.phase = "battle";
    beginDeparture(w, boss);
  }
  const departure = boss.departure!;
  const age = w.time - boss.phaseAt;

  if (age >= 1 && !departure.emitted) {
    departure.emitted = true;
    w.rimWaves ??= [];
    w.rimWaves.push({ x: boss.x, y: boss.y, size: boss.size, born: w.time, hit: new Set() });
    w.rimWaves = w.rimWaves.slice(-8);
    w.notices.push("the departing mothership releases a rim blast...");
  }

  if (departure.mode === "jet" && age >= 1) {
    const launch = age - 1;
    const speed = Math.min(Math.max(1000, w.width * .65), 180 + launch * launch * Math.max(900, w.width * .4));
    boss.x += departure.vx * speed * dt;
    boss.y += departure.vy * speed * dt;
    boss.floatVx = departure.vx * speed;
    boss.floatVy = departure.vy * speed;
  }

  const margin = boss.size * 1.1;
  const outside = boss.x < -margin || boss.x > w.width + margin || boss.y < -margin;
  if (departure.mode === "warp" && age >= 1.8 || departure.mode === "jet" && (outside || age >= 5.5)) {
    w.notices.push(departure.mode === "jet"
      ? "the mothership jets beyond the light..."
      : "the mothership vanishes in a final flash...");
    w.mothership = null;
  }
}
