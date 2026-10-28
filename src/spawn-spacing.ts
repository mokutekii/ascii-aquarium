import type { World } from "./world";
import { bodyPoints } from "./collision-bodies";
import { clamp, rand } from "./math";

/** Reserve both the entry and destination, including craft still approaching offshore. */
export function craftEntry(w: World, kind: "ufo" | "sub", manual = false) {
  const cell = clamp(Math.round(w.width / 124), 8, 13);
  const rx = kind === "ufo" ? Math.max(40, Math.min(w.width, w.height) * .07) : cell * 12;
  const ry = kind === "ufo" ? rx * .35 + 12 : cell * 5;
  const margin = 45;
  const actors = [...w.ufos, ...w.subs, ...w.whales, ...w.sharks.filter(s => !s.grabbed && !s.lifted),
    ...(w.mothership && w.mothership.phase !== "collapse" ? [w.mothership] : [])];
  const occupied = actors.flatMap(a => bodyPoints(w, a));
  for (const u of w.ufos) if (u.state === "enter") {
    occupied.push({ x: u.tx, y: u.hy, r: Math.max(40, Math.min(w.width, w.height) * .07) * .4 });
    occupied.push({ x: u.x < 0 ? rx : w.width - rx, y: u.hy, r: rx * .4 });
  }
  for (const s of w.subs) if (s.x < 0 || s.x > w.width)
    occupied.push({ x: s.x < 0 ? rx : w.width - rx, y: s.y, r: cell * 5 });

  let best: { x: number; y: number; tx: number; face: 1 | -1; clearance: number } | undefined;
  const side = Math.random() < .5 ? 0 : 1;
  const firstLane = Math.floor(Math.random() * 12);
  // Try varied lanes on both sides; unlike repeated random retries this also
  // finds a free lane when the random source happens to keep picking one spot.
  for (let i = 0; i < 24; i++) {
    const edge = (side + Math.floor(i / 12)) % 2;
    const fraction = ((firstLane + i) % 12 + .5) / 12;
    const y = w.height * (kind === "ufo" ? .12 + fraction * .5 : .2 + fraction * .55);
    const x = edge === 0 ? -rx - 75 : w.width + rx + 75;
    const tx = kind === "ufo" ? w.width * rand(.2, .8) : edge === 0 ? rx + 60 : w.width - rx - 60;
    let clearance = Infinity;
    for (const sx of [x, edge === 0 ? rx + 30 : w.width - rx - 30, tx]) for (const p of occupied) {
      const distance = Math.hypot((sx - p.x) / (rx + p.r + margin), (y - p.y) / (ry + p.r + margin));
      clearance = Math.min(clearance, distance - 1);
    }
    const candidate = { x, y, tx, face: (edge === 0 ? 1 : -1) as 1 | -1, clearance };
    if (!best || clearance > best.clearance) best = candidate;
    if (clearance > 0) return candidate;
  }
  // A crowded entry waits farther offshore instead of materializing in a hull.
  if (manual) {
    // Wait only as far offshore as this lane needs, independent of the other fleet's count.
    while (occupied.some(p => ((best!.x - p.x) / (rx + p.r + margin)) ** 2 + ((best!.y - p.y) / (ry + p.r + margin)) ** 2 < 1))
      best!.x += (best!.face === 1 ? -1 : 1) * (rx * 2 + margin);
    return best!;
  }
  best!.x += (best!.face === 1 ? -1 : 1) * (w.ufos.length + w.subs.length + 1) * (rx * 2 + margin);
  return best!;
}
