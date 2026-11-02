import type { World, Shark, Fish, Ufo } from "./world";
import type { Sub } from "./deep";
import type { AttackDrone, Mothership } from "./encounters";
import { bodyPoints, bodiesOverlap, segmentHit, type BodyCircle } from "./collision-bodies";
import { kickCraft, cancelCraftMotion, isCraftHeld } from "./handling";
import { beginCommanderHold } from "./commanders";
import { hitDroneWithShark } from "./drone-defense";
import { beginMegaWhip, megaStrokeActive, megaStrokeAge, megaTailFrame, sharkSpinePoint, MEGA_STRIKE_COIL, MEGA_STRIKE_SNAP } from "./mega-swim";
import { provoke } from "./provocation";
import { UFO_HITS_TO_BREAK } from "./types";
import { angleDiff, clamp, rand } from "./math";
import { recoverMega } from "./mega-motion";
import { evadeThreat } from "./evasion";

/**
 * The megalodon is always hunting. It picks prey (anything provoking it or close, else the nearest fish), commits to a straight
 * heavy sprint, bites with a felt impact, clamps and shakes its head, then releases. The tail is a separate weapon, used only
 * against craft and motherships, never the kraken.
 */
export type HuntPrey =
  | { kind: "fish"; fish: Fish }
  | { kind: "shark"; shark: Shark }
  | { kind: "craft"; craft: Sub | Ufo };
export interface MegaHunt {
  phase: "sprint" | "clamp";
  prey: HuntPrey;
  at: number;
  until: number;
  /** Where the prey sits relative to the jaws while clamped. */
  dx: number;
  dy: number;
  /** Since when the prey has been behind it (a miss): it gives up the turn and takes something ahead instead of circling. */
  behindAt?: number;
}
type Craft = Sub | Ufo | AttackDrone | Mothership;

export function huntPos(p: HuntPrey) {
  return p.kind === "fish" ? { x: p.fish.x, y: p.fish.y, vx: p.fish.vx, vy: p.fish.vy }
    : p.kind === "shark" ? { x: p.shark.nodes[0], y: p.shark.nodes[1], vx: Math.cos(p.shark.heading) * p.shark.speed, vy: Math.sin(p.shark.heading) * p.shark.speed }
      : { x: p.craft.x, y: p.craft.y, vx: "hull" in p.craft ? p.craft.vx : p.craft.floatVx ?? 0, vy: "hull" in p.craft ? p.craft.vy : p.craft.floatVy ?? 0 };
}
export function huntAlive(w: World, p: HuntPrey) {
  if (p.kind === "fish") return p.fish.alive && !p.fish.docked && !p.fish.riding && !p.fish.held && !p.fish.eoeBound;
  if (p.kind === "shark") return w.sharks.includes(p.shark) && !p.shark.leaving && !p.shark.lifted;
  return "hull" in p.craft ? w.subs.includes(p.craft) && p.craft.hull > 0 : w.ufos.includes(p.craft);
}
/** Whether the prey is something the jaws must clamp and shake (everything but a small fish, which is simply snapped). */
const bigPrey = (p: HuntPrey) => p.kind !== "fish" || !!p.fish.diver;

/** The aim point for steering: where the prey is going, not where it was. */
export function megaHuntAim(sh: Shark) {
  const h = sh.hunt;
  if (!h) return null;
  const p = huntPos(h.prey);
  const d = Math.hypot(p.x - sh.nodes[0], p.y - sh.nodes[1]);
  const lead = clamp(d / Math.max(120, sh.speed), 0, 1.4);
  return { x: p.x + p.vx * lead, y: p.y + p.vy * lead, kind: h.prey.kind, phase: h.phase };
}
/** Prey worth leaving everything else for: a sprint is on, or a clamp is. */
export const megaHunting = (sh: Shark) => !!sh.hunt && !sh.retreat;

