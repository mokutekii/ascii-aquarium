import type { World, Ufo, Fish, Jelly } from "./world";

export const TRACTOR_HALF_WIDTH = 55;

export function chooseBeamTarget(w: World, u: Ufo) {
  if (u.targetShark) { u.beamTarget = undefined; return; }
  let best = Infinity;
  let target: Fish | Jelly | undefined;
  const consider = (p: Fish | Jelly) => {
    if (p.y < u.y || Math.abs(p.x - u.beamX) > TRACTOR_HALF_WIDTH) return;
    const distance = Math.hypot(p.x - (u.aim?.x ?? u.beamX), p.y - (u.aim?.y ?? u.y + 200));
    if (distance < best) { best = distance; target = p; }
  };
  for (const f of w.fish) if (f.alive && !f.riding && !f.dragger && !f.seized && !f.eoeBound) consider(f);
  for (const j of w.jellies) consider(j);
  u.beamTarget = target;
}

/** The same target-following end is used by capture logic and drawing. */
export function tractorBottom(w: World, u: Ufo) {
  const p = u.beamTarget;
  const live = p && ("alive" in p ? p.alive : w.jellies.includes(p));
  let bottom = u.targetShark ? u.targetShark.nodes[1] + 30 : live ? p.y + 25 : u.aim?.y ?? u.y + 100;
  bottom = Math.max(u.y + 25, Math.min(w.height, bottom));
  // Heavy bodies intercept the column; targets beneath them cannot be pulled through.
  for (const wh of w.whales) for (let t = 0; t <= 1; t += 0.1) {
    const c = w.whalePoint(wh,t), r = wh.length * 0.075;
    if (Math.abs(c.x-u.beamX)<r+TRACTOR_HALF_WIDTH && c.y-r>u.y) bottom=Math.min(bottom,c.y-r);
  }
  for (const sb of w.subs) if (Math.abs(sb.x-u.beamX)<125+TRACTOR_HALF_WIDTH && sb.y-35>u.y) bottom=Math.min(bottom,sb.y-35);
  return bottom;
}
