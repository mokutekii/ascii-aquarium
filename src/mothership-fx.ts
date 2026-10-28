import { carry } from "./rim-wave";
import { provoke } from "./provocation";
import { UFO_HITS_TO_BREAK } from "./types";
import { clamp, TAU } from "./math";
import type { World } from "./world";
import type { Mothership, AttackDrone } from "./encounters";
import type { Put } from "./deepdraw";
import { impactSub, touchesHull } from "./hull-combat";
import { spawnCraftDebris } from "./wreckage";
export interface AlienScrap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  fuse?: number;
  glyph: string;
}

export interface MothershipWreck {
  x: number;
  y: number;
  born: number;
  size: number;
  hit?: Set<object>[];
  damaged?: Set<object>;
}

export function dropDrone(w: World, d: AttackDrone) {
  if (d.detonated)
    return;
  if (w.alienScrap.length >= 100)
    return;
  w.alienScrap.push({ x: d.x, y: d.y, vx: 0, vy: 25, born: w.time, fuse: w.time + 4, glyph: "@" });
  w.callout(d.x, d.y - 25, "UNSTABLE CORE", "120,235,255");
}

export function beginWreck(w: World, b: Mothership) {
  w.mothershipWreck = { x: b.x, y: b.y, size: b.size, born: w.time };
  spawnCraftDebris(w, "mothership", b.x, b.y, b.size, 150);
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996, speed = 65 + (i % 7) * 23;
    w.alienScrap.push({
      x: b.x + Math.cos(a) * b.size * .35, y: b.y + Math.sin(a) * b.size * .12,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, born: w.time, glyph: ["#", "%", "=", "+", "/"][i % 5]
    });
  }
  w.alienScrap = w.alienScrap.slice(-100);
}
// Apply pressure once as each expanding wavefront crosses an actor, independent of frame rate.
function pressure(w: World, x: number, y: number, previous: number, radius: number, power: number, hit: Set<object>, source?: import("./provocation").Offender) {
  const kick = (p: {
    x: number;
    y: number;
    vx?: number;
    vy?: number;
  }, mass = 1, identity: object = p) => {
    if (hit.has(identity))
      return;
    let dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (d > radius || d < previous)
      return;
    hit.add(identity);
    if (d < 1) {
      dx = 0;
      dy = 1;
      d = 1;
    }
    const force = power / mass;
    // Apply momentum, never project an off-screen body back into the tank.
    if ("nodes" in identity || identity === w.kraken || identity === w.leviathan || w.whales.includes(identity as never))
      carry(w, identity as import("./provocation").Offender, dx / d * force, dy / d * force);
    if (p.vx !== undefined)
      p.vx += dx / d * force;
    if (p.vy !== undefined)
      p.vy += dy / d * force;
  };
  for (const f of w.fish)
    if (f.alive && !f.held && !f.seized && !f.riding && !f.dragger) {
      kick(f);
      if (hit.has(f)) f.alarm = 1;
    }
  for (const s of w.subs)
    if (!s.seizedByKraken)
      kick(s, 3);
  for (const u of w.ufos)
    if (!u.held)
      kick(u, 2);
  for (const d of w.attackDrones)
    kick(d);
  for (const whale of w.whales) {
    const x = whale.x, y = whale.y;
    kick(whale, 7);
    if (whale.spine)
      for (const p of whale.spine) {
        p.x += whale.x - x;
        p.y += whale.y - y;
      }
  }
  if (w.kraken) {
    kick(w.kraken, 6);
    if (hit.has(w.kraken)) { w.kraken.rageUntil = Math.max(w.kraken.rageUntil ?? 0, w.time + 10); if (source) provoke(w, w.kraken, source); }
  }
  if (w.leviathan)
    kick(w.leviathan, 8);
  for (const s of w.sharks)
    if (!s.grabbed) {
      const p = { x: s.nodes[0], y: s.nodes[1] }, ox = p.x, oy = p.y;
      kick(p, s.mega ? 6 : 2, s);
      if (hit.has(s)) {
        if (s.mega) { s.rageUntil = Math.max(s.rageUntil ?? 0, w.time + 10); if (source) provoke(w, s, source); }
        else { s.blastFlee = { x, y, until: w.time + 2 }; s.target = null; s.alertUntil = w.time + 2; }
      }
      for (let i = 0; i < s.nodes.length; i += 2) {
        s.nodes[i] += p.x - ox;
        s.nodes[i + 1] += p.y - oy;
      }
    }
  for (const s of w.alienScrap)
    kick(s, .7);
}