function pickPrey(w: World, sh: Shark): HuntPrey | undefined {
  const hx = sh.nodes[0], hy = sh.nodes[1], L = sh.length;
  const aggr = clamp(w.titanAggression(sh), 0, 1);
  const near = L * (1.2 + 1.6 * aggr);
  let best: HuntPrey | undefined;
  let bestScore = Infinity;
  const consider = (p: HuntPrey, x: number, y: number, bonus = 0, limit = Infinity) => {
    const d = Math.hypot(x - hx, y - hy);
    if (d > limit) return;
    // Prey ahead beats prey behind: a heavy body is better off driving straight on than doubling back in a circle.
    const turn = Math.abs(angleDiff(sh.heading, Math.atan2(y - hy, x - hx)));
    if(turn>2.1&&d>L*.35)return;
    const score = d - bonus + L * .7 * turn / Math.PI;
    if (score < bestScore) { bestScore = score; best = p; }
  };
  for (const o of w.sharks)
    if (!o.mega && !o.leaving && !o.grabbed && !o.lifted && !o.ufoCharge && !o.cleaning && !o.carrion)
      consider({ kind: "shark", shark: o }, o.nodes[0], o.nodes[1], L * .3, near);
  for (const s of w.subs)
    if (!s.seizedByKraken && !s.leaving && !s.arrival && !s.commanderHold && !isCraftHeld(w, s))
      consider({ kind: "craft", craft: s }, s.x, s.y, L * .2, near * .9);
  for (const u of w.ufos)
    if (!u.held && u.state !== "enter" && u.state !== "leave")
      consider({ kind: "craft", craft: u }, u.x, u.y, L * .2, near * .9);
  // With a ship or the kraken to settle, it ignores small game and only takes what is right beside it.
  const busy = !!sh.hullHunt || (!!w.kraken && w.kraken.state !== "flee");
  for (const f of busy ? [] : w.fish) {
    if (!f.alive || f.docked || f.riding || f.seized || f.held || f.dragger || f.eoeBound || !w.onScreen(f)) continue;
    if (f.x < 60 || f.y < 60 || f.x > w.width - 60 || f.y > w.height - 60) continue;
    // Divers are bigger game; plain fish are chased from anywhere, so it is always after something.
    // A tight shoal is worth more than a straggler: it can take several in one pass.
    let mates = 0;
    if (!f.diver) for (const o of w.fish) if (o !== f && o.alive && !o.diver && Math.abs(o.x - f.x) < 260 && Math.abs(o.y - f.y) < 260 && ++mates >= 6) break;
    consider({ kind: "fish", fish: f }, f.x, f.y, f.diver ? L * .6 : L * .05 * mates);
  }
  return best;
}

/** A small fish in the jaws is simply swallowed in passing, so a run through a school takes many. */
function snapFish(w: World, sh: Shark) {
  // The bow wave drags small fish ahead of the jaws in toward the mouth: the faster it drives, the harder the pull.
  const pull = clamp((sh.speed - 120) / 220, 0, 1) * .05;
  if (pull > 0) {
    const fx0 = Math.cos(sh.heading), fy0 = Math.sin(sh.heading), pr = sh.length * .4;
    for (const f of w.fish) {
      if (f.diver || !f.alive || f.docked || f.riding || f.seized || f.held || f.dragger || f.eoeBound) continue;
      const dx = f.x - sh.nodes[0], dy = f.y - sh.nodes[1], d = Math.hypot(dx, dy);
      if (d > pr || d < 1 || (dx * fx0 + dy * fy0) / d < .35) continue;
      const k = pull * (1 - d / pr);
      f.x -= dx * k; f.y -= dy * k;
    }
  }
  if (w.time < (sh.nextSnapAt ?? 0)) return;
  const hx = sh.nodes[0], hy = sh.nodes[1], reach = sh.length * .13 + 24, fx = Math.cos(sh.heading), fy = Math.sin(sh.heading);
  let ate = 0;
  for (const f of w.fish) {
    if (f.diver || !f.alive || f.docked || f.riding || f.seized || f.held || f.dragger || f.eoeBound) continue;
    const dx = f.x - hx, dy = f.y - hy, dist = Math.hypot(dx, dy);
    if (dist > reach || (dist > reach * .35 && dx * fx + dy * fy < 0)) continue;
    f.alive = false;
    f.respawnAt = w.time + rand(3, 8);
    w.events.push({ kind: "eat", x: f.x, y: f.y });
    sh.hunger = Math.max(0, sh.hunger - .02);
    if (++ate >= 4) break;
  }
  if (!ate) return;
  sh.chompAt = w.time;
  sh.nextSnapAt = w.time + .3;
  w.splash(hx, hy, 1.1, undefined, { dir: sh.heading, weight: 3, max: sh.length * .35, quiet: true });
  if (ate > 1) w.frenzy = Math.min(1, w.frenzy + .02 * ate);
}

