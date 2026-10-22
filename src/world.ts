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

export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse" | "sawshark";

/** Which sharks to put in the water; size is relative to the biggest. */
export type SharkSpec = { kind: SharkKind; size: number };

// The landing hero: four of the same shark at different depths.
const DEFAULT_SHARKS: SharkSpec[] = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.7 },
  { kind: "classic", size: 0.84 },
  { kind: "classic", size: 0.77 },
];

export type DiverKind = "scuba" | "photo" | "treasure" | "snorkel" | "scooter" | "tech" | "bomber";

/** Suit colour (r,g,b) per kind of diver; the renderer and the popped bits share it. */
export const DIVER_SUIT: Record<DiverKind, string> = {
  scuba: "255,150,60", photo: "60,200,190", treasure: "190,150,85", snorkel: "240,110,150", scooter: "120,225,120", tech: "175,100,255", bomber: "255,235,50",
};

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
  /** A diver: drawn as a person, steered by stepDivers, and fair game for sharks. */
  diver?: true;
  /** A diver riding on top of the ufo. */
  riding?: true;
  /** What kind of diver this is; changes its look and how it swims. */
  dkind?: DiverKind;
  /** The shark carrying this diver around in its jaws. */
  dragger?: Shark;
  /** Photographers: when the last flash went off, and when the next one will. */
  flashAt?: number;
  nextFlash?: number;
  /** Tech divers: the wreck they swim to for scrap, when they finish arming, and when the next shot is due. */
  salvage?: { x: number; y: number };
  /** Bombers: when the fuse is lit (a red ! shows over his head) and when he goes off. */
  hotAt?: number;
  fuseAt?: number;
  equipUntil?: number;
  nextShot?: number;
  /** Tech divers get one roll at blasting themselves free of a grab: undefined = not rolled, false = used up. */
  escapeRoll?: boolean;
  /** Knocked out by a jellyfish until this time: limp, drifting, and easy prey. */
  stunUntil?: number;
  /** Held in the kraken's arms, thrashed about until crushAt. */
  seized?: true;
  crushAt?: number;
  /** Scooter divers: already had a go at freeing a shark from the kraken. */
  tried?: true;
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
  /** Until this time a red "!" floats over the shark: it has spotted something to eat. */
  alertUntil?: number;
  /** Sawshark only: when it next tries to slice, and until when its slash is showing. */
  nextSlice?: number;
  sliceUntil?: number;
  /** Heading for the ufo to cut it in half. */
  ufoCharge?: boolean;
  /** Dangling in the ufo's beam. */
  lifted?: boolean;
  /** Has eaten a diver: ignores the rest until this time. */
  fedUntil?: number;
  /** Sent to eat the bits left by a popped diver. */
  cleaning?: boolean;
  /** Swimming off to leave the tank; removed once clear of the frame. */
  leaving?: boolean;
  /** A diver carried in the jaws, and until when. */
  dragging?: Fish;
  dragUntil?: number;
  /** Distance swum since the last wake ripple (megalodon). */
  wakeD?: number;
  /** Held by the kraken: when it decides whether to eat this one. */
  devourAt?: number;
  /** A megalodon backing off after the kraken drove it away. */
  retreat?: boolean;
  /** Sent in to help a megalodon the kraken is crushing. */
  rallying?: boolean;
  /** A megalodon chases a fleeing kraken only until this time. */
  chaseUntil?: number;
  megaHeading?: number;
  /** How hard a megalodon is thrashing (0 cruising → 1+ wrapped by the kraken or clamped on the whale): drives a bigger, faster body wave. */
  thrash?: number;
  /** A megalodon that just bit something waits until this time before biting again. */
  nextBite?: number;
  /** Does this megalodon go for whales? Decided on arrival: some just share the water with one. */
  whaleAttack?: boolean;
  /** When the kraken's arms set on this shark: the arms take a moment to reach it before it is hauled in. */
  grabbedAt?: number;
  /** Something that touched a megalodon's body: it turns to bite it and gives up after `until`. */
  biteTarget?: { shark?: Shark; fish?: Fish; until: number };
  born?: number;
}

export interface Kraken {
  /** Distance travelled since the last wake ripple. */
  wakeD?: number;
  x: number;
  y: number;
  heading: number;
  size: number;
  phase: number;
  born: number;
  state: "enter" | "grab" | "wrap" | "flee";
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
  /** The megalodon it is wrapped around, and how long the fight lasts. */
  wrapping: Shark | null;
  wrapFor: number;
  /** Who is going to win the fight; the grip and the thrashing play out accordingly. */
  winner: "kraken" | "mega";
  nextShake: number;
  shakeUntil: number;
  /** Sharks eaten, sharks snatched again after the first grab, megalodons driven off. */
  meals: number;
  regrabs: number;
  rounds: number;
  nextGrab: number;
  /** Divers it is holding, and when it can seize the next one. */
  caught: Fish[];
  /** A saucer it is striking at or holding, and when it lets go. */
  ufoStrike: number | null;
  ufoHeld: boolean;
  ufoUntil: number;
  /** How hard it is jetting (0 still → 1 fleeing), and the phase of the ripple running down its arms. */
  jet: number;
  wave: number;
  /** Until when it has a whale wrapped (0 when it does not). */
  whaleUntil: number;
  /** Sharks have been called in to rescue the megalodon it is crushing. */
  rally: boolean;
  /** Jetting across the tank to clamp onto the megalodon; the fight proper starts when it lands. */
  lunging?: boolean;
  /** A tentacle lashing out at a diver: the grab lands when it arrives. */
  strike: { f: Fish; at: number } | null;
  nextCatch: number;
  /** Hurt in a fight: flees faster and inks for longer. */
  wounded: boolean;
  /** Divers' sway on the tug of war: negative favours the megalodon, positive the kraken. */
  tilt: number;
}

export interface Jelly {
  x: number;
  y: number;
  size: number;
  phase: number;
  drift: number;
  hue: number;
  /** Last zap, and who it hit (drawn as a bolt for a moment). */
  zapAt?: number;
  zapTarget?: Fish;
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
  /** Distance swum since the last wake ripple. */
  wakeD?: number;
  /** When it next sings. */
  songAt?: number;
  /** Attacked: it speeds up and swims off the way it was pointed away. */
  fleeing?: boolean;
  fleeHeading?: number;
}

export interface Fight {
  a: Shark;
  b: Shark;
  /** Centre the pair circles. */
  mx: number;
  my: number;
  until: number;
  dir: 1 | -1;
  lungeUntil: number;
  nextLunge: number;
  /** True once the pair has closed in and started circling. */
  engaged: boolean;
}

export type EventLevel = "off" | "calm" | "normal" | "busy";

