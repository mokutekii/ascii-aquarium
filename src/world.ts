/**
 * Artificial-life sim for the hero: tiny fish schools and the sharks that hunt them.
 *
 * Fish: Reynolds boids (separation / alignment / cohesion) in Couzin-style
 * zones, with a blind spot behind each fish. Alarm spreads from fish to fish
 * through the school (a "wave of agitation"), so a whole school bolts even
 * when only its edge can see the shark. Fleeing fish break sideways around the
 * shark's path, which gives the fountain effect seen in real bait balls.
 *
 * Sharks: Reynolds steering (wander + pursuit + separation) on a
 * follow-the-leader spine. Hunger builds over time and drops when they eat.
 * They prefer fish in sparse spots, since dense schools confuse predators,
 * so stragglers get picked off. Eaten fish come back later as new schools
 * swimming in from the edges, which keeps the population steady.
 */
import { angleDiff, clamp, current, rand, randInt, TAU } from "./math";
import { pickSpecies, SPECIES } from "./species";

export const SHARK_NODES = 20;

export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse";

/** Which sharks to put in the water; size is relative to the biggest. */
export type SharkSpec = { kind: SharkKind; size: number };

// The landing hero: four of the same shark at different depths.
const DEFAULT_SHARKS: SharkSpec[] = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.7 },
  { kind: "classic", size: 0.84 },
  { kind: "classic", size: 0.77 },
];

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
  /** 0 calm → 1 panicking. Spreads to neighbours. */
  alarm: number;
  alive: boolean;
  respawnAt: number;
  /** Tail-beat phase. */
  phase: number;
  /** Smoothed angular velocity (rad/s); hard turns flash silver. */
  turn: number;
  /** 0.55 far → 1 near. */
  depth: number;
  /** Rotation sense shared by a school when it mills into a bait ball. */
  millDir: 1 | -1;
  /** Set on one-off visitors: they leave (or are removed once eaten) at this time. */
  temp?: number;
}

export interface Shark {
  id: number;
  kind: SharkKind;
  length: number;
  /** Spine positions, snout first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** Tail-beat phase; drives the body wave in the renderer. */
  phase: number;
  /** Smoothed angular velocity (rad/s); the shark banks its fins into turns. */
  turn: number;
  hunger: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  target: Fish | null;
  retargetAt: number;
  /** 0 far / dim → 1 near / bright. */
  depth: number;
  /** A passing megalodon: swims a straight line and scares the other sharks off. */
  mega?: boolean;
  /** Held by the kraken: pulled in and thrashing. */
  grabbed?: boolean;
  megaHeading?: number;
  born?: number;
}

export interface Kraken {
  x: number;
  y: number;
  heading: number;
  size: number;
  phase: number;
  born: number;
  state: "enter" | "grab" | "flee";
  stateAt: number;
  ax: number;
  ay: number;
  side: 0 | 1;
  grabbed: Shark[];
  megaSent: boolean;
  /** Demo mode: no megalodon follows; the kraken lets go on its own. */
  solo: boolean;
  grabCount: number;
  megaDelay: number;
  holdFor: number;
  inkAt: number;
  /** Smoothed turn rate (rad/s); the arms trail behind it. */
  bend: number;
}

export interface Jelly {
  x: number;
  y: number;
  size: number;
  phase: number;
  drift: number;
  hue: number;
}

export interface Whale {
  x: number;
  y: number;
  heading: number;
  speed: number;
  length: number;
  phase: number;
  traveled: number;
  rippleAt: number;
}

export interface Angler {
  x: number;
  y: number;
  face: 1 | -1;
  born: number;
  until: number;
  snapUntil: number;
  nextSnap: number;
  /** Where the glowing lure is right now. */
  lx: number;
  ly: number;
  size: number;
}

export interface Whirl {
  x: number;
  y: number;
  r: number;
  born: number;
  until: number;
  dir: 1 | -1;
  rippleAt: number;
}

export interface BaitBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  born: number;
  until: number;
  dir: 1 | -1;
  members: Fish[];
}

export interface Ripple {
  x: number;
  y: number;
  r: number;
  max: number;
  strength: number;
  /** Per-angle amplitude (1 intact, 0 broken up by another ring). */
  amp: Float32Array;
}