/** Head-on contact felt through the whole view: ring, spray, shake and a short view shake. */
function bite(w: World, sh: Shark, x: number, y: number, power: number) {
  sh.chompAt = w.time;
  w.blasts.push({ x, y, born: w.time });
  w.splash(x, y, 1.9, undefined, { dir: sh.heading, weight: 3, max: sh.length * .5 });
  w.titanImpact(power);
}

function release(w: World, sh: Shark, cooldown: number) {
  sh.hunt = undefined;
  sh.shake = undefined;
  const aggr = clamp(w.titanAggression(sh), 0, 1.3);
  sh.nextBite = w.time + cooldown * (1.2 - .7 * clamp(aggr, 0, 1));
}

function finishClamp(w: World, sh: Shark, h: MegaHunt) {
  const p = h.prey, { time } = w, aggr = clamp(w.titanAggression(sh), 0, 1);
  if (p.kind === "fish") {
    const f = p.fish;
    f.seized = undefined;
    if (f.alive) {
      f.deathCause = "MEGALODON BITE";
      f.alive = false;
      f.respawnAt = time + rand(3, 8);
      w.callout(f.x, f.y - 30, "DIVER EATEN", "255,120,110");
      w.diverQuip("eaten");
      w.events.push({ kind: "eat", x: f.x, y: f.y });
      w.blood = { x: f.x, y: f.y, until: time + 7 };
      w.titanKill(sh);
      w.frenzy = Math.min(1, w.frenzy + .3);
    }
  }
  else if (p.kind === "shark") {
    const victim = p.shark;
    const x = victim.nodes[0], y = victim.nodes[1];
    if (w.sharks.includes(victim) && Math.random() < .55 + .25 * aggr) {
      w.sharks = w.sharks.filter((o) => o !== victim);
      if (w.fight && (w.fight.a === victim || w.fight.b === victim)) w.fight = null;
      w.callout(x, y - 40, "SHARK EATEN", "255,120,110");
      w.notices.push("the megalodon ate a shark... ouch!");
      w.events.push({ kind: "eat", x, y });
      w.blood = { x, y, until: time + 8 };
      w.titanKill(sh);
      w.frenzy = Math.min(1, w.frenzy + .3);
    }
    else if (w.sharks.includes(victim)) {
      victim.blastFlee = { x: sh.nodes[0], y: sh.nodes[1], until: time + 2.5 };
      victim.target = null;
      victim.alertUntil = time + 2.5;
      w.callout(x, y - 40, "SHARK MAULED", "255,170,120");
      w.blood = { x, y, until: time + 5 };
    }
  }
  release(w, sh, p.kind === "fish" ? .5 : 1.1);
}

/** Craft take the bite as a ram: hull damage, a hard knock and a stun. A commander is clamped in its jaws instead. */
function biteCraft(w: World, sh: Shark, craft: Sub | Ufo) {
  const hx = sh.nodes[0], hy = sh.nodes[1];
  provoke(w, sh, craft);
  if ("hull" in craft && craft.crew && beginCommanderHold(w, craft, sh)) {
    bite(w, sh, hx, hy, .9);
    sh.hunt = undefined;
    sh.nextBite = w.time + 2;
    return;
  }
  bite(w, sh, hx, hy, .85);
  const a = Math.atan2(craft.y - hy, craft.x - hx);
  cancelCraftMotion(w, craft);
  kickCraft(w, craft, Math.cos(a) * 560, Math.sin(a) * 560);
  stun(w, craft, Math.cos(a) * 90, 2.2);
  craft.hitAt = w.time;
  if ("hull" in craft) {
    craft.hull -= 3;
    if (craft.hull <= 0) { w.destroySub(craft, "the megalodon bit a submarine in half..."); w.titanKill(sh); }
  }
  else {
    craft.hits = (craft.hits ?? 0) + 3;
    if (craft.hits >= UFO_HITS_TO_BREAK) { w.destroyUfo("smashed", craft, "the megalodon's jaws crushed a UFO..."); w.titanKill(sh); }
  }
  w.callout(craft.x, craft.y - 40, "JAWS HIT", "255,170,120");
  release(w, sh, 1.4);
}