export interface Ufo {
  /** Hits taken from a tech diver's blaster; the third brings it down. */
  hits?: number;
  x: number;
  y: number;
  /** Hover height. */
  hy: number;
  tx: number;
  state: "enter" | "seek" | "beam" | "leave";
  phase: number;
  beamUntil: number;
  beams: number;
  maxBeams: number;
  beamX: number;
  aim: { x: number; y: number } | null;
  /** Seconds spent hovering with no clear target. */
  waited: number;
  /** A diver that has taken the controls. */
  pilot: Fish | null;
  huntSharks: boolean;
  targetShark: Shark | null;
  hijackChecked: boolean;
  /** A shark the pilot means to keep, and what has been beamed up this time round. */
  keep: boolean;
  got: number;
  /** Grabbed something and is bolting. */
  fast: boolean;
  /** The pilot has climbed aboard. */
  boarded: boolean;
  /** In the kraken's arms. */
  held: boolean;
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
  /** 1 for an orange (Claude) ring; absent for the usual purple. */
  hue?: 1;
  x: number;
  y: number;
  r: number;
  max: number;
  strength: number;
  /** How hard it shoves bodies: 1 everyone, 2 the whale's wake, 3 a titan's (kraken, megalodon). Heavier wakes shove lighter bodies. */
  weight?: number;
  /** A whale song: a slow, wide, gentle pulse that does not push anything. */
  song?: boolean;
  /** Spread-speed multiplier, so neighbouring rings do not stay in lockstep. */
  rate?: number;
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
/** Chance the kraken swallows a shark it has held long enough, once per visit; otherwise the shark gets away. */
const KRAKEN_EAT_CHANCE = 0.2;
/** Seconds a tentacle takes to reach its target (the renderer extends the arm over the same time). */
export const STRIKE_TIME = 0.9;
/** How far round from straight behind its head the kraken can reach: 270 degrees in all. Past this it has to turn to face. */
export const KRAKEN_ARC = 2.35;
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
  /** When a kraken or megalodon last swam in: drives the screen shake and the shadow it casts. */
  titanEntry: { born: number } | null = null;
  /** Drifting clouds of kraken ink that fish steer clear of. */
  inks: { x: number; y: number; vx: number; vy: number; r0: number; r1: number; born: number; life: number; seed: number }[] = [];
  /** A kraken waiting for the whale fight to finish before it swims in after the megalodon. */
  private krakenQueued = false;
  /** A megalodon mauling the whale. */
  whaleFight: { mega: Shark; start: number; until: number; nextHit: number; doomed: boolean; bite: number; locked: boolean } | null = null;
  jellies: Jelly[] = [];
  /** Up to two whales at once. `whale` is the oldest, which the fights and the titans deal with. */
  whales: Whale[] = [];
  get whale(): Whale | null { return this.whales[0] ?? null; }
  set whale(v: Whale | null) { if (v === null) this.whales.shift(); else this.whales.unshift(v); }
  whirl: Whirl | null = null;
  fight: Fight | null = null;
  /** Big announced events, each with a banner and progress bar: the blood moon, a titans clash, a meteor shower. They run side by side (one of each kind), alongside the alien invasion. */
  sagas: { kind: "moon" | "clash" | "meteor"; title: string; rgb: string; born: number; until: number; count: number }[] = [];
  /** Meteors in flight: where they are, how they fall, and the depth they hit the water at. */
  meteors: { x: number; y: number; vx: number; vy: number; ty: number; born: number }[] = [];
  private nextMeteorAt = 0;
  /** An announced event asked for while the same kind is already running waits here and starts when that one ends. */
  private sagaQueue: ("moon" | "meteor" | "clash")[] = [];
  private nextMoonTech = 0;
  /** An alien invasion, Terraria style: it begins when the third saucer arrives and runs through a fixed number of them. */
  invasion: { total: number; spawned: number; killed: number; escaped: number; nextAt: number; born: number; banner: number } | null = null;
  /** Up to three saucers at once. `ufo` is the oldest, which the kraken and the sharks deal with. */
  ufos: Ufo[] = [];
  get ufo(): Ufo | null { return this.ufos[0] ?? null; }
  set ufo(v: Ufo | null) { if (v === null) this.ufos.shift(); else this.ufos.unshift(v); }
  /** The two halves of a ufo that has been cut apart, drifting down. */
  debris: { x: number; y: number; vx: number; vy: number; side: -1 | 1; born: number }[] = [];
  /** What is left of a popped diver, until a shark cleans it up. */
  mess: { x: number; y: number; vx: number; vy: number; born: number; glyph: string; rgb: string }[] = [];
  /** Expanding flashes where a diver popped. */
  blasts: { x: number; y: number; born: number }[] = [];
  /** Short labels that float where something just happened ("KRAKEN WINS"). */
  callouts: { x: number; y: number; text: string; rgb: string; born: number }[] = [];
  /** Short messages for the page to show once (e.g. when the megalodon eats the ufo). */
  notices: string[] = [];
  private diverGoals = new WeakMap<Fish, { x: number; y: number; born: number }>();
  /** Decide once per visitor whether it attracts a normal shark. */
  private diverInterest = new WeakMap<Fish, boolean>();
  private diverQueue: number[] = [];
  /** When a titan was last around, and until when no random kraken or megalodon turns up after it. */
  private titanWas = false;
  private titanCooldownUntil = 0;
  /** Wrecks a tech diver is on his way to salvage: where the ufo fell and when he arrives. */
  private techQueue: { x: number; y: number; at: number }[] = [];
  /** Bomber explosions, for drawing: where, when, and how far the shockwave reaches. */
  bombs: { x: number; y: number; born: number; r: number }[] = [];
  /** Blaster bolts in flight, for drawing. */
  bolts: { x0: number; y0: number; x1: number; y1: number; born: number }[] = [];
  private diverCap = 25;
  private fullPresses = 0;
  /** Which assistants are waiting on you; their ring pulses until you answer. */
  attention = { claude: false, codex: false };
  private attentionAt = 0;
  /** Options from the settings panel. */
  settings: { events: EventLevel; night: boolean } = { events: "normal", night: true };
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
  private yeatStart = 0;
  private yeatUntil = 0;
  /** The most regular sharks this tank holds; the head count wanders between a quarter of it and all of it. */
  private sharkCap = 0;
  private nextSharkDrift = 25;
  private growNext = false;
  private sharkId = 100;
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
    // Sharks (and any event in progress) ride along too, so dragging the window to another monitor
    // doesn't restart the tank; the drift step adds or drops sharks to match the new size.
    for (const sh of this.sharks) {
      for (let n = 0; n < SHARK_NODES; n++) {
        sh.nodes[n * 2] *= sx;
        sh.nodes[n * 2 + 1] *= sy;
      }
    }
    this.sharkCap = this.wantedSharks();
    if (this.sharks.length === 0) this.seedSharks();
    if (!this.fishCount) this.rescaleFish();
  }

  /** One shark per ~80k px^2 of tank, so a bigger window holds more of them. */
  private wantedSharks() {
    return clamp(Math.round((this.width * this.height) / 110000), 1, 24);
  }

  seed() {
    this.seedSharks();
    this.seedFish();
  }

  private seedSharks() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseLength = clamp(minSide * 0.44, 170, 430);
    const cap = this.wantedSharks();
    this.sharkCap = cap;
    // A random head count rather than a full tank every time.
    const sharkCount = cap < 4 ? cap : clamp(Math.round(cap * rand(0.55, 1)), 2, cap);
    const offset = randInt(0, this.sharkSpecs.length - 1);

    this.sharks = [];
    for (let i = 0; i < sharkCount; i++) {
      const spec = this.sharkSpecs[(i + offset) % this.sharkSpecs.length];
      const kind = spec.kind;
      const size = spec.size * Math.max(0.55, 1 - 0.08 * Math.floor(i / this.sharkSpecs.length));
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
    const want = clamp(Math.round((this.width * this.height) / 7000), 85, 700);
    const have = this.fish.length;
    if (Math.abs(want - have) < have * 0.15) return;
    if (want < have) { this.fish.length = want; return; }
    this.seedFish(true);
  }

  private seedFish(keep = false) {
    const { width: W, height: H } = this;
    const total = this.fishCount ?? clamp(Math.round((W * H) / 7000), 85, 700);
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
      // It only vanishes once the tail has cleared the edge too, so it swims out instead of popping away.
      let gone = true;
      for (let n = 0; n < SHARK_NODES && gone; n++) {
        const nx = mega.nodes[n * 2];
        const ny = mega.nodes[n * 2 + 1];
        if (nx > -60 && nx < this.width + 60 && ny > -60 && ny < this.height + 60) gone = false;
      }
      const age = time - (mega.born ?? 0);
      // Past two and a half minutes it heads for the nearest edge and swims out, rather than blinking away mid-tank.
      if (age > 150 && !mega.retreat && this.whaleFight?.mega !== mega && this.kraken?.wrapping !== mega) {
        const cx = mega.nodes[0];
        const cy = mega.nodes[1];
        const edges: [number, number, number][] = [[cx, -1, 0], [this.width - cx, 1, 0], [cy, 0, -1], [this.height - cy, 0, 1]];
        const [, ex, ey] = edges.sort((a, b) => a[0] - b[0])[0];
        mega.retreat = true;
        mega.megaHeading = Math.atan2(ey, ex);
      }
      if ((gone && age > 4) || age > 400) {
        if (this.whaleFight?.mega === mega) this.endWhaleFight();
        this.sharks = this.sharks.filter((sh) => sh !== mega);
      }
    }
    this.stepSharkDrift();
    this.stepKraken(dt);
    this.stepSaga(dt);
    this.stepTitanContacts();
    this.stepWhaleFight(dt);
    this.stepKrakenQueue();
    this.stepCritters(dt);
    this.stepFight();
    if (time < this.nextEventAt || this.width === 0) return;
    // Irregular gaps: usually a minute or so, sometimes two events close together.
    const level = this.settings.events;
    // While a titan is loose the gaps shrink, so smaller events keep the tank busy around it.
    const combatActive = !!mega || !!this.kraken;
    // Once a titan has left, neither comes back for a good while, so they never run back to back.
    if (this.titanWas && !combatActive) this.titanCooldownUntil = time + rand(150, 240);
    this.titanWas = combatActive;
    this.nextEventAt = time + (Math.random() < 0.2 ? rand(12, 30) : rand(30, 100)) * (level === "busy" ? 0.5 : level === "calm" ? 1.6 : 1) * (combatActive ? 0.25 : 1);
    if (level === "off") return;
    // The kraken and megalodon share a story, so only one of that pair runs at a time and no whale
    // appears during it; everything else can overlap, up to five minor events together.
    const minorsActive = [this.baitBall, this.whirl, this.ufo, this.fight, this.jellies.length ? 1 : 0, this.fish.some((f) => f.diver && f.alive) ? 1 : 0].filter(Boolean).length;
    const pool: [string, number][] = [
      ["chase", 0.22], ["saga", 0.11], ["kraken", 0.06], ["mega", 0.05], ["bait", 0.17],
      ["moon", 0.035], ["meteor", 0.05], ["jelly", 0.15], ["whale", 0.07], ["whirl", 0.11], ["fight", 0.07], ["ufo", 0.17], ["diver", 0.2], ["yeat", 0.0025],
    ];
    const majorKinds = ["saga", "kraken", "mega", "whale"];
    const calmOff = [...majorKinds, "fight", "diver"];
    // Around a titan, favour the small stuff (divers, runners, jellies, bait balls, saucers) to feed the story.
    const minorKinds = ["chase", "bait", "jelly", "ufo", "diver", "whirl"];
    if (combatActive) for (const e of pool) if (minorKinds.includes(e[0])) e[1] *= 2.2;
    // Busy means a lot going on, not constant titans: the big two come half as often.
    if (level === "busy") for (const e of pool) if (e[0] === "saga" || e[0] === "kraken" || e[0] === "mega") e[1] *= 0.5;
    const allowed = pool.filter(([kind]) => {
      if (combatActive && (kind === "saga" || kind === "kraken" || kind === "mega" || kind === "fight")) return false;
      if (time < this.titanCooldownUntil && (kind === "saga" || kind === "kraken" || kind === "mega")) return false;
      if ((kind === "moon" || kind === "meteor") && (this.sagas.some((s) => s.kind === kind) || (kind === "moon" && combatActive))) return false;
      if (kind === "whale" && (this.whales.length >= 2 || combatActive)) return false;
      // Rare by design: it runs five minutes, is a very rare roll, and stays away at least three hours after, so it covers about 1% of the time or less.
      if (kind === "yeat" && (this.yeat > 0 || (this.yeatUntil > 0 && time < this.yeatUntil + 10800))) return false;
      if (level === "calm" && calmOff.includes(kind)) return false;
      if (minorsActive >= (combatActive ? 7 : 5) && !majorKinds.includes(kind) && kind !== "chase") return false;
      if (kind === "bait" && this.whirl) return false;
      if (kind === "whirl" && this.baitBall) return false;
      if (kind === "bait" && this.baitBall) return false;
      if (kind === "jelly" && this.jellies.length) return false;
      if (kind === "whirl" && this.whirl) return false;
      if (kind === "ufo" && (this.ufos.length >= 3 || this.invasion)) return false;
      return true;
    });
    let roll = Math.random() * allowed.reduce((sum, [, w]) => sum + w, 0);
    for (const [kind, w] of allowed) {
      roll -= w;
      if (roll <= 0) {
        // Now and then a lone saucer is the vanguard: three arrive together and the invasion begins.
        if (kind === "ufo" && !this.ufos.length && Math.random() < 0.2) { for (let i = 0; i < 3; i++) this.spawnUfo(); }
        else this.triggerEvent(kind as never);
        break;
      }
    }
  }

  /** Is this kind of event running right now? */
  private eventActive(kind: string) {
    switch (kind) {
      case "kraken": case "saga": return !!this.kraken;
      case "mega": return this.sharks.some((sh) => sh.mega);
      case "bait": return !!this.baitBall;
      case "jelly": return this.jellies.length > 0;
      case "whale": return this.whales.length >= 2;
      case "whirl": return !!this.whirl;
      case "fight": return !!this.fight;
      case "ufo": return this.ufos.length >= 3;
      case "moon": case "meteor": return this.sagas.some((s) => s.kind === kind);
      case "diver": return this.fish.some((f) => f.diver && f.alive) || this.diverQueue.length > 0;
      case "chase": return this.fish.some((f) => f.temp !== undefined);
      default: return true;
    }
  }

  /** Public so a key press can trigger one on demand. Says whether it started, was already running, or had to wait. */
  triggerEvent(kind: "chase" | "mega" | "kraken" | "saga" | "bait" | "jelly" | "whale" | "whirl" | "fight" | "ufo" | "diver" | "night" | "yeat" | "moon" | "meteor"): "started" | "already" | "blocked" | "off" | "full" | "ended" | "insist" | "cake" | "queued" {
    const combatActive = !!this.kraken || this.sharks.some((sh) => sh.mega);
    const combat = kind === "kraken" || kind === "saga" || kind === "mega";
    // No whale while the kraken or megalodon is around.
    if (kind === "whale" && !!this.kraken && this.sharks.some((sh) => sh.mega)) return "blocked";
    if (kind === "night" && !this.settings.night) return "off";
    // Yeat mode toggles: pressing it again fades it out.
    if (kind === "yeat") {
      if (this.yeat > 0) { this.yeatUntil = Math.min(this.yeatUntil, this.time + 3); return "ended"; }
      this.yeatStart = this.time;
      this.yeatUntil = this.time + 300;
      this.notices.push(["luh tönka...", "luh birky...", "luh twïzzy..."][randInt(0, 2)]);
      return "started";
    }
    // A kraken called in while a megalodon is loose (e.g. whale then megalodon) is queued behind the whale fight, then goes for the megalodon.
    if ((kind === "kraken" || kind === "saga") && !this.kraken && this.sharks.some((sh) => sh.mega)) {
      if (this.krakenQueued) return "already";
      this.krakenQueued = true;
      this.stepKrakenQueue();
      return "started";
    }
    // M with a kraken already out sends the megalodon in from the far side whenever you like, to start the fight.
    if (kind === "mega" && this.kraken && !this.sharks.some((sh) => sh.mega)) {
      this.kraken.megaSent = true;
      this.spawnMegalodon(this.kraken.side === 0 ? 1 : 0);
      return "started";
    }
    if (combat && combatActive) return this.eventActive(kind) ? "already" : "blocked";
    // The announced events all run at once, but only one of each kind: asking for the same one again queues it.
    if (kind === "moon" || kind === "meteor" || kind === "saga") {
      const want = kind === "saga" ? "clash" : kind;
      if (this.sagas.some((s) => s.kind === want)) {
        if (this.sagaQueue.includes(want)) return "already";
        this.sagaQueue.push(want);
        return "queued";
      }
    }
    if (kind === "moon" || kind === "meteor") {
      if (kind === "moon") this.startSaga("moon", "BLOOD MOON", "255,70,70", 75, "THE BLOOD MOON RISES!", "the sea turns red!!! the sharks are hungry... and the divers are armed...");
      else this.startSaga("meteor", "METEOR SHOWER", "255,170,80", 40, "A METEOR SHOWER BEGINS!", "fire is falling from the sky!!! keep your head down...");
      return "started";
    }
    // A fight needs free sharks; a bait ball and a whirlpool would both fight over the same fish.
    if (kind === "fight" && (combatActive || this.fight)) return this.fight ? "already" : "blocked";
    if ((kind === "bait" && this.whirl) || (kind === "whirl" && this.baitBall)) return "blocked";
    // Divers stack: every press brings more.
    if (kind !== "chase" && kind !== "night" && kind !== "diver" && this.eventActive(kind)) return "already";
    if (kind === "chase") this.spawnRunner(randInt(1, 3));
    else if (kind === "kraken" || kind === "saga") {
      this.spawnKraken(kind === "kraken");
      // The full saga is announced: the kraken rises, and the megalodon comes for it.
      if (kind === "saga" && !this.sagas.some((s) => s.kind === "clash")) this.startSaga("clash", "TITANS CLASH", "235,235,245", Infinity, "THE TITANS CLASH!", "the kraken rises... and something vast comes for it!!!");
    }
    else if (kind === "mega") this.spawnMegalodon();
    else if (kind === "bait") this.spawnBaitBall();
    else if (kind === "jelly") this.spawnJellies();
    else if (kind === "whale") this.spawnWhale();
    else if (kind === "whirl") this.spawnWhirl();
    else if (kind === "fight") this.spawnFight();
    else if (kind === "ufo") this.spawnUfo();
    else if (kind === "diver") {
      if (!this.spawnDivers()) {
        if (this.diverCap === 25 && ++this.fullPresses >= 5) { this.diverCap = 50; this.fullPresses = 0; this.spawnDivers(); return "insist"; }
        if (this.diverCap === 50 && ++this.fullPresses >= 10) { this.diverCap = 120; this.fullPresses = 0; this.spawnDivers(); return "cake"; }
        return "full";
      }
    }
    else if (kind === "night") this.dayOffset = DAY_LEN * 0.35 - this.time;
    return this.eventActive(kind) ? "started" : "blocked";
  }

  /** Yeat mode: 0 off → 1 full, fading in and out over 3s; a random event runs it for five minutes. */
  get yeat() {
    if (this.time >= this.yeatUntil) return 0;
    return clamp(Math.min((this.time - this.yeatStart) / 3, (this.yeatUntil - this.time) / 3), 0, 1);
  }

  /** 0 in daylight, 1 in the middle of the night; a slow cycle with soft dusk and dawn. */
  get night() {
    if (!this.settings.night) return 0;
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

  /**
   * Where a new arrival comes in: the side away from the whale, kraken or megalodon already in the
   * tank (unless a side is asked for) and a height well clear of them, so they never start on top of
   * each other.
   */
  private entryPoint(wanted?: 0 | 1): { side: 0 | 1; y: number } {
    const { width: W, height: H } = this;
    const others: { x: number; y: number }[] = [];
    if (this.whale) others.push(this.whaleMid(this.whale));
    if (this.kraken) others.push({ x: this.kraken.x, y: this.kraken.y });
    const big = this.sharks.find((sh) => sh.mega);
    if (big) others.push({ x: big.nodes[0], y: big.nodes[1] });
    let side = wanted ?? (randInt(0, 1) as 0 | 1);
    if (wanted === undefined && others.length) side = others.reduce((sum, o) => sum + o.x, 0) / others.length < W / 2 ? 1 : 0;
    let y = rand(H * 0.25, H * 0.75);
    for (let i = 0; i < 8; i++) {
      y = rand(H * 0.2, H * 0.8);
      if (others.every((o) => Math.abs(o.y - y) > H * 0.3)) break;
    }
    return { side, y };
  }

  /** A huge shark crosses the tank in a near-straight line; every other shark bolts. */
  private spawnMegalodon(wantedSide?: 0 | 1) {
    const { width: W, height: H, time } = this;
    const { side, y } = this.entryPoint(wantedSide);
    const length = clamp(Math.min(W, H) * rand(1.2, 1.5), 560, 1500);
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
      mega: true, megaHeading: heading, born: time, whaleAttack: Math.random() < 0.55,
    });
    this.titanEntry = { born: time };
    this.sharks.sort((a, b) => a.length - b.length);
  }

  /** A sawshark sweeps its blade through the fish ahead of it every so often, cutting a few down. */
  private stepSlices() {
    const { time } = this;
    for (const sh of this.sharks) {
      if (sh.kind !== "sawshark" || sh.mega || sh.grabbed) continue;
      // Special case: with a saucer to cut in half, it ignores the fish.
      if (sh.ufoCharge) {
        if (!this.ufo) sh.ufoCharge = false;
        else if (Math.hypot(sh.nodes[0] - this.ufo.x, sh.nodes[1] - this.ufo.y) < 85) {
          this.destroyUfo("sawed");
          sh.nextSlice = time + rand(10, 16);
        }
        continue;
      }
      sh.nextSlice ??= time + rand(4, 9);
      if (time < sh.nextSlice) continue;
      const reach = sh.length * 0.4;
      const hx = sh.nodes[0];
      const hy = sh.nodes[1];
      const near = this.fish
        .filter((f) => f.alive && !f.diver && f.temp === undefined)
        .map((f) => ({ f, d: Math.hypot(f.x - hx, f.y - hy), off: Math.abs(angleDiff(sh.heading, Math.atan2(f.y - hy, f.x - hx))) }))
        .filter((e) => e.d < reach && e.off < 0.9)
        .sort((a, b) => a.d - b.d)
        .slice(0, randInt(2, 4));
      if (!near.length) { sh.nextSlice = time + 1.5; continue; }
      for (const { f } of near) {
        f.alive = false;
        f.respawnAt = time + rand(4, 9);
        this.events.push({ kind: "eat", x: f.x, y: f.y });
      }
      sh.sliceUntil = time + 0.4;
      sh.nextSlice = time + rand(8, 15);
    }
  }

  // ── ufo and divers ───────────────────────────────────────────────────

  private spawnUfo() {
    if (this.ufos.length >= 3) return;
    const { width: W, height: H } = this;
    const side = randInt(0, 1);
    // Each new saucer takes its own lane and hover height, so they never settle on top of one another.
    const lane = Math.max(150, Math.min(W, H) * 0.2);
    let tx = rand(W * 0.25, W * 0.75);
    for (let tries = 0; tries < 8 && this.ufos.some((o) => Math.abs(o.tx - tx) < lane); tries++) tx = rand(W * 0.15, W * 0.85);
    this.ufos.push({
      x: side === 0 ? -90 : W + 90, y: -40, hy: H * rand(0.12, 0.2) + this.ufos.length * H * 0.1, tx, state: "enter",
      phase: 0, beamUntil: 0, beams: 0, maxBeams: this.invasion ? randInt(3, 4) : randInt(2, 3), beamX: 0, aim: null, waited: 0,
      pilot: null, huntSharks: false, targetShark: null, hijackChecked: false, keep: false, got: 0, fast: false, boarded: false, held: false,
    });
    if (this.invasion) this.invasion.spawned++;
    else if (this.ufos.length >= 3) this.startInvasion();
    // Sometimes a sawshark sets out to cut the saucer in half.
    const saws = this.sharks.filter((sh) => sh.kind === "sawshark" && !sh.mega && !sh.grabbed);
    if (saws.length && Math.random() < 0.4) saws[randInt(0, saws.length - 1)].ufoCharge = true;
  }

  /** Is a shark (the head, middle or tail) under this column? The saucer waits rather than beam over one. */
  private columnBlocked(x: number) {
    return this.sharks.some((sh) => !sh.mega && [0, 6, 12, 18].some((n) => Math.abs(sh.nodes[n * 2] - x) < 115 && sh.nodes[n * 2 + 1] > 60));
  }

  /** Something worth abducting: a diver, a jellyfish, or a fish. */
  private pickAbductionTarget(): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 8; attempt++) {
      const pick = this.pickAbductionCandidate();
      const chasedDiver = this.fish.some((f) => f.diver && f.alive && Math.abs(f.x - (pick?.x ?? -1)) < 2 && this.sharks.some((sh) => sh.target === f));
      if (pick && (chasedDiver || !this.columnBlocked(pick.x))) return pick;
    }
    return null;
  }

  private pickAbductionCandidate(): { x: number; y: number } | null {
    // A diver a shark is chasing is the best prize.
    const chased = this.fish.filter((f) => f.diver && f.alive && !f.riding && this.sharks.some((sh) => sh.target === f));
    if (chased.length && Math.random() < 0.85) return { x: chased[0].x, y: chased[0].y };
    const divers = this.fish.filter((f) => f.diver && f.alive && !f.riding);
    const out = divers.filter((f) => (f.stunUntil ?? 0) > this.time && !f.seized);
    if (out.length && Math.random() < 0.8) return { x: out[0].x, y: out[0].y };
    const roll = Math.random();
    if (divers.length && roll < 0.4) { const d = divers[randInt(0, divers.length - 1)]; return { x: d.x, y: d.y }; }
    if (this.jellies.length && roll < 0.7) { const j = this.jellies[randInt(0, this.jellies.length - 1)]; return { x: j.x, y: j.y }; }
    const fish = this.fish.filter((f) => f.alive && !f.diver && f.temp === undefined && f.y > this.height * 0.25);
    if (!fish.length) return null;
    const f = fish[randInt(0, fish.length - 1)];
    return { x: f.x, y: f.y };
  }

  /** The saucer is gone: its pilot falls back into the water, and a sawed ufo leaves two halves. */
  private destroyUfo(how: "smashed" | "sawed" | "crushed" | "shot" | "blasted", target?: Ufo) {
    const u = target ?? this.ufo;
    if (!u) return;
    if (u.pilot && u.pilot.alive) { delete u.pilot.riding; u.pilot.vx = 0; u.pilot.vy = 30; }
    if (u.targetShark) u.targetShark.lifted = false;
    for (const sh of this.sharks) sh.ufoCharge = false;
    this.events.push({ kind: "eat", x: u.x, y: u.y });
    this.splash(u.x, u.y, how === "sawed" ? 2 : 2.2);
    // It breaks into two halves that drift apart, whatever did it (a smashed one is flung harder).
    const kick = how === "smashed" ? 90 : 38;
    this.debris.push({ x: u.x, y: u.y, vx: -kick, vy: 12, side: -1, born: this.time }, { x: u.x, y: u.y, vx: kick, vy: 12, side: 1, born: this.time });
    this.notices.push(how === "smashed" ? "the megalodon smashed the ufo... scrap everywhere!" : how === "crushed" ? "the kraken crushed the ufo... crunch!" : how === "shot" ? "a diver shot the ufo down... pew pew!" : how === "blasted" ? "a bomber blew up the ufo... kaboom!" : "the sawshark cut the ufo in half... zzzip!");
    // Whatever brought it down, the wreck leaves scrap drifting in the water.
    const scrap: [string, string][] = [["=", "190,200,215"], ["#", "150,160,180"], ["%", "210,215,225"], ["+", "120,235,255"], ["o", "230,235,240"], ["|", "170,180,200"]];
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      const sp = rand(15, 80);
      const [glyph, rgb] = scrap[i % scrap.length];
      this.mess.push({ x: u.x + Math.cos(a) * rand(0, 40), y: u.y + Math.sin(a) * rand(0, 24), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: this.time, glyph, rgb });
    }
    // A tech diver comes in to pick through the wreck (one at a time).
    if (!this.techQueue.length && !this.fish.some((f) => f.dkind === "tech" && f.alive)) this.techQueue.push({ x: u.x, y: Math.min(u.y + 60, this.height * 0.8), at: this.time + rand(2, 4) });
    // Remove this very saucer (not just the oldest one), and count it against the invasion.
    this.ufos = this.ufos.filter((o) => o !== u);
    if (this.invasion) this.invasion.killed++;
  }

  /** Each saucer takes its turn as the primary one, so the single-saucer logic runs for all of them. */
  private stepUfos(dt: number) {
    const order = [...this.ufos];
    for (const u of order) {
      if (!this.ufos.includes(u)) continue;
      this.ufos = [u, ...this.ufos.filter((o) => o !== u)];
      this.stepUfo(dt);
    }
    this.ufos = order.filter((u) => this.ufos.includes(u));
    // Saucers never overlap: any two that drift together are eased apart (sideways while flying, up and down while beaming).
    const sep = Math.max(120, Math.min(this.width, this.height) * 0.17);
    const ease = Math.min(1, dt * 3);
    for (let i = 0; i < this.ufos.length; i++) {
      for (let j = i + 1; j < this.ufos.length; j++) {
        const a = this.ufos[i];
        const b = this.ufos[j];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d >= sep) continue;
        const push = (sep - d) * 0.5 * ease;
        const nx = d > 1e-3 ? (b.x - a.x) / d : 1;
        const ny = d > 1e-3 ? (b.y - a.y) / d : 0;
        if (!a.held) { if (a.state === "beam") a.y -= Math.abs(ny) * push + push * 0.3; else { a.x -= nx * push; a.y -= ny * push; } }
        if (!b.held) { if (b.state === "beam") b.y += Math.abs(ny) * push + push * 0.3; else { b.x += nx * push; b.y += ny * push; } }
      }
    }
    this.stepInvasion();
  }

  private startSaga(kind: "moon" | "clash" | "meteor", title: string, rgb: string, duration: number, banner: string, notice: string) {
    const { time } = this;
    const slot = this.sagas.length + (this.invasion ? 1 : 0);
    this.sagas.push({ kind, title, rgb, born: time, until: time + duration, count: 0 });
    this.callout(this.width / 2, this.height * (0.2 + 0.07 * slot), banner, rgb);
    this.notices.push(notice);
    if (kind === "meteor") this.nextMeteorAt = time + 1.5;
    if (kind === "moon") {
      this.nextMoonTech = time + 6;
      // The hungry sea sometimes brings its biggest hunter.
      if (!this.kraken && !this.sharks.some((s) => s.mega) && Math.random() < 0.6) this.spawnMegalodon();
    }
  }

  private stepSaga(dt: number) {
    for (const sg of [...this.sagas]) this.stepOneSaga(sg, dt);
    if (!this.sagas.some((s) => s.kind === "meteor")) this.meteors.length = 0;
  }

  private stepOneSaga(sg: World["sagas"][number], dt: number) {
    const { time, width: W, height: H } = this;
    if (sg.kind === "clash") {
      if (time - sg.born > 4 && !this.kraken && !this.sharks.some((s) => s.mega)) {
        this.sagas = this.sagas.filter((q) => q !== sg);
        this.callout(W / 2, H * 0.2, "THE TITANS PART...", "235,235,245");
        this.notices.push("the titans have parted... the water settles...");
      }
      return;
    }
    if (time >= sg.until) {
      this.sagas = this.sagas.filter((q) => q !== sg);
      if (sg.kind === "moon") {
        this.callout(W / 2, H * 0.2, "THE MOON SETS...", "255,190,160");
        this.notices.push("the blood moon sets... the sea breathes again...");
      } else {
        this.callout(W / 2, H * 0.2, "THE SKY CLEARS...", "255,210,150");
        this.notices.push(`the sky clears... ${sg.count} meteors fell!`);
      }
      return;
    }
    if (sg.kind === "moon") {
      // The sharks never stop being hungry, and armed divers keep arriving to hold them off.
      for (const sh of this.sharks) if (!sh.mega && !sh.grabbed) sh.hunger = Math.max(sh.hunger, 0.9);
      if (time >= this.nextMoonTech) {
        this.nextMoonTech = time + rand(10, 14);
        if (this.fish.filter((f) => f.dkind === "tech" && f.alive).length < 3) {
          const edge = randInt(0, 3);
          this.fish.push({
            x: edge === 2 ? -20 : edge === 3 ? W + 20 : rand(W * 0.1, W * 0.9), y: edge === 0 ? -20 : edge === 1 ? H + 20 : rand(H * 0.15, H * 0.85),
            vx: edge === 2 ? 30 : edge === 3 ? -30 : 0, vy: edge === 0 ? 30 : edge === 1 ? -30 : 0, species: 0, alarm: 0, alive: true,
            respawnAt: Infinity, phase: rand(0, TAU), turn: 0, depth: 1, millDir: 1, temp: time + 160, diver: true, dkind: "tech", equipUntil: time, nextShot: time + rand(1, 3),
          });
          sg.count++;
        }
      }
      return;
    }
    // Meteors: burning rocks fall in from above and slam into the water at random depths.
    if (time >= this.nextMeteorAt) {
      this.nextMeteorAt = time + rand(0.5, 1.4);
      const x0 = rand(W * 0.05, W * 1.0);
      const slope = rand(-0.5, 0.5);
      const speed = rand(520, 760);
      this.meteors.push({ x: x0, y: -40, vx: slope * speed, vy: speed, ty: H * rand(0.35, 0.92), born: time });
    }
    for (const m of this.meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
    for (const m of this.meteors.filter((q) => q.y >= q.ty)) this.meteorImpact(m.x, m.y);
    this.meteors = this.meteors.filter((q) => q.y < q.ty && q.x > -200 && q.x < W + 200);
  }

  private meteorImpact(x: number, y: number) {
    const { time } = this;
    const R = 170;
    const shower = this.sagas.find((s) => s.kind === "meteor");
    if (shower) shower.count++;
    this.bombs.push({ x, y, born: time, r: R });
    this.splash(x, y, 2.6);
    this.events.push({ kind: "eat", x, y });
    for (const o of this.fish) {
      if (!o.alive || o.diver) continue;
      if (Math.hypot(o.x - x, o.y - y) < R * 0.8) { o.alive = false; o.respawnAt = time + rand(4, 9); }
    }
    for (const o of this.fish) {
      if (!o.alive || !o.diver || o.dkind === "tech") continue;
      if (Math.hypot(o.x - x, o.y - y) < R * 0.6) { o.vx += (o.x - x) * 2; o.vy += (o.y - y) * 2; o.stunUntil = time + 2; }
    }
    for (const sh of this.sharks) {
      if (sh.mega) continue;
      if (Math.hypot(sh.nodes[0] - x, sh.nodes[1] - y) < R * 1.3) { sh.heading = Math.atan2(sh.nodes[1] - y, sh.nodes[0] - x); sh.speed = 170; sh.target = null; sh.alertUntil = time + 1.5; }
    }
    for (const u of [...this.ufos]) {
      if (Math.hypot(u.x - x, u.y - y) < R) { this.callout(u.x, u.y - 40, "UFO HIT BY A METEOR", "255,170,80"); this.destroyUfo("blasted", u); }
    }
    // Some leave glowing scrap behind, and a tech diver comes to salvage it.
    if (Math.random() < 0.4) {
      const scrap: [string, string][] = [["#", "255,150,70"], ["%", "200,110,60"], ["*", "255,220,120"], ["o", "170,170,180"], ["=", "140,140,150"]];
      for (let i = 0; i < 12; i++) {
        const a = rand(0, TAU);
        const sp = rand(10, 60);
        const [glyph, rgb] = scrap[i % scrap.length];
        this.mess.push({ x: x + Math.cos(a) * rand(0, 30), y: y + Math.sin(a) * rand(0, 20), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
      }
      if (!this.techQueue.length && !this.fish.some((f) => f.dkind === "tech" && f.alive)) this.techQueue.push({ x, y: Math.min(y + 40, this.height * 0.8), at: time + rand(2, 4) });
    }
    if (Math.random() < 0.25) this.callout(x, y - 50, "METEOR STRIKE!", "255,170,80");
  }

  /** The third saucer has arrived: the aliens are invading. A fixed number of saucers come in waves until all are down or gone. */
  private startInvasion() {
    this.invasion = { total: 7, spawned: this.ufos.length, killed: 0, escaped: 0, nextAt: this.time + rand(7, 11), born: this.time, banner: this.time };
    this.callout(this.width / 2, this.height * (0.2 + 0.07 * this.sagas.length), "THE ALIENS ARE INVADING!", "120,255,150");
    this.notices.push("the aliens are invading!!! hold the line...");
  }

  private stepInvasion() {
    // An invasion starts whenever a third saucer is out, and a queued event starts the moment its own kind is free.
    if (!this.invasion && this.ufos.length >= 3) this.startInvasion();
    for (let i = 0; i < this.sagaQueue.length; i++) {
      const next = this.sagaQueue[i];
      if (this.sagas.some((s) => s.kind === next)) continue;
      if (next === "clash" && (this.kraken || this.sharks.some((s) => s.mega))) continue;
      this.sagaQueue.splice(i, 1);
      this.triggerEvent(next === "clash" ? "saga" : next);
      break;
    }
    const inv = this.invasion;
    if (!inv) return;
    const { time } = this;
    if (inv.spawned < inv.total && this.ufos.length < 3 && time >= inv.nextAt) {
      inv.nextAt = time + rand(6, 11);
      this.spawnUfo();
    }
    if (inv.spawned >= inv.total && this.ufos.length === 0) {
      this.invasion = null;
      if (inv.killed >= Math.ceil(inv.total / 2)) {
        this.callout(this.width / 2, this.height * 0.2, "THE INVASION HAS BEEN REPELLED!", "150,255,190");
        this.notices.push("the invasion has been repelled!!! the sea is safe... for now");
      } else {
        this.callout(this.width / 2, this.height * 0.2, "THE ALIENS ESCAPED...", "255,200,120");
        this.notices.push("the aliens slipped away... they will be back...");
      }
    } else if (time - inv.born > 360) this.invasion = null;
  }

  private stepUfo(dt: number) {
    const u = this.ufo;
    if (!u) return;
    const { time, width: W } = this;
    u.phase += dt;
    // A diver at the controls rides on top of the dome.
    if (u.pilot) {
      if (!u.pilot.alive) u.pilot = null;
      else {
        const p = u.pilot;
        p.riding = true;
        p.vx = 0;
        p.vy = 0;
        if (u.boarded) { p.x = u.x; p.y = u.y - 30; }
        else {
          // The diver swims up to the saucer first and climbs aboard.
          const bx = u.x - p.x;
          const by = u.y - 30 - p.y;
          const bd = Math.hypot(bx, by) || 1;
          if (bd < 14) { u.boarded = true; this.notices.push("the diver is at the controls... uh oh!"); }
          else { const s = Math.min(bd * 3, 190) * dt; p.x += (bx / bd) * s; p.y += (by / bd) * s; p.vx = (bx / bd) * 60; p.vy = (by / bd) * 60; p.phase += dt * 8; }
        }
      }
    }
    // In the kraken's arms the kraken moves it; the pilot (if any) rides along above.
    if (u.held) return;
    const move = (tx: number, ty: number, speed: number) => {
      const dx = tx - u.x;
      const dy = ty - u.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = Math.min(speed, d * 3);
      u.x += (dx / d) * s * dt;
      u.y += (dy / d) * s * dt;
      return d;
    };
    // The saucer gives way to any shark that gets close.
    for (const sh of this.sharks) {
      for (const n of [0, 5, 10]) {
        const ox = u.x - sh.nodes[n * 2];
        const oy = u.y - sh.nodes[n * 2 + 1];
        const od = Math.hypot(ox, oy) || 1;
        if (od < 120) { u.x += (ox / od) * (120 - od) * 3 * dt; u.y += (oy / od) * (120 - od) * 3 * dt; }
      }
    }
    if (u.state === "enter") {
      if (move(u.tx, u.hy, 130) < 8) u.state = "seek";
    } else if (u.state === "seek") {
      u.beamX = u.x;
      // Once per visit, a diver may take over the saucer and go after a shark.
      if (!u.pilot && !u.hijackChecked && u.y < this.height) {
        const crew = this.fish.filter((f) => f.diver && f.alive && !f.riding && f.y > 40);
        // One chance per eligible visit, rather than retrying until a hijack happens.
        if (crew.length) {
          u.hijackChecked = true;
          if (Math.random() < 0.4) {
            u.pilot = crew[randInt(0, crew.length - 1)];
            u.pilot.riding = true;
            u.huntSharks = Math.random() < 0.5;
            u.maxBeams = 2;
            this.notices.push("a diver is hijacking the ufo!");
          }
        }
      }
      // Wait for the pilot to get aboard before heading off.
      if (u.pilot && !u.boarded) { u.beamX = u.x; return; }
      if (u.pilot && u.huntSharks && !u.targetShark && !u.aim) {
        const prey = this.sharks
          .filter((sh) => !sh.mega && !sh.grabbed && !sh.ufoCharge && sh.nodes[1] > u.hy + 140 && !(this.fight && (sh === this.fight.a || sh === this.fight.b)))
          .sort((a, b) => Math.abs(a.nodes[0] - u.x) - Math.abs(b.nodes[0] - u.x));
        if (prey.length) u.targetShark = prey[0];
      }
      if (u.targetShark) u.aim = { x: u.targetShark.nodes[0], y: u.targetShark.nodes[1] };
      if (!u.aim) {
        u.aim = this.pickAbductionTarget();
        // No clear column right now: hover and look again, and only give up after a few seconds.
        if (!u.aim) { u.waited += dt; if (u.waited > 7) u.state = "leave"; } else u.waited = 0;
      } else {
        move(u.aim.x, u.hy + Math.sin(u.phase * 2) * 4, 140);
        if (Math.abs(u.x - u.aim.x) < (u.targetShark ? 16 : 10)) {
          u.state = "beam";
          // Now and then a piloted saucer means to keep its shark, and hauls it right up.
          u.keep = !!u.targetShark && Math.random() < 0.35;
          u.beamUntil = time + (u.keep ? 9 : u.targetShark ? 2.8 : 3.4);
        }
      }
    } else if (u.state === "beam") {
      u.beamX = u.x;
      u.y = u.hy + Math.sin(u.phase * 2) * 4;
      // A piloted saucer drags a shark up by its beam; the shark thrashes and (below) breaks free.
      const ts = u.targetShark;
      if (ts) {
        ts.lifted = true;
        for (let n = 0; n < SHARK_NODES; n++) {
          ts.nodes[n * 2 + 1] -= (u.keep ? 80 : 32) * dt;
          ts.nodes[n * 2] += (u.beamX - ts.nodes[0]) * dt;
        }
        if (u.keep && ts.nodes[1] < u.y + 50) {
          this.sharks = this.sharks.filter((sh) => sh !== ts);
          this.events.push({ kind: "eat", x: ts.nodes[0], y: ts.nodes[1] });
          this.splash(ts.nodes[0], ts.nodes[1], 1.8);
          this.notices.push("the ufo abducted a shark and bolted!");
          this.callout(u.x, u.y + 50, "UFO TAKES SHARK", "170,255,205");
          this.growNext = true;
          this.nextSharkDrift = Math.min(this.nextSharkDrift, time + rand(10, 18));
          u.targetShark = null;
          u.keep = false;
          u.fast = true;
          u.state = "leave";
          return;
        }
      }
      // Everything inside the beam rises toward the saucer and vanishes into it.
      for (const f of this.fish) {
        if (!f.alive || f.dragger || f.seized || f.y < u.y || Math.abs(f.x - u.beamX) > 55) continue;
        f.y -= (f.diver ? 170 : 88) * dt;
        f.x += (u.beamX - f.x) * dt * 2;
        f.vx *= 0.9;
        f.vy = Math.min(f.vy, -40);
        if (f.y < u.y + 26) {
          if (f.diver && this.sharks.some((sh) => sh.target === f)) this.notices.push("the ufo stole a diver from a shark... sneaky!");
          f.alive = false;
          f.respawnAt = f.diver ? Infinity : time + rand(6, 12);
          u.got++;
        }
      }
      for (const j of this.jellies) {
        if (j.y < u.y || Math.abs(j.x - u.beamX) > 55) continue;
        j.y -= 80 * dt;
        j.x += (u.beamX - j.x) * dt * 2;
        if (j.y < u.y + 26) { j.y = -9999; u.got++; }
      }
      this.jellies = this.jellies.filter((j) => j.y > -9000);
      // A shark drifting under the beam ends it early: nothing gets in the saucer's way.
      const blocked = this.sharks.some((sh) => !sh.mega && sh !== ts && Math.abs(sh.nodes[0] - u.beamX) < 90 && sh.nodes[1] > u.y);
      if (blocked || time > u.beamUntil) {
        if (ts) {
          ts.lifted = false;
          this.splash(ts.nodes[0], ts.nodes[1], 1.8);
          this.notices.push("the shark broke free!");
          u.targetShark = null;
        }
        u.beams += blocked ? 0.5 : 1;
        u.aim = null;
        u.keep = false;
        // With a catch aboard it sometimes grabs and runs rather than going back for more.
        if (u.got > 0 && !blocked && Math.random() < 0.5) { u.fast = true; this.notices.push("the ufo grabbed its catch and bolted!"); }
        u.got = 0;
        u.state = u.beams >= u.maxBeams || u.fast ? "leave" : "seek";
      }
    } else {
      move(u.x + (u.x < W / 2 ? -600 : 600), -140, u.fast ? 440 : 230);
      if (u.y < -90) {
        if (u.pilot) u.pilot.alive = false;
        if (u.targetShark) u.targetShark.lifted = false;
        for (const sh of this.sharks) sh.ufoCharge = false;
        if (this.invasion) this.invasion.escaped++;
        this.ufo = null;
      }
    }
  }

  /** A click on a diver pops it. Returns true if one was hit. */
  popDiverAt(x: number, y: number): boolean {
    let hit: Fish | null = null;
    let best = 42;
    for (const f of this.fish) {
      if (!f.diver || !f.alive) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < best) { best = d; hit = f; }
    }
    if (!hit) return false;
    this.popDiver(hit);
    return true;
  }

  private popDiver(f: Fish) {
    const { x, y } = f;
    f.alive = false;
    if (f.riding) {
      delete f.riding;
      if (this.ufo && this.ufo.pilot === f) this.ufo.pilot = null;
    }
    if (f.dragger) { f.dragger.dragging = undefined; delete f.dragger; }
    if (f.seized) { delete f.seized; if (this.kraken) this.kraken.caught = this.kraken.caught.filter((o) => o !== f); }
    this.events.push({ kind: "eat", x, y });
    this.splash(x, y, 1.6);
    this.blasts.push({ x, y, born: this.time });
    // Bits of suit, fin, tank and mask fly out and slowly sink.
    const suit = DIVER_SUIT[f.dkind ?? "scuba"];
    const bits: [string, string][] = [["*", suit], ["#", suit], ["=", "70,120,210"], ["~", "90,150,235"], f.dkind === "treasure" ? ["$", "255,215,80"] : ["o", "205,212,222"], ["O", "255,236,205"], [":", suit]];
    for (let i = 0; i < 9; i++) {
      const a = rand(0, TAU);
      const sp = rand(30, 110);
      const [glyph, rgb] = bits[i % bits.length];
      this.mess.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: this.time, glyph, rgb });
    }
    // The nearest shark that is free comes to tidy up.
    let tidy: Shark | null = null;
    let td = Infinity;
    for (const sh of this.sharks) {
      if (sh.mega || sh.grabbed || sh.lifted || sh.ufoCharge || (this.fight && (sh === this.fight.a || sh === this.fight.b))) continue;
      const d = Math.hypot(sh.nodes[0] - x, sh.nodes[1] - y);
      if (d < td) { td = d; tidy = sh; }
    }
    if (tidy) { tidy.cleaning = true; tidy.target = null; tidy.alertUntil = this.time + 1.2; }
  }

  private stepMess(dt: number) {
    const { time } = this;
    for (const m of this.mess) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= Math.pow(0.35, dt);
      m.vy = m.vy * Math.pow(0.35, dt) + 8 * dt;
    }
    for (const sh of this.sharks) {
      if (!sh.cleaning) continue;
      const reach = sh.length * 0.05 + 16;
      this.mess = this.mess.filter((m) => {
        const eaten = (m.x - sh.nodes[0]) ** 2 + (m.y - sh.nodes[1]) ** 2 < reach * reach;
        if (eaten) sh.hunger = Math.max(0, sh.hunger - 0.02);
        return !eaten;
      });
    }
    this.mess = this.mess.filter((m) => time - m.born < 30);
    this.blasts = this.blasts.filter((b) => time - b.born < 0.8);
    this.callouts = this.callouts.filter((c) => time - c.born < 5);
    if (!this.mess.length) for (const sh of this.sharks) sh.cleaning = false;
  }

  private spawnDivers(): boolean {
    if (this.fish.filter((f) => f.diver && f.alive).length + this.diverQueue.length >= this.diverCap) return false;
    // Every call drops one in at once and may trail a couple more behind it; spam it for a crowd.
    const count = 1 + Math.floor(Math.pow(Math.random(), 1.8) * 3);
    let at = this.time;
    for (let i = 0; i < count; i++) { this.diverQueue.push(at); at += rand(0.6, 2); }
    return true;
  }

  private callout(x: number, y: number, text: string, rgb = "255,255,255") {
    this.callouts.push({ x, y, text, rgb, born: this.time });
  }

  private pickDiverKind(): DiverKind {
    const kinds: [DiverKind, number][] = [["scuba", 0.3], ["photo", 0.15], ["treasure", 0.13], ["snorkel", 0.12], ["scooter", 0.2], ["bomber", 0.1]];
    let roll = Math.random();
    for (const [kind, w] of kinds) { roll -= w; if (roll <= 0) return kind; }
    return "scuba";
  }

  /**
   * A bomber goes off: a fireball and shockwave that shoves sharks away, kills fish, stuns divers, frees whatever the
   * kraken is holding, blows up ufos, and shifts the tug of war against whichever titan is closer.
   */
  private explode(x: number, y: number, src?: Fish) {
    const { time } = this;
    const R = 300;
    if (src) {
      src.alive = false;
      delete src.seized;
      if (src.dragger) { src.dragger.dragging = undefined; src.dragger = undefined; }
    }
    this.bombs.push({ x, y, born: time, r: R });
    this.splash(x, y, 3.4);
    this.events.push({ kind: "eat", x, y });
    this.callout(x, y - 50, "BOOM!", "255,190,70");
    for (const sh of this.sharks) {
      if (sh.mega) continue;
      const d = Math.hypot(sh.nodes[0] - x, sh.nodes[1] - y);
      if (d > R * 1.2) continue;
      sh.heading = Math.atan2(sh.nodes[1] - y, sh.nodes[0] - x);
      sh.speed = 190;
      sh.target = null;
      sh.alertUntil = time + 2;
      sh.dragging = undefined;
    }
    for (const o of this.fish) {
      if (!o.alive || o === src) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d > R * 1.6) continue;
      o.alarm = 1;
      if (!o.diver) {
        if (d < R) { o.alive = false; o.respawnAt = time + rand(4, 9); }
      } else if (o.dkind === "bomber" && o.fuseAt === undefined && d < R * 0.7) {
        o.fuseAt = time + 0.5;
      } else if (o.dkind !== "tech" && d < R * 0.8) {
        const a = Math.atan2(o.y - y, o.x - x);
        o.vx = Math.cos(a) * 240;
        o.vy = Math.sin(a) * 240;
        o.stunUntil = time + 2.5;
      }
    }
    for (const u of [...this.ufos]) {
      if (Math.hypot(u.x - x, u.y - y) >= R + 120) continue;
      if (this.kraken && u === this.ufo) this.kraken.ufoHeld = false;
      u.held = false;
      this.callout(u.x, u.y - 40, "UFO BLOWN UP", "255,110,100");
      this.destroyUfo("blasted", u);
    }
    const k = this.kraken;
    if (k) {
      const kd = Math.hypot(k.x - x, k.y - y);
      if (kd < R + k.size * 0.6) {
        // Whatever it is holding is blown out of its arms, and it loses its grip on the next catch for a while.
        for (const f of k.caught) {
          delete f.seized;
          const a = Math.atan2(f.y - y, f.x - x);
          f.vx = Math.cos(a) * 240;
          f.vy = Math.sin(a) * 240;
        }
        k.caught = [];
        for (const sh of k.grabbed) { sh.grabbed = false; sh.devourAt = undefined; }
        k.grabbed = [];
        k.strike = null;
        k.nextCatch = time + 4;
        k.nextGrab = time + 6;
        const a = Math.atan2(k.y - y, k.x - x);
        k.x += Math.cos(a) * 50;
        k.y += Math.sin(a) * 50;
        if (k.state === "wrap") k.tilt = clamp(k.tilt - 0.22, -1, 1);
      }
    }
    const mega = this.sharks.find((s) => s.mega);
    if (mega && k?.state === "wrap" && Math.hypot(mega.nodes[0] - x, mega.nodes[1] - y) < R + mega.length * 0.3 && k) k.tilt = clamp(k.tilt + 0.22, -1, 1);
  }

  /**
   * A tech diver's laser at the kraken: it cuts an arm that is mid-grab, frees something the kraken is holding (a diver,
   * a shark or a ufo), or just stings it. Returns true if he used the shot.
   */
  private techVsKraken(f: Fish, k: Kraken) {
    const { time } = this;
    const bolt = () => { this.bolts.push({ x0: f.x, y0: f.y, x1: k.x, y1: k.y, born: time }); f.flashAt = time; };
    if (k.strike) {
      k.strike = null;
      k.nextCatch = time + 4;
      bolt();
      this.callout(k.x, k.y - k.size * 0.3, "TENTACLE SHOT", "175,100,255");
      return true;
    }
    const held: ("diver" | "shark" | "ufo")[] = [];
    if (k.caught.some((d) => d !== f)) held.push("diver");
    if (k.grabbed.length) held.push("shark");
    if (k.ufoHeld) held.push("ufo");
    if (held.length && Math.random() < 0.75) {
      const what = held[randInt(0, held.length - 1)];
      bolt();
      if (what === "diver") {
        const d = k.caught.find((o) => o !== f)!;
        delete d.seized;
        const a = Math.atan2(d.y - k.y, d.x - k.x);
        d.vx = Math.cos(a) * 240;
        d.vy = Math.sin(a) * 240;
        k.caught = k.caught.filter((o) => o !== d);
        this.callout(d.x, d.y - 30, "DIVER FREED", "175,100,255");
      } else if (what === "shark") {
        const s = k.grabbed[0];
        s.grabbed = false;
        s.devourAt = undefined;
        k.grabbed = k.grabbed.filter((o) => o !== s);
        this.callout(s.nodes[0], s.nodes[1] - 40, "SHARK FREED", "175,100,255");
      } else if (this.ufo) {
        k.ufoHeld = false;
        this.ufo.held = false;
        this.ufo.fast = true;
        this.ufo.state = "leave";
        this.callout(this.ufo.x, this.ufo.y - 40, "UFO FREED", "175,100,255");
      }
      k.nextCatch = time + 3;
      return true;
    }
    if (k.state === "wrap") {
      // Shooting the kraken while it wrestles the megalodon tips the fight toward the megalodon.
      k.tilt = clamp(k.tilt - 0.1, -1, 1);
      bolt();
      this.callout(k.x, k.y - k.size * 0.3, "KRAKEN HIT", "175,100,255");
      return true;
    }
    return false;
  }

  /** Is this diver actually in the water (not still on his way in from an edge)? */
  private onScreen(f: Fish) {
    return f.x > 20 && f.x < this.width - 20 && f.y > 30 && f.y < this.height - 20;
  }

  /**
   * A tech diver fires his blaster: at a ufo (three hits bring one down), at a fish, or just past a passing shark for show.
   * He never hits a shark.
   */
  private blasterFire(f: Fish) {
    const { time } = this;
    const u = this.ufos.filter((o) => !o.held && Math.hypot(o.x - f.x, o.y - f.y) < 620).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0] ?? null;
    const kr = this.kraken;
    const mg = this.sharks.find((s) => s.mega);
    // Titans first: a shot at the kraken cuts a grab short, and a shot at the megalodon draws it onto him.
    if (kr && Math.hypot(kr.x - f.x, kr.y - f.y) < kr.size * 1.4 + 500 && (kr.strike || kr.caught.length || kr.grabbed.length || kr.ufoHeld || Math.random() < 0.4) && this.techVsKraken(f, kr)) return;
    if (mg && !mg.retreat && Math.hypot(mg.nodes[0] - f.x, mg.nodes[1] - f.y) < 1300 && Math.random() < 0.3) {
      this.bolts.push({ x0: f.x, y0: f.y, x1: mg.nodes[0], y1: mg.nodes[1], born: time });
      f.flashAt = time;
      mg.biteTarget = { fish: f, until: time + 7 };
      this.callout(mg.nodes[0], mg.nodes[1] - 60, "MEGALODON PROVOKED", "175,100,255");
      if (kr?.state === "wrap") kr.tilt = clamp(kr.tilt + 0.1, -1, 1);
      return;
    }
    let tx: number;
    let ty: number;
    if (u && !u.held && Math.hypot(u.x - f.x, u.y - f.y) < 620 && Math.random() < 0.6) {
      tx = u.x;
      ty = u.y;
      u.hits = (u.hits ?? 0) + 1;
      this.splash(u.x, u.y, 1.2);
      if (u.hits >= 3) { this.callout(u.x, u.y - 40, "UFO SHOT DOWN", "255,110,100"); this.destroyUfo("shot", u); }
      else this.callout(u.x, u.y - 40, "UFO HIT", "255,200,120");
    } else {
      let victim: Fish | null = null;
      let vd = 460;
      for (const o of this.fish) {
        if (!o.alive || o.diver || o.temp !== undefined || o.y < 40) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d < vd) { vd = d; victim = o; }
      }
      if (victim) {
        tx = victim.x;
        ty = victim.y;
        victim.alive = false;
        victim.respawnAt = time + rand(4, 9);
        this.events.push({ kind: "eat", x: tx, y: ty });
      } else {
        // Nothing worth shooting: a warning shot past the nearest shark.
        const sh = this.sharks.find((s) => !s.mega && Math.hypot(s.nodes[0] - f.x, s.nodes[1] - f.y) < 700);
        tx = sh ? sh.nodes[0] + rand(-60, 60) : f.x + rand(-300, 300);
        ty = sh ? sh.nodes[1] + rand(-60, 60) : f.y + rand(-200, 100);
      }
    }
    this.bolts.push({ x0: f.x, y0: f.y, x1: tx, y1: ty, born: time });
    f.flashAt = time;
  }

  /** A tech diver's one chance to blast himself out of a grab: true if he got away. */
  private blasterEscape(f: Fish, chance: number, fromX: number, fromY: number, text = "BLASTED FREE") {
    if (f.dkind !== "tech" || f.escapeRoll === false) return false;
    f.escapeRoll ??= Math.random() < chance;
    if (!f.escapeRoll) return false;
    f.escapeRoll = false;
    const a = Math.atan2(f.y - fromY, f.x - fromX);
    f.vx = Math.cos(a) * 260;
    f.vy = Math.sin(a) * 260;
    this.bolts.push({ x0: f.x, y0: f.y, x1: fromX, y1: fromY, born: this.time });
    f.flashAt = this.time;
    this.callout(f.x, f.y - 30, text, "120,255,170");
    return true;
  }

  /** Where in the water (as a fraction of the height) a diver likes to swim. */
  private diverDepth(f: Fish) {
    return f.dkind === "snorkel" ? rand(0.07, 0.18) : rand(0.25, 0.7);
  }

  /** The spot photographers and rescuers head for: a kraken fight, a shark fight, or a kraken holding sharks. */
  private spectacle(): { x: number; y: number; rescue: boolean } | null {
    const k = this.kraken;
    if (k && (k.state === "wrap" || k.state === "grab")) return { x: k.x, y: k.y, rescue: k.state === "grab" && k.grabbed.length > 0 };
    if (this.fight?.engaged) return { x: this.fight.mx, y: this.fight.my, rescue: false };
    return null;
  }

  /** Divers swim slowly between random spots, bolt from nearby sharks, and are chased down. */
  private stepDivers(dt: number) {
    const { time, width: W, height: H } = this;
    if (this.diverQueue.length) {
      const due = this.diverQueue.filter((t) => t <= time).length;
      this.diverQueue = this.diverQueue.filter((t) => t > time);
      for (let i = 0; i < due; i++) {
        // Divers swim in from any edge, whatever that says about where they came from.
        const edge = randInt(0, 3);
        const ex = edge === 2 ? -20 : edge === 3 ? W + 20 : rand(W * 0.1, W * 0.9);
        const ey = edge === 0 ? -20 : edge === 1 ? H + 20 : rand(H * 0.15, H * 0.85);
        const vx = edge === 2 ? 30 : edge === 3 ? -30 : 0;
        const vy = edge === 0 ? 30 : edge === 1 ? -30 : 0;
        this.fish.push({
          x: ex, y: ey, vx, vy, species: 0, alarm: 0, alive: true,
          respawnAt: Infinity, phase: rand(0, TAU), turn: 0, depth: 1, millDir: 1, temp: time + 150, diver: true, dkind: this.pickDiverKind(),
        });
      }
    }
    for (const w of this.techQueue.filter((q) => q.at <= time)) {
      this.fish.push({
        x: clamp(w.x + rand(-300, 300), W * 0.1, W * 0.9), y: -20, vx: 0, vy: 40, species: 0, alarm: 0, alive: true,
        respawnAt: Infinity, phase: rand(0, TAU), turn: 0, depth: 1, millDir: 1, temp: time + 200, diver: true, dkind: "tech", salvage: { x: w.x, y: w.y },
      });
    }
    this.techQueue = this.techQueue.filter((q) => q.at > time);
    this.bolts = this.bolts.filter((b) => time - b.born < 0.45);
    this.bombs = this.bombs.filter((b) => time - b.born < 1.4);
    // Bombers: once he is in the water he heads for something worth blowing up, lights his fuse (a red ! shows over
    // his head) and goes off a couple of seconds later, wherever he happens to be, even in a kraken's arms.
    for (const f of this.fish) {
      if (f.dkind !== "bomber" || !f.alive || f.riding) continue;
      f.hotAt ??= time + rand(16, 28);
      if (f.fuseAt === undefined && this.onScreen(f) && time >= f.hotAt - 10) {
        const u = this.ufo;
        const k = this.kraken;
        const mega = this.sharks.find((s) => s.mega);
        const nearTarget = (u && Math.hypot(u.x - f.x, u.y - f.y) < 260) || (k && Math.hypot(k.x - f.x, k.y - f.y) < k.size * 0.8 + 200) ||
          (mega && Math.hypot(mega.nodes[0] - f.x, mega.nodes[1] - f.y) < 420) || this.sharks.some((s) => !s.mega && Math.hypot(s.nodes[0] - f.x, s.nodes[1] - f.y) < 170);
        if (nearTarget || time >= f.hotAt) f.fuseAt = time + 2.2;
      }
      if (f.fuseAt !== undefined && time >= f.fuseAt) this.explode(f.x, f.y, f);
    }
    const show = this.spectacle();
    for (const f of this.fish) {
      if (!f.diver || !f.alive || f.riding || f.dragger || f.seized) continue;
      if ((f.stunUntil ?? 0) > time) {
        // Out cold: drifts down, limp, carrying on whatever way it was thrown.
        f.vx *= Math.exp(-dt * 1.2);
        f.vy += (8 - f.vy) * Math.min(1, dt * 1.2);
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        continue;
      }
      let goal = this.diverGoals.get(f);
      if (!goal) { goal = { x: f.x + rand(-200, 200), y: H * this.diverDepth(f), born: time }; this.diverGoals.set(f, goal); }
      const leaving = time - goal.born > (f.dkind === "tech" ? 120 : 55);
      if (f.salvage) {
        // A tech diver heads straight for the wreck, strips the scrap into a blaster, and only then goes about his business.
        goal.x = f.salvage.x;
        goal.y = f.salvage.y;
        goal.born = time;
        if (Math.hypot(f.x - f.salvage.x, f.y - f.salvage.y) < 70) {
          const sx = f.salvage.x;
          const sy = f.salvage.y;
          f.salvage = undefined;
          f.equipUntil = time + 3.5;
          this.mess = this.mess.filter((m) => Math.hypot(m.x - sx, m.y - sy) > 220);
          this.callout(f.x, f.y - 30, "SALVAGING UFO SCRAP", "120,255,170");
        }
      } else if (f.dkind === "tech" && time < (f.equipUntil ?? 0)) {
        // Hovers over the scrap while the gun comes together.
        goal.x = f.x;
        goal.y = f.y;
        goal.born = time;
        f.nextShot = (f.equipUntil ?? 0) + rand(0.5, 1.5);
      } else if (f.dkind === "tech" && f.equipUntil !== undefined && time >= (f.nextShot ?? 0)) {
        f.nextShot = time + rand(2.2, 4.5);
        this.blasterFire(f);
      }
      if (leaving) {
        // Out by whichever edge is closest.
        const toEdge = [f.y, H - f.y, f.x, W - f.x];
        const near = toEdge.indexOf(Math.min(...toEdge));
        goal.x = near === 2 ? -80 : near === 3 ? W + 80 : f.x;
        goal.y = near === 0 ? -80 : near === 1 ? H + 80 : f.y;
      }
      else if (show && f.dkind === "photo") {
        // Photographers hang back at a safe distance and shoot the show.
        const away = Math.atan2(f.y - show.y, f.x - show.x);
        goal.x = clamp(show.x + Math.cos(away) * 330, W * 0.05, W * 0.95);
        goal.y = clamp(show.y + Math.sin(away) * 330, H * 0.1, H * 0.9);
      } else if (show?.rescue && f.dkind === "scooter" && !f.tried) {
        // Scooter divers race in to cut a shark free of the kraken.
        goal.x = show.x;
        goal.y = show.y;
        const k = this.kraken!;
        if (Math.hypot(f.x - k.x, f.y - k.y) < k.size * 0.45) {
          f.tried = true;
          const held = k.grabbed[0];
          if (held && Math.random() < 0.55) {
            held.grabbed = false;
            held.devourAt = undefined;
            k.grabbed = k.grabbed.filter((o) => o !== held);
            k.nextGrab = time + rand(5, 8);
            this.splash(held.nodes[0], held.nodes[1], 1.6);
            this.notices.push("a diver cut a shark free of the kraken!");
            this.callout(held.nodes[0], held.nodes[1] - 30, "DIVER SAVES SHARK", "150,255,190");
          }
          const out = Math.atan2(f.y - k.y, f.x - k.x);
          goal.x = clamp(f.x + Math.cos(out) * 450, W * 0.05, W * 0.95);
          goal.y = clamp(f.y + Math.sin(out) * 450, H * 0.1, H * 0.9);
        }
      } else if (f.dkind === "bomber" && f.fuseAt === undefined) {
        // He picks the juiciest thing in the water and swims straight at it: a ufo, a titan, or failing that a shark.
        const k = this.kraken;
        const mega = this.sharks.find((s) => s.mega);
        const pick = this.ufo ?? (k ? { x: k.x, y: k.y } : mega ? { x: mega.nodes[0], y: mega.nodes[1] } : this.sharks[0] ? { x: this.sharks[0].nodes[0], y: this.sharks[0].nodes[1] } : null);
        if (pick) { goal.x = pick.x; goal.y = pick.y; goal.born = time; }
      } else if (Math.hypot(goal.x - f.x, goal.y - f.y) < 40) { goal.x = rand(W * 0.1, W * 0.9); goal.y = H * this.diverDepth(f); }
      if (f.dkind === "photo") {
        f.nextFlash ??= time + rand(3, 7);
        if (time >= f.nextFlash) {
          f.flashAt = time;
          f.nextFlash = time + (show ? rand(1.5, 3) : rand(6, 12));
          // The flash startles the fish round it.
          for (const o of this.fish) if (o.alive && !o.diver && Math.hypot(o.x - f.x, o.y - f.y) < 150) o.alarm = Math.max(o.alarm, 0.6);
        }
      }
      let nearest: Shark | null = null;
      let nd = Infinity;
      for (const sh of this.sharks) {
        const d = Math.hypot(sh.nodes[0] - f.x, sh.nodes[1] - f.y);
        if (d < nd) { nd = d; nearest = sh; }
      }
      const panic = nd < 260 && !leaving;
      let dx = goal.x - f.x;
      let dy = goal.y - f.y;
      if (panic && nearest) { dx = f.x - nearest.nodes[0]; dy = f.y - nearest.nodes[1]; }
      const d = Math.hypot(dx, dy) || 1;
      const speed = (panic ? 40 : 20) * (f.dkind === "scooter" ? 2.2 : f.dkind === "snorkel" ? 0.8 : f.salvage ? 2 : f.dkind === "bomber" ? (f.fuseAt !== undefined ? 3 : 1.6) : 1);
      // Divers are clumsy: they take a moment to change direction, so a shark can run one down.
      f.vx += ((dx / d) * speed - f.vx) * Math.min(1, dt * 0.8);
      f.vy += ((dy / d) * speed - f.vy) * Math.min(1, dt * 0.8);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.phase += dt * (panic ? 7 : 3);
      if (leaving && (f.y < -40 || f.y > H + 40 || f.x < -40 || f.x > W + 40)) f.alive = false;
    }
    // Keep one hunter per diver. Other sharks leave claimed divers alone.
    const free = (sh: Shark) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.leaving && !sh.dragging && !sh.cleaning && !sh.ufoCharge && (sh.fedUntil ?? 0) <= time && !(this.fight && (sh === this.fight.a || sh === this.fight.b));
    const claimed = new Set<Fish>();
    for (const sh of this.sharks) {
      const f = sh.target;
      if (!f?.diver) continue;
      if (!free(sh) || !f.alive || f.riding || f.seized || !this.onScreen(f) || claimed.has(f)) {
        sh.target = null;
        sh.alertUntil = 0;
        continue;
      }
      claimed.add(f);
      sh.hunger = 1;
      sh.retargetAt = time + 2;
    }
    for (const f of this.fish) {
      if (!f.diver || !f.alive || f.riding || f.dragger || f.seized || !this.onScreen(f) || claimed.has(f) || this.diverInterest.get(f) === false) continue;
      const stunned = (f.stunUntil ?? 0) > time;
      if (stunned) this.diverInterest.set(f, true);
      let hunter: Shark | null = null;
      let nearest = stunned ? 1500 : 900;
      for (const sh of this.sharks) {
        if (!free(sh) || sh.target?.diver) continue;
        const d = Math.hypot(sh.nodes[0] - f.x, sh.nodes[1] - f.y);
        if (d < nearest) { nearest = d; hunter = sh; }
      }
      if (!hunter) continue;
      // Some visits pass unnoticed; do not reroll that choice every frame.
      if (!this.diverInterest.has(f)) this.diverInterest.set(f, Math.random() < 0.6);
      if (!this.diverInterest.get(f)) continue;
      hunter.target = f;
      hunter.alertUntil = time + 1.5;
      hunter.hunger = 1;
      hunter.retargetAt = time + 2;
      claimed.add(f);
    }
  }

  // ── ambient critters and set pieces ─────────────────────────────────

  private spawnJellies() {
    if (this.jellies.length) return;
    const { width: W, height: H } = this;
    const count = randInt(3, 6);
    for (let i = 0; i < count; i++) {
      this.jellies.push({
        x: rand(W * 0.08, W * 0.92), y: H + rand(40, 420), size: rand(8, 12), phase: rand(0, TAU),
        drift: rand(-14, 14), hue: Math.random(),
      });
    }
  }

  private spawnWhale() {
    const { width: W, height: H } = this;
    const length = clamp(Math.min(W, H) * 1.05, 380, 1050);
    const side = randInt(0, 1);
    if (this.whales.length >= 2) return;
    this.whales.push({
      x: side === 0 ? -20 : W + 20, y: rand(H * 0.25, H * 0.75), heading: (side === 0 ? 0 : Math.PI) + rand(-0.12, 0.12),
      speed: rand(22, 30), length, phase: 0, traveled: 0, rippleAt: 0,
    });
  }

  /** Two similar-sized sharks circle each other and lunge. */
  private spawnFight() {
    if (this.fight) return;
    const free = this.sharks.filter((sh) => !sh.mega && !sh.grabbed);
    if (free.length < 2) return;
    // The two sharks that are already closest square off.
    let a = free[0];
    let b = free[1];
    let best = Infinity;
    for (let i = 0; i < free.length; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const d = Math.hypot(free[i].nodes[0] - free[j].nodes[0], free[i].nodes[1] - free[j].nodes[1]);
        if (d < best) { best = d; a = free[i]; b = free[j]; }
      }
    }
    this.fight = {
      a, b, mx: (a.nodes[0] + b.nodes[0]) / 2, my: (a.nodes[1] + b.nodes[1]) / 2,
      until: this.time + 40, dir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1, lungeUntil: 0, nextLunge: Infinity, engaged: false,
    };
  }

  private stepFight() {
    const f = this.fight;
    if (!f) return;
    const { time } = this;
    if (this.fish.some((d) => d.diver && d.alive)) { this.fight = null; return; }
    if (time > f.until || !this.sharks.includes(f.a) || !this.sharks.includes(f.b) || f.a.mega || f.b.mega || f.a.grabbed || f.b.grabbed) { this.fight = null; return; }
    const hx = (f.a.nodes[0] + f.b.nodes[0]) / 2;
    const hy = (f.a.nodes[1] + f.b.nodes[1]) / 2;
    f.mx += (hx - f.mx) * 0.02;
    f.my += (hy - f.my) * 0.02;
    if (!f.engaged) {
      const gap = Math.hypot(f.a.nodes[0] - f.b.nodes[0], f.a.nodes[1] - f.b.nodes[1]);
      if (gap < (f.a.length + f.b.length) * 0.9) {
        f.engaged = true;
        f.until = time + rand(12, 16);
        f.nextLunge = time + 2.5;
      }
      return;
    }
    if (time >= f.nextLunge && time >= f.lungeUntil) { f.lungeUntil = time + 1.1; f.nextLunge = time + rand(3, 4.5); }
    if (time < f.lungeUntil) {
      const d = Math.hypot(f.a.nodes[0] - f.b.nodes[0], f.a.nodes[1] - f.b.nodes[1]);
      if (d < (f.a.length + f.b.length) * 0.17) {
        // The clash: a flash and a splash at the point of contact, then both recoil.
        this.events.push({ kind: "eat", x: hx, y: hy });
        this.splash(hx, hy, 1.5);
        f.lungeUntil = 0;
        f.a.speed *= 0.35;
        f.b.speed *= 0.35;
      }
    }
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
    this.stepUfos(dt);
    this.stepDivers(dt);
    this.stepSlices();
    this.stepMess(dt);
    for (const d of this.debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 60 * dt; d.vx *= 0.995; }
    this.debris = this.debris.filter((d) => this.time - d.born < 8);
    // A waiting assistant sends a ring from its dot in the corner every couple of seconds.
    if ((this.attention.claude || this.attention.codex) && time - this.attentionAt > 2.4) {
      this.attentionAt = time;
      if (this.attention.claude) this.splash(W - 70, 26, 1, 1);
      if (this.attention.codex) this.splash(W - 110, 26, 1, 0);
    }
    // Jellyfish drift up in slow surges; fish keep clear, sharks ignore them.
    if (this.jellies.length) {
      for (const j of this.jellies) {
        j.phase += dt * 2;
        const surge = 0.35 + 0.65 * Math.max(0, Math.sin(j.phase));
        j.y -= (10 + 14 * surge) * dt;
        j.x += (j.drift + Math.sin(time * 0.4 + j.hue * 9) * 8) * dt * 0.5;
      }
      // A jellyfish sometimes zaps a diver that drifts too close, knocking it out.
      for (const j of this.jellies) {
        if (time - (j.zapAt ?? -99) < 5) continue;
        for (const f of this.fish) {
          if (!f.diver || !f.alive || f.riding || f.seized || f.dragger || (f.stunUntil ?? 0) > time) continue;
          if (Math.hypot(f.x - j.x, f.y - j.y) > j.size * 4 || Math.random() > dt * 0.8) continue;
          j.zapAt = time;
          j.zapTarget = f;
          f.stunUntil = time + rand(10, 16);
          f.vx *= 0.2;
          f.vy *= 0.2;
          this.callout(f.x, f.y - 34, "ZAPPPP!", "255,240,120");
          this.splash(f.x, f.y, 1.3);
          this.events.push({ kind: "eat", x: f.x, y: f.y });
          break;
        }
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
    // Relationship: a megalodon that swims into the saucer, with any part of its body, smashes it to pieces.
    const bigShark = this.sharks.find((sh) => sh.mega);
    if (bigShark) {
      const reach = bigShark.length * 0.06 + Math.max(40, Math.min(W, H) * 0.07);
      for (const sauc of [...this.ufos]) {
        for (let n = 0; n < SHARK_NODES; n++) {
          if (Math.hypot(bigShark.nodes[n * 2] - sauc.x, bigShark.nodes[n * 2 + 1] - sauc.y) < reach) {
            this.callout(sauc.x, sauc.y - 40, "UFO SMASHED", "255,110,100");
            this.destroyUfo("smashed", sauc);
            break;
          }
        }
      }
    }
    // Relationship: a whirlpool drags nearby jellyfish round with the fish.
    if (this.whirl) {
      const wp = this.whirl;
      for (const j of this.jellies) {
        const dx = j.x - wp.x;
        const dy = j.y - wp.y;
        const d = Math.hypot(dx, dy);
        if (d > wp.r * 2.6 || d < 1e-3) continue;
        const fall = Math.pow(1 - d / (wp.r * 2.6), 0.8);
        j.x += ((-dy / d) * wp.dir * 70 - (dx / d) * 25) * fall * dt;
        j.y += ((dx / d) * wp.dir * 70 - (dy / d) * 25) * fall * dt;
      }
    }
    const whaleOrder = [...this.whales];
    for (const wCur of whaleOrder) {
    if (!this.whales.includes(wCur)) continue;
    this.whales = [wCur, ...this.whales.filter((x) => x !== wCur)];
    const wh = this.whale;
    if (wh) {
      wh.phase += dt * 0.45;
      if (wh.fleeing) {
        wh.speed += (115 - wh.speed) * Math.min(1, dt * 0.8);
        wh.heading += clamp(angleDiff(wh.heading, wh.fleeHeading ?? wh.heading), -0.5 * dt, 0.5 * dt);
        wh.phase += dt * 0.9;
      }
      // A whale never swims toward a predator: it veers off when a megalodon or kraken is bearing down.
      if (!wh.fleeing && !this.whaleFight) {
        const hunter = this.sharks.find((sh) => sh.mega && !sh.retreat && sh.whaleAttack !== false);
        const hp = hunter ? { x: hunter.nodes[0], y: hunter.nodes[1] } : this.kraken && this.kraken.state !== "flee" ? { x: this.kraken.x, y: this.kraken.y } : null;
        if (hp) {
          const m = this.whaleMid(wh);
          if (Math.hypot(hp.x - m.x, hp.y - m.y) < wh.length * 0.9) {
            const away = Math.atan2(m.y - hp.y, m.x - hp.x);
            wh.heading += clamp(angleDiff(wh.heading, away), -0.22 * dt, 0.22 * dt);
          }
        }
      }
      wh.x += Math.cos(wh.heading) * wh.speed * dt;
      wh.y += Math.sin(wh.heading) * wh.speed * dt;
      wh.traveled += wh.speed * dt;
      const dx = Math.cos(wh.heading);
      const dy = Math.sin(wh.heading);
      const tx = wh.x - dx * wh.length;
      const ty = wh.y - dy * wh.length;
      // Wakes are laid down as it travels (not on a timer), flaring out behind the flukes and along the flanks.
      wh.wakeD = (wh.wakeD ?? 0) + wh.speed * dt;
      if (wh.wakeD > wh.length * 0.1) {
        wh.wakeD = 0;
        this.splash(tx, ty, 1.05, undefined, { dir: wh.heading, weight: 2, max: wh.length * 0.8, quiet: true });
        this.splash(wh.x - dx * wh.length * 0.55, wh.y - dy * wh.length * 0.55, 0.8, undefined, { dir: wh.heading, weight: 2, max: wh.length * 0.5, quiet: true });
      }
      // Now and then it sings: one slow, wide pulse rolls out from its head.
      if (!wh.fleeing && !this.whaleFight && !(this.kraken && this.kraken.whaleUntil > 0)) {
        wh.songAt ??= time + rand(5, 10);
        if (time >= wh.songAt) {
          wh.songAt = time + rand(22, 40);
          this.splash(wh.x, wh.y, 0.9, undefined, { song: true, max: Math.max(this.width, this.height) * 0.95, quiet: true });
          this.callout(wh.x, wh.y - 50, "~ WHALE SONG ~", "150,215,255");
        }
      }
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
      if (wh.traveled > Math.max(W, H) * 1.0 + wh.length * 1.15 + 80 || (wh.fleeing && Math.max(-wh.x, wh.x - W, -wh.y, wh.y - H) > wh.length * 1.1)) this.whale = null;
    }
    }
    this.whales = whaleOrder.filter((w) => this.whales.includes(w));

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
      // Divers cannot out-swim it near the middle, and sharks are dragged round a little (big ones less).
      for (const f of this.fish) {
        if (!f.diver || !f.alive || f.riding) continue;
        const dx = f.x - wp.x;
        const dy = f.y - wp.y;
        const d = Math.hypot(dx, dy);
        if (d > wp.r * 2.6 || d < 1e-3) continue;
        const fall = Math.pow(1 - d / (wp.r * 2.6), 0.7) * Math.max(0, fade);
        f.x += ((-dy / d) * wp.dir * 110 - (dx / d) * 55) * fall * dt;
        f.y += ((dx / d) * wp.dir * 110 - (dy / d) * 55) * fall * dt;
      }
      for (const sh of this.sharks) {
        if (sh.mega || sh.grabbed || sh.lifted) continue;
        const dx = sh.nodes[0] - wp.x;
        const dy = sh.nodes[1] - wp.y;
        const d = Math.hypot(dx, dy);
        if (d > wp.r * 2.6 || d < 1e-3) continue;
        const fall = Math.pow(1 - d / (wp.r * 2.6), 0.8) * Math.max(0, fade) * clamp(260 / sh.length, 0.3, 1);
        const mx = ((-dy / d) * wp.dir * 36 - (dx / d) * 14) * fall * dt;
        const my = ((dx / d) * wp.dir * 36 - (dy / d) * 14) * fall * dt;
        for (let n = 0; n < SHARK_NODES; n++) { sh.nodes[n * 2] += mx; sh.nodes[n * 2 + 1] += my; }
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

  /** A kraken swims in, seizes sharks (and may eat one), and fights the megalodon that comes for it. */
  private spawnKraken(solo = false, megaHere = false) {
    const { width: W, height: H, time } = this;
    const size = clamp(Math.min(W, H) * rand(0.9, 1.2), 400, 1200);
    const { side, y } = this.entryPoint();
    const ax = W * (side === 0 ? rand(0.25, 0.5) : rand(0.5, 0.75));
    this.kraken = {
      x: side === 0 ? -size * 0.7 : W + size * 0.7, y, heading: side === 0 ? 0 : Math.PI, size, phase: 0,
      born: time, state: "enter", stateAt: time, ax, ay: y, side, grabbed: [], megaSent: solo || megaHere, inkAt: 0, bend: 0, solo,
      grabCount: randInt(2, 4), megaDelay: rand(4, 12), holdFor: rand(55, 80),
      caught: [], strike: null, rally: false, whaleUntil: 0, ufoStrike: null, ufoHeld: false, ufoUntil: 0, jet: 0, wave: 0, nextCatch: 0, wrapping: null, wrapFor: 0, tilt: 0, winner: "mega", nextShake: 0, shakeUntil: 0, meals: 0, regrabs: 0, nextGrab: 0, rounds: 0, wounded: false,
    };
    this.titanEntry = { born: time };
  }

  /** Releases a queued kraken once the whale fight is over; if the megalodon has left meanwhile it arrives as a normal kraken. */
  private stepKrakenQueue() {
    if (!this.krakenQueued || this.whaleFight || this.kraken) return;
    this.krakenQueued = false;
    // If the megalodon is still here the kraken doesn't need to send one.
    this.spawnKraken(false, this.sharks.some((sh) => sh.mega));
  }

  private stepKraken(dt: number) {
    const k = this.kraken;
    if (!k) return;
    const { time, width: W, height: H } = this;
    k.phase += dt * 0.9;
    k.wave += dt * (0.75 + 1.0 * k.jet);
    const mega = this.sharks.find((sh) => sh.mega);
    const move = (speed: number, heading: number, pulse = true, turnRate = 1.6) => {
      const turn = clamp(angleDiff(k.heading, heading), -dt * turnRate, dt * turnRate);
      k.heading += turn;
      k.bend += (turn / dt - k.bend) * Math.min(1, dt * 2);
      // Jet propulsion: it surges forward in pulses and glides between them.
      const surge = pulse ? 0.55 + 0.9 * Math.max(0, Math.sin(k.phase * 1.1)) : 1;
      k.jet += (clamp((speed * surge) / 180, 0, 1) - k.jet) * Math.min(1, dt * 2.5);
      k.x += Math.cos(k.heading) * speed * surge * dt;
      k.y += Math.sin(k.heading) * speed * surge * dt;
      // Each jet stroke shoves a heavy wake out behind it.
      k.wakeD = (k.wakeD ?? 0) + speed * surge * dt;
      if (k.wakeD > k.size * 0.2) {
        k.wakeD = 0;
        this.splash(k.x + Math.cos(k.heading + Math.PI) * k.size * 0.35, k.y + Math.sin(k.heading + Math.PI) * k.size * 0.35, 1.15, undefined, { dir: k.heading, weight: 3, max: k.size * 0.9, quiet: true });
      }
    };
    const letGo = () => {
      this.dropCaught(k);
      for (const sh of k.grabbed) { sh.grabbed = false; sh.devourAt = undefined; }
      k.grabbed = [];
    };
    const endRally = () => {
      k.rally = false;
      for (const s of this.sharks) s.rallying = false;
    };
    const runAway = (wounded: boolean) => {
      k.whaleUntil = 0;
      endRally();
      if (mega) mega.chaseUntil = time + 5;
      letGo();
      k.wrapping = null;
      k.lunging = false;
      k.wounded = wounded;
      k.state = "flee";
      k.stateAt = time;
    };
    // A megalodon that reaches the kraken, even while it is still swimming in, either scares it off or gets wrapped.
    const meetMega = () => {
      const close = mega && !mega.retreat ? Math.hypot(mega.nodes[0] - k.x, mega.nodes[1] - k.y) < k.size * 0.75 : false;
      if (!close || !mega) return false;
      // The megalodon arrives: sometimes the kraken bolts at once, otherwise it wraps the beast and they fight.
      if (Math.random() < 0.35) { this.callout(k.x, k.y - k.size * 0.3, "KRAKEN RUNS", "230,230,235"); runAway(false); }
      else {
        letGo();
        k.state = "wrap";
        k.stateAt = time;
        k.lunging = true;
        this.splash(k.x, k.y, 1.8);
        k.wrapping = mega;
        k.wrapFor = rand(9, 14);
        this.callout(k.x, k.y - k.size * 0.3, "KRAKEN WRAPS MEGALODON", "230,230,235");
        // Decided up front so the fight reads: a winning kraken tightens its grip as the beast tires,
        // a winning megalodon shakes harder and harder until the arms give.
        k.winner = k.rounds < 1 && Math.random() < 0.4 ? "kraken" : "mega";
        k.nextShake = time + rand(1.5, 3);
        k.shakeUntil = 0;
      }
      return true;
    };
    // A tentacle lashes out at a diver on the arm side, and the grab lands when it arrives (so a quick
    // rescuer can still slip past, and nothing is seized from beyond what the arm visibly reaches).
    if (k.state === "enter" || k.state === "grab") {
      const back = k.heading + Math.PI;
      const rx = k.x + Math.cos(back) * k.size * 0.085;
      const ry = k.y + Math.sin(back) * k.size * 0.085;
      if (k.strike) {
        const f = k.strike.f;
        if (!f.alive || f.seized || f.riding || f.dragger || Math.hypot(f.x - rx, f.y - ry) > k.size * 1.5) k.strike = null;
        else if (time - k.strike.at > STRIKE_TIME) {
          f.seized = true;
          f.crushAt = time + rand(4, 7);
          k.caught.push(f);
          k.strike = null;
          k.nextCatch = time + rand(2.5, 4.5);
          this.callout(f.x, f.y - 30, "DIVER CAUGHT", "255,170,120");
        }
      } else if (this.fish.some((f) => f.diver && f.alive && !f.seized && !f.riding && !f.dragger && Math.hypot(f.x - k.x, f.y - k.y) < k.size * 0.3)) {
        // A diver that blunders into the kraken itself is never ignored: a tentacle is set on it at once, or it is crushed outright if its arms are full.
        const f = this.fish.find((d) => d.diver && d.alive && !d.seized && !d.riding && !d.dragger && Math.hypot(d.x - k.x, d.y - k.y) < k.size * 0.3)!;
        if (k.caught.length < 3) k.strike = { f, at: time };
        else { this.callout(f.x, f.y - 30, "DIVER CRUSHED", "255,110,100"); this.popDiver(f); }
      } else if (k.caught.length < 3 && time >= k.nextCatch) {
        let best = Infinity;
        let target: Fish | null = null;
        for (const f of this.fish) {
          if (!f.diver || !f.alive || f.riding || f.dragger || f.seized) continue;
          const d = Math.hypot(f.x - rx, f.y - ry);
          if (d > k.size * ((f.stunUntil ?? 0) > time ? 1.3 : 1.1) || Math.abs(angleDiff(back, Math.atan2(f.y - k.y, f.x - k.x))) > KRAKEN_ARC) continue;
          if (d < best) { best = d; target = f; }
        }
        if (target) k.strike = { f: target, at: time };
      }
    }
    // Saucers are fair game too: a tentacle lashes out, then it is flung about and crushed (or breaks free).
    const sauc = this.ufo;
    if ((k.state === "enter" || k.state === "grab") && sauc && !sauc.held && sauc.y > 20 && time >= k.nextCatch) {
      const back = k.heading + Math.PI;
      const near = Math.hypot(sauc.x - k.x, sauc.y - k.y) < k.size * 1.2 && Math.abs(angleDiff(back, Math.atan2(sauc.y - k.y, sauc.x - k.x))) < KRAKEN_ARC;
      if (k.ufoStrike === null && near) k.ufoStrike = time;
      else if (k.ufoStrike !== null && !near) k.ufoStrike = null;
      else if (k.ufoStrike !== null && time - k.ufoStrike > STRIKE_TIME) {
        k.ufoStrike = null;
        k.ufoHeld = true;
        k.ufoUntil = time + rand(5, 8);
        sauc.held = true;
        this.callout(sauc.x, sauc.y - 40, "UFO CAUGHT", "255,255,255");
      }
    } else if (k.ufoStrike !== null) k.ufoStrike = null;
    if (k.ufoHeld) {
      const u = this.ufo;
      if (!u || !u.held) k.ufoHeld = false;
      else {
        // Held out on long arms and swayed at the same slow pace as everything else it flings about.
        const a = k.heading + Math.PI + Math.sin(time * 0.7) * 0.55;
        const r = Math.min(k.size * (0.9 + 0.08 * Math.sin(time * 1.0)), Math.min(W, H) * 0.45);
        const pull = Math.min(1, dt * 1.6);
        u.x += (k.x + Math.cos(a) * r - u.x) * pull;
        u.y += (k.y + Math.sin(a) * r - u.y) * pull;
        if (time > k.ufoUntil) {
          k.ufoHeld = false;
          u.held = false;
          if (Math.random() < 0.7) { this.callout(u.x, u.y - 40, "UFO CRUSHED", "255,110,100"); this.destroyUfo("crushed"); }
          else { this.callout(u.x, u.y - 40, "UFO ESCAPES", "150,255,190"); u.fast = true; u.state = "leave"; k.nextCatch = time + 3; }
        }
      }
    }
    // A whale in reach is wrapped for a few seconds, then tears free and bolts.
    const whale = this.whale;
    if (k.state === "grab" && time - k.stateAt > 3 && whale && !whale.fleeing && k.whaleUntil === 0) {
      const wm = this.whaleMid(whale);
      if (Math.hypot(wm.x - k.x, wm.y - k.y) < k.size * 0.9) {
        k.whaleUntil = time + rand(4, 5.5);
        this.callout(wm.x, wm.y - 60, "KRAKEN WRAPS WHALE", "255,255,255");
      }
    }
    if (k.whaleUntil > 0) {
      if (!whale || whale.fleeing) k.whaleUntil = 0;
      else {
        whale.speed += (10 - whale.speed) * Math.min(1, dt * 1.5);
        whale.phase += dt * 2;
        // The kraken closes in on the whale and clamps on, not the other way round.
        const wm2 = this.whaleMid(whale);
        const dd = Math.hypot(wm2.x - k.x, wm2.y - k.y);
        if (dd > k.size * 0.3) {
          const sp = clamp(dd * 2.2, 90, 420);
          k.x += ((wm2.x - k.x) / dd) * sp * dt;
          k.y += ((wm2.y - k.y) / dd) * sp * dt;
        }
        if (time > k.whaleUntil) {
          k.whaleUntil = 0;
          this.attackWhale(k.x, k.y, "WHALE BREAKS FREE", "the whale tore free of the kraken");
        }
      }
    }
    k.caught = k.caught.filter((f, i) => {
      if (!f.alive) { delete f.seized; return false; }
      if (time > (f.crushAt ?? 0) && this.blasterEscape(f, 0.65, k.x, k.y)) { delete f.seized; k.nextCatch = time + rand(2.5, 4.5); return false; }
      if (time > (f.crushAt ?? 0) && (f.stunUntil ?? 0) > time && Math.random() < 0.5) {
        // A limp diver is sometimes just hurled away.
        delete f.seized;
        const a = Math.atan2(f.y - k.y, f.x - k.x);
        f.vx = Math.cos(a) * 240;
        f.vy = Math.sin(a) * 240;
        k.nextCatch = time + rand(1.5, 3);
        this.callout(f.x, f.y - 30, "DIVER THROWN", "255,170,120");
        return false;
      }
      if (time > (f.crushAt ?? 0)) {
        delete f.seized;
        this.callout(f.x, f.y - 30, "DIVER CRUSHED", "255,110,100");
        this.popDiver(f);
        return false;
      }
      // Held out at the end of long arms, swung about, rather than clutched against the body.
      // Held out at the far end of long arms and swayed slowly: heavy and menacing, not flailing.
      const a = k.heading + Math.PI + Math.sin(time * 0.7 + i * 2.1) * 0.55;
      const r = Math.min(k.size * (1.0 + 0.08 * Math.sin(time * 1.0 + i)), Math.min(W, H) * 0.5);
      // Hauled out to its swinging spot along the arm rather than snapped there, so a fresh catch never jumps.
      // It travels round the kraken (angle and distance eased separately), so it can never be dragged through the body.
      const pull = Math.min(1, dt * 1.6);
      const r0 = Math.hypot(f.x - k.x, f.y - k.y);
      const a0 = Math.atan2(f.y - k.y, f.x - k.x);
      const rNow = Math.max(k.size * 0.16, r0 + (r - r0) * pull);
      const aNow = a0 + angleDiff(a0, a) * pull;
      f.x = k.x + Math.cos(aNow) * rNow;
      f.y = k.y + Math.sin(aNow) * rNow;
      f.vx = Math.cos(a + 1.57) * 30;
      f.vy = Math.sin(a + 1.57) * 30;
      f.phase += dt * 3.5;
      return true;
    });
    if (k.state === "enter") {
      if (meetMega()) return;
      const d = Math.hypot(k.ax - k.x, k.ay - k.y);
      move(Math.min(60, d * 0.5 + 10), Math.atan2(k.ay - k.y, k.ax - k.x));
      if (d < 14) {
        k.state = "grab";
        k.stateAt = time;
        k.nextGrab = time + rand(3, 6);
        const prey = this.sharks
          .filter((sh) => !sh.mega && !sh.leaving)
          .sort((a, b) => Math.hypot(a.nodes[0] - k.x, a.nodes[1] - k.y) - Math.hypot(b.nodes[0] - k.x, b.nodes[1] - k.y))
          .slice(0, k.grabCount);
        for (const sh of prey) { sh.grabbed = true; sh.grabbedAt = time; sh.target = null; sh.devourAt = time + rand(8, 16); }
        k.grabbed = prey;
      }
    } else if (k.state === "grab") {
      // It stays put and reaches: it only turns when what it wants is outside its 270 degree arm arc, and then slowly and heavily.
      const behind = k.heading + Math.PI;
      let goal: { x: number; y: number } | null = null;
      if (k.grabbed.length) {
        goal = {
          x: k.grabbed.reduce((sum, sh) => sum + sh.nodes[0], 0) / k.grabbed.length,
          y: k.grabbed.reduce((sum, sh) => sum + sh.nodes[1], 0) / k.grabbed.length,
        };
      }
      // On its own (or with nothing in its arms) it watches for divers, and the whale if that is all there is.
      if (!goal && k.caught.length < 3) {
        let pd = k.size * 3;
        for (const f of this.fish) {
          if (!f.diver || !f.alive || f.riding || f.dragger || f.seized || !this.onScreen(f)) continue;
          const d = Math.hypot(f.x - k.x, f.y - k.y);
          if (d < pd) { pd = d; goal = f; }
        }
        if (!goal && this.whale && !this.whale.fleeing) {
          const wm = this.whaleMid(this.whale);
          if (Math.hypot(wm.x - k.x, wm.y - k.y) < k.size * 3.2) goal = wm;
        }
        if (goal) {
          // Drifts in only until the target is within its long reach.
          const gd = Math.hypot(goal.x - k.x, goal.y - k.y);
          const sp = clamp((gd - k.size * 1.2) * 0.3, 0, 45);
          const toward = Math.atan2(goal.y - k.y, goal.x - k.x);
          k.x += Math.cos(toward) * sp * dt;
          k.y += Math.sin(toward) * sp * dt;
        }
      }
      let want = k.heading;
      if (goal && Math.abs(angleDiff(behind, Math.atan2(goal.y - k.y, goal.x - k.x))) > KRAKEN_ARC - 0.15) want = Math.atan2(goal.y - k.y, goal.x - k.x) + Math.PI;
      move(0, want, false, 0.7);
      this.krakenFeed(k);
      if (!k.megaSent && !mega && time - k.stateAt > k.megaDelay) {
        k.megaSent = true;
        this.spawnMegalodon(k.side === 0 ? 1 : 0);
      }
      if (!meetMega() && ((time - k.stateAt > (k.solo ? k.holdFor : 60) && (!k.caught.length || time - k.stateAt > (k.solo ? k.holdFor : 60) + 8)) || (k.solo && time - k.born > 88))) {
        runAway(false);
      }
    } else if (k.state === "wrap") {
      const m = k.wrapping;
      if (!m || !this.sharks.includes(m)) {
        runAway(true);
      } else if (k.lunging && Math.hypot(m.nodes[8] - k.x, m.nodes[9] - k.y) > k.size * 0.12 && time - k.stateAt < 4) {
        // It jets across the tank at the megalodon, curving in and gathering speed, instead of snapping onto it.
        // Speed scales with the distance left, so a far megalodon is crossed fast and the head arrives with the arms.
        const gap = Math.hypot(m.nodes[8] - k.x, m.nodes[9] - k.y);
        const sp = clamp(Math.max(gap * 1.8, 220 + (time - k.stateAt) * 600), 220, 900);
        const toward = Math.atan2(m.nodes[9] - k.y, m.nodes[8] - k.x);
        // Head first while crossing the tank, then it swings round so the arms face the megalodon as it closes in.
        const turnIn = this.krakenTurnIn(gap, k.size);
        move(0, toward + Math.PI * turnIn, false, 3.5);
        // It eases off while it swings round, so the body doesn't slide sideways through the turn.
        const glide = sp * (1 - 0.75 * turnIn);
        k.x += Math.cos(toward) * glide * dt;
        k.y += Math.sin(toward) * glide * dt;
        k.jet = 1;
        k.wakeD = (k.wakeD ?? 0) + glide * dt;
        if (k.wakeD > k.size * 0.2) {
          k.wakeD = 0;
          this.splash(k.x - Math.cos(toward) * k.size * 0.35, k.y - Math.sin(toward) * k.size * 0.35, 1.15, undefined, { dir: toward, weight: 3, max: k.size * 0.9, quiet: true });
        }
      } else {
        if (k.lunging) {
          // Lands: the fight clock starts here.
          k.lunging = false;
          k.stateAt = time;
          k.nextShake = time + rand(1.5, 3);
          this.splash(m.nodes[0], m.nodes[1], 2.4);
          this.events.push({ kind: "eat", x: (k.x + m.nodes[0]) / 2, y: (k.y + m.nodes[1]) / 2 });
        }
        // Clamped round the megalodon's head and flank, thrashing while it bites.
        const progress = clamp((time - k.stateAt) / k.wrapFor, 0, 1);
        // The divers can swing it: enough of a lean one way and the other titan takes over.
        k.tilt *= 1 - dt * 0.04;
        if (k.tilt > 0.4 && k.winner === "mega") { k.winner = "kraken"; k.tilt = 0.1; this.callout(k.x, k.y - k.size * 0.3, "THE DIVERS TURN THE TIDE", "255,255,255"); }
        else if (k.tilt < -0.4 && k.winner === "kraken") { k.winner = "mega"; k.tilt = -0.1; this.callout(k.x, k.y - k.size * 0.3, "THE DIVERS TURN THE TIDE", "130,175,235"); }
        // Every few seconds the megalodon whips its head and flings the kraken around it.
        if (time >= k.nextShake && time >= k.shakeUntil) {
          k.shakeUntil = time + 1.3;
          k.nextShake = time + rand(2.5, 4) * (k.winner === "mega" ? 1 - 0.4 * progress : 1 + 0.6 * progress);
          this.splash(m.nodes[0], m.nodes[1], 1.6);
        }
        // As the megalodon tires, the other sharks come to its rescue; if two reach the kraken, it lets go.
        if (k.winner === "kraken" && !k.rally && progress > 0.25) {
          k.rally = true;
          k.wrapFor += 3;
          for (const s of this.sharks) s.rallying = false;
          const helpers = this.sharks
            .filter((s) => !s.mega && !s.grabbed && !s.lifted && !s.ufoCharge && !s.leaving && !s.cleaning && !s.dragging && !(this.fight && (s === this.fight.a || s === this.fight.b)))
            .sort((x, y) => Math.hypot(x.nodes[0] - k.x, x.nodes[1] - k.y) - Math.hypot(y.nodes[0] - k.x, y.nodes[1] - k.y))
            .slice(0, 4);
          for (const s of helpers) { s.rallying = true; s.target = null; }
          if (helpers.length) {
            this.callout(k.x, k.y + k.size * 0.3, "SHARKS RALLY!", "150,255,190");
            this.notices.push("the sharks rally to the megalodon... all together now!");
          }
        }
        if (k.rally && this.sharks.filter((s) => s.rallying && Math.hypot(s.nodes[0] - k.x, s.nodes[1] - k.y) < k.size * 0.6).length >= 2) {
          this.callout(k.x, k.y - k.size * 0.3, "SHARKS SAVE THE MEGALODON", "150,255,190");
          this.notices.push("the sharks drove the kraken off!");
          this.splash(k.x, k.y, 2);
          m.chaseUntil = time + 6;
          runAway(true);
          return;
        }
        const shaking = time < k.shakeUntil;
        const fling = shaking ? k.size * 0.09 : k.size * 0.025;
        k.x += (m.nodes[8] + Math.sin(time * 3.6) * fling - k.x) * Math.min(1, dt * 5);
        k.y += (m.nodes[9] + Math.cos(time * 3.2) * fling - k.y) * Math.min(1, dt * 5);
        move(0, Math.atan2(m.nodes[25] - k.y, m.nodes[24] - k.x) + Math.PI, false, 3.5);
        if (time - k.inkAt > 0.8) {
          k.inkAt = time;
          this.events.push({ kind: "splash", x: k.x, y: k.y, strength: 1.2 });
          if (Math.random() < 0.5) this.events.push({ kind: "eat", x: (k.x + m.nodes[0]) / 2, y: (k.y + m.nodes[1]) / 2 });
        }
        if (time - k.stateAt > k.wrapFor) {
          endRally();
          const r = Math.random();
          if (k.winner === "kraken") {
            // The grip holds: the megalodon backs off and the kraken goes back to hunting.
            k.rounds++;
            m.retreat = true;
            m.megaHeading = Math.atan2(m.nodes[1] - k.y, m.nodes[0] - k.x);
            k.wrapping = null;
            k.state = "grab";
            k.stateAt = time;
            k.megaSent = false;
            k.megaDelay = rand(12, 20);
            k.nextGrab = time + 2;
            k.meals = 0;
            k.regrabs = 0;
            this.notices.push("the kraken scared the megalodon off... for now!");
            this.callout(k.x, k.y - k.size * 0.3, "KRAKEN WINS - MEGALODON FLEES", "255,220,120");
          } else if (r < 0.6) {
            this.events.push({ kind: "eat", x: k.x, y: k.y });
            this.splash(k.x, k.y, 2.6);
            this.dropCaught(k);
            // Torn arms and mantle drift out as scraps for the sharks to clean up.
            const bits: [string, string][] = [["8", "232,228,215"], ["@", "245,240,230"], ["o", "250,248,240"], ["%", "200,195,215"], ["~", "170,150,200"], [":", "120,100,150"]];
            // A kraken is enormous, so there is a lot of it: a wide cloud of torn arm and mantle drifting out from where it died.
            for (let i = 0; i < 120; i++) {
              const a = rand(0, TAU);
              const sp = rand(15, 90);
              const [glyph, rgb] = bits[i % bits.length];
              this.mess.push({ x: k.x + Math.cos(a) * k.size * rand(0, 0.7), y: k.y + Math.sin(a) * k.size * rand(0, 0.7), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
            }
            this.sharks
              .filter((sh) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.leaving && !sh.dragging && !(this.fight && (sh === this.fight.a || sh === this.fight.b)))
              .sort((a, b) => Math.hypot(a.nodes[0] - k.x, a.nodes[1] - k.y) - Math.hypot(b.nodes[0] - k.x, b.nodes[1] - k.y))
              .slice(0, 7)
              .forEach((sh) => { sh.cleaning = true; sh.target = null; sh.alertUntil = time + 1.2; });
            this.notices.push("the megalodon ate the kraken... what a feast!");
            this.callout(k.x, k.y - k.size * 0.3, "MEGALODON WINS - KRAKEN EATEN", "255,120,110");
            this.kraken = null;
          } else {
            this.events.push({ kind: "eat", x: k.x, y: k.y });
            this.splash(k.x, k.y, 2);
            this.notices.push("the megalodon tore free!");
            this.callout(k.x, k.y - k.size * 0.3, "MEGALODON WINS - KRAKEN FLEES", "255,120,110");
            runAway(true);
          }
        }
      }
    } else {
      const away = mega ? Math.atan2(k.y - mega.nodes[1], k.x - mega.nodes[0]) : k.heading;
      move(Math.min(k.wounded ? 190 : 130, 40 + (time - k.stateAt) * (k.wounded ? 70 : 50)), away);
      if (time - k.inkAt > 0.35 && time - k.stateAt < (k.wounded ? 6 : 3)) {
        k.inkAt = time;
        this.events.push({ kind: "splash", x: k.x, y: k.y, strength: 1.2 });
        if (this.inks.length < 40) {
          const back = k.heading + Math.PI;
          this.inks.push({ x: k.x + Math.cos(back) * k.size * 0.25, y: k.y + Math.sin(back) * k.size * 0.25, vx: Math.cos(back) * 10, vy: Math.sin(back) * 10, r0: k.size * 0.18, r1: k.size * rand(0.4, 0.55), born: time, life: rand(9, 13), seed: Math.random() * 100 });
        }
      }
      const gone = Math.max(-k.x, k.x - W, -k.y, k.y - H) > k.size * 0.9;
      if ((gone && time - k.stateAt > 3) || time - k.stateAt > 40) { this.dropCaught(k); this.kraken = null; }
    }
  }

  /**
   * Nothing shoulders past a titan unharmed. A shark or diver that runs into the megalodon's body is bitten or eaten,
   * and a shark that blunders into the kraken is seized.
   */
  private stepTitanContacts() {
    const { time } = this;
    const mega = this.sharks.find((sh) => sh.mega);
    if (mega) {
      const bodyTouch = (x: number, y: number, pad: number) => {
        for (let n = 0; n < SHARK_NODES; n += 2) {
          if (Math.hypot(mega.nodes[n * 2] - x, mega.nodes[n * 2 + 1] - y) < mega.length * 0.06 + pad) return true;
        }
        return false;
      };
      const bt = mega.biteTarget;
      const tx = bt ? (bt.shark ? bt.shark.nodes[0] : bt.fish!.x) : 0;
      const ty = bt ? (bt.shark ? bt.shark.nodes[1] : bt.fish!.y) : 0;
      const gone = !bt || time > bt.until || (bt.shark ? !this.sharks.includes(bt.shark) : !bt.fish!.alive);
      if (gone) mega.biteTarget = undefined;
      else if (time >= (mega.nextBite ?? 0) && Math.hypot(mega.nodes[0] - tx, mega.nodes[1] - ty) < mega.length * 0.07 + (bt!.shark ? bt!.shark.length * 0.05 : 14)) {
        // Its mouth has reached what it turned on: now it bites.
        mega.biteTarget = undefined;
        mega.nextBite = time + 2.5;
        this.events.push({ kind: "eat", x: tx, y: ty });
        if (bt!.shark) {
          const victim = bt!.shark;
          this.splash(tx, ty, 1.8);
          if (Math.random() < 0.4) {
            this.sharks = this.sharks.filter((sh) => sh !== victim);
            if (this.fight && (this.fight.a === victim || this.fight.b === victim)) this.fight = null;
            this.callout(tx, ty - 40, "SHARK EATEN", "255,120,110");
            this.notices.push("the megalodon ate a shark... ouch!");
          } else {
            // Snapped at and sent flying: it bolts away from the megalodon.
            victim.heading = Math.atan2(ty - mega.nodes[1], tx - mega.nodes[0]);
            victim.speed = 150;
            victim.target = null;
            victim.alertUntil = time + 2;
            this.callout(tx, ty - 40, "SHARK BITTEN", "255,170,120");
          }
        } else {
          const d = bt!.fish!;
          if (this.blasterEscape(d, 0.4, mega.nodes[0], mega.nodes[1])) return;
          d.alive = false;
          d.respawnAt = time + rand(3, 8);
          this.callout(tx, ty - 30, "DIVER EATEN", "255,120,110");
        }
      } else if (!mega.biteTarget) {
        // Brushing its body isn't fatal: it just notices whatever touched it and swings round to deal with it.
        const shark = this.sharks.find((sh) => !sh.mega && !sh.leaving && !sh.grabbed && !sh.lifted && !sh.ufoCharge && bodyTouch(sh.nodes[0], sh.nodes[1], sh.length * 0.05));
        const diver = shark ? undefined : this.fish.find((f) => f.diver && f.alive && !f.seized && !f.riding && !f.dragger && bodyTouch(f.x, f.y, 6));
        if (shark || diver) mega.biteTarget = { shark, fish: diver, until: time + 4 };
      }
    }
    const k = this.kraken;
    if (k && (k.state === "enter" || k.state === "grab") && k.grabbed.length < 4) {
      const prey = this.sharks.find((sh) => !sh.mega && !sh.leaving && !sh.grabbed && !sh.lifted && !sh.ufoCharge && Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y) < k.size * 0.25 && Math.abs(angleDiff(k.heading + Math.PI, Math.atan2(sh.nodes[1] - k.y, sh.nodes[0] - k.x))) < 1.2);
      if (prey) {
        prey.grabbed = true;
        prey.grabbedAt = this.time;
        prey.target = null;
        prey.devourAt = this.time + rand(8, 16);
        k.grabbed.push(prey);
        this.callout(prey.nodes[0], prey.nodes[1] - 40, "SHARK SEIZED", "255,170,120");
      }
    }
  }

  /** Where rescuing sharks head: the kraken while it holds something, or the whale while it is being mauled. */
  private rallyPoint(): { x: number; y: number } | null {
    return this.kraken?.rally ? this.kraken : null;
  }

  private endWhaleFight() {
    this.whaleFight = null;
  }

  /** The megalodon chases the whale down and savages it: usually the whale is eaten, sometimes it gets away. */
  private stepWhaleFight(dt: number) {
    const wf = this.whaleFight;
    if (!wf) return;
    const { time } = this;
    const wh = this.whale;
    if (!wh || wh.fleeing || !this.sharks.includes(wf.mega)) { this.endWhaleFight(); return; }
    const mega = wf.mega;
    const m = this.whaleMid(wh);
    // The whale tries to lumber away, thrashing, while the megalodon runs it down.
    const away = Math.atan2(m.y - mega.nodes[1], m.x - mega.nodes[0]);
    wh.speed += (48 - wh.speed) * Math.min(1, dt * 1.2);
    // The whale is one long rigid body swinging about its head, so it turns slowly: a quick turn would whip its tail round.
    wh.heading += clamp(angleDiff(wh.heading, away), -0.15 * dt, 0.15 * dt);
    wh.phase += dt * 1.8;
    // A megalodon that can't get a grip within a few seconds gives up, and the whale carries on unharmed.
    if (!wf.locked && time - wf.start > 9) { mega.whaleAttack = false; this.endWhaleFight(); return; }
    if (wf.locked && time >= wf.nextHit) {
      wf.nextHit = time + rand(0.7, 1.1);
      const bx = mega.nodes[0];
      const by = mega.nodes[1];
      this.events.push({ kind: "eat", x: bx, y: by });
      this.events.push({ kind: "eat", x: (bx + m.x) / 2, y: (by + m.y) / 2 });
      this.splash(bx, by, 1.7);
    }
    if (time < wf.until) return;
    this.endWhaleFight();
    if (wf.doomed) {
      for (let u = 0.1; u < 1; u += 0.2) this.events.push({ kind: "eat", x: wh.x - Math.cos(wh.heading) * wh.length * u, y: wh.y - Math.sin(wh.heading) * wh.length * u });
      this.splash(m.x, m.y, 2.8);
      this.callout(m.x, m.y - 60, "MEGALODON WINS - WHALE EATEN", "255,120,110");
      this.notices.push("the megalodon ate the whale... the sea goes quiet...");
      // What is left of the whale drifts down as scraps for the sharks to clean up.
      const wx = Math.cos(wh.heading);
      const wy = Math.sin(wh.heading);
      const bits: [string, string][] = [["#", "205,220,240"], ["%", "170,190,225"], ["@", "235,240,250"], ["*", "200,70,80"], [":", "190,60,70"], ["o", "245,245,240"]];
      for (let i = 0; i < 40; i++) {
        const u = rand(0.05, 0.95);
        const a = rand(0, TAU);
        const sp = rand(10, 60);
        const [glyph, rgb] = bits[i % bits.length];
        this.mess.push({ x: wh.x - wx * wh.length * u, y: wh.y - wy * wh.length * u, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
      }
      this.sharks
        .filter((sh) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.leaving && !sh.dragging && !(this.fight && (sh === this.fight.a || sh === this.fight.b)))
        .sort((a, b) => Math.hypot(a.nodes[0] - m.x, a.nodes[1] - m.y) - Math.hypot(b.nodes[0] - m.x, b.nodes[1] - m.y))
        .slice(0, 4)
        .forEach((sh) => { sh.cleaning = true; sh.target = null; sh.alertUntil = time + 1.2; });
      this.whale = null;
    } else {
      this.attackWhale(mega.nodes[0], mega.nodes[1], "WHALE ESCAPES", "the whale escaped the megalodon");
    }
  }

  /** Ink clouds drift and thin out; fish swim out of them. */
  private stepInk(dt: number) {
    if (!this.inks.length) return;
    const { time } = this;
    this.inks = this.inks.filter((c) => time - c.born < c.life);
    for (const c of this.inks) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.pow(0.8, dt);
      c.vy *= Math.pow(0.8, dt);
      const R = c.r0 + (c.r1 - c.r0) * Math.min(1, (time - c.born) / 3);
      for (const f of this.fish) {
        if (!f.alive || f.seized || f.riding) continue;
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d >= R || d < 1e-3) continue;
        const w = (1 - d / R) * 320 * dt;
        f.vx += (dx / d) * w;
        f.vy += (dy / d) * w;
      }
    }
  }

  /** 0 while a kraken is far from its target (swim head first), rising smoothly to 1 as it closes in (arms toward the target). */
  private krakenTurnIn(gap: number, size: number) {
    const t = clamp((size * 2.2 - gap) / (size * 1.5), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** A spot on the whale's body (u: 0 head → 1 tail) where a megalodon can clamp on. */
  private whaleBitePoint(wh: Whale, u: number) {
    return { x: wh.x - Math.cos(wh.heading) * wh.length * u, y: wh.y - Math.sin(wh.heading) * wh.length * u };
  }

  private whaleMid(wh: Whale) {
    return { x: wh.x - Math.cos(wh.heading) * wh.length * 0.4, y: wh.y - Math.sin(wh.heading) * wh.length * 0.4 };
  }

  /** A whale that has been bitten or wrapped bolts away from whatever got it, clearing the board. */
  private attackWhale(fromX: number, fromY: number, text: string, notice: string) {
    const wh = this.whale;
    if (!wh) return;
    const m = this.whaleMid(wh);
    wh.fleeing = true;
    wh.fleeHeading = Math.atan2(m.y - fromY, m.x - fromX);
    this.events.push({ kind: "eat", x: m.x, y: m.y });
    this.splash(m.x, m.y, 2.4);
    this.callout(m.x, m.y - 60, text, "255,255,255");
    this.notices.push(notice);
  }

  /** Let go of every diver it is holding; they bolt away. */
  private dropCaught(k: Kraken) {
    for (const f of k.caught) {
      delete f.seized;
      if (f.alive) { f.vx = Math.cos(k.heading + Math.PI) * 50; f.vy = Math.sin(k.heading + Math.PI) * 50; }
    }
    k.caught = [];
    k.strike = null;
    k.ufoStrike = null;
    if (k.ufoHeld && this.ufo) { this.ufo.held = false; this.ufo.fast = true; this.ufo.state = "leave"; }
    k.ufoHeld = false;
  }

  /** While it holds sharks the kraken may eat one, lets another slip away, and snatches a fresh one from nearby. */
  private krakenFeed(k: Kraken) {
    const { time } = this;
    for (const sh of [...k.grabbed]) {
      sh.devourAt ??= time + rand(7, 15);
      if (time < sh.devourAt) continue;
      // Wait until the shark has been reeled in to the beak.
      if (Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y) > k.size * 0.4 + sh.length * 0.2 + 40) { sh.devourAt = time + 1; continue; }
      k.grabbed = k.grabbed.filter((o) => o !== sh);
      sh.devourAt = undefined;
      if (k.meals < 1 && this.sharks.filter((o) => !o.mega).length > 2 && Math.random() < KRAKEN_EAT_CHANCE) {
        k.meals++;
        this.sharks = this.sharks.filter((o) => o !== sh);
        this.events.push({ kind: "eat", x: sh.nodes[0], y: sh.nodes[1] });
        this.splash(k.x, k.y, 2.2);
        this.notices.push("the kraken ate a shark... gulp!");
        this.callout(k.x, k.y - k.size * 0.25, "SHARK EATEN", "255,120,110");
        this.nextSharkDrift = Math.min(this.nextSharkDrift, time + rand(10, 18));
        this.growNext = true;
      } else {
        sh.grabbed = false;
        this.splash(sh.nodes[0], sh.nodes[1], 1.6);
        this.notices.push("a shark wriggled free! phew!");
        this.callout(sh.nodes[0], sh.nodes[1] - 30, "SHARK ESCAPES", "150,255,190");
      }
      k.nextGrab = time + rand(3, 6);
    }
    if (k.grabbed.length < k.grabCount && k.regrabs < 3 && time >= k.nextGrab) {
      k.nextGrab = time + rand(3, 6);
      let pick: Shark | null = null;
      let best = k.size * 1.25;
      for (const sh of this.sharks) {
        if (sh.mega || sh.grabbed || sh.lifted || sh.ufoCharge || sh.leaving || sh.cleaning || sh.dragging) continue;
        if (this.fight && (sh === this.fight.a || sh === this.fight.b)) continue;
        const d = Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y);
        if (d < best) { best = d; pick = sh; }
      }
      if (pick) {
        pick.grabbed = true;
        pick.target = null;
        pick.devourAt = time + rand(6, 12);
        k.grabbed.push(pick);
        k.regrabs++;
      }
    }
  }

  /** strength: ~0.25 hover wake, ~0.55 drag trail, 2.5 click or finished task. */
  splash(x: number, y: number, strength = 1, hue?: 0 | 1, opts?: { dir?: number; weight?: number; max?: number; quiet?: boolean; song?: boolean }) {
    if (this.ripples.length >= (strength < 1.2 ? 48 : 64)) return;
    // Only a heavy splash gets the burst at its centre; a trail is just clean rings.
    if (strength >= 1.2 && !opts?.quiet) this.events.push({ kind: "splash", x, y, strength });
    const far = Math.max(x, this.width - x);
    const deep = Math.max(y, this.height - y);
    const full = Math.hypot(far, deep) + 40;
    // Light touches die out nearby; only a heavy splash crosses the whole tank.
    const max = opts?.max ? Math.min(full, opts.max) : strength >= 1.2 ? full : Math.min(full, 90 + 200 * strength);
    const amp = new Float32Array(RIPPLE_SEGMENTS).fill(1);
    // Something moving throws its wake out sideways and behind it, not evenly all round.
    if (opts?.dir !== undefined) {
      for (let k = 0; k < RIPPLE_SEGMENTS; k++) {
        const ang = ((k + 0.5) / RIPPLE_SEGMENTS) * TAU - Math.PI;
        const behind = 0.5 + 0.5 * Math.cos(angleDiff(ang, opts.dir + Math.PI));
        amp[k] = 0.1 + 0.9 * Math.pow(behind, 1.3);
      }
    }
    this.ripples.push({ x, y, r: 0, max, strength, amp, rate: opts?.song ? 0.42 : rand(0.88, 1.14), ...(opts?.song ? { song: true as const } : {}), ...(opts?.weight ? { weight: opts.weight } : {}), ...(hue ? { hue: 1 as const } : {}) });
  }

  /**
   * Rings expand and push each fish once as their front passes. Where two rings
   * cross, the stretch of ring in contact breaks up (its amplitude drains away)
   * and throws off a small burst, so waves scatter instead of passing through.
   */
  private stepRipples(dt: number) {
    for (const rp of this.ripples) {
      const from = rp.r;
      // Rings slow as they spread and fade, like a swell settling.
      rp.r += RIPPLE_SPEED * (rp.rate ?? 1) * (0.55 + 0.45 * Math.max(0, 1 - rp.r / rp.max)) * dt;
      const fade = 1 - rp.r / rp.max;
      const wt = rp.weight ?? 1;
      if (wt >= 2) {
        // A bigger creature's wake shoves smaller ones: titans move the whale, and the whale moves sharks.
        const nudge = (px: number, py: number, power: number, move: (nx: number, ny: number, k: number) => void) => {
          const ddx = px - rp.x;
          const ddy = py - rp.y;
          const d = Math.hypot(ddx, ddy);
          const off = Math.abs(d - rp.r);
          if (off > 45 || d < 1e-3) return;
          const seg = Math.floor(((Math.atan2(ddy, ddx) + Math.PI) / TAU) * RIPPLE_SEGMENTS) % RIPPLE_SEGMENTS;
          move(ddx / d, ddy / d, power * fade * rp.strength * rp.amp[seg] * (1 - off / 45) * dt);
        };
        if (wt >= 3 && this.whale) {
          const wh = this.whale;
          const m = this.whaleMid(wh);
          nudge(m.x, m.y, 70, (nx, ny, k) => { wh.x += nx * k; wh.y += ny * k; });
        }
        for (const sh of this.sharks) {
          if (sh.mega || sh.grabbed || sh.lifted) continue;
          nudge(sh.nodes[0], sh.nodes[1], 40 * (wt - 1), (nx, ny, k) => { sh.nodes[0] += nx * k; sh.nodes[1] += ny * k; });
        }
      }
      for (const f of rp.song ? [] : this.fish) {
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
    this.stepInk(dt);
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
      if (!f.alive || f.diver) continue;
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
      if (!f.alive || f.diver) continue;
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
    const whale = this.whale;
    const fight = this.fight;

    for (const sh of sharks) {
      const L = sh.length;
      const nodes = sh.nodes;
      const hx = nodes[0];
      const hy = nodes[1];

      sh.hunger = Math.min(1, sh.hunger + dt * 0.03);

      // A shark with a diver in its jaws swims it around for a while, then eats it or lets go.
      if (sh.dragging) {
        if (!sh.dragging.alive || sh.dragging.dragger !== sh) sh.dragging = undefined;
        else if (time > (sh.dragUntil ?? 0)) this.endDrag(sh);
      }

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
      const t = sh.dragging ? null : sh.target;
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
      let lunging = false;
      let fighting = false;
      if (sh.mega) {
        // Homes in on the kraken while there is one; otherwise holds its line.
        // The megalodon is not picky: it goes after any diver in the water (and eats every one it reaches).
        let diverPrey: Fish | null = null;
        let dd = Infinity;
        for (const f of this.fish) {
          if (!f.diver || !f.alive || f.riding || f.seized || !this.onScreen(f)) continue;
          const d = Math.hypot(f.x - hx, f.y - hy);
          if (d < dd) { dd = d; diverPrey = f; }
        }
        const prey = sh.retreat ? null : kraken && (kraken.state !== "flee" || time < (sh.chaseUntil ?? 0)) ? { x: kraken.x, y: kraken.y } : whale && !whale.fleeing && sh.whaleAttack !== false ? this.whaleMid(whale) : diverPrey ? { x: diverPrey.x, y: diverPrey.y } : this.ufo ? { x: this.ufo.x, y: this.ufo.y } : null;
        if (prey) {
          const want = Math.atan2(prey.y - hy, prey.x - hx);
          const cur = sh.megaHeading ?? sh.heading;
          sh.megaHeading = cur + clamp(angleDiff(cur, want), -(kraken ? 0.25 : 0.4) * dt, (kraken ? 0.25 : 0.4) * dt);
        }
        // Wrapped by the kraken it whips its head about; a winning megalodon thrashes harder as the fight goes on.
        let wobble = 0;
        if (kraken?.state === "wrap" && kraken.wrapping === sh) {
          const progress = clamp((time - kraken.stateAt) / kraken.wrapFor, 0, 1);
          const power = kraken.winner === "mega" ? 0.6 + 0.6 * progress : 0.7 * (1 - 0.8 * progress);
          wobble = Math.sin(time * (time < kraken.shakeUntil ? 8 : 4.5)) * power * (time < kraken.shakeUntil ? 0.9 : 0.35);
        }
        // It will bite a whale it reaches, and the whale bolts.
        if (whale && !whale.fleeing && !sh.retreat && sh.whaleAttack !== false && time - (sh.born ?? 0) > 8) {
          const wm = this.whaleMid(whale);
          let touch = Infinity;
          for (let u = 0; u <= 1; u += 0.1) touch = Math.min(touch, Math.hypot(whale.x - Math.cos(whale.heading) * whale.length * u - hx, whale.y - Math.sin(whale.heading) * whale.length * u - hy));
          // It has to actually reach the whale: the attacker closes the gap.
          if (!this.whaleFight && touch < whale.length * 0.1 + 30) {
            // It turns in toward the nape (just behind the head) or the middle of the body; the fight proper starts when it clamps on.
            this.whaleFight = { mega: sh, start: time, until: Infinity, nextHit: Infinity, doomed: Math.random() < 0.75, bite: Math.random() < 0.4 ? rand(0.17, 0.24) : rand(0.38, 0.5), locked: false };
          }
        }
        let aim = sh.megaHeading ?? sh.heading;
        if (sh.biteTarget && !sh.retreat && kraken?.state !== "wrap" && !this.whaleFight) {
          // It turns on whatever brushed its body, then snaps at it with its mouth.
          const bt = sh.biteTarget;
          aim = Math.atan2((bt.shark ? bt.shark.nodes[1] : bt.fish!.y) - hy, (bt.shark ? bt.shark.nodes[0] : bt.fish!.x) - hx);
        }
        const wf = this.whaleFight;
        if (wf?.mega === sh && whale) {
          // It swims at its bite spot on the whale's flank, then clamps on and worries it, head whipping side to side.
          const bp = this.whaleBitePoint(whale, wf.bite);
          const toBite = Math.hypot(bp.x - hx, bp.y - hy);
          if (!wf.locked && toBite < L * 0.1 + 20) {
            wf.locked = true;
            wf.until = time + rand(5.5, 8);
            wf.nextHit = time + 0.5;
            const wm = this.whaleMid(whale);
            this.events.push({ kind: "eat", x: hx, y: hy });
            this.splash(hx, hy, 2.2);
            this.callout(wm.x, wm.y - 60, "MEGALODON ATTACKS WHALE", "255,255,255");
            this.notices.push("the megalodon attacked the whale!");
          }
          aim = Math.atan2(bp.y - hy, bp.x - hx);
          wobble = wf.locked ? Math.sin(time * 5) * 0.25 : 0;
        }
        // How hard it is thrashing, smoothed so the body wave builds and fades instead of jumping.
        let thrashTo = 0;
        if (kraken?.state === "wrap" && kraken.wrapping === sh) {
          const prog = clamp((time - kraken.stateAt) / kraken.wrapFor, 0, 1);
          thrashTo = (kraken.winner === "mega" ? 0.45 + 0.3 * prog : 0.5 * (1 - 0.7 * prog)) * (time < kraken.shakeUntil ? 1.25 : 1);
        } else if (this.whaleFight?.mega === sh && this.whaleFight.locked) thrashTo = 0.35;
        sh.thrash = (sh.thrash ?? 0) + (thrashTo - (sh.thrash ?? 0)) * Math.min(1, dt * 4);
        dx = Math.cos(aim + wobble);
        dy = Math.sin(aim + wobble);
        hunting = false;
      } else if (sh.grabbed && kraken) {
        // Hauled toward the kraken, thrashing against the arms.
        const ox = kraken.x - hx;
        const oy = kraken.y - hy;
        const d = Math.hypot(ox, oy) || 1;
        const thrash = (Math.sin(time * 4.5 + sh.id * 2.3) + 0.6 * Math.sin(time * 7 + sh.id)) * 1.6;
        // Reeled in with jolts, not a steady beam.
        const jolt = Math.max(0, Math.sin(time * 2.6 + sh.id));
        // Nothing hauls it in until the arms have actually reached it.
        const reached = clamp((time - (sh.grabbedAt ?? -9) - 1.2) / 0.8, 0, 1);
        const pull = (d > kraken.size * 0.4 + L * 0.2 ? 0.25 + 1.2 * jolt : 0.1) * reached;
        dx = (ox / d) * pull + (-oy / d) * thrash;
        dy = (oy / d) * pull + (ox / d) * thrash;
        held = true;
        hunting = false;
        sh.target = null;
      } else if (sh.leaving) {
        // Swims off the nearest way out and is gone.
        const ox = hx - cxW;
        const oy = hy - cyW;
        const od = Math.hypot(ox, oy) || 1;
        dx = (ox / od) * 3;
        dy = (oy / od) * 3;
        hunting = false;
        sh.target = null;
      } else if (sh.rallying && this.rallyPoint()) {
        // Charges in to help whoever is being crushed or mauled.
        const rp = this.rallyPoint()!;
        const ox = rp.x - hx;
        const oy = rp.y - hy;
        const od = Math.hypot(ox, oy) || 1;
        dx = (ox / od) * 3;
        dy = (oy / od) * 3;
        fighting = true;
        lunging = true;
        hunting = false;
        sh.target = null;
      } else if (sh.cleaning && this.mess.length) {
        // Swims to the nearest scrap of the popped diver and eats it.
        let near = this.mess[0];
        let nd2 = Infinity;
        for (const m of this.mess) {
          const d2 = (m.x - hx) ** 2 + (m.y - hy) ** 2;
          if (d2 < nd2) { nd2 = d2; near = m; }
        }
        const ox = near.x - hx;
        const oy = near.y - hy;
        const od = Math.hypot(ox, oy) || 1;
        dx = (ox / od) * 3;
        dy = (oy / od) * 3;
        fighting = true;
        hunting = false;
        sh.target = null;
      } else if (sh.lifted) {
        // Dangling in the saucer's beam, thrashing.
        const thrash = (Math.sin(time * 11 + sh.id * 2.3) + 0.6 * Math.sin(time * 17 + sh.id)) * 1.6;
        dx = Math.cos(sh.heading) - Math.sin(sh.heading) * thrash;
        dy = Math.sin(sh.heading) + Math.cos(sh.heading) * thrash;
        held = true;
        hunting = false;
        sh.target = null;
      } else if (sh.ufoCharge && this.ufo) {
        // Straight at the saucer, fast.
        const ox = this.ufo.x - hx;
        const oy = this.ufo.y - hy;
        const od = Math.hypot(ox, oy) || 1;
        dx = (ox / od) * 3;
        dy = (oy / od) * 3;
        fighting = true;
        lunging = true;
        hunting = false;
        sh.target = null;
      } else if (fight && (sh === fight.a || sh === fight.b)) {
        // Circle the other shark at a respectful distance, then lunge in.
        const other = sh === fight.a ? fight.b : fight.a;
        const ox = other.nodes[0] - hx;
        const oy = other.nodes[1] - hy;
        const od = Math.hypot(ox, oy) || 1;
        const rx = hx - fight.mx;
        const ry = hy - fight.my;
        const rd = Math.hypot(rx, ry) || 1;
        const R0 = (fight.a.length + fight.b.length) * 0.3;
        lunging = !fight.engaged || time < fight.lungeUntil;
        if (lunging) {
          dx = (ox / od) * 3;
          dy = (oy / od) * 3;
        } else {
          const pull = ((R0 - rd) / R0) * 1.3;
          dx = (-ry / rd) * fight.dir + (rx / rd) * pull;
          dy = (rx / rd) * fight.dir + (ry / rd) * pull;
        }
        fighting = true;
        hunting = false;
        sh.target = null;
      } else {
        const threats = [
          mega && { x: mega.nodes[0], y: mega.nodes[1], reach: Math.max(W, H) * 0.9, sprint: 0.5 },
          kraken && { x: kraken.x, y: kraken.y, reach: kraken.size * 1.3, sprint: 1 },
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
            // A gentle drift away from afar that firms up as it gets closer, so the titan always has open water
            // around it without every shark sprinting across the tank.
            const w = 3 + 11 * Math.pow(1 - d / threat.reach, 1.5);
            dx += (ox / d) * w;
            dy += (oy / d) * w;
            if (d < threat.reach * threat.sprint) fleeing = true;
            hunting = false;
            sh.target = null;
          }
        }
      }
      // Nothing bumps into the saucer: sharks steer around it and stay out of its beam.
      const saucer = this.ufo;
      if (saucer && !sh.mega && !sh.ufoCharge && saucer.targetShark !== sh) {
        for (const ahead of [0, 0.5, 1]) {
          const qx = hx + Math.cos(sh.heading) * L * ahead;
          const qy = hy + Math.sin(sh.heading) * L * ahead;
          const ox = qx - saucer.x;
          const oy = qy - saucer.y;
          const od = Math.hypot(ox, oy) || 1;
          if (od < 250) { const w = (1 - od / 250) * 16; dx += (ox / od) * w; dy += (oy / od) * w; }
          if ((saucer.state === "beam" || saucer.state === "seek") && qy > saucer.y - 40 && Math.abs(qx - saucer.beamX) < 170) {
            const w = (1 - Math.abs(qx - saucer.beamX) / 170) * 16;
            dx += (qx >= saucer.beamX ? 1 : -1) * w;
          }
        }
      }
      const desired = Math.atan2(dy, dx);
      // Sharks can't pivot on the spot: the turning circle grows with speed.
      const agility = Math.min(sh.mega ? (sh.retreat ? 0.6 : sh.biteTarget ? 0.7 : 0.3) : held ? 3 : fighting ? 1.8 : fleeing ? 2 : hunting ? 1.7 + closing : 0.8, sh.speed / (L * 0.22));
      const maxTurn = agility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = 30 + L * 0.04;
      const targetSpeed = sh.mega ? (kraken?.state === "wrap" ? 12 : this.whaleFight?.mega === sh ? 62 : sh.retreat ? 140 : kraken ? 46 : whale && !whale.fleeing && !sh.retreat && sh.whaleAttack !== false ? 58 : 30 + L * 0.015) : held ? 30 : fighting ? cruise * (lunging ? 2.4 : 1.3) : fleeing ? cruise * 2.3 : hunting ? cruise * (1.45 + closing * 1.5) : cruise;
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * (sh.mega && sh.retreat ? 1.7 : 1.1));
      // A megalodon keeps a slow, heavy tail beat even when it surges (more push per stroke, not faster strokes), and only lashes quickly while thrashing.
      sh.phase += dt * (sh.mega ? 1.0 + Math.min(sh.speed, 200) / 120 + 2.2 * (sh.thrash ?? 0) : 2 + sh.speed / 24);

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;
      if (sh.mega && this.whaleFight?.mega === sh && this.whaleFight.locked && whale) {
        // Clamped on: the head eases onto the whale's flank and is dragged along with it, the body following smoothly.
        const bp = this.whaleBitePoint(whale, this.whaleFight.bite);
        const k = Math.min(1, dt * 4);
        nodes[0] += (bp.x - nodes[0]) * k;
        nodes[1] += (bp.y - nodes[1]) * k;
      }
      if (sh.mega) {
        sh.wakeD = (sh.wakeD ?? 0) + sh.speed * dt;
        if (sh.wakeD > L * 0.09) {
          sh.wakeD = 0;
          const mid = SHARK_NODES >> 1;
          this.splash(nodes[mid * 2], nodes[mid * 2 + 1], 1.15, undefined, { dir: sh.heading, weight: 3, max: L * 0.8, quiet: true });
          this.splash(nodes[(SHARK_NODES - 2) * 2], nodes[(SHARK_NODES - 2) * 2 + 1], 1.1, undefined, { dir: sh.heading, weight: 3, max: L * 0.7, quiet: true });
        }
      }

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

      // The diver in its jaws goes where it goes, kicking.
      if (sh.dragging) {
        const d = sh.dragging;
        d.x = nodes[2];
        d.y = nodes[3];
        d.vx = Math.cos(sh.heading) * sh.speed;
        d.vy = Math.sin(sh.heading) * sh.speed;
        d.phase += dt * 9;
      }

      // Feed.
      if (sh.hunger > 0.15) {
        const mouthR = L * 0.05 + 8;
        const mx = nodes[0];
        const my = nodes[1];
        for (const f of this.fish) {
          if (!f.alive || f.riding || f.seized) continue;
          // A shark eats one diver at a time; once fed it leaves the rest alone. The megalodon eats them all.
          if (f.diver && !sh.mega && (sh.dragging || (sh.fedUntil ?? 0) > time || sh.target !== f)) continue;
          if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
            if (f.dkind === "bomber" && f.fuseAt !== undefined) { this.explode(f.x, f.y, f); continue; }
            if (f.diver && !sh.mega && this.blasterEscape(f, 0.55, mx, my)) { sh.target = null; sh.fedUntil = time + 12; sh.alertUntil = 0; continue; }
            // Some sharks grab a diver and carry it about instead of swallowing it at once.
            if (f.diver && !sh.mega && Math.random() < ((f.stunUntil ?? 0) > time ? 0.7 : 0.4)) {
              sh.dragging = f;
              f.dragger = sh;
              sh.dragUntil = time + rand(6, 12);
              sh.alertUntil = 0;
              continue;
            }
            f.alive = false;
            if (f.diver && !sh.mega) sh.fedUntil = time + 40;
            f.respawnAt = time + rand(3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y });
          }
        }
      }
    }
  }

  /** Sharks come and go: now and then one swims in from an edge, or a spare one leaves. */
  private stepSharkDrift() {
    const { time, width: W, height: H } = this;
    if (this.sharks.some((sh) => sh.leaving && Math.max(-sh.nodes[0], sh.nodes[0] - W, -sh.nodes[1], sh.nodes[1] - H) > sh.length * 1.05)) {
      this.sharks = this.sharks.filter((sh) => !(sh.leaving && Math.max(-sh.nodes[0], sh.nodes[0] - W, -sh.nodes[1], sh.nodes[1] - H) > sh.length * 1.05));
    }
    if (this.sharkCap < 4 || time < this.nextSharkDrift || W === 0) return;
    // Around a titan the tank stays full: sharks arrive quickly, none leave, and a couple extra are allowed
    // so there are always some close enough to come to the rescue.
    const titan = !!this.kraken || this.sharks.some((sh) => sh.mega);
    this.nextSharkDrift = time + (titan ? rand(4, 10) : rand(18, 50));
    const staying = this.sharks.filter((sh) => !sh.mega && !sh.leaving);
    const cap = this.sharkCap + (titan ? 2 : 0);
    const least = Math.max(2, Math.round(this.sharkCap * 0.4));
    const grow = titan || this.growNext || staying.length <= least || (staying.length < cap && Math.random() < 0.5);
    this.growNext = false;
    if (grow) {
      if (staying.length < cap) this.addShark();
      return;
    }
    const spare = staying.filter((sh) => !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.cleaning && !sh.dragging && this.ufo?.targetShark !== sh && !(this.fight && (sh === this.fight.a || sh === this.fight.b)));
    if (spare.length) spare[randInt(0, spare.length - 1)].leaving = true;
  }

  /** A new shark swims in from just off an edge. */
  private addShark() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const spec = this.sharkSpecs[randInt(0, this.sharkSpecs.length - 1)];
    const size = spec.size * rand(0.6, 1);
    const length = clamp(minSide * 0.44, 170, 430) * size;
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -length * 0.2 : side === 1 ? W + length * 0.2 : along * W;
    const y = side === 2 ? -length * 0.2 : side === 3 ? H + length * 0.2 : along * H;
    const heading = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.4, 0.4);
    const nodes = new Float32Array(SHARK_NODES * 2);
    const seg = length / (SHARK_NODES - 1);
    for (let n = 0; n < SHARK_NODES; n++) {
      nodes[n * 2] = x - Math.cos(heading) * seg * n;
      nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
    }
    this.sharks.push({
      id: this.sharkId++, kind: spec.kind, length, nodes, heading, speed: 40, phase: rand(0, TAU), turn: 0,
      hunger: rand(0.25, 0.75), wander: 0, orbitDir: Math.random() < 0.5 ? 1 : -1, orbitRadius: minSide * rand(0.28, 0.4),
      target: null, retargetAt: 0, depth: size,
    });
    this.sharks.sort((a, b) => a.length - b.length);
  }

  /** The carry is over: the shark swallows the diver, or lets it go to bolt away. */
  private endDrag(sh: Shark) {
    const f = sh.dragging;
    sh.dragging = undefined;
    sh.target = null;
    sh.fedUntil = this.time + 40;
    if (!f) return;
    delete f.dragger;
    if (!f.alive) return;
    if (Math.random() < 0.55) {
      f.alive = false;
      sh.hunger = Math.max(0, sh.hunger - 0.16);
      this.events.push({ kind: "eat", x: f.x, y: f.y });
    } else {
      this.diverInterest.set(f, false);
      f.vx = Math.cos(sh.heading + 1.6) * 45;
      f.vy = Math.sin(sh.heading + 1.6) * 45;
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
      if (!f.alive || f.diver) continue;
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
