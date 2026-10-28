import { craftEntry } from "./spawn-spacing";
import { angleDiff, clamp, rand, randInt, TAU } from "./math";
import { UFO_HITS_TO_BREAK, CRAFT_HULL_HP } from "./types";
import { SHARK_NODES } from "./types";
import type { Ufo } from "./types";
import type { AttackDrone, Mothership } from "./encounters";
import type { Fish, Shark } from "./types";
import { ghostBlobs, ghostFrame } from "./leviathan";
import { GHOST_ARRIVE, GHOST_LINES, YEAT_LINES } from "./lines";
import type { World } from "./world";
import { isCraftDriven } from "./handling";
import { nextAttackAt, nearestOpponent, battleStation } from "./battle";
import { spawnCraftDebris } from "./wreckage";
import { interruptTractor } from "./tractor";
/** The deep: a ghost leviathan and submarines (including the crew that works while an assistant does). */
export type GhostTarget = Fish | Sub | Ufo | AttackDrone | Mothership;
export interface Leviathan {
  x: number;
  y: number;
  heading: number;
  speed: number;
  length: number;
  phase: number;
  /** The body as a chain of joints from the head. */
  spine: {
    x: number;
    y: number;
  }[];
  born: number;
  /** After this it loses interest and swims off the nearest edge. */
  until: number;
  leaving: boolean;
  nextSong: number;
  state: "drift" | "warn" | "charge" | "recover";
  stateAt: number;
  rageUntil: number;
  target: GhostTarget | null;
  nextAttack: number;
  hitAt: number;
}
export interface Sub {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 facing right, -1 left. */
  face: 1 | -1;
  born: number;
  until: number;
  /** The assistant whose work keeps this sub down here; it surfaces and leaves when the work ends. */
  crew?: "claude" | "codex";
  leaving: boolean;
  nextPing: number;
  pingAt: number;
  nextTorp: number;
  hull: number;
  /** Running from this point until the time is up. */
  fleeFrom?: {
    x: number;
    y: number;
  };
  fleeUntil: number;
  bob: number;
  hitAt: number;
  bumpAt: number;
  seizedByKraken?: boolean;
  seizedAt?: number;
  crushAt?: number;
}
export interface Torpedo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  trail: {
    x: number;
    y: number;
  }[];
  owner?: Sub;
}
/** A shark that has been hit by something: for a while it either goes after what hit it, or bolts. */
export interface Agitation {
  mode: "attack" | "flee";
  until: number;
  from?: {
    x: number;
    y: number;
  };
  sub?: Sub;
  bites: number;
  biteAt: number;
}
export interface DeepMethods {
  spawnLeviathan(this: World): boolean;
  spawnSub(this: World, crew?: "claude" | "codex", manual?: boolean): boolean;
  setWorkers(this: World, claude: boolean, codex: boolean): void;
  stepDeep(this: World, dt: number): void;
  destroySub(this: World, sb: Sub, notice: string): void;
  agitate(this: World, sh: Shark, mode: "attack" | "flee", from: {
    x: number;
    y: number;
  }, seconds: number, sub?: Sub): void;
  agitateLeviathan(this: World, x: number, y: number, radius?: number, attacker?: GhostTarget): boolean;
}
const SUB_LINES = ["a submarine dips in...", "a research sub is on patrol...", "sonar ping...", "a little sub joins the dive..."];
const pick = <T>(list: T[]): T => list[randInt(0, list.length - 1)];
/** Is any part of this shark within r of the point? */
function sharkNear(sh: Shark, x: number, y: number, r: number) {
  for (let n = 0; n < SHARK_NODES; n += 3)
    if (Math.hypot(sh.nodes[n * 2] - x, sh.nodes[n * 2 + 1] - y) < r)
      return true;
  return false;
}
export const deepMethods: DeepMethods = {
  /** Damage or a collision provokes it; ordinary swimming, sonar and splashes leave it peaceful. */
  agitateLeviathan(this: World, x: number, y: number, radius = 0, attacker?: GhostTarget) {
    const lv = this.leviathan;
    if (!lv || lv.leaving || !ghostBlobs(lv).some((p) => Math.hypot(p.x - x, p.y - y) < p.r + radius))
      return false;
    const calm = this.time >= lv.rageUntil;
    lv.rageUntil = this.time + 22;
    if (attacker)
      lv.target = attacker;
    if (calm) {
      lv.state = "warn";
      lv.stateAt = this.time;
      lv.nextAttack = this.time + 2.5;
      this.notices.push(GHOST_LINES.provoked);
      this.splash(lv.x, lv.y, 1.8, undefined, { song: true, quiet: true, max: lv.length * 0.5 });
    }
    return true;
  },
  destroySub(this: World, sb: Sub, notice: string) {
    if (!this.subs.includes(sb))
      return;
    this.subs = this.subs.filter((s) => s !== sb);
    spawnCraftDebris(this, "sub", sb.x, sb.y, 160, 70);
    this.blasts.push({ x: sb.x, y: sb.y, born: this.time });
    this.splash(sb.x, sb.y, 2, undefined, { weight: 2, max: 260 });
    this.events.push({ kind: "eat", x: sb.x, y: sb.y });
    this.notices.push(notice);
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      this.mess.push({ x: sb.x + rand(-30, 30), y: sb.y + rand(-10, 10), vx: Math.cos(a) * rand(20, 100), vy: Math.sin(a) * rand(20, 100), born: this.time, glyph: ["#", "=", "o", "*", "%"][i % 5], rgb: i % 3 ? "235,200,70" : "170,180,190" });
    }
    for (const [sh, ag] of this.agitated)
      if (ag.sub === sb)
        this.agitated.delete(sh);
  },
  /** Whatever hits a shark makes it either go after the thing that hit it, or run. */
  agitate(this: World, sh: Shark, mode: "attack" | "flee", from: {
    x: number;
    y: number;
  }, seconds: number, sub?: Sub) {
    sh.rageUntil = Math.max(sh.rageUntil ?? 0, this.time + seconds);
    this.agitated.set(sh, { mode, until: this.time + seconds, from: { x: from.x, y: from.y }, sub, bites: 0, biteAt: 0 });
    sh.target = null;
    sh.alertUntil = this.time + 1.5;
  },
  spawnLeviathan(this: World) {
    if (this.leviathan || !this.isEventEnabled("leviathan"))
      return false;
    const { width: W, height: H, time } = this;
    // The same immense animal in every mode; Yeat changes its light, never its anatomy.
    const length = clamp(Math.min(W, H) * 1.2, 700, 2400);
    const side = Math.random() < 0.5 ? 0 : 1;
    const y = rand(H * 0.3, H * 0.75);
    const heading = (side === 0 ? 0 : Math.PI) + rand(-0.15, 0.15);
    const x = side === 0 ? -30 : W + 30;
    const joints = 52;
    const spine: {
      x: number;
      y: number;
    }[] = [];
    for (let i = 0; i < joints; i++)
      spine.push({ x: x - Math.cos(heading) * (length / joints) * i, y: y - Math.sin(heading) * (length / joints) * i });
    this.leviathan = {
      x, y, heading, speed: 48, length, phase: 0, spine, born: time, until: time + rand(75, 110), leaving: false,
      nextSong: time + rand(6, 10),
      state: "drift", stateAt: time, rageUntil: 0, target: null, nextAttack: time + 6, hitAt: -99,
    };
    // Keep a stable event key; the toast layer rotates its entrance wording.
    this.notices.push(GHOST_ARRIVE[0]);
    return true;
  },
  spawnSub(this: World, crew?: "claude" | "codex", manual = false) {
    if (this.eoe)
      return false;
    if (!crew && !this.isEventEnabled("sub"))
      return false;
    if (!crew && !manual && this.subs.filter((s) => !s.crew).length >= 3)
      return false;
    const { width: W, height: H, time } = this;
    const entry = craftEntry(this, "sub", manual);
    const face = entry.face;
    this.subs.push({
      x: entry.x, y: entry.y, vx: 0, vy: 0, face, born: time,
      until: time + (crew ? Infinity : rand(70, 110)), crew, leaving: false, nextPing: time + rand(1.5, 4), pingAt: -99,
      nextTorp: time + 4, hull: CRAFT_HULL_HP, fleeUntil: 0, bob: rand(0, TAU), hitAt: -99, bumpAt: -99,
    });
    if (!crew)
      this.notices.push(pick(SUB_LINES));
    return true;
  },
  setWorkers(this: World, claude: boolean, codex: boolean) {
    if (this.eoe)
      return;
    for (const [who, on] of [["claude", claude], ["codex", codex]] as const) {
      const sub = this.subs.find((s) => s.crew === who);
      if (on && !sub && this.width)
        this.spawnSub(who);
      if (!on && sub && !sub.leaving) {
        sub.leaving = true;
        // Work is done: the crew surfaces, scattering a little treasure where it turned.
        for (let i = 0; i < 8; i++)
          this.mess.push({ x: sub.x + rand(-20, 20), y: sub.y + 10, vx: rand(-12, 12), vy: rand(10, 40), born: this.time, glyph: i % 3 ? "$" : "*", rgb: "255,215,90" });
        this.splash(sub.x, sub.y, 1.2, who === "claude" ? 1 : 0);
      }
    }
  },
  stepDeep(this: World, dt: number) {
    const { time, width: W, height: H } = this;
    if (!W)
      return;
    const lv = this.leviathan;
    // --- Ghost leviathan: a slow, weighty passage through the water ------------------------------------------------------
    if (lv) {
      if (!lv.leaving && time > lv.until) {
        lv.leaving = true;
        this.titanCooldownUntil = Math.max(this.titanCooldownUntil, time + rand(140, 220));
      }
      const valid = (o: GhostTarget | null): o is GhostTarget => !!o && o.x > -40 && o.x < W + 40 && o.y > -40 && o.y < H + 40 && ("hull" in o ? this.subs.includes(o) && !o.leaving :
        "maxBeams" in o ? this.ufos.includes(o) :
          "stunned" in o ? this.attackDrones.includes(o) && o.hp > 0 :
            "maxHp" in o ? this.mothership === o && o.hp > 0 :
              o.alive && !!o.diver && !o.seized && !o.riding && this.fish.includes(o));
      const angry = time < lv.rageUntil && !lv.leaving;
      if (!angry && lv.state !== "drift") {
        lv.state = "drift";
        lv.stateAt = time;
        lv.target = null;
        if (!lv.leaving)
          this.notices.push(GHOST_LINES.calm);
      }
      if (angry && !valid(lv.target)) {
        lv.target = null;
        let best = lv.length * 0.8;
        for (const o of [...this.subs, ...this.fish.filter((f) => f.diver)]) {
          const d = Math.hypot(o.x - lv.x, o.y - lv.y);
          if (valid(o) && d < best) {
            lv.target = o;
            best = d;
          }
        }
      }
      if (angry && lv.state === "warn" && time >= lv.nextAttack && valid(lv.target)) {
        lv.state = "charge";
        lv.stateAt = time;
        this.whisper(lv.x, lv.y - lv.length * 0.08, "!", "180,235,255");
      }
      if (lv.state === "charge" && (time - lv.stateAt > 4 || !valid(lv.target))) {
        lv.state = "recover";
        lv.stateAt = time;
        lv.nextAttack = time + 6;
      }
      if (angry && lv.state === "recover" && time >= lv.nextAttack) {
        lv.state = "warn";
        lv.stateAt = time;
        lv.nextAttack = time + 2.5;
      }
      let want = lv.heading + Math.sin(time * 0.13 + lv.born) * 0.28;
      if (lv.leaving) {
        const edges: [
          number,
          number,
          number
        ][] = [[lv.x, -1, 0], [W - lv.x, 1, 0], [lv.y, 0, -1], [H - lv.y, 0, 1]];
        const [, ex, ey] = edges.sort((a, b) => a[0] - b[0])[0];
        want = Math.atan2(ey, ex);
      }
      else if ((lv.state === "warn" || lv.state === "charge") && valid(lv.target)) {
        want = Math.atan2(lv.target.y - lv.y, lv.target.x - lv.x);
      }
      else if (lv.x < W * 0.12 || lv.x > W * 0.88 || lv.y < H * 0.25 || lv.y > H * 0.75) {
        want = Math.atan2(H / 2 - lv.y, W / 2 - lv.x);
      }
      // Wide, unhurried arcs. Its body follows the same path in ordinary and Yeat light.
      lv.heading += clamp(angleDiff(lv.heading, want), -1, 1) * (lv.state === "charge" ? 0.75 : 0.32) * dt;
      const alignment = valid(lv.target) ? Math.max(0, Math.cos(angleDiff(lv.heading, want))) : 0;
      const cruise = lv.leaving ? 80 : lv.state === "charge" ? 70 + 240 * alignment * alignment : lv.state === "warn" ? 28 : 48;
      lv.speed += (cruise - lv.speed) * Math.min(1, dt * 1.2);
      lv.phase += dt * (0.55 + lv.speed * 0.008);
      lv.x += Math.cos(lv.heading) * lv.speed * dt;
      lv.y += Math.sin(lv.heading) * lv.speed * dt;
      const gap = lv.length / (lv.spine.length - 1);
      lv.spine[0].x = lv.x;
      lv.spine[0].y = lv.y;
      for (let i = 1; i < lv.spine.length; i++) {
        const a = lv.spine[i - 1];
        const b = lv.spine[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        b.x = a.x + ((b.x - a.x) / d) * gap;
        b.y = a.y + ((b.y - a.y) / d) * gap;
      }
      // Only an agitated charge can hurt a human, and only when the mouth actually reaches them.
      if (lv.state === "charge" && valid(lv.target)) {
        const mouth = ghostFrame(lv, 0);
        const x = mouth.x + mouth.tx * lv.length * 0.06;
        const y = mouth.y + mouth.ty * lv.length * 0.06;
        const target = lv.target;
        if (Math.hypot(target.x - x, target.y - y) < lv.length * 0.035 + ("hull" in target ? 45 : 10)) {
          lv.hitAt = time;
          lv.state = "recover";
          lv.stateAt = time;
          lv.nextAttack = time + 7;
          this.splash(x, y, 2.2, undefined, { weight: 2, max: lv.length * 0.25 });
          if ("hull" in target) {
            target.hull--;
            target.hitAt = time;
            target.vx = Math.cos(lv.heading) * 220;
            target.vy = Math.sin(lv.heading) * 220;
            target.fleeUntil = time + 9;
            target.fleeFrom = { x: lv.x, y: lv.y };
            if (target.hull <= 0)
              this.destroySub(target, GHOST_LINES.subLost);
            else
              this.notices.push(GHOST_LINES.subHit);
          }
          else if ("maxBeams" in target)
            this.destroyUfo("blasted", target);
          else if ("stunned" in target)
            target.hp = 0;
          else if ("maxHp" in target)
            target.hp -= 12;
          else {
            this.popDiver(target);
            this.notices.push(GHOST_LINES.diver);
          }
          lv.target = null;
        }
      }
      if (time > lv.nextSong && !lv.leaving) {
        lv.nextSong = time + rand(14, 22);
        this.splash(lv.x, lv.y, 1.2, undefined, { quiet: true, song: true, max: Math.max(W, H) * 0.4 });
        this.whisper(lv.x, lv.y - lv.length * 0.08, "hmmmm~", "140,220,255");
      }
      // Wildlife flees the entire silhouette. Contact displaces creatures without hurting them.
      const body = ghostBlobs(lv);
      const contact = (x: number, y: number) => body.reduce((best, p) => Math.hypot(x - p.x, y - p.y) - p.r < Math.hypot(x - best.x, y - best.y) - best.r ? p : best);
      const repel = (o: {
        x: number;
        y: number;
      }, radius: number, rate: number) => {
        const p = contact(o.x, o.y);
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        const nx = d > 0.001 ? (o.x - p.x) / d : -Math.sin(lv.heading);
        const ny = d > 0.001 ? (o.y - p.y) / d : Math.cos(lv.heading);
        const force = clamp((p.r + radius - d) / Math.max(radius, 1), 0, 1);
        if (d < p.r + radius * 0.2) {
          const push = Math.min(p.r + radius * 0.2 - d, rate * dt);
          o.x += nx * push;
          o.y += ny * push;
        }
        return { nx, ny, force };
      };
      for (const f of this.fish) {
        if (!f.alive || f.diver || f.seized || f.riding || f.dragger)
          continue;
        const { nx, ny, force } = repel(f, f.diver ? 130 : 100, 160);
        if (!force)
          continue;
        f.alarm = 1;
        f.vx += nx * 500 * force * dt;
        f.vy += ny * 500 * force * dt;
        if (f.diver) {
          this.whisper(f.x, f.y - 22, "eek!", "240,225,170");
        }
      }
      for (const sh of this.sharks) {
        if (sh.grabbed || sh.lifted || sh.mega && (this.kraken?.wrapping === sh || this.whaleFight?.mega === sh))
          continue;
        if (sh.mega) {
          const p = contact(sh.nodes[0], sh.nodes[1]);
          if (Math.hypot(sh.nodes[0] - p.x, sh.nodes[1] - p.y) < p.r + sh.length * .08 && time >= (this.ghostTitanWake.get(sh) ?? 0)) {
            this.ghostTitanWake.set(sh, time + 8);
            const nx = -Math.sin(lv.heading), ny = Math.cos(lv.heading);
            for (let i = 0; i < sh.nodes.length; i += 2) {
              sh.nodes[i] += nx * 7;
              sh.nodes[i + 1] += ny * 7;
            }
            this.splash(sh.nodes[0], sh.nodes[1], .4, undefined, { quiet: true, song: true, max: 180 });
          }
          continue;
        }
        const front = { x: sh.nodes[0], y: sh.nodes[1] };
        const oldX = front.x, oldY = front.y;
        const { nx, ny, force } = repel(front, sh.mega ? 240 : 160, sh.mega ? 110 : 220);
        if (!force)
          continue;
        for (let i = 0; i < sh.nodes.length; i += 2) {
          sh.nodes[i] += front.x - oldX;
          sh.nodes[i + 1] += front.y - oldY;
        }
        sh.heading += angleDiff(sh.heading, Math.atan2(ny, nx)) * Math.min(1, dt * (sh.mega ? 0.6 : 3) * force);
        if (!sh.mega) {
          sh.target = null;
          sh.alertUntil = time + 1;
          sh.speed = Math.max(sh.speed, 100 * force);
        }
      }
      for (const j of this.jellies)
        repel(j, j.size * 2 + 30, 110);
      if (this.kraken && !this.kraken.wrapping && !this.kraken.whaleTarget) {
        const k = this.kraken;
        const p = contact(k.x, k.y);
        if (Math.hypot(k.x - p.x, k.y - p.y) < p.r + k.size * .2 && time >= (this.ghostTitanWake.get(k) ?? 0)) {
          this.ghostTitanWake.set(k, time + 8);
          k.x -= Math.sin(lv.heading) * 5;
          k.y += Math.cos(lv.heading) * 5;
          this.splash(k.x, k.y, .4, undefined, { quiet: true, song: true, max: 180 });
        }
      }
      // Wait for the whole silhouette, including the broad skull, to clear the window.
      const margin = lv.length * 0.4;
      if (lv.leaving && lv.spine.every((p) => p.x < -margin || p.x > W + margin || p.y < -margin || p.y > H + margin))
        this.leviathan = null;
      else if (time - lv.born > 400)
        this.leviathan = null;
    }
    // --- Shark agitation: hit by something, a shark goes after it or bolts ----------------------------------------------
    for (const [sh, ag] of this.agitated) {
      if (time > ag.until || !this.sharks.includes(sh)) {
        this.agitated.delete(sh);
        continue;
      }
      const hx = sh.nodes[0];
      const hy = sh.nodes[1];
      if (ag.mode === "flee" && ag.from) {
        sh.heading += angleDiff(sh.heading, Math.atan2(hy - ag.from.y, hx - ag.from.x)) * Math.min(1, dt * 4);
        sh.speed = Math.max(sh.speed, 130);
        sh.target = null;
      }
      else if (ag.mode === "attack" && ag.sub && this.subs.includes(ag.sub)) {
        const sb = ag.sub;
        sh.heading += angleDiff(sh.heading, Math.atan2(sb.y - hy, sb.x - hx)) * Math.min(1, dt * 3);
        sh.speed = Math.max(sh.speed, 120);
        sh.target = null;
        if (time - ag.biteAt > 1.4 && Math.hypot(sb.x - hx, sb.y - hy) < 44) {
          ag.biteAt = time;
          ag.bites++;
          sb.hull--;
          sb.hitAt = time;
          this.whisper(sb.x, sb.y - 40, "CHOMP!", "255,150,120");
          this.splash(sb.x, sb.y, 1.2, undefined, { weight: 2, max: 200 });
          if (sb.hull <= 0)
            this.destroySub(sb, "a shark tore a sub apart...");
          else if (ag.bites >= 2)
            this.agitate(sh, "flee", { x: sb.x, y: sb.y }, 4);
        }
      }
      else
        this.agitated.delete(sh);
    }
    // --- Submarines ------------------------------------------------------------------------------------------------------
    const ghostBody = this.leviathan ? ghostBlobs(this.leviathan) : [];
    for (const sb of this.subs) {
      if (isCraftDriven(this, sb))
        continue;
      if (sb.seizedByKraken) {
        const k = this.kraken;
        if (!k) {
          sb.seizedByKraken = false;
          continue;
        }
        const a = k.heading + Math.PI + Math.sin(time * .18) * .16;
        const radius = k.size * .72;
        const pull = Math.min(1, dt * .5);
        sb.x += (k.x + Math.cos(a) * radius - sb.x) * pull;
        sb.y += (k.y + Math.sin(a) * radius - sb.y) * pull;
        sb.vx = 0;
        sb.vy = 0;
        if (time >= (sb.crushAt ?? Infinity)) {
          sb.hull--;
          sb.hitAt = time;
          sb.crushAt = time + 5.5;
          this.callout(sb.x, sb.y - 40, "HULL STRAIN", "255,170,110");
          if (sb.hull <= 0) {
            this.destroySub(sb, "the kraken crushed a submarine...");
            continue;
          }
        }
        if (time >= sb.nextTorp) {
          sb.nextTorp = time + 10;
          const aim = Math.atan2(k.y - sb.y, k.x - sb.x);
          this.torpedoes.push({ x: sb.x, y: sb.y, vx: Math.cos(aim) * 190, vy: Math.sin(aim) * 190, born: time, trail: [], owner: sb });
        }
        continue;
      }
      const big = this.leviathan && !this.leviathan.leaving ? this.leviathan : null;
      const nearest = ghostBody.reduce<{
        x: number;
        y: number;
        r: number;
      } | null>((best, p) => !best || Math.hypot(p.x - sb.x, p.y - sb.y) - p.r < Math.hypot(best.x - sb.x, best.y - sb.y) - best.r ? p : best, null);
      const threat = nearest ? Math.hypot(nearest.x - sb.x, nearest.y - sb.y) - nearest.r : Infinity;
      if (big && nearest && threat < 180 && time > sb.fleeUntil) {
        sb.fleeUntil = time + 2.5;
        sb.fleeFrom = { x: nearest.x, y: nearest.y };
      }
      if (big && time - sb.born > 5 && time - big.born > 5 && time - sb.bumpAt > 5 && Math.hypot(sb.vx, sb.vy) > 55 &&
        Math.hypot(sb.x - big.x, sb.y - big.y) < big.length * 0.09 + 45 && (big.x - sb.x) * sb.vx + (big.y - sb.y) * sb.vy > 0) {
        sb.bumpAt = time;
        this.agitateLeviathan(sb.x, sb.y, 60, sb);
      }
      const from = time < sb.fleeUntil ? sb.fleeFrom : undefined;
      let tx = sb.x + sb.face * 200;
      let ty = H * (0.3 + 0.25 * Math.sin(time * 0.15 + sb.bob));
      let speed = 38;
      if (sb.leaving || time > sb.until) {
        sb.leaving = true;
        ty = -120;
        tx = sb.x;
        speed = 46;
      }
      else if (from) {
        const away = Math.atan2(sb.y - from.y, sb.x - from.x);
        tx = sb.x + Math.cos(away) * 300;
        ty = sb.y + Math.sin(away) * 300;
        speed = 120;
      }
      else {
        const station = battleStation(this, sb);
        if (station) {
          tx = station.x;
          ty = station.y;
          speed = 65;
        }
      }
      const dx = tx - sb.x;
      const dy = ty - sb.y;
      const d = Math.hypot(dx, dy) || 1;
      sb.vx += ((dx / d) * speed - sb.vx) * Math.min(1, dt * 1.2);
      sb.vy += ((dy / d) * speed * 0.6 - sb.vy) * Math.min(1, dt * 1.2);
      // Keep clear of everything: other subs, sharks, whales, titans and the leviathan push it round them.
      let ax = 0;
      let ay = 0;
      const steer = (px: number, py: number, R: number, k: number) => {
        const ddx = sb.x - px;
        const ddy = sb.y - py;
        const dd = Math.hypot(ddx, ddy);
        if (dd >= R || dd < 1e-3)
          return;
        const f = (1 - dd / R) * k;
        ax += (ddx / dd) * f;
        ay += (ddy / dd) * f;
      };
      for (const o of this.subs)
        if (o !== sb)
          steer(o.x, o.y, 220, 160);
      for (const sh of this.sharks)
        if (this.agitated.get(sh)?.sub !== sb)
          steer(sh.nodes[0], sh.nodes[1], sh.mega ? 420 : 200, sh.mega ? 260 : 120);
      for (const wh of this.whales) {
        const m = this.whaleMid(wh);
        steer(m.x, m.y, wh.length * 0.6, 150);
      }
      for (const t of this.titanBlobs())
        steer(t.x, t.y, t.r + 160, 200);
      sb.vx += ax * dt;
      sb.vy += ay * dt;
      if (Math.abs(sb.vx) > 6)
        sb.face = sb.vx > 0 ? 1 : -1;
      sb.x += sb.vx * dt;
      sb.y += sb.vy * dt + Math.sin(time * 1.6 + sb.bob) * 6 * dt;
      // Turn round at the edges instead of leaving (unless it is on its way out).
      if (!sb.leaving && ((sb.x < W * 0.04 && sb.face < 0) || (sb.x > W * 0.96 && sb.face > 0)))
        sb.face = (sb.face * -1) as 1 | -1;
      if (!sb.leaving)
        sb.y = clamp(sb.y, H * 0.12, H * 0.82);
      // Sonar ping: a thin ring.
      if (time > sb.nextPing) {
        sb.nextPing = time + rand(5, 9);
        sb.pingAt = time;
        this.splash(sb.x, sb.y, 0.6, sb.crew === "claude" ? 1 : sb.crew === "codex" ? 0 : undefined, { quiet: true, song: true, max: 220 });
      }
      // A shark that bumps it either goes for it or bolts; the sub runs and, if one is coming for it, fights back.
      if (time - sb.bumpAt > 6) {
        const bumper = this.sharks.find((sh) => !sh.mega && !this.agitated.has(sh) && sharkNear(sh, sb.x, sb.y, 40));
        if (bumper) {
          sb.bumpAt = time;
          this.whisper(sb.x, sb.y - 40, "bonk!", "255,235,150");
          sb.fleeUntil = time + 2.5;
          sb.fleeFrom = { x: bumper.nodes[0], y: bumper.nodes[1] };
          if (Math.random() < 0.55)
            this.agitate(bumper, "attack", sb, 10, sb);
          else
            this.agitate(bumper, "flee", sb, 5);
        }
      }
      // It only shoots in self-defence: a shark, or a provoked leviathan actively charging this sub.
      if (!sb.leaving && time > sb.nextTorp) {
        const charging = big?.state === "charge" && big.target === sb && Math.hypot(big.x - sb.x, big.y - sb.y) < 480;
        const attacker = this.sharks.find((sh) => this.agitated.get(sh)?.sub === sb && Math.hypot(sh.nodes[0] - sb.x, sh.nodes[1] - sb.y) < 300);
        const drone = this.mothership?.phase === "battle" ? this.attackDrones.find(d => Math.hypot(d.x - sb.x, d.y - sb.y) < 650) : null;
        const carrier = this.mothership?.phase === "battle" && Math.hypot(this.mothership.x - sb.x, this.mothership.y - sb.y) < 750 ? this.mothership : null;
        const saucer = nearestOpponent(this, sb, this.ufos.filter(u => !u.pilot?.alive && u.state !== "leave"), 750);
        const aimAt = charging ? big : attacker ? { x: attacker.nodes[0], y: attacker.nodes[1] } : drone ?? carrier ?? saucer;
        if (aimAt) {
          sb.nextTorp = nextAttackAt(this, sb, Math.hypot(aimAt.x - sb.x, aimAt.y - sb.y), 10);
          const a = Math.atan2(aimAt.y - sb.y, aimAt.x - sb.x);
          this.whisper(sb.x, sb.y - 40, "FWOOSH", "255,210,120");
          this.torpedoes.push({ x: sb.x + Math.cos(a) * 60, y: sb.y + Math.sin(a) * 30, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, born: time, trail: [], owner: sb });
        }
        else
          sb.nextTorp = time + 1;
      }
    }
    this.subs = this.subs.filter((s) => !(s.leaving && s.y < -80));
    for (const t of this.torpedoes) {
      t.trail.push({ x: t.x, y: t.y });
      if (t.trail.length > 10)
        t.trail.shift();
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      let hit = false;
      if (t.owner?.seizedByKraken && this.kraken && Math.hypot(t.x - this.kraken.x, t.y - this.kraken.y) < this.kraken.size * .28) {
        t.owner.seizedByKraken = false;
        t.owner.fleeUntil = time + 6;
        t.owner.fleeFrom = { x: this.kraken.x, y: this.kraken.y };
        this.callout(t.owner.x, t.owner.y - 40, "ARMS DRIVEN BACK", "170,230,255");
        hit = true;
      }
      const drone = !hit ? this.attackDrones.find(d => d.hp > 0 && Math.hypot(d.x - t.x, d.y - t.y) < 35) : undefined;
      if (drone) {
        drone.hp -= 2;
        hit = true;
      }
      const boss = this.mothership;
      if (!hit && boss && ((t.x - boss.x) / (boss.size * .95)) ** 2 + ((t.y - boss.y) / (boss.size * .25)) ** 2 < 1) {
        boss.hp -= 4;
        hit = true;
      }
      const craft = !hit ? this.ufos.find(u => !u.pilot && Math.hypot(u.x - t.x, u.y - t.y) < 65) : undefined;
      if (craft) {
        craft.hits = (craft.hits ?? 0) + 2;
        craft.hitAt = time;
        if (craft.hits >= UFO_HITS_TO_BREAK)
          this.destroyUfo("shot", craft);
        else
          interruptTractor(this, craft);
        hit = true;
      }
      if (!hit && this.leviathan && ghostBody.some((p) => Math.hypot(p.x - t.x, p.y - t.y) < p.r + 6)) {
        hit = this.agitateLeviathan(t.x, t.y, 8, t.owner);
        if (hit)
          this.splash(t.x, t.y, 1.3, undefined, { quiet: true, max: 180 });
      }
      if (!hit) {
        for (const sh of this.sharks) {
          if (sh.mega || !sharkNear(sh, t.x, t.y, 26))
            continue;
          hit = true;
          // Hit, the shark turns on whoever fired (usually), or bolts.
          if (t.owner && this.subs.includes(t.owner) && Math.random() < 0.7)
            this.agitate(sh, "attack", t, 10, t.owner);
          else
            this.agitate(sh, "flee", t, 5);
          this.splash(t.x, t.y, 1.6, undefined, { weight: 2, max: 220 });
          break;
        }
      }
      if (hit || t.x < -50 || t.x > W + 50 || t.y < -50 || t.y > H + 50 || time - t.born > 4) {
        if (hit)
          for (let i = 0; i < 10; i++) {
            const a = rand(0, TAU);
            this.mess.push({ x: t.x, y: t.y, vx: Math.cos(a) * rand(20, 90), vy: Math.sin(a) * rand(20, 90), born: time, glyph: i % 2 ? "*" : "+", rgb: "255,190,90" });
          }
        t.born = -999;
      }
    }
    this.torpedoes = this.torpedoes.filter((t) => t.born > -900);
    // Yeat mode keeps ad-libbing now and then while it lasts.
    if (this.yeat > 0.5 && time > this.nextYeatQuip) {
      this.nextYeatQuip = time + rand(18, 40);
      this.notices.push(pick(YEAT_LINES));
    }
    // --- The sea thinking out loud ---------------------------------------------------------------------------------------
    if (time > this.nextWhisper) {
      this.nextWhisper = time + rand(3.5, 7);
      const things: [
        number,
        number,
        string[],
        string
      ][] = [];
      for (const sh of this.sharks)
        if (!sh.mega)
          things.push([sh.nodes[0], sh.nodes[1] - 18, ["...", "hungry.", "hm.", "*sniff*", "where is everyone?"], "170,190,215"]);
      for (const j of this.jellies)
        things.push([j.x, j.y - j.size * 2, ["bloop", "blub~", "squish", "glow glow"], "150,215,255"]);
      for (const f of this.fish)
        if (f.alive && f.diver && !f.seized)
          things.push([f.x, f.y - 20, ["hm?", "nice view!", "ok ok ok", "bubbles!", "is that a shark?"], "240,225,170"]);
      for (const sb of this.subs)
        things.push([sb.x, sb.y - 40, sb.crew ? ["working...", "scanning...", "ping!"] : ["ping!", "all clear?", "searching..."], "255,235,150"]);
      if (lv)
        things.push([lv.x, lv.y - 30, ["hmmmm~", "..."], "140,220,255"]);
      if (things.length) {
        const [x, y, lines, rgb] = pick(things);
        this.whisper(x, y, pick(lines), rgb);
      }
    }
  },
};