function stun(w: World, c: Craft, drift: number, seconds: number) {
  c.emp = { until: w.time + seconds, sink: 55, rise: 80, homeY: clamp(c.y, 60, w.height - 60), drift };
}

function beginClamp(w: World, sh: Shark, h: MegaHunt, p: { x: number; y: number }) {
  const hx = sh.nodes[0], hy = sh.nodes[1];
  const f = h.prey.kind === "fish" ? h.prey.fish : undefined;
  if (f) {
    if (w.blasterEscape(f, .15, hx, hy) || w.absorbDiverShield(f)) { release(w, sh, 1); return; }
    f.seized = true;
    f.vx = 0; f.vy = 0;
  }
  bite(w, sh, p.x, p.y, h.prey.kind === "shark" ? .8 : .6);
  if (w.time >= (sh.noteAt ?? 0)) { sh.noteAt = w.time + 14; w.notices.push("the megalodon has clamped on"); }
  w.events.push({ kind: "eat", x: p.x, y: p.y });
  h.phase = "clamp";
  h.at = w.time;
  h.until = w.time + rand(1.3, 2) * (1 - .25 * clamp(w.titanAggression(sh), 0, 1));
  h.dx = p.x - hx;
  h.dy = p.y - hy;
  sh.shake = { amp: .6 + .4 * clamp(w.titanAggression(sh), 0, 1), phase: 0 };
  sh.nextBite = w.time + 99;
}

function carry(w: World, sh: Shark, h: MegaHunt) {
  const hx = sh.nodes[0] + h.dx, hy = sh.nodes[1] + h.dy, p = h.prey;
  if (p.kind === "fish") { p.fish.x = hx; p.fish.y = hy; p.fish.vx = 0; p.fish.vy = 0; }
  else if (p.kind === "shark") {
    const v = p.shark, ox = hx - v.nodes[0], oy = hy - v.nodes[1];
    for (let i = 0; i < v.nodes.length; i += 2) { v.nodes[i] += ox; v.nodes[i + 1] += oy; }
    v.speed = 0; v.target = null;
  }
}