export function teleportImpact(w: World, b: Mothership) {
  for (const f of w.fish) {
    if (!f.alive || f.held || f.seized || f.riding || f.dragger)
      continue;
    if (((f.x - b.x) / (b.size * .95 + 25)) ** 2 + ((f.y - b.y) / (b.size * .26 + 25)) ** 2 > 1)
      continue;
    f.y = clamp(b.y + b.size * .26 + 55, 30, w.height - 30);
    f.vy = 220;
    f.alarm = 1;
    if (f.diver) {
      const state = w.diverCombat.get(f) ?? { hits: 0, hitAt: -99, nextShot: w.time + 2, nextRepair: w.time + 4 };
      if (w.absorbDiverShield(f))
        continue;
      else
        state.hits++;
      state.hitAt = w.time;
      w.diverCombat.set(f, state);
      f.stunUntil = w.time + 1.2;
      if (state.hits >= 3)
        w.popDiver(f, "blast");
    }
  }
  for (const s of [...w.subs]) {
    if (Math.abs(s.x - b.x) > b.size * .95 + 100 || Math.abs(s.y - b.y) > b.size * .26 + 40)
      continue;
    impactSub(w, b, s, 2);
    s.y = clamp(b.y + b.size * .26 + 90, 40, w.height - 40);
  }
  // Titans are solid on re-entry; choose a clear side instead of materialising through their bodies.
  for (const sh of w.sharks.filter(s => s.mega))
    for (let i = 0; i < sh.nodes.length; i += 4) {
      if (!touchesHull(b, sh.nodes[i], sh.nodes[i + 1], sh.length * .06))
        continue;
      b.y = clamp(sh.nodes[i + 1] + (b.y < sh.nodes[i + 1] ? -1 : 1) * (b.size * .28 + sh.length * .1), b.size * .3, w.height - b.size * .3);
      b.hp -= b.maxHp * .04;
      break;
    }
  if (w.kraken && touchesHull(b, w.kraken.x, w.kraken.y, w.kraken.size * .2)) {
    b.y = clamp(w.kraken.y + (b.y < w.kraken.y ? -1 : 1) * (b.size * .28 + w.kraken.size * .25), b.size * .3, w.height - b.size * .3);
    b.hp -= b.maxHp * .04;
  }
}

const blastHits = new WeakMap<object, Set<object>>();
export function stepMothershipFx(w: World, dt: number) {
  if (w.eoe) {
    w.mothershipWreck = null;
    w.alienScrap = [];
    w.capacitorWaves = [];
    return;
  }
  // Every bomb producer (including bombers, cores and meteors) shares one expanding pressure front.
  for (const bomb of w.bombs ?? []) {
    const age = w.time - bomb.born;
    if (age < 0 || age > 1.2) continue;
    let hit = blastHits.get(bomb);
    if (!hit) { hit = new Set(); blastHits.set(bomb, hit); }
    pressure(w, bomb.x, bomb.y, 0, bomb.r * Math.min(1, age / .65), 170, hit, bomb.source);
  }
  const wreck = w.mothershipWreck;
  if (wreck) {
    const age = w.time - wreck.born;
    wreck.hit ??= [new Set(), new Set(), new Set()];
    for (const [i, delay] of [0, .65, 1.45].entries()) {
      const a = age - delay;
      if (a < 0 || a > 4)
        continue;
      pressure(w, wreck.x, wreck.y, Math.max(0, a - dt) * 650, a * 650, delay === 0 ? 250 : 120, wreck.hit[i]);
    }
    if (age > 8)
      w.mothershipWreck = null;
  }
  for (const s of w.alienScrap) {
    s.x += s.vx * dt;
    s.y = clamp(s.y + s.vy * dt, 20, w.height - 35);
    s.vx *= Math.exp(-dt * 1.2);
    s.vy += (18 - s.vy) * Math.min(1, dt * .8);
    const diver = w.fish.find(f => f.alive && f.diver && !f.alienArmor && !f.held && !f.seized && !f.riding && !f.dragger && Math.hypot(f.x - s.x, f.y - s.y) < 40);
    if (diver && w.time - s.born > .8) {
      diver.alienArmor = true;
      s.born = -Infinity;
      s.fuse = undefined;
      w.callout(diver.x, diver.y - 35, "ALIEN ARMOR", "120,235,255");
      continue;
    }
    if (s.fuse !== undefined && s.fuse > w.time + .16) {
      const blast = w.bombs?.some(b => w.time - b.born < .3 && Math.hypot(b.x - s.x, b.y - s.y) < b.r);
      const wave = w.capacitorWaves.some(b => { const age = w.time - b.born, d = Math.hypot(b.x - s.x, b.y - s.y); return age > 0 && age < 1.5 && Math.abs(d - age * 320) < 45; });
      if (blast || wave)
        s.fuse = w.time + .1 + (Math.abs(s.x + s.y) % 7) * .015;
    }
    if (s.fuse !== undefined && w.time >= s.fuse) {
      w.capacitorWaves.push({ x: s.x, y: s.y, born: w.time, size: 1 });
      s.born = -Infinity;
    }
  }
  w.alienScrap = w.alienScrap.filter(s => w.time - s.born < 24);
  for (const wave of w.capacitorWaves) {
    const a = w.time - wave.born;
    wave.hit ??= [new Set()];
    pressure(w, wave.x, wave.y, Math.max(0, a - dt) * 320, a * 320, 100, wave.hit[0]);
    wave.damaged ??= new Set();
    for (const u of [...w.ufos])
      if (!u.held && !wave.damaged.has(u) && Math.abs(Math.hypot(u.x - wave.x, u.y - wave.y) - a * 320) < 45) {
        wave.damaged.add(u);
        u.hits = (u.hits ?? 0) + 1;
        u.hitAt = w.time;
        if (u.hits >= UFO_HITS_TO_BREAK)
          w.destroyUfo("blasted", u);
      }
    for (const d of w.attackDrones)
      if (!wave.damaged.has(d) && Math.abs(Math.hypot(d.x - wave.x, d.y - wave.y) - a * 320) < 45) {
        wave.damaged.add(d);
        d.hp--;
      }
  }
  w.capacitorWaves = w.capacitorWaves.filter(s => w.time - s.born < 1.5).slice(-16);
  // Divers actively retrieve safe wreckage after the main pressure fronts have passed.
  if ((wreck && w.time - wreck.born > 4) || w.alienScrap.some(s => s.fuse !== undefined))
    for (const f of w.fish) {
      if (!f.alive || !f.diver || f.alienArmor || f.held || f.seized || f.riding || f.dragger)
        continue;
      const s = w.alienScrap.reduce<AlienScrap | undefined>((best, s) => (s.fuse === undefined || Math.hypot(s.x - f.x, s.y - f.y) < 240) && (!best || Math.hypot(s.x - f.x, s.y - f.y) < Math.hypot(best.x - f.x, best.y - f.y)) ? s : best, undefined);
      if (s) {
        f.x += clamp(s.x - f.x, -100 * dt, 100 * dt);
        f.y += clamp(s.y - f.y, -100 * dt, 100 * dt);
      }
    }
}

