import type { World } from "./world";
import type { Put } from "./deepdraw";
import { kickCraft, isCraftHeld } from "./handling";
import { UFO_HITS_TO_BREAK } from "./types";
import { bodyPoints } from "./collision-bodies";
import { actorAlive, provoke, type Offender } from "./provocation";

const wakes = new WeakMap<World, Map<Offender, { vx: number; vy: number }>>();

export function carry(w: World, actor: Offender, vx: number, vy: number) {
  let map = wakes.get(w);
  if (!map) { map = new Map(); wakes.set(w, map); }
  const old = map.get(actor);
  const sumX = (old?.vx ?? 0) + vx, sumY = (old?.vy ?? 0) + vy;
  const max = "nodes" in actor ? actor.mega ? 65 : 200 : 450;
  const scale = Math.min(1, max / (Math.hypot(sumX, sumY) || 1));
  map.set(actor, { vx: sumX * scale, vy: sumY * scale });
}

/** Continue the outward motion while swimming and steering gradually regain control. */
export function stepRimMotion(w: World, dt: number) {
  const map = wakes.get(w);
  if (!map) return;
  for (const [actor, velocity] of map) {
    const attached = "nodes" in actor ? actor.grabbed || actor.lifted
      : actor === w.kraken ? actor.wrapping || actor.maul
      : "alive" in actor ? actor.held || actor.seized || actor.riding || actor.dragger : false;
    if (!actorAlive(w, actor) || attached) { map.delete(actor); continue; }
    // Integrate exponential drag exactly so the same blast travels the same distance at 15/30/60 fps.
    const decay = Math.exp(-dt * 2.2), distance = (1 - decay) / 2.2;
    const dx = velocity.vx * distance, dy = velocity.vy * distance;
    if ("nodes" in actor) {
      for (let i = 0; i < actor.nodes.length; i += 2) { actor.nodes[i] += dx; actor.nodes[i + 1] += dy; }
    } else {
      actor.x += dx; actor.y += dy;
      if ("spine" in actor && actor.spine) for (const p of actor.spine) { p.x += dx; p.y += dy; }
    }
    velocity.vx *= decay; velocity.vy *= decay;
    if (Math.hypot(velocity.vx, velocity.vy) < 4) map.delete(actor);
  }
}

export interface RimWave {
  x: number;
  y: number;
  size: number;
  born: number;
  hit: Set<object>;
}