/** One step of hunting for a megalodon (called each step from stepTitanContacts). */
export function stepMegaHunt(w: World, sh: Shark, dt: number) {
  const { time } = w;
  const special = sh.retreat || sh.leaving || sh.grabbed || sh.lifted || w.kraken?.wrapping === sh || w.whaleFight?.mega === sh || !!sh.hullClamp || !!w.kraken && w.kraken.state!=="flee";
  if (special) {
    if (sh.hunt?.prey.kind === "fish") sh.hunt.prey.fish.seized = undefined;
    sh.hunt = undefined;
    if (!(w.kraken?.wrapping === sh)) sh.shake = undefined;
    return;
  }
  snapFish(w, sh);
  const hx = sh.nodes[0], hy = sh.nodes[1];
  // Something that provoked it, or a request from elsewhere (a diver it was told to bite), becomes the prey.
  const req = sh.biteTarget;
  if (req && !sh.hunt) {
    sh.biteTarget = undefined;
    const prey: HuntPrey | undefined = req.fish ? { kind: "fish", fish: req.fish } : req.shark ? { kind: "shark", shark: req.shark } : undefined;
    if (prey && huntAlive(w, prey)) sh.hunt = { phase: "sprint", prey, at: time, until: time + 9, dx: 0, dy: 0 };
  }
  const provoked = w.provocations.get(sh);
  if (provoked && !sh.hunt) {
    const t = provoked.target;
    const prey: HuntPrey | undefined = w.fish.includes(t as Fish) ? { kind: "fish", fish: t as Fish }
      : w.sharks.includes(t as Shark) ? { kind: "shark", shark: t as Shark }
        : w.subs.includes(t as Sub) || w.ufos.includes(t as Ufo) ? { kind: "craft", craft: t as Sub | Ufo } : undefined;
    if (prey && huntAlive(w, prey)) sh.hunt = { phase: "sprint", prey, at: time, until: time + 9, dx: 0, dy: 0 };
  }
  let h = sh.hunt;
  if (!h) {
    if (time >= (sh.nextBite ?? 0) && time >= (sh.huntPickAt ?? 0)) {
      sh.huntPickAt = time + .4;
      const prey = pickPrey(w, sh);
      if (prey) {
        sh.hunt = h = { phase: "sprint", prey, at: time, until: time + 10, dx: 0, dy: 0 };
        // The moment it commits, the water reacts: everything near scatters and the view feels the weight of it.
        if (bigPrey(prey) && Math.hypot(huntPos(prey).x - hx, huntPos(prey).y - hy) > sh.length * .6) {
          w.titanImpact(.35);
          if (time >= (sh.noteAt ?? 0)) { sh.noteAt = time + 22; w.notices.push("the megalodon is hunting"); }
          // Everything near the bow panics the moment it lunges.
          for (const f of w.fish) if (f.alive && !f.docked && Math.hypot(f.x - hx, f.y - hy) < sh.length * 1.3) f.alarm = 1;
          for (const o of w.sharks) if (!o.mega && !o.grabbed && Math.hypot(o.nodes[0] - hx, o.nodes[1] - hy) < sh.length * 1.3) o.alertUntil = Math.max(o.alertUntil ?? 0, time + 2);
          w.splash(hx, hy, 2, undefined, { dir: sh.heading, weight: 3, max: sh.length * .7, quiet: true });
        }
      }
    }
    tailStrike(w, sh);
    return;
  }
  if (!huntAlive(w, h.prey)) {
    if (h.phase === "clamp") finishClamp(w, sh, h);
    else release(w, sh, .4);
    return;
  }
  const p = huntPos(h.prey);
  if (h.phase === "sprint") {
    const d = Math.hypot(p.x - hx, p.y - hy);
    const radius = h.prey.kind === "shark" ? h.prey.shark.length * .05 : h.prey.kind === "craft" ? 26 : 14;
    // Heavy bow wave while it drives in.
    if (sh.speed > 150 && time >= (sh.bowAt ?? 0)) {
      sh.bowAt = time + .22;
      w.splash(hx, hy, 1.4, undefined, { dir: sh.heading, weight: 3, max: sh.length * .5, quiet: true });
    }
    if (d < sh.length * .09 + radius && time >= (sh.nextBite ?? 0)) {
      const actor=h.prey.kind==="fish"?h.prey.fish:h.prey.kind==="craft"?h.prey.craft:null;
      if(actor&&evadeThreat(w,actor,{x:hx,y:hy})) {
        const after=huntPos(h.prey);
        if(Math.hypot(after.x-hx,after.y-hy)>sh.length*.09+radius){release(w,sh,.5);recoverMega(sh,time);return;}
      }
      if (h.prey.kind === "craft") biteCraft(w, sh, h.prey.craft);
      else if (bigPrey(h.prey)) beginClamp(w, sh, h, p);
      else release(w, sh, .1);
      return;
    }
    // Missed it: the prey is now behind the bow. A heavy body drives on rather than doubling back, so take what is ahead.
    if (Math.abs(angleDiff(sh.heading, Math.atan2(p.y - hy, p.x - hx))) > 1.3 && d > sh.length * .2) {
      h.behindAt ??= time;
      if (time - h.behindAt > .5) { release(w, sh, .6); recoverMega(sh,time); return; }
    }
    else h.behindAt = undefined;
    if (time > h.until) release(w, sh, 1.2);
    tailStrike(w, sh);
    return;
  }
  // Clamped: the prey rides the jaws, the head shakes, the whole body drags.
  carry(w, sh, h);
  sh.speed = Math.min(sh.speed, 150);
  if (time >= h.until) finishClamp(w, sh, h);
}