export interface WorldEvent {
  kind: "eat" | "splash";
  x: number;
  y: number;
  strength?: number;
}

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const RIPPLE_SPEED = 150; // px/s
const RIPPLE_SEGMENTS = 96;
const DAY_LEN = 540; // seconds for one full day and night
const RIPPLE_BAND = 14; // px either side of a ring that counts as contact
const BLIND_COS = -0.6; // ~127° either side of the heading is visible

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  sharks: Shark[] = [];
  events: WorldEvent[] = [];
  /** Expanding rings from splashes; they sweep the whole tank. */
  ripples: Ripple[] = [];
  kraken: Kraken | null = null;
  jellies: Jelly[] = [];
  whale: Whale | null = null;
  angler: Angler | null = null;
  whirl: Whirl | null = null;
  baitBall: BaitBall | null = null;
  /** Shifts the day/night clock (seconds); the N key jumps it toward night. */
  dayOffset = 0;
  pointer = { x: 0, y: 0, active: false };

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  private perception = 60;
  /** Per-species personal space in px (x, y). */
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketCount = new Uint16Array(0);
  private bucketNext = new Int32Array(0);
  private lastSpawn = 0;
  private nextEventAt = 20 + Math.random() * 35;
  private tmp = { x: 0, y: 0 };

  /** fishCount overrides the area-based population (the sidebar wants a single small school). */
  constructor(
    private sharkSpecs: SharkSpec[] = DEFAULT_SHARKS,
    private fishCount?: number,
  ) {}

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    const oldW = this.width;
    const oldH = this.height;
    this.width = width;
    this.height = height;
    // Spacing is set in grid cells so every fish lands in its own cell.
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;

    if (first || this.fish.length === 0) {
      this.seed();
      return;
    }
    // Carry the fish along with the tank so a bigger window doesn't leave them in one corner.
    const sx = width / oldW;
    const sy = height / oldH;
    for (const f of this.fish) {
      f.x = clamp(f.x * sx, 0, width);
      f.y = clamp(f.y * sy, 0, height);
    }
    if (this.wantedSharks() !== this.sharks.filter((sh) => !sh.mega).length) this.seedSharks();
    if (!this.fishCount) this.rescaleFish();
  }

  /** One shark per ~80k px^2 of tank, so a bigger window holds more of them. */
  private wantedSharks() {
    return clamp(Math.round((this.width * this.height) / 80000), 1, 14);
  }

  seed() {
    this.seedSharks();
    this.seedFish();
  }

  private seedSharks() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseLength = clamp(minSide * 0.44, 170, 430);
    const sharkCount = this.wantedSharks();

    this.sharks = [];
    for (let i = 0; i < sharkCount; i++) {
      const spec = this.sharkSpecs[i % this.sharkSpecs.length];
      const kind = spec.kind;
      const size = spec.size * (1 - 0.08 * Math.floor(i / this.sharkSpecs.length));
      const length = baseLength * size;
      const orbitRadius = minSide * rand(0.28, 0.4);
      const a = (i / sharkCount) * TAU + rand(-0.4, 0.4);
      const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const x = W / 2 + Math.cos(a) * orbitRadius * (W / minSide) * 0.9;
      const y = H / 2 + Math.sin(a) * orbitRadius;
      const heading = a + (orbitDir * Math.PI) / 2;
      const nodes = new Float32Array(SHARK_NODES * 2);
      const seg = length / (SHARK_NODES - 1);
      for (let n = 0; n < SHARK_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      this.sharks.push({
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: 30,
        phase: rand(0, TAU),
        turn: 0,
        hunger: rand(0.25, 0.75),
        wander: 0,
        orbitDir,
        orbitRadius,
        target: null,
        retargetAt: 0,
        depth: size,
      });
    }
    // Smaller (farther) sharks draw first so the big one swims over them.
    this.sharks.sort((a, b) => a.length - b.length);
  }

  /** Add or drop fish when a resize or zoom moves the target more than 15%. */
  private rescaleFish() {
    const want = clamp(Math.round((this.width * this.height) / 6000), 85, 420);
    const have = this.fish.length;
    if (Math.abs(want - have) < have * 0.15) return;
    if (want < have) { this.fish.length = want; return; }
    this.seedFish(true);
  }

  private seedFish(keep = false) {
    const { width: W, height: H } = this;
    const total = this.fishCount ?? clamp(Math.round((W * H) / 6000), 85, 420);
    if (!keep) this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      // Mostly level headings: fish cruise sideways far more than up or down.
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir,
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }

  /** Every so often something happens: a chased runner, or a megalodon passing through. */
  private stepEvents(dt: number) {
    const { time } = this;
    if (this.fish.some((f) => f.temp !== undefined && (time > f.temp || !f.alive))) {
      this.fish = this.fish.filter((f) => f.temp === undefined || (time <= f.temp && f.alive));
    }
    const mega = this.sharks.find((sh) => sh.mega);
    if (mega) {
      const [hx, hy] = [mega.nodes[0], mega.nodes[1]];
      const gone = Math.max(-hx, hx - this.width, -hy, hy - this.height) > mega.length * 0.4;
      if ((gone && time - (mega.born ?? 0) > 4) || time - (mega.born ?? 0) > 100) {
        this.sharks = this.sharks.filter((sh) => sh !== mega);
      }
    }
    this.stepKraken(dt);
    this.stepCritters(dt);
    if (time < this.nextEventAt || this.width === 0) return;
    // Irregular gaps: usually a minute or so, sometimes two events close together.
    this.nextEventAt = time + (Math.random() < 0.2 ? rand(15, 35) : rand(40, 130));
    const bigBusy = !!mega || !!this.kraken || !!this.whale;
    const pool: [string, number][] = [
      ["chase", 0.22], ["saga", 0.16], ["kraken", 0.07], ["mega", 0.07], ["bait", 0.12],
      ["jelly", 0.1], ["whale", 0.07], ["angler", 0.08], ["whirl", 0.07],
    ];
    const allowed = pool.filter(([kind]) => {
      if (bigBusy && ["saga", "kraken", "mega", "whale"].includes(kind)) return false;
      if (kind === "bait" && this.baitBall) return false;
      if (kind === "jelly" && this.jellies.length) return false;
      if (kind === "angler" && this.angler) return false;
      if (kind === "whirl" && this.whirl) return false;
      return true;
    });
    let roll = Math.random() * allowed.reduce((sum, [, w]) => sum + w, 0);
    for (const [kind, w] of allowed) {
      roll -= w;
      if (roll <= 0) { this.triggerEvent(kind as never); break; }
    }
  }

  /** Is this kind of event running right now? */
  private eventActive(kind: string) {
    switch (kind) {
      case "kraken": case "saga": return !!this.kraken;
      case "mega": return this.sharks.some((sh) => sh.mega);
      case "bait": return !!this.baitBall;
      case "jelly": return this.jellies.length > 0;
      case "whale": return !!this.whale;
      case "angler": return !!this.angler;
      case "whirl": return !!this.whirl;
      case "chase": return this.fish.some((f) => f.temp !== undefined);
      default: return true;
    }
  }

  /** Public so a key press can trigger one on demand. Says whether it started, was already running, or had to wait. */
  triggerEvent(kind: "chase" | "mega" | "kraken" | "saga" | "bait" | "jelly" | "whale" | "angler" | "whirl" | "night"): "started" | "already" | "blocked" {
    const bigBusy = !!this.kraken || !!this.whale || this.sharks.some((sh) => sh.mega);
    const big = kind === "kraken" || kind === "saga" || kind === "mega" || kind === "whale";
    if (big && bigBusy) return this.eventActive(kind) ? "already" : "blocked";
    if (kind !== "chase" && kind !== "night" && this.eventActive(kind)) return "already";
    if (kind === "chase") this.spawnRunner(randInt(1, 3));
    else if (kind === "kraken" || kind === "saga") this.spawnKraken(kind === "kraken");
    else if (kind === "mega") this.spawnMegalodon();
    else if (kind === "bait") this.spawnBaitBall();
    else if (kind === "jelly") this.spawnJellies();
    else if (kind === "whale") this.spawnWhale();
    else if (kind === "angler") this.spawnAngler();
    else if (kind === "whirl") this.spawnWhirl();
    else if (kind === "night") this.dayOffset = DAY_LEN * 0.35 - this.time;
    return this.eventActive(kind) ? "started" : "blocked";
  }

  /** 0 in daylight, 1 in the middle of the night; a slow cycle with soft dusk and dawn. */
  get night() {
    const phase = (((this.time + this.dayOffset) / DAY_LEN) % 1 + 1) % 1;
    const light = 0.5 + 0.5 * Math.cos(phase * TAU);
    return clamp((0.3 - light) / 0.3, 0, 1);
  }

  /** A fast fish swims in from an edge and the nearest shark gives chase. */
  private spawnRunner(count = 1) {
    const hunters = this.sharks.filter((sh) => !sh.mega && !sh.grabbed);
    if (!hunters.length) return;
    const taken = new Set<Shark>();
    for (let n = 0; n < count; n++) this.spawnOneRunner(hunters, taken);
  }

  private spawnOneRunner(hunters: Shark[], taken: Set<Shark>) {
    const { width: W, height: H, time } = this;
    const side = randInt(0, 3);
    const along = rand(0.2, 0.8);
    const x = side === 0 ? -10 : side === 1 ? W + 10 : along * W;
    const y = side === 2 ? -10 : side === 3 ? H + 10 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.4, 0.4);
    const fast = SPECIES.map((sp, i) => [sp.maxSpeed, i]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    const species = fast[randInt(0, fast.length - 1)][1];
    const sp = SPECIES[species];
    const runner: Fish = {
      x, y, vx: Math.cos(inward) * sp.maxSpeed, vy: Math.sin(inward) * sp.maxSpeed,
      species, alarm: 1, alive: true, respawnAt: Infinity, phase: rand(0, TAU), turn: 0,
      depth: 1, millDir: 1, temp: time + rand(18, 30),
    };
    this.fish.push(runner);
    let nearest: Shark | null = null;
    let best = Infinity;
    for (const sh of hunters) {
      if (taken.has(sh)) continue;
      const d = Math.hypot(sh.nodes[0] - x, sh.nodes[1] - y);
      if (d < best) { best = d; nearest = sh; }
    }
    if (!nearest) return;
    taken.add(nearest);
    nearest.target = runner;
    nearest.hunger = 1;
    nearest.retargetAt = time + rand(5, 10);
  }

  /** A huge shark crosses the tank in a near-straight line; every other shark bolts. */
  private spawnMegalodon(side: 0 | 1 = randInt(0, 1) as 0 | 1) {
    const { width: W, height: H, time } = this;
    const length = clamp(Math.min(W, H) * rand(0.9, 1.2), 420, 1150);
    const y = rand(H * 0.2, H * 0.8);
    const x = side === 0 ? -20 : W + 20;
    const heading = (side === 0 ? 0 : Math.PI) + rand(-0.4, 0.4) * (y < H / 2 ? 1 : -1) * 0.8;
    const nodes = new Float32Array(SHARK_NODES * 2);
    const seg = length / (SHARK_NODES - 1);
    for (let n = 0; n < SHARK_NODES; n++) {
      nodes[n * 2] = x - Math.cos(heading) * seg * n;
      nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
    }
    this.sharks.push({
      id: 900, kind: "classic", length, nodes, heading, speed: 35, phase: 0, turn: 0, hunger: 0,
      wander: 0, orbitDir: 1, orbitRadius: 0, target: null, retargetAt: Infinity, depth: 1,
      mega: true, megaHeading: heading, born: time,
    });
    this.sharks.sort((a, b) => a.length - b.length);
  }

  // ── ambient critters and set pieces ─────────────────────────────────

  private spawnJellies() {
    if (this.jellies.length) return;
    const { width: W, height: H } = this;
    const count = randInt(3, 6);
    for (let i = 0; i < count; i++) {
      this.jellies.push({
        x: rand(W * 0.08, W * 0.92), y: H + rand(40, 420), size: rand(22, 30), phase: rand(0, TAU),
        drift: rand(-14, 14), hue: Math.random(),
      });
    }
  }

  private spawnWhale() {
    const { width: W, height: H } = this;
    const length = clamp(Math.min(W, H) * 1.3, 450, 1300);
    const side = randInt(0, 1);
    this.whale = {
      x: side === 0 ? -20 : W + 20, y: rand(H * 0.25, H * 0.75), heading: (side === 0 ? 0 : Math.PI) + rand(-0.12, 0.12),
      speed: rand(22, 30), length, phase: 0, traveled: 0, rippleAt: 0,
    };
  }

  private spawnAngler() {
    if (this.angler) return;
    const { width: W, height: H, time } = this;
    const size = clamp(Math.min(W, H) * 0.05, 22, 44);
    const face = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
    const x = rand(W * 0.15, W * 0.85);
    const y = H * rand(0.72, 0.86);
    this.angler = { x, y, face, born: time, until: time + rand(28, 42), snapUntil: 0, nextSnap: time + 4, lx: x, ly: y, size };
  }

  private spawnWhirl() {
    if (this.whirl) return;
    const { width: W, height: H, time } = this;
    const r = clamp(Math.min(W, H) * 0.12, 60, 150);
    this.whirl = {
      x: rand(W * 0.2, W * 0.8), y: rand(H * 0.25, H * 0.75), r, born: time, until: time + rand(9, 14),
      dir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1, rippleAt: time,
    };
  }

  /** Pull a loose knot of fish into a spinning bait ball while the sharks close in. */
  private spawnBaitBall() {
    if (this.baitBall) return;
    const { width: W, height: H, time } = this;
    const cx = rand(W * 0.25, W * 0.75);
    const cy = rand(H * 0.3, H * 0.7);
    const near = this.fish
      .filter((f) => f.alive && f.temp === undefined)
      .map((f) => ({ f, d: Math.hypot(f.x - cx, f.y - cy) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, randInt(60, 110))
      .map((e) => e.f);
    if (near.length < 25) return;
    this.baitBall = {
      x: cx, y: cy, vx: rand(-14, 14), vy: rand(-8, 8), r: clamp(Math.min(W, H) * 0.14, 70, 170), born: time,
      until: time + rand(14, 22), dir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1, members: near,
    };
    for (const sh of this.sharks) if (!sh.mega && !sh.grabbed) sh.hunger = Math.max(sh.hunger, 0.85);
  }

  private stepCritters(dt: number) {
    const { time, width: W, height: H } = this;
    // Jellyfish drift up in slow surges; fish keep clear, sharks ignore them.
    if (this.jellies.length) {
      for (const j of this.jellies) {
        j.phase += dt * 2;
        const surge = 0.35 + 0.65 * Math.max(0, Math.sin(j.phase));
        j.y -= (10 + 14 * surge) * dt;
        j.x += (j.drift + Math.sin(time * 0.4 + j.hue * 9) * 8) * dt * 0.5;
      }
      for (const f of this.fish) {
        if (!f.alive) continue;
        for (const j of this.jellies) {
          const dx = f.x - j.x;
          const dy = f.y - j.y;
          const d = Math.hypot(dx, dy);
          const reach = j.size * 2.6;
          if (d < reach && d > 1e-3) {
            const w = (1 - d / reach) * 260 * dt;
            f.vx += (dx / d) * w;
            f.vy += (dy / d) * w;
          }
        }
      }
      this.jellies = this.jellies.filter((j) => j.y > -j.size * 4);
    }

    // The whale: a slow straight crossing; fish part around it and ripples roll off its tail.
    const wh = this.whale;
    if (wh) {
      wh.phase += dt * 0.9;
      wh.x += Math.cos(wh.heading) * wh.speed * dt;
      wh.y += Math.sin(wh.heading) * wh.speed * dt;
      wh.traveled += wh.speed * dt;
      const dx = Math.cos(wh.heading);
      const dy = Math.sin(wh.heading);
      const tx = wh.x - dx * wh.length;
      const ty = wh.y - dy * wh.length;
      if (time - wh.rippleAt > 1.6) { wh.rippleAt = time; this.splash(tx, ty, 0.8); }
      for (const f of this.fish) {
        if (!f.alive) continue;
        for (let u = 0; u <= 1; u += 0.1) {
          const bx = wh.x - dx * wh.length * u;
          const by = wh.y - dy * wh.length * u;
          const reach = wh.length * 0.11 * Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.05)) + 36;
          const fx = f.x - bx;
          const fy = f.y - by;
          const d = Math.hypot(fx, fy);
          if (d < reach && d > 1e-3) {
            const w = (1 - d / reach) * 420 * dt;
            f.vx += (fx / d) * w;
            f.vy += (fy / d) * w;
          }
        }
      }
      if (wh.traveled > Math.max(W, H) * 1.0 + wh.length * 1.15 + 80) this.whale = null;
    }

    // The anglerfish: a glowing lure draws fish in; one that gets too close is snapped up.
    const an = this.angler;
    if (an) {
      an.lx = an.x + an.face * an.size * 0.95;
      an.ly = an.y - an.size * 1.1 + Math.sin(time * 2) * 5;
      for (const f of this.fish) {
        if (!f.alive) continue;
        const dx = an.lx - f.x;
        const dy = an.ly - f.y;
        const d = Math.hypot(dx, dy);
        if (d < 340 && d > 1e-3) {
          const w = (1 - d / 340) * 140 * dt;
          f.vx += (dx / d) * w;
          f.vy += (dy / d) * w;
        }
        if (d < an.size * 0.7 && time >= an.nextSnap) {
          f.alive = false;
          f.respawnAt = time + rand(3, 8);
          an.snapUntil = time + 0.7;
          an.nextSnap = time + rand(2.5, 5);
          this.events.push({ kind: "eat", x: f.x, y: f.y });
        }
      }
      if (time > an.until) this.angler = null;
    }

    // The whirlpool: fish are swept into a spiral for a few seconds, then flung out.
    const wp = this.whirl;
    if (wp) {
      const left = wp.until - time;
      const fade = Math.min(1, (time - wp.born) / 2, left / 2);
      if (time - wp.rippleAt > 0.9) { wp.rippleAt = time; this.splash(wp.x, wp.y, 0.7); }
      for (const f of this.fish) {
        if (!f.alive) continue;
        const dx = f.x - wp.x;
        const dy = f.y - wp.y;
        const d = Math.hypot(dx, dy);
        if (d > wp.r * 2.6 || d < 1e-3) continue;
        const fall = Math.pow(1 - d / (wp.r * 2.6), 0.8) * Math.max(0, fade);
        f.vx += ((-dy / d) * wp.dir * 520 - (dx / d) * 190) * fall * dt;
        f.vy += ((dx / d) * wp.dir * 520 - (dy / d) * 190) * fall * dt;
      }
      if (time > wp.until) {
        this.splash(wp.x, wp.y, 2);
        for (const f of this.fish) {
          const dx = f.x - wp.x;
          const dy = f.y - wp.y;
          const d = Math.hypot(dx, dy);
          if (f.alive && d < wp.r * 2 && d > 1e-3) { f.vx += (dx / d) * 220; f.vy += (dy / d) * 220; f.alarm = 1; }
        }
        this.whirl = null;
      }
    }

    // The bait ball: members orbit a drifting centre, tightening, with sharks circling in.
    const bb = this.baitBall;
    if (bb) {
      bb.x += bb.vx * dt;
      bb.y += bb.vy * dt;
      if (bb.x < W * 0.15 || bb.x > W * 0.85) bb.vx = -bb.vx;
      if (bb.y < H * 0.2 || bb.y > H * 0.8) bb.vy = -bb.vy;
      const age = (time - bb.born) / (bb.until - bb.born);
      const rt = bb.r * (1 - 0.35 * age);
      const live = bb.members.filter((f) => f.alive);
      for (const f of live) {
        const dx = f.x - bb.x;
        const dy = f.y - bb.y;
        const d = Math.hypot(dx, dy) || 1;
        const want = d > rt ? 1 : 0.5;
        const vx = (-dy / d) * bb.dir * 95 + (-dx / d) * (d - rt * want) * 1.4 + bb.vx;
        const vy = (dx / d) * bb.dir * 95 + (-dy / d) * (d - rt * want) * 1.4 + bb.vy;
        f.vx += (vx - f.vx) * Math.min(1, dt * 5);
        f.vy += (vy - f.vy) * Math.min(1, dt * 5);
        f.alarm = Math.max(f.alarm, 0.7);
      }
      if (time > bb.until || live.length < 8) this.baitBall = null;
    }
  }

  /** A kraken swims in, seizes the nearest sharks, and the megalodon arrives to drive it off. */
  private spawnKraken(solo = false) {
    const { width: W, height: H, time } = this;
    const size = clamp(Math.min(W, H) * rand(0.7, 1.0), 300, 900);
    const side = randInt(0, 1) as 0 | 1;
    const y = rand(H * 0.25, H * 0.75);
    const ax = W * (side === 0 ? rand(0.25, 0.5) : rand(0.5, 0.75));
    this.kraken = {
      x: side === 0 ? -size * 0.7 : W + size * 0.7, y, heading: side === 0 ? 0 : Math.PI, size, phase: 0,
      born: time, state: "enter", stateAt: time, ax, ay: y, side, grabbed: [], megaSent: solo, inkAt: 0, bend: 0, solo,
      grabCount: randInt(1, 3), megaDelay: rand(4, 12), holdFor: rand(9, 16),
    };
  }

  private stepKraken(dt: number) {
    const k = this.kraken;
    if (!k) return;
    const { time, width: W, height: H } = this;
    k.phase += dt * 2.4;
    const mega = this.sharks.find((sh) => sh.mega);
    const move = (speed: number, heading: number, pulse = true) => {
      const turn = clamp(angleDiff(k.heading, heading), -dt * 0.7, dt * 0.7);
      k.heading += turn;
      k.bend += (turn / dt - k.bend) * Math.min(1, dt * 2);
      // Jet propulsion: it surges forward in pulses and glides between them.
      const surge = pulse ? 0.55 + 0.9 * Math.max(0, Math.sin(k.phase * 1.1)) : 1;
      k.x += Math.cos(k.heading) * speed * surge * dt;
      k.y += Math.sin(k.heading) * speed * surge * dt;
    };
    if (k.state === "enter") {
      const d = Math.hypot(k.ax - k.x, k.ay - k.y);
      move(Math.min(85, d * 0.7 + 10), Math.atan2(k.ay - k.y, k.ax - k.x));
      if (d < 14) {
        k.state = "grab";
        k.stateAt = time;
        const prey = this.sharks
          .filter((sh) => !sh.mega)
          .sort((a, b) => Math.hypot(a.nodes[0] - k.x, a.nodes[1] - k.y) - Math.hypot(b.nodes[0] - k.x, b.nodes[1] - k.y))
          .slice(0, k.grabCount);
        for (const sh of prey) { sh.grabbed = true; sh.target = null; }
        k.grabbed = prey;
      }
    } else if (k.state === "grab") {
      // Turn so the arms point at the sharks it holds and the mantle trails away from them.
      let want = k.heading;
      if (k.grabbed.length) {
        const gx = k.grabbed.reduce((sum, sh) => sum + sh.nodes[0], 0) / k.grabbed.length;
        const gy = k.grabbed.reduce((sum, sh) => sum + sh.nodes[1], 0) / k.grabbed.length;
        want = Math.atan2(gy - k.y, gx - k.x) + Math.PI;
      }
      move(0, want, false);
      if (!k.megaSent && time - k.stateAt > k.megaDelay) {
        k.megaSent = true;
        this.spawnMegalodon(k.side === 0 ? 1 : 0);
      }
      const close = mega ? Math.hypot(mega.nodes[0] - k.x, mega.nodes[1] - k.y) < k.size * 0.75 : false;
      if (close || time - k.stateAt > (k.solo ? k.holdFor : 60)) {
        k.state = "flee";
        k.stateAt = time;
        for (const sh of k.grabbed) sh.grabbed = false;
        k.grabbed = [];
      }
    } else {
      const away = mega ? Math.atan2(k.y - mega.nodes[1], k.x - mega.nodes[0]) : k.heading;
      move(Math.min(190, 50 + (time - k.stateAt) * 70), away);
      if (time - k.inkAt > 0.35 && time - k.stateAt < 3) {
        k.inkAt = time;
        this.events.push({ kind: "splash", x: k.x, y: k.y, strength: 1.2 });
      }
      const gone = Math.max(-k.x, k.x - W, -k.y, k.y - H) > k.size * 0.9;
      if ((gone && time - k.stateAt > 3) || time - k.stateAt > 40) this.kraken = null;
    }
  }

  /** strength: ~0.25 hover wake, ~0.55 drag trail, 2.5 click or finished task. */
  splash(x: number, y: number, strength = 1) {
    if (this.ripples.length >= (strength < 1.2 ? 48 : 64)) return;
    // Only a heavy splash gets the burst at its centre; a trail is just clean rings.
    if (strength >= 1.2) this.events.push({ kind: "splash", x, y, strength });
    const far = Math.max(x, this.width - x);
    const deep = Math.max(y, this.height - y);
    const full = Math.hypot(far, deep) + 40;
    // Light touches die out nearby; only a heavy splash crosses the whole tank.
    const max = strength >= 1.2 ? full : Math.min(full, 90 + 200 * strength);
    this.ripples.push({ x, y, r: 0, max, strength, amp: new Float32Array(RIPPLE_SEGMENTS).fill(1) });
  }

  /**
   * Rings expand and push each fish once as their front passes. Where two rings
   * cross, the stretch of ring in contact breaks up (its amplitude drains away)
   * and throws off a small burst, so waves scatter instead of passing through.
   */
  private stepRipples(dt: number) {
    for (const rp of this.ripples) {
      const from = rp.r;
      rp.r += RIPPLE_SPEED * dt;
      const fade = 1 - rp.r / rp.max;
      for (const f of this.fish) {
        if (!f.alive) continue;
        const dx = f.x - rp.x;
        const dy = f.y - rp.y;
        const d = Math.hypot(dx, dy);
        if (d <= from || d > rp.r || d < 1e-3) continue;
        const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / TAU) * RIPPLE_SEGMENTS) % RIPPLE_SEGMENTS;
        const k = 110 * fade * rp.strength * rp.amp[seg];
        f.vx += (dx / d) * k;
        f.vy += (dy / d) * k;
        f.alarm = Math.max(f.alarm, Math.min(1, fade * rp.strength * rp.amp[seg]));
      }
    }
    const n = this.ripples.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) this.collide(this.ripples[i], this.ripples[j], dt);
    }
    this.ripples = this.ripples.filter((rp) => rp.r < rp.max && rp.amp.some((a) => a > 0.04));
  }

  private collide(a: Ripple, b: Ripple, dt: number) {
    const D = Math.hypot(b.x - a.x, b.y - a.y);
    // Trail ripples (hover/drag) overlap by design; only a heavy splash scatters against others.
    if (a.strength < 1.2 && b.strength < 1.2) return;
    if (D > a.r + b.r + RIPPLE_BAND || D < Math.abs(a.r - b.r) - RIPPLE_BAND || a.r < 4 || b.r < 4) return;
    this.breakContact(a, b, dt);
    this.breakContact(b, a, dt);
  }

  private breakContact(a: Ripple, other: Ripple, dt: number) {
    for (let k = 0; k < RIPPLE_SEGMENTS; k++) {
      if (a.amp[k] <= 0) continue;
      const ang = ((k + 0.5) / RIPPLE_SEGMENTS) * TAU - Math.PI;
      const px = a.x + Math.cos(ang) * a.r;
      const py = a.y + Math.sin(ang) * a.r;
      if (Math.abs(Math.hypot(px - other.x, py - other.y) - other.r) > RIPPLE_BAND) continue;
      const before = a.amp[k];
      a.amp[k] = Math.max(0, before - dt * 1.8);
      if (before >= 0.5 && a.amp[k] < 0.5) this.events.push({ kind: "splash", x: px, y: py, strength: 0.3 });
    }
  }

  step(dt: number) {
    this.time += dt;
    this.stepEvents(dt);
    this.stepRipples(dt);
    this.rebuildHash();
    this.stepFish(dt);
    this.stepSharks(dt);
    this.respawn();
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepFish(dt: number) {
    const { fish, sharks, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      // Alarmed fish want more room: the school flashes apart around a
      // shark and closes back up once the threat fades.
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                // Blind zone directly behind the fish.
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  // Elliptical personal space: wide along x, tight along y.
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    // Different species keep their own schools.
                    const k = ((1 - d / foreignSep) / d) * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - f.vy) * alignK + (cy / n) * cohesionK;
        if (sp.mill > 0) {
          // Circle the local centre: the school spins into a bait ball.
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.alarm);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.alarm);
        }
      }

      // Predators. Distance is measured to the nearest point along the front
      // half of the shark, so fish also give the flanks a wide berth.
      let fear = 0;
      for (const sh of sharks) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        // Fountain effect: break to whichever side of the shark's path you're on.
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }

      if (pointer.active) {
        const pr = 130;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w;
          ay += (dy / d) * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }

      // Alarm: direct threat sets it, neighbours pass it along (slightly
      // weaker each hop), and it fades on its own.
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;

      // Soft walls.
      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      // Ambient current and a little individual restlessness.
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      // Swim level, except when bolting from danger.
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);

      // Relax toward a preferred speed that rises with panic.
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + f.vx * dt, -60, W + 60);
      f.y = clamp(f.y + f.vy * dt, -60, H + 60);
    }
  }

  private stepSharks(dt: number) {
    const { sharks, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const cxW = W / 2;
    const cyW = H / 2;
    const mega = sharks.find((x) => x.mega);
    const kraken = this.kraken;

    for (const sh of sharks) {
      const L = sh.length;
      const nodes = sh.nodes;
      const hx = nodes[0];
      const hy = nodes[1];

      sh.hunger = Math.min(1, sh.hunger + dt * 0.03);

      // Momentum.
      let dx = Math.cos(sh.heading);
      let dy = Math.sin(sh.heading);

      // Wander: a slowly drifting offset on a circle ahead of the snout.
      sh.wander = clamp(sh.wander + (Math.random() - 0.5) * dt * 3.2, -1.1, 1.1);
      dx += Math.cos(sh.heading + sh.wander) * 0.45;
      dy += Math.sin(sh.heading + sh.wander) * 0.45;

      // Hunt.
      if (time >= sh.retargetAt) {
        sh.target = this.findPrey(sh);
        sh.retargetAt = time + 0.45;
      }
      const t = sh.target;
      let hunting = false;
      let closing = 0;
      if (t && t.alive && sh.hunger > 0.3) {
        // Pursuit: aim at where the fish is about to be.
        const tx = t.x + t.vx * 0.35 - hx;
        const ty = t.y + t.vy * 0.35 - hy;
        const d = Math.hypot(tx, ty) || 1;
        const w = 1.4 + 2.6 * sh.hunger;
        dx += (tx / d) * w;
        dy += (ty / d) * w;
        hunting = true;
        closing = clamp(1 - d / (L * 0.9), 0, 1);
      } else {
        // Patrol: a lazy circuit around the headline.
        const rx = (hx - cxW) / (W / minSide);
        const ry = hy - cyW;
        const r = Math.hypot(rx, ry) || 1;
        const radius = sh.orbitRadius * (1 + 0.15 * Math.sin(time * 0.05 + sh.id));
        const radial = clamp((radius - r) / radius, -1, 1);
        dx += ((-ry / r) * sh.orbitDir + (rx / r) * radial * 0.9) * 0.55;
        dy += ((rx / r) * sh.orbitDir + (ry / r) * radial * 0.9) * 0.55;
      }

      // Give other sharks room.
      for (const other of sharks) {
        if (other === sh) continue;
        for (let k = 0; k < SHARK_NODES; k += 4) {
          const ox = hx - other.nodes[k * 2];
          const oy = hy - other.nodes[k * 2 + 1];
          const d = Math.hypot(ox, oy);
          const range = (L + other.length) * 0.45;
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * 3;
            dx += (ox / d) * w;
            dy += (oy / d) * w;
          }
        }
      }

      // Keep the headline mostly clear: a soft elliptical no-swim zone.
      const ex = (hx - cxW) / (W * 0.3);
      const ey = (hy - cyW) / (H * 0.16);
      const e2 = ex * ex + ey * ey;
      if (e2 < 1) {
        const e = Math.sqrt(e2) || 1e-3;
        const w = (1 - e) * (hunting ? 1 : 2.5);
        dx += (ex / e) * w;
        dy += (ey / e) * w;
      }

      // Turn back once the snout leaves the frame, so bodies dip off-screen
      // now and then but the sharks never wander away for good.
      const over = Math.max(-hx, hx - W, -hy, hy - H);
      if (over > -L * 0.05) {
        const w = clamp((over + L * 0.05) / (L * 0.35), 0, 1) * 3.5;
        const toX = cxW - hx;
        const toY = cyW - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      let fleeing = false;
      let held = false;
      if (sh.mega) {
        // Homes in on the kraken while there is one; otherwise holds its line.
        if (kraken) {
          const want = Math.atan2(kraken.y - hy, kraken.x - hx);
          const cur = sh.megaHeading ?? sh.heading;
          sh.megaHeading = cur + clamp(angleDiff(cur, want), -0.25 * dt, 0.25 * dt);
        }
        dx = Math.cos(sh.megaHeading ?? sh.heading);
        dy = Math.sin(sh.megaHeading ?? sh.heading);
        hunting = false;
      } else if (sh.grabbed && kraken) {
        // Hauled toward the kraken, thrashing against the arms.
        const ox = kraken.x - hx;
        const oy = kraken.y - hy;
        const d = Math.hypot(ox, oy) || 1;
        const thrash = (Math.sin(time * 11 + sh.id * 2.3) + 0.6 * Math.sin(time * 17 + sh.id)) * 1.6;
        // Reeled in with jolts, not a steady beam.
        const jolt = Math.max(0, Math.sin(time * 2.6 + sh.id));
        const pull = d > kraken.size * 0.4 + L * 0.2 ? 0.25 + 1.2 * jolt : 0.1;
        dx = (ox / d) * pull + (-oy / d) * thrash;
        dy = (oy / d) * pull + (ox / d) * thrash;
        held = true;
        hunting = false;
        sh.target = null;
      } else {
        const threats = [
          mega && { x: mega.nodes[0], y: mega.nodes[1], reach: Math.max(W, H) * 0.9 },
          kraken && { x: kraken.x, y: kraken.y, reach: kraken.size * 1.3 },
        ];
        const ball = this.baitBall;
        if (ball) {
          const bx = ball.x - hx;
          const by = ball.y - hy;
          const bd = Math.hypot(bx, by) || 1;
          // Close in from afar, then circle the ball and dive through it.
          dx += (bx / bd) * (bd > ball.r * 1.4 ? 2.2 : 0.4) + (-by / bd) * ball.dir * (bd < ball.r * 2.4 ? 1.3 : 0);
          dy += (by / bd) * (bd > ball.r * 1.4 ? 2.2 : 0.4) + (bx / bd) * ball.dir * (bd < ball.r * 2.4 ? 1.3 : 0);
        }
        for (const threat of threats) {
          if (!threat) continue;
          const ox = hx - threat.x;
          const oy = hy - threat.y;
          const d = Math.hypot(ox, oy) || 1;
          if (d < threat.reach) {
            dx += (ox / d) * 8;
            dy += (oy / d) * 8;
            fleeing = true;
            hunting = false;
            sh.target = null;
          }
        }
      }
      const desired = Math.atan2(dy, dx);
      // Sharks can't pivot on the spot: the turning circle grows with speed.
      const agility = Math.min(sh.mega ? 0.3 : held ? 3 : fleeing ? 2 : hunting ? 1.7 + closing : 0.8, sh.speed / (L * 0.22));
      const maxTurn = agility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = 30 + L * 0.04;
      const targetSpeed = sh.mega ? (kraken ? 62 : 38 + L * 0.02) : held ? 30 : fleeing ? cruise * 2.3 : hunting ? cruise * (1.45 + closing * 1.5) : cruise;
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * 1.1);
      sh.phase += dt * (2 + sh.speed / 24);

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;

      // Follow-the-leader spine, with a stiffness limit per joint so the
      // body bends into a C at most and never folds back on itself.
      const seg = L / (SHARK_NODES - 1);
      const maxBend = 0.16;
      let prevAngle = sh.heading + Math.PI;
      for (let k = 1; k < SHARK_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }

      // Feed.
      if (sh.hunger > 0.15) {
        const mouthR = L * 0.05 + 8;
        const mx = nodes[0];
        const my = nodes[1];
        for (const f of this.fish) {
          if (!f.alive) continue;
          if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
            f.alive = false;
            f.respawnAt = time + rand(3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y });
          }
        }
      }
    }
  }

  /**
   * Pick prey in the shark's forward cone, preferring close fish in sparse
   * buckets (stragglers) over fish buried in a dense school.
   */
  private findPrey(sh: Shark): Fish | null {
    const range = sh.length * 0.9 + 160;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const fx = Math.cos(sh.heading);
    const fy = Math.sin(sh.heading);
    let best: Fish | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - hx;
      const dy = f.y - hy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1e-3) continue;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.2) continue;
      const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
      const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
      if (f === sh.target) currentScore = score;
    }
    // Stick with the current target unless something is clearly better.
    if (sh.target && currentScore < bestScore * 1.3) return sh.target;
    return best;
  }

  private respawn() {
    const { time, width: W, height: H } = this;
    const due: Fish[] = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;

    // A new school swims in from a random edge.
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(-1, 1) * this.perception;
      f.y = y + rand(-1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