/** Shared by defensive spins and the final departure blast. Each body is hit once. */
export function pushRim(w: World, hit: Set<object>, x: number, y: number, reach: number) {
  const push = (actor: Offender | World["jellies"][number], px: number, py: number, apply: (nx: number, ny: number) => void) => {
    if (hit.has(actor)) return;
    const points = "size" in actor && w.jellies.includes(actor as never)
      ? [{ x: px, y: py, r: (actor as World["jellies"][number]).size }] : bodyPoints(w, actor as Offender);
    if (!points.some(p => Math.hypot(p.x - x, p.y - y) - p.r <= reach)) return;
    hit.add(actor);
    const a = Math.atan2(py - y, px - x);
    apply(Math.cos(a), Math.sin(a));
  };

  for (const f of w.fish) {
    if (!f.alive || f.riding || f.seized || f.dragger) continue;
    push(f, f.x, f.y, (nx, ny) => {
      if (!f.diver) {
        f.alive = false;
        f.respawnAt = w.time + 5 + Math.random() * 5;
      } else {
        w.popDiver(f, "blast");
      }
    });
  }

  for (const sub of [...w.subs]) {
    if (!sub.seizedByKraken) {
      push(sub, sub.x, sub.y, (nx, ny) => {
        sub.hull -= 2; sub.hitAt = w.time;
        kickCraft(w, sub, nx * 650, ny * 650);
        if (sub.hull <= 0) w.destroySub(sub, "the mothership blast destroyed a submarine...");
      });
    }
  }
  for (const ufo of [...w.ufos]) {
    if (!ufo.held) {
      push(ufo, ufo.x, ufo.y, (nx, ny) => {
        ufo.hits = (ufo.hits ?? 0) + 2; ufo.hitAt = w.time;
        kickCraft(w, ufo, nx * 750, ny * 750);
        if (ufo.hits >= UFO_HITS_TO_BREAK) w.destroyUfo("blasted", ufo);
      });
    }
  }
  for (const drone of w.attackDrones) {
    if (isCraftHeld(w, drone)) continue;
    push(drone, drone.x, drone.y, (nx, ny) => {
      drone.returned = undefined;
      kickCraft(w, drone, nx * 650, ny * 650);
      drone.stunned = w.time + 1.5;
    });
  }
  for (const shark of w.sharks) {
    if (shark.grabbed || shark.lifted) continue;
    push(shark, shark.nodes[0], shark.nodes[1], (nx, ny) => {
      shark.blastFlee = { x, y, until: w.time + (shark.mega ? 6 : 9) };
      shark.target = null;
      shark.ufoCharge = false;
      const power = shark.mega ? 120 : 420;
      carry(w, shark, nx * power, ny * power);
      if (!shark.mega) {
        shark.blastFlee = { x, y, until: w.time + 9 };
        shark.target = null;
      }
    });
  }
  for (const jelly of w.jellies) {
    push(jelly, jelly.x, jelly.y, (nx, ny) => {
      jelly.vx = (jelly.vx ?? 0) + nx * 230;
      jelly.vy = (jelly.vy ?? 0) + ny * 230;
    });
  }
  for (const whale of w.whales) {
    push(whale, whale.x, whale.y, (nx, ny) => {
      carry(w, whale, nx * 85, ny * 85);
      whale.fleeing = true; whale.fleeHeading = Math.atan2(ny, nx);
    });
  }
  if (w.kraken && !w.kraken.wrapping) {
    const k = w.kraken;
    push(k, k.x, k.y, (nx, ny) => {
      if (w.mothership) {
        provoke(w, k, w.mothership);
        k.hullUntil = w.time + 12;
        if (w.mothership.grapple?.kraken === k) w.mothership.grapple = undefined;
      }
      carry(w, k, nx * 110, ny * 110);
    });
  }
  if (w.leviathan) {
    const ghost = w.leviathan;
    push(ghost, ghost.x, ghost.y, (nx, ny) => {
      carry(w, ghost, nx * 40, ny * 40);
    });
  }
  for (const debris of [...w.debris, ...w.mess, ...w.alienScrap]) {
    if (hit.has(debris) || Math.hypot(debris.x - x, debris.y - y) > reach) continue;
    hit.add(debris);
    const angle = Math.atan2(debris.y - y, debris.x - x);
    debris.vx += Math.cos(angle) * 360; debris.vy += Math.sin(angle) * 360;
  }
}

export function stepRimWaves(w: World) {
  if (!w.rimWaves?.length) return;
  for (const wave of w.rimWaves) {
    const progress = Math.min(1, (w.time - wave.born) / 1.5);
    pushRim(w, wave.hit, wave.x, wave.y, wave.size * .95 + progress * 480);
  }
  w.rimWaves = w.rimWaves.filter(wave => w.time - wave.born < 2.2);
}

export function drawRimWaves(put: Put, w: World, cw: number) {
  for (const wave of w.rimWaves ?? []) {
    const age = w.time - wave.born;
    const radius = wave.size * .95 + Math.min(1, age / 1.5) * 480;
    const count = Math.min(220, Math.max(40, Math.ceil(radius * Math.PI * 2 / cw)));
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      put(wave.x + Math.cos(a) * radius, wave.y + Math.sin(a) * radius,
        i % 4 ? "~" : "*", `rgba(150,255,210,${Math.max(0, 1 - age / 2.2)})`);
    }
  }
}