/** The tail as a deliberate weapon against craft and motherships alongside the rear half; never the kraken. */
const struck = new WeakMap<Shark, Set<object>>();
const oldTails=new WeakMap<Shark,BodyCircle[]>();
function tailStrike(w: World, sh: Shark) {
  const { time } = w;
  const count = sh.nodes.length / 2, first = Math.floor(count * .6);
  const hx = sh.nodes[0], hy = sh.nodes[1];
  const targets: Craft[] = [
    ...w.subs.filter((s) => !s.seizedByKraken && !s.commanderHold && !s.leaving && !s.arrival && !isCraftHeld(w, s)),
    ...w.ufos.filter((u) => !u.held && u.state !== "enter" && u.state !== "leave"),
    ...w.attackDrones.filter((d) => d.hp > 0),
    ...(w.mothership && w.mothership.phase === "battle" && (!w.mothership.warp || w.mothership.warp.moved) ? [w.mothership] : []),
  ];
  const tail = (): BodyCircle[] => { const pts: BodyCircle[] = []; for (let i = first; i < count; i++) pts.push({ ...sharkSpinePoint(sh,i), r: sh.length * (.02 + .025 * (i / count)) + 6 });
    const f=megaTailFrame(sh);for(const side of [-1,0,1])pts.push({x:f.bx+sh.length*(f.c*.14-f.s*.1*side),y:f.by+sh.length*(f.s*.14+f.c*.1*side),r:sh.length*.025});return pts; };
  const previous=oldTails.get(sh),current=tail();oldTails.set(sh,current);
  if (!megaStrokeActive(sh)) {
    if (time < (sh.nextWhipAt ?? 0) || !targets.length) return;
    const aggr = clamp(w.titanAggression(sh), 0, 1.3);
    let pick: Craft | undefined, side = 1, bestD = Infinity;
    for (const t of targets) {
      const bodies = bodyPoints(w, t);
      let dist = Infinity;
      for (let i = first; i < count; i++)
        for (const b of bodies) dist = Math.min(dist, Math.hypot(sh.nodes[i * 2] - b.x, sh.nodes[i * 2 + 1] - b.y) - b.r);
      const jaw = Math.hypot(t.x - hx, t.y - hy);
      if (dist < sh.length * .14 && jaw > sh.length * .22 && dist < bestD) {
        bestD = dist; pick = t;
        const dx = t.x - sh.nodes[(count - 1) * 2], dy = t.y - sh.nodes[(count - 1) * 2 + 1];
        side = dx * Math.sin(sh.heading) - dy * Math.cos(sh.heading) >= 0 ? 1 : -1;
      }
    }
    if (!pick) return;
    sh.nextWhipAt = time + (9 - 4 * clamp(aggr, 0, 1)) * (.85 + .3 * Math.random());
    beginMegaWhip(sh, side);
    struck.set(sh, new Set());
    return;
  }
  const age = megaStrokeAge(sh) ?? 0;
  if (age < MEGA_STRIKE_COIL - .03 || age > MEGA_STRIKE_COIL + MEGA_STRIKE_SNAP) return;
  const tailBodies = current;
  const hitSet = struck.get(sh) ?? new Set<object>();
  struck.set(sh, hitSet);
  for (const t of targets) {
    if(hitSet.has(t))continue;
    const hull=bodyPoints(w,t);
    const swept=previous?.length===tailBodies.length&&tailBodies.some((n,i)=>Math.hypot(n.x-previous[i].x,n.y-previous[i].y)<sh.length*.3&&Number.isFinite(segmentHit(previous[i].x,previous[i].y,n.x,n.y,hull.map(c=>({...c,r:c.r+n.r})))));
    if(!bodiesOverlap(tailBodies,hull)&&!swept)continue;
    if(evadeThreat(w,t,{x:hx,y:hy})&&!bodiesOverlap(tailBodies,bodyPoints(w,t)))continue;
    hitSet.add(t);
    // Direction: away from the tail node that connected.
    let best = tailBodies[tailBodies.length - 1], bd = Infinity;
    for (const n of tailBodies) { const d = Math.hypot(n.x - t.x, n.y - t.y); if (d < bd) { bd = d; best = n; } }
    const a = Math.atan2(t.y - best.y, t.x - best.x);
    whipHit(w, sh, t, a, 1, best.x, best.y);
  }
}