export function drawMothershipFx(put: Put, w: World, cw: number, ch: number) {
  const ring = (x: number, y: number, r: number, alpha: number, flat = false) => {
    const n = Math.min(240, Math.max(24, Math.ceil(r * TAU / cw)));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      put(x + Math.cos(a) * r, y + Math.sin(a) * r * (flat ? .22 : 1), flat ? "=" : "*", `rgba(125,225,255,${alpha})`, true);
    }
  };
  // Every bomb producer (including bombers, cores and meteors) shares one expanding pressure front.
  for (const bomb of w.bombs ?? []) {
    const age = w.time - bomb.born;
    if (age < 0 || age > 1.2) continue;
    let hit = blastHits.get(bomb);
    if (!hit) { hit = new Set(); blastHits.set(bomb, hit); }
    pressure(w, bomb.x, bomb.y, 0, bomb.r * Math.min(1, age / .65), 170, hit, bomb.source);
  }
  const wreck = w.mothershipWreck;
  if (wreck) {
    const age = w.time - wreck.born;
    for (const delay of [0, .65, 1.45]) {
      const a = age - delay;
      if (a >= 0 && a < 4) {
        ring(wreck.x, wreck.y, a * 650, (1 - a / 4) * .9);
        ring(wreck.x, wreck.y, a * 900, (1 - a / 4), true);
      }
    }
    if (age < .4)
      for (let i = -10; i <= 10; i++)
        put(wreck.x + i * cw, wreck.y, "=", `rgba(230,250,255,${1 - age / .4})`, true);
  }
  for (const wave of w.capacitorWaves)
    ring(wave.x, wave.y, (w.time - wave.born) * 320, 1 - (w.time - wave.born) / 1.5);
  for (const s of w.alienScrap) {
    const hot = s.fuse !== undefined;
    put(s.x, s.y, hot ? (Math.floor(w.time * 7) % 2 ? "@" : "!") : s.glyph, hot ? "rgb(255,175,95)" : "rgb(140,220,255)", true);
  }
  for (const f of w.fish)
    if (f.alive && (f.alienArmor || (f.shieldUntil ?? 0) > w.time)) {
      const alpha = f.alienArmor ? .3 + .1 * Math.sin(w.time * 2) : Math.max(0, (f.shieldUntil! - w.time) / .9);
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2;
        put(f.x + Math.cos(a) * cw * 2.6, f.y - ch + Math.sin(a) * ch * 2, ".", `rgba(125,225,255,${alpha})`, true);
      }
      put(f.x - cw * 2, f.y, "[", "rgb(125,225,255)", true);
      put(f.x + cw * 2, f.y, "]", "rgb(125,225,255)", true);
    }
}
