import type { World, Ufo, Fish, Jelly } from "./world";
import { bodyPoints } from "./collision-bodies";
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
  if (u.state !== "beam" || bottom<=top || p.y > bottom)
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
        if (f.alive && !f.docked && !f.riding && !f.held && !f.seized && !f.dragger && tractorContains(w, u, f))
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
    if (f.alive && !f.docked && !f.riding && !f.dragger && !f.seized && !f.eoeBound)
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
  return tractorObstruction(w,u,bottom);
}

/** First contact of the expanding cone with any occupied heavy hull. */
export function tractorObstruction(w:World,u:Ufo,bottom:number,x=u.beamX,half=tractorHalfWidth(w,u)) {
  const top=tractorIntake(w,u), slope=(half-16)/Math.max(1,bottom-top);
  const actors=[...w.whales,...w.subs,...w.ufos.filter(o=>o!==u&&o.state!=="leave"),
    ...w.sharks.filter(o=>o.mega&&o!==u.targetShark),...(w.kraken?[w.kraken]:[]),...(w.leviathan?[w.leviathan]:[]),
    ...(w.mothership&&w.mothership.phase!=="collapse"&&(!w.mothership.warp||w.mothership.warp.moved)?[w.mothership]:[])];
  let first=bottom;
  for(const actor of actors)for(const c of bodyPoints(w,actor)){
    let lo=Math.max(top,c.y-c.r),end=Math.min(bottom,c.y+c.r);
    if(lo>end)continue;
    let hi=Math.max(lo,Math.min(end,c.y+c.r*slope/Math.sqrt(1+slope*slope)));
    const gap=(y:number)=>Math.abs(c.x-x)-(16+slope*(y-top))-Math.sqrt(Math.max(0,c.r*c.r-(y-c.y)**2));
    if(gap(hi)>0)continue;
    if(gap(lo)>0)for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(gap(mid)<=0)hi=mid;else lo=mid;}
    else hi=lo;
    first=Math.min(first,hi);
  }
  return first;
}

/** Legacy name, shared heavy-body obstruction for target selection and capture. */
export function titanBlocksBeam(w: World, u: Ufo, x = u.beamX, bottom = Math.min(w.height, tractorBottom(w, u) + 60), half = TRACTOR_HALF_WIDTH) {
  return tractorObstruction(w,u,bottom,x,Math.max(half,tractorHalfWidth(w,u)))<bottom-.1;
}