function whipHit(w: World, sh: Shark, t: Craft, a: number, force: number, x: number, y: number) {
  const aggr = clamp(w.titanAggression(sh), 0, 1.3);
  provoke(w, sh, t);
  const kick = (520 + 140 * aggr) * force;
  w.blasts.push({ x, y, born: w.time });
  w.splash(x, y, 2.2, undefined, { dir: a, weight: 3, max: sh.length * .6 });
  w.titanImpact(.95);
  if ("maxHp" in t) {
    // The mothership takes real damage and is knocked clear: it drifts off the field, then climbs back in.
    t.hp -= t.maxHp * (.06 + .02 * aggr);
    kickCraft(w, t, Math.cos(a) * kick * .5, Math.sin(a) * kick * .5);
    stun(w, t, Math.cos(a) * 45, 3.2);
    w.callout(t.x, t.y - t.size * .3, "HULL RAMMED", "255,210,150");
    w.notices.push("the megalodon's tail struck the mothership...");
    return;
  }
  if ("stunned" in t) { hitDroneWithShark(w, sh, t); t.hp = 0; return; }
  cancelCraftMotion(w, t);
  kickCraft(w, t, Math.cos(a) * kick, Math.sin(a) * kick);
  stun(w, t, Math.cos(a) * 90, 2.6);
  t.hitAt = w.time;
  if ("hull" in t) {
    t.hull -= 3;
    if (t.hull <= 0) { w.destroySub(t, "the megalodon's tail broke a submarine..."); w.titanKill(sh); }
  }
  else {
    t.hits = (t.hits ?? 0) + 3;
    if (t.hits >= UFO_HITS_TO_BREAK) { w.destroyUfo("smashed", t, "the megalodon's tail smashed a UFO..."); w.titanKill(sh); }
  }
  w.callout(t.x, t.y - 40, "TAIL STRIKE", "255,150,120");
}

/**
 * The megalodon's whole body is solid and lethal. Anything its body (not only its jaws) runs into is destroyed: fish are eaten,
 * divers crushed, small sharks and jellyfish destroyed, drones smashed. Craft are handled with the other craft contacts
 * (hull-combat), the kraken, whales and the Ghost keep their own encounters.
 */
export function stepMegaBody(w: World, sh: Shark) {
  if (sh.grabbed || sh.lifted || sh.leaving) return;
  const body = bodyPoints(w, sh), { time } = w;
  const hit = (x: number, y: number, pad = 0) => body.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + pad);
  let ate = 0;
  for (const f of w.fish) {
    if (!f.alive || f.docked || f.riding || f.eoeBound || f.seized || f.held || !hit(f.x, f.y, 4)) continue;
    if (f.diver) {
      if (sh.hunt?.prey.kind === "fish" && sh.hunt.prey.fish === f) continue;
      f.deathCause = "MEGALODON BODY";
      w.callout(f.x, f.y - 30, "DIVER CRUSHED AGAINST MEGALODON", "255,120,110");
      w.popDiver(f, "crushed");
      continue;
    }
    f.alive = false;
    f.respawnAt = time + rand(3, 8);
    w.events.push({ kind: "eat", x: f.x, y: f.y });
    ate++;
  }
  if (ate) w.splash(sh.nodes[0], sh.nodes[1], 1, undefined, { dir: sh.heading, weight: 3, max: sh.length * .3, quiet: true });
  for (const o of [...w.sharks]) {
    if (o.mega || o.leaving || o.grabbed || o.lifted || o.ufoCharge || w.kraken?.wrapping === o) continue;
    if (!hit(o.nodes[0], o.nodes[1], o.length * .03)) continue;
    w.sharks = w.sharks.filter((s) => s !== o);
    if (w.fight && (w.fight.a === o || w.fight.b === o)) w.fight = null;
    w.callout(o.nodes[0], o.nodes[1] - 40, "SHARK CRUSHED", "255,120,110");
    w.notices.push("the megalodon ate a shark... ouch!");
    w.events.push({ kind: "eat", x: o.nodes[0], y: o.nodes[1] });
    w.blood = { x: o.nodes[0], y: o.nodes[1], until: time + 8 };
    w.titanKill(sh);
  }
  const jellies = w.jellies.filter((j) => hit(j.x, j.y, j.size));
  if (jellies.length) {
    w.jellies = w.jellies.filter((j) => !jellies.includes(j));
    for (const j of jellies) w.splash(j.x, j.y, 1, undefined, { quiet: true });
  }
}
