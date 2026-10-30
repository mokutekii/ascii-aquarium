import type { World, Ufo, Fish, Jelly } from "./world";
export const TRACTOR_HALF_WIDTH = 42;
export function tractorIntake(w: World, u: Ufo) {
  return u.y + Math.max(40, Math.min(w.width, w.height) * .07) * .18;
}
export function tractorHalfWidth(w: World, u: Ufo) {
  if (u.targetShark) {
    let reach = 55;
    const sh = u.targetShark;
    for (let i = 0; i < sh.nodes.length; i += 2)
      reach = Math.max(reach, Math.abs(sh.nodes[i] - u.beamX) + sh.length * .1);
    return reach;
  }
  const cell = Math.max(8, Math.min(13, Math.round(w.width / 124)));
  let width = TRACTOR_HALF_WIDTH;
  for (const p of [u.beamTarget, ...(u.cargo ?? [])]) {
    if (!p || !("alive" in p ? p.alive : w.jellies.includes(p))) continue;
    width = Math.max(width, "size" in p ? p.size * 2 + 14 : p.diver ? cell * 4.5 : TRACTOR_HALF_WIDTH);
  }
  return width;
}

export function tractorContains(w: World, u: Ufo, p: {
  x: number;
  y: number;
}) {
  const top = tractorIntake(w, u), bottom = tractorBottom(w, u);
  if (u.state !== "beam" || p.y > bottom)
    return false;
  if (u.cargo?.has(p as Fish) && p.y > u.y - 160 && Math.abs(p.x - u.beamX) < tractorHalfWidth(w, u)) return true;
  if (p.y < top)
    return (u.beamTarget === p || !!u.cargo?.has(p as Fish)) && p.y > u.y - ("size" in p && typeof p.size === "number" ? Math.max(160, p.size * 4 + 40) : 160) && Math.abs(p.x - u.beamX) < tractorHalfWidth(w, u);
  const mix = Math.max(0, Math.min(1, (p.y - top) / Math.max(1, bottom - top)));
  return Math.abs(p.x - u.beamX) <= 16 + (tractorHalfWidth(w, u) - 16) * mix;
}

export function tractorCaptives(w: World) {
  const captured = new Set<object>();
  for (const u of w.ufos)
    if (u.state === "beam" && !u.held) {
      for (const f of w.fish)
        if (f.alive && !f.riding && !f.held && !f.seized && !f.dragger && tractorContains(w, u, f))
          captured.add(f);
      for (const j of w.jellies)
        if (tractorContains(w, u, j))
          captured.add(j);
      if (u.targetShark?.lifted)
        captured.add(u.targetShark);
    }
  return captured;
}

export function chooseBeamTarget(w: World, u: Ufo) {
  if (u.targetShark) {
    u.beamTarget = undefined;
    return;
  }
  let best = Infinity;
  let target: Fish | Jelly | undefined;
  const consider = (p: Fish | Jelly) => {
    if (p.y < u.y || Math.abs(p.x - u.beamX) > tractorHalfWidth(w, u))
      return;
    const distance = Math.hypot(p.x - (u.aim?.x ?? u.beamX), p.y - (u.aim?.y ?? u.y + 200));
    if (distance < best) {
      best = distance;
      target = p;
    }
  };
  for (const f of w.fish)
    if (f.alive && !f.riding && !f.dragger && !f.seized && !f.eoeBound)
      consider(f);
  for (const j of w.jellies)
    consider(j);
  u.beamTarget = target;
  u.cargo = new Set(target ? [target] : []);
}

export function interruptTractor(w: World, u: Ufo, message = "BEAM DISRUPTED") {
  if (u.state !== "beam")
    return;
  if (u.targetShark) {
    u.targetShark.lifted = false;
    u.targetShark.speed = Math.max(u.targetShark.speed, 110);
  }
  for (const f of w.fish)
    if (u.cargo?.has(f) || u.beamTarget === f) {
      f.vy = Math.max(f.vy, 25);
    }
  u.targetShark = null;
  u.beamTarget = undefined;
  u.cargo?.clear();
  u.aim = null;
  u.keep = false;
  u.state = "seek";
  u.beamRestUntil = w.time + 2.5;
  if (message)
    w.callout(u.x, u.y + 40, message, "150,255,190");
}
/** The same target-following end is used by capture logic and drawing. */
export function tractorBottom(w: World, u: Ufo) {
  const p = u.beamTarget;
  const live = p && ("alive" in p ? p.alive : w.jellies.includes(p));
  let sharkBottom = -Infinity;
  if (u.targetShark)
    for (let i = 1; i < u.targetShark.nodes.length; i += 2)
      sharkBottom = Math.max(sharkBottom, u.targetShark.nodes[i] + u.targetShark.length * .1);
  const padding = live && "diver" in p && p.diver ? 80 : live && "size" in p ? p.size * 4 : 25;
  let bottom = u.targetShark ? sharkBottom : live ? p.y + padding : u.aim?.y ?? u.y + 100;
  bottom = Math.max(u.y + 25, Math.min(w.height, bottom));
  for (const cargo of u.cargo ?? []) {
    if (!("alive" in cargo ? cargo.alive : w.jellies.includes(cargo))) continue;
    const pad = "size" in cargo ? cargo.size * 4 : cargo.diver ? 80 : 25;
    bottom = Math.max(bottom, cargo.y + pad);
  }
  bottom = Math.min(w.height, bottom);
  // Heavy bodies intercept the column; targets beneath them cannot be pulled through.
  for (const wh of w.whales)
    for (let t = 0; t <= 1; t += 0.1) {
      const c = w.whalePoint(wh, t), r = wh.length * 0.075;
      if (Math.abs(c.x - u.beamX) < r + TRACTOR_HALF_WIDTH && c.y - r > u.y)
        bottom = Math.min(bottom, c.y - r);
    }
  for (const sb of w.subs)
    if (Math.abs(sb.x - u.beamX) < 125 + TRACTOR_HALF_WIDTH && sb.y - 35 > u.y)
      bottom = Math.min(bottom, sb.y - 35);
  return bottom;
}
