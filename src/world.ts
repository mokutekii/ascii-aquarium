/**
}
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
import { TRAITS } from "./sharks";
import { CLASH_AMBIENT, FRENZY_LINES, pickLine } from "./lines";
import { titanMethods, type TitanMethods } from "./titans";
import { DEFAULT_SHARKS, SHARK_NODES, SharkKind, SharkSpec, DiverKind, DIVER_MASS, DIVER_SUIT, Fish, Shark, Kraken, Jelly, Whale, Fight, EventLevel, Ufo, SagaKind, Saga, Whirl, BaitBall, Ripple, WorldEvent, KRAKEN_EAT_CHANCE, STRIKE_TIME, KRAKEN_ARC } from "./types";
export * from "./types";


const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const RIPPLE_SPEED = 150; // px/s
const RIPPLE_SEGMENTS = 96;
const DAY_LEN = 540; // seconds for one full day and night
const RIPPLE_BAND = 14; // px either side of a ring that counts as contact
const BLIND_COS = -0.6; // ~127° either side of the heading is visible

export type EventKind = "chase" | "mega" | "kraken" | "saga" | "bait" | "jelly" | "whale" | "whirl" | "fight" | "ufo" | "diver" | "night" | "yeat" | "moon" | "meteor" | "maelstrom" | "bloom" | "migration" | "current";

/** Seconds a kind of random event rests after it fires. */
const COOLDOWNS: Record<string, number> = {
  current: 90, chase: 20, bait: 60, jelly: 60, whale: 100, whirl: 60, fight: 60, ufo: 70, diver: 16,
  moon: 240, meteor: 150, maelstrom: 180, bloom: 150, migration: 180,
};

export class World {
  readonly disabledEvents = new Set<EventKind>();
  readonly eventQueue: EventKind[] = [];
  currentUntil = 0;
  nextQueuedAt = 0;
  /** When each kind of random event may fire again. Manual events ignore this. */
  cooldownUntil: Record<string, number> = {};

  isEventEnabled(kind: EventKind) {
    return !this.disabledEvents.has(kind)
      && (kind !== "night" || this.settings.night)
      && (kind !== "saga" || (!this.disabledEvents.has("mega") && !this.disabledEvents.has("kraken")));
  }

  setEventEnabled(kind: EventKind, enabled: boolean) {
    if (enabled) this.disabledEvents.delete(kind);
    else {
      this.disabledEvents.add(kind);
      for (let i = this.eventQueue.length - 1; i >= 0; i--) if (this.eventQueue[i] === kind) this.eventQueue.splice(i, 1);
      this.sagaQueue = this.sagaQueue.filter(k => (k === "clash" ? "saga" : k) !== kind);
      if (this.pendingTitan === kind) this.pendingTitan = null;
      if (kind === this.krakenQueuedAs) this.krakenQueued = false;
      if (kind === "mega" || kind === "kraken") this.cancelQueuedEvent("saga");
      if (kind === "diver") { this.diverQueue.length = 0; this.techQueue.length = 0; }
      if (kind === "ufo" && this.invasion) this.invasion.total = this.invasion.spawned;
    }
  }

  queueEvent(kind: EventKind): "queued" | "already" | "off" {
    if (!this.isEventEnabled(kind)) return "off";
    if (this.eventQueue.includes(kind)) return "already";
    this.eventQueue.push(kind);
    return "queued";
  }

  cancelQueuedEvent(kind: EventKind) {
    const index = this.eventQueue.indexOf(kind);
    if (index >= 0) this.eventQueue.splice(index, 1);
    this.sagaQueue = this.sagaQueue.filter(k => (k === "clash" ? "saga" : k) !== kind);
    if (this.pendingTitan === kind) this.pendingTitan = null;
    if (kind === this.krakenQueuedAs) this.krakenQueued = false;
  }

  eventStatus(kind: EventKind): "disabled" | "queued" | "running" | "ready" {
    if (!this.isEventEnabled(kind)) return "disabled";
    if (this.eventQueue.includes(kind) || this.sagaQueue.some(k => (k === "clash" ? "saga" : k) === kind) || this.pendingTitan === kind || (kind === this.krakenQueuedAs && this.krakenQueued)) return "queued";
    if (kind === "whale") return this.whales.length ? "running" : "ready";
    if (kind === "ufo") return this.ufos.length ? "running" : "ready";
    if (kind === "night") return this.night > 0.05 ? "running" : "ready";
    if (kind === "yeat") return this.time < this.yeatUntil ? "running" : "ready";
    return this.eventActive(kind) ? "running" : "ready";
  }

  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  sharks: Shark[] = [];
  /** Blood in the water: 0 to 1 after kills, makes every shark bolder and faster; `blood` is where the last kill happened, which idle sharks swim to. */
  frenzy = 0;
  /** Set while an event announces itself some other way, so the spawn does not add its own boss line. */
  quietSpawn = false;
  private frenzyNoteAt = 0;
  private ambientAt = 0;
  blood: { x: number; y: number; until: number } | null = null;
  events: WorldEvent[] = [];
  /** Expanding rings from splashes; they sweep the whole tank. */
  ripples: Ripple[] = [];
  kraken: Kraken | null = null;
  /** When a kraken or megalodon last swam in: drives the screen shake and the shadow it casts. */
  titanEntry: { born: number } | null = null;
  /** Drifting clouds of kraken ink that fish steer clear of. */
  inks: { x: number; y: number; vx: number; vy: number; r0: number; r1: number; born: number; life: number; seed: number }[] = [];
  /** A kraken waiting for the whale fight to finish before it swims in after the megalodon. */
  krakenQueued = false;
  krakenQueuedAs: "kraken" | "saga" = "kraken";
  /** A megalodon mauling the whale. */
  whaleFight: { whale: Whale; mega: Shark; start: number; until: number; nextHit: number; doomed: boolean; bite: number; locked: boolean } | null = null;
  jellies: Jelly[] = [];
  /** Up to two whales at once. `whale` is the oldest, which the fights and the titans deal with. */
  whales: Whale[] = [];
  get whale(): Whale | null { return this.whales[0] ?? null; }
  set whale(v: Whale | null) { if (v === null) this.whales.shift(); else this.whales.unshift(v); }
  whirl: Whirl | null = null;
  fight: Fight | null = null;
  /** Big announced events, each with a banner and progress bar: the blood moon, a titans clash, a meteor shower. They run side by side (one of each kind), alongside the alien invasion. */
  sagas: Saga[] = [];
  /** The storm's whirlpools (maelstrom), drawn and stepped like the ordinary whirlpool. */
  vortices: Whirl[] = [];
  bloomSeen = new Set<Fish>();
  nextBloomWave = 0;
  migrants: Fish[] = [];
  /** Meteors in flight: where they are, how they fall, and the depth they hit the water at. */
  meteors: { x: number; y: number; vx: number; vy: number; ty: number; born: number }[] = [];
  nextMeteorAt = 0;
  /** An announced event asked for while the same kind is already running waits here and starts when that one ends. */
  sagaQueue: SagaKind[] = [];
  /** A second titan asked for while another announced event is running: it arrives once that is over. */
  pendingTitan: "kraken" | "mega" | null = null;
  nextMoonTech = 0;
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
  /** When a bomber last went off. */
  lastBoom = -99;
  /** Saucer wrecks about to blow a second time. */
  ufoBlasts: { x: number; y: number; at: number }[] = [];
  bombQueue: { x: number; y: number; at: number; u: Ufo }[] = [];
  lastQuip = "";
  lastQuipAt = -99;
  diverGoals = new WeakMap<Fish, { x: number; y: number; born: number }>();
  /** Decide once per visitor whether it attracts a normal shark. */
  diverInterest = new WeakMap<Fish, boolean>();
  diverQueue: number[] = [];
  /** When a titan was last around, and until when no random kraken or megalodon turns up after it. */
  titanWas = false;
  titanCooldownUntil = 0;
  /** Wrecks a tech diver is on his way to salvage: where the ufo fell and when he arrives. */
  techQueue: { x: number; y: number; at: number }[] = [];
  /** Bomber explosions, for drawing: where, when, and how far the shockwave reaches. */
  bombs: { x: number; y: number; born: number; r: number; green?: boolean }[] = [];
  /** Blaster bolts in flight, for drawing. */
  bolts: { x0: number; y0: number; x1: number; y1: number; born: number }[] = [];
  diverCap = 25;
  fullPresses = 0;
  /** Which assistants are waiting on you; their ring pulses until you answer. */
  attention = { claude: false, codex: false };
  attentionAt = 0;
  /** Options from the settings panel. */
  settings: { events: EventLevel; night: boolean } = { events: "normal", night: true };
  baitBall: BaitBall | null = null;
  /** Shifts the day/night clock (seconds); the N key jumps it toward night. */
  dayOffset = 0;
  pointer = { x: 0, y: 0, active: false };

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  perception = 60;
  /** Per-species personal space in px (x, y). */
  sepX: number[] = [];
  sepY: number[] = [];
  foreignSep = 40;
  bucketCols = 0;
  bucketRows = 0;
  bucketHead = new Int32Array(0);
  bucketCount = new Uint16Array(0);
  bucketNext = new Int32Array(0);
  lastSpawn = 0;
  yeatStart = 0;
  yeatUntil = 0;
  /** The most regular sharks this tank holds; the head count wanders between a quarter of it and all of it. */
  sharkCap = 0;
  nextSharkDrift = 25;
  growNext = false;
  sharkId = 100;
  nextEventAt = 20 + Math.random() * 35;
  tmp = { x: 0, y: 0 };

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
    const move = (point: { x: number; y: number }) => { point.x *= sx; point.y *= sy; };
    for (const points of [this.whales, this.jellies, this.ufos, this.vortices, this.ripples, this.inks, this.meteors, this.mess, this.debris, this.blasts, this.bombs, this.callouts]) for (const point of points) move(point);
    if (this.kraken) move(this.kraken);
    if (this.whirl) move(this.whirl);
    if (this.baitBall) move(this.baitBall);
    for (const meteor of this.meteors) meteor.ty *= sy;
    for (const ufo of this.ufos) { ufo.hy *= sy; ufo.beamX *= sx; }
    if (this.fight) { this.fight.mx *= sx; this.fight.my *= sy; }
    this.sharkCap = this.wantedSharks();
    if (this.sharks.length === 0) this.seedSharks();
    if (!this.fishCount) this.rescaleFish();
  }

  /** One shark per ~80k px^2 of tank, so a bigger window holds more of them. */
  wantedSharks() {
    return clamp(Math.round((this.width * this.height) / 230000), 1, 14);
  }

  seed() {
    this.seedSharks();
    this.seedFish();
  }

  seedSharks() {
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
  rescaleFish() {
    const want = clamp(Math.round((this.width * this.height) / 10000), 65, 450);
    const residents = this.fish.filter(f => f.temp === undefined && !f.diver);
    const have = residents.length;
    if (Math.abs(want - have) < have * 0.15) return;
    if (want < have) {
      const keep = new Set(residents.slice(0, want));
      this.fish = this.fish.filter(f => f.temp !== undefined || f.diver || keep.has(f));
      return;
    }
    this.seedFish(true);
  }

  seedFish(keep = false) {
    const { width: W, height: H } = this;
    const total = this.fishCount ?? clamp(Math.round((W * H) / 10000), 65, 450);
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
  stepEvents(dt: number) {
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
      // Enraged (provoked, or under a blood moon) it stays until the fury ends, then calms down for a few seconds first.
      if (this.megaRage(mega) > 0) mega.calmUntil = time + rand(7, 12);
      const settled = time >= (mega.calmUntil ?? 0);
      // Past two and a half minutes it heads for an edge and swims out, rather than blinking away mid-tank.
      if (age > 150 && settled && !mega.retreat && this.whaleFight?.mega !== mega && this.kraken?.wrapping !== mega) {
        const cx = mega.nodes[0];
        const cy = mega.nodes[1];
        // The edge it can reach with the least turning: a long body doesn't U-turn, it curves out the way it already faces.
        const edges: [number, number, number][] = [[cx, -1, 0], [this.width - cx, 1, 0], [cy, 0, -1], [this.height - cy, 0, 1]];
        const cost = (e: [number, number, number]) => e[0] + Math.abs(angleDiff(mega.heading, Math.atan2(e[2], e[1]))) * 260;
        const [, ex, ey] = edges.sort((a, b) => cost(a) - cost(b))[0];
        mega.retreat = true;
        mega.leaveCalm = true;
        mega.megaHeading = Math.atan2(ey, ex);
      }
      if ((gone && age > 4) || (age > 400 && settled)) {
        if (this.whaleFight?.mega === mega) this.endWhaleFight();
        this.sharks = this.sharks.filter((sh) => sh !== mega);
      }
    }
    for (const sh of this.sharks) if (sh.mega) sh.rageLevel = this.megaRage(sh);
    this.stepSharkDrift();
    this.stepKraken(dt);
    this.stepUfoBlasts();
    this.stepBombQueue();
    this.stepSaga(dt);
    this.stepTitanContacts();
    this.stepWhaleFight(dt);
    this.stepKrakenQueue();
    this.stepCritters(dt);
    this.stepFight();
    // Whenever the last titan leaves, however it came (by hand or by itself), neither one turns up on its own for a good
    // while. Watched every step, so a short visit between two event ticks still resets the clock.
    const titanNow = !!this.kraken || this.sharks.some((sh) => sh.mega);
    if (this.titanWas && !titanNow) this.titanCooldownUntil = time + rand(180, 300);
    this.titanWas = titanNow;
    if (time < this.nextEventAt || this.width === 0) return;
    // Irregular gaps: usually a minute or so, sometimes two events close together.
    const level = this.settings.events;
    // Give titan encounters breathing room before adding background events.
    const combatActive = !!mega || !!this.kraken;
    // Once a titan has left, neither comes back on its own for a good while, so they never run back to back.
    this.nextEventAt = time + (Math.random() < 0.35 ? rand(8, 22) : rand(18, 60)) * (level === "busy" ? 0.5 : level === "calm" ? 1.6 : 1) * (combatActive ? 1.3 : 1);
    if (level === "off") return;
    // The kraken and megalodon share a story, so only one of that pair runs at a time and no whale
    // appears during it; everything else can overlap, up to three minor events together.
    const pool: [string, number][] = [
      ["current", 0.12], ["chase", 0.22], ["saga", 0.11], ["kraken", 0.06], ["mega", 0.05], ["bait", 0.17],
      ["moon", 0.035], ["meteor", 0.05], ["maelstrom", 0.04], ["bloom", 0.04], ["migration", 0.04], ["jelly", 0.15], ["whale", 0.07], ["whirl", 0.11], ["fight", 0.07], ["ufo", 0.17], ["diver", 0.3], ["yeat", 0.0025],
    ];
    const majorKinds = ["saga", "kraken", "mega", "whale"];
    const calmOff = [...majorKinds, "fight", "diver"];
    // Around a titan, favour the small stuff (divers, runners, jellies, bait balls, saucers) to feed the story.
    const minorKinds = ["chase", "bait", "jelly", "ufo", "diver", "whirl"];
    if (combatActive) for (const e of pool) if (minorKinds.includes(e[0])) e[1] *= 2.2;
    // Busy means a lot going on, not constant titans: the big two come half as often.
    if (level === "busy") for (const e of pool) if (e[0] === "saga" || e[0] === "kraken" || e[0] === "mega") e[1] *= 0.5;
    const allowed = pool.filter(([kind]) => {
      if (!this.isEventEnabled(kind as EventKind)) return false;
      // Nothing else happens during a titans clash.
      if (this.titanPair() || this.sagas.some((s) => s.kind === "clash")) return false;
      if (combatActive && (kind === "saga" || kind === "kraken" || kind === "mega" || kind === "fight")) return false;
      if (time < this.titanCooldownUntil && (kind === "saga" || kind === "kraken" || kind === "mega")) return false;
      if (["moon", "meteor", "maelstrom", "bloom", "migration"].includes(kind) && this.sagas.some((s) => s.kind === kind)) return false;
      if ((kind === "moon" || kind === "migration") && combatActive) return false;
      // Each kind rests on its own cooldown after it fires, so repeats are spaced out but different events can overlap freely.
      if (time < (this.cooldownUntil[kind] ?? 0)) return false;
      if (kind === "whale" && (this.whales.length >= 2 || combatActive)) return false;
      // Rare by design: it runs five minutes, is a very rare roll, and stays away at least three hours after, so it covers about 1% of the time or less.
      if (kind === "yeat" && (this.yeat > 0 || (this.yeatUntil > 0 && time < this.yeatUntil + 10800))) return false;
      if (level === "calm" && calmOff.includes(kind)) return false;
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
        else if (kind === "diver") this.spawnDivers(true);
        else this.triggerEvent(kind as never);
        this.cooldownUntil[kind] = time + (COOLDOWNS[kind] ?? 45);
        break;
      }
    }
  }

  /** Is this kind of event running right now? */
  eventActive(kind: string) {
    switch (kind) {
      case "current": return this.currentUntil > this.time;
      case "night": return this.night > 0.05;
      case "yeat": return this.time < this.yeatUntil;
      case "kraken": case "saga": return !!this.kraken;
      case "mega": return this.sharks.some((sh) => sh.mega);
      case "bait": return !!this.baitBall;
      case "jelly": return this.jellies.length > 0;
      case "whale": return this.whales.length >= 2;
      case "whirl": return !!this.whirl;
      case "fight": return !!this.fight;
      case "ufo": return this.ufos.length >= 3;
      case "moon": case "meteor": case "maelstrom": case "bloom": case "migration": return this.sagas.some((s) => s.kind === kind);
      case "diver": return this.fish.some((f) => f.diver && f.alive) || this.diverQueue.length > 0;
      case "chase": return this.fish.some((f) => f.temp !== undefined);
      default: return true;
    }
  }

  /** Are both titans out together (a titans clash)? While they are, nothing else begins. */
  titanPair() {
    return !!this.kraken && this.sharks.some((s) => s.mega);
  }

  /** Is an announced event other than the titans clash running? The titans keep out of its way, and it of theirs. */
  othersRunning() {
    return this.sagas.some((s) => s.kind !== "clash") || !!this.invasion;
  }

  /** Public so a key press can trigger one on demand. Says whether it started, was already running, or had to wait. */
  triggerEvent(kind: EventKind): "started" | "already" | "blocked" | "off" | "full" | "ended" | "insist" | "cake" | "queued" {
    if (!this.isEventEnabled(kind) || (kind === "saga" && (!this.isEventEnabled("mega") || !this.isEventEnabled("kraken")))) return "off";
    if (kind === "current") {
      if (this.currentUntil > this.time) return "already";
      this.currentUntil = this.time + 45;
      this.notices.push("a ribbon of living light drifts through the deep...");
      return "started";
    }
    const combatActive = !!this.kraken || this.sharks.some((sh) => sh.mega);
    const combat = kind === "kraken" || kind === "saga" || kind === "mega";
    // A key press is never refused for company: only the hard limits below (one of each titan, two whales, the divers' cap) apply. The
    // random events keep to their own rules about clashes and cooldowns.
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
      this.krakenQueuedAs = kind;
      this.stepKrakenQueue();
      return this.krakenQueued ? "queued" : "started";
    }
    // M with a kraken already out sends the megalodon in from the far side whenever you like, to start the fight.
    if (kind === "mega" && this.kraken && !this.sharks.some((sh) => sh.mega)) {
      this.kraken.megaSent = true;
      this.spawnMegalodon(this.kraken.side === 0 ? 1 : 0);
      return "started";
    }
    if (combat && combatActive) return this.eventActive(kind) ? "already" : "blocked";
    // The announced events all run at once, but only one of each kind: asking for the same one again queues it.
    const SAGA_KINDS = ["moon", "meteor", "maelstrom", "bloom", "migration"];
    if (SAGA_KINDS.includes(kind) || kind === "saga") {
      const want = (kind === "saga" ? "clash" : kind) as SagaKind;
      if (this.sagas.some((s) => s.kind === want)) {
        if (this.sagaQueue.includes(want)) return "already";
        this.sagaQueue.push(want);
        return "queued";
      }
    }
    if (SAGA_KINDS.includes(kind)) {
      this.startSaga(kind as SagaKind);
      return "started";
    }
    if (kind === "fight" && this.fight) return "already";
    // Divers stack: every press brings more.
    if (kind === "whale" && this.whales.length >= 2) return "already";
    if (kind !== "chase" && kind !== "night" && kind !== "diver" && kind !== "whale" && this.eventActive(kind)) return "already";
    if (kind === "chase") this.spawnRunner(randInt(1, 3));
    else if (kind === "kraken" || kind === "saga") {
      this.quietSpawn = kind === "saga";
      this.spawnKraken(kind === "kraken");
      this.quietSpawn = false;
      // The full saga is announced: the kraken rises, and the megalodon comes for it.
      if (kind === "saga" && !this.sagas.some((s) => s.kind === "clash")) this.startSaga("clash", "TITANS CLASH", "235,235,245", Infinity, "THE TITANS CLASH!", "the kraken rises... and something vast comes for it!!!");
    }
    else if (kind === "mega") this.spawnMegalodon();
    else if (kind === "bait") this.spawnBaitBall();
    else if (kind === "jelly") this.spawnJellies();
    else if (kind === "whale") return this.spawnWhale(true) ? "started" : "blocked";
    else if (kind === "whirl") this.spawnWhirl();
    else if (kind === "fight") this.spawnFight();
    else if (kind === "ufo") { this.spawnUfo(); return "started"; }
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
  spawnRunner(count = 1) {
    const hunters = this.sharks.filter((sh) => !sh.mega && !sh.grabbed);
    if (!hunters.length) return;
    const taken = new Set<Shark>();
    for (let n = 0; n < count; n++) this.spawnOneRunner(hunters, taken);
  }

  spawnOneRunner(hunters: Shark[], taken: Set<Shark>) {
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
  entryPoint(wanted?: 0 | 1): { side: 0 | 1; y: number } {
    const { width: W, height: H } = this;
    const others: { x: number; y: number }[] = [];
    for (const whale of this.whales) others.push(this.whaleMid(whale));
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
  spawnMegalodon(wantedSide?: 0 | 1) {
    // Only ever one megalodon, whatever asked for it.
    if (!this.isEventEnabled("mega") || this.sharks.some((sh) => sh.mega)) return;
    const { width: W, height: H, time } = this;
    const { side, y } = this.entryPoint(wantedSide);
    const length = clamp(Math.min(W, H) * rand(0.75, 0.95), 360, 1150);
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
    // A lone megalodon announces itself; one arriving with the kraken is announced as the clash instead.
    if (!this.kraken && !this.quietSpawn) this.notices.push("the megalodon has awoken!");
    this.sharks.sort((a, b) => a.length - b.length);
  }

  /** A sawshark sweeps its blade through the fish ahead of it every so often, cutting a few down. */
  stepSlices() {
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

  spawnUfo() {
    if (!this.isEventEnabled("ufo")) return;
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
      pilot: null, huntSharks: false, targetShark: null, hijackChecked: false, keep: false, got: 0, fast: false, boarded: false, held: false, ammo: Math.random() < 0.25 ? 1 : 0,
    });
    if (this.invasion) this.invasion.spawned++;
    else if (this.ufos.length >= 3) this.startInvasion();
    // Sometimes a sawshark sets out to cut the saucer in half.
    const saws = this.sharks.filter((sh) => sh.kind === "sawshark" && !sh.mega && !sh.grabbed);
    if (saws.length && Math.random() < 0.4) saws[randInt(0, saws.length - 1)].ufoCharge = true;
  }

  /** Is a shark (the head, middle or tail) under this column? The saucer waits rather than beam over one. */
  columnBlocked(x: number) {
    return this.sharks.some((sh) => !sh.mega && [0, 6, 12, 18].some((n) => Math.abs(sh.nodes[n * 2] - x) < 115 && sh.nodes[n * 2 + 1] > 60));
  }

  /** Something worth abducting: a diver, a jellyfish, or a fish. */
  pickAbductionTarget(): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 8; attempt++) {
      const pick = this.pickAbductionCandidate();
      const chasedDiver = this.fish.some((f) => f.diver && f.alive && Math.abs(f.x - (pick?.x ?? -1)) < 2 && this.sharks.some((sh) => sh.target === f));
      if (pick && (chasedDiver || !this.columnBlocked(pick.x))) return pick;
    }
    return null;
  }

  pickAbductionCandidate(): { x: number; y: number } | null {
    // A diver a shark is chasing is the best prize.
    const chased = this.fish.filter((f) => f.diver && f.alive && !f.riding && this.sharks.some((sh) => sh.target === f));
    if (chased.length && Math.random() < 0.85) return { x: chased[0].x, y: chased[0].y };
    const divers = this.fish.filter((f) => f.diver && f.alive && !f.riding);
    // Saucers go looking for bomber divers: they are ammunition.
    const bombers = divers.filter((f) => f.dkind === "bomber" && !f.seized);
    if (bombers.length && Math.random() < 0.75) { const b = bombers[randInt(0, bombers.length - 1)]; return { x: b.x, y: b.y }; }
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
  destroyUfo(how: "smashed" | "sawed" | "crushed" | "shot" | "blasted", target?: Ufo) {
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
    // A saucer set off by a blast goes up in a second explosion a moment later, which can take its neighbours with it.
    if (how === "blasted" && Math.random() < 0.6) this.ufoBlasts.push({ x: u.x, y: u.y, at: this.time + rand(0.5, 0.9) });
    // Remove this very saucer (not just the oldest one), and count it against the invasion.
    this.ufos = this.ufos.filter((o) => o !== u);
    if (this.invasion) this.invasion.killed++;
  }

  /** Saucers never sit inside a whale (they are shoved clear of its body), and one that flies into a diver runs it over. */
  stepUfoCollisions(dt: number) {
    if (!this.ufos.length) return;
    const R = Math.max(40, Math.min(this.width, this.height) * 0.07);
    // A saucer drifts clear rather than jumping: gently while the overlap is shallow, quicker (but still a glide) when it is deep.
    const ease = (over: number, depth: number) => Math.min(over, (60 + 260 * Math.min(1, over / Math.max(1, depth))) * dt);
    for (const u of this.ufos) {
      if (!u.held) {
        for (const wh of this.whales) {
          const reach = wh.length * 0.055 + R * 0.8;
          for (let s = 0; s <= 10; s++) {
            const bx = wh.x - Math.cos(wh.heading) * wh.length * (s / 10);
            const by = wh.y - Math.sin(wh.heading) * wh.length * (s / 10);
            const d = Math.hypot(u.x - bx, u.y - by);
            if (d >= reach) continue;
            const nx = d > 1e-3 ? (u.x - bx) / d : 0;
            const ny = d > 1e-3 ? (u.y - by) / d : -1;
            const step = ease(reach - d, reach);
            u.x += nx * step;
            u.y += ny * step;
          }
        }
      }
      // And out of the kraken's head and mantle: it can only reach for them, never fly through it.
      const k = this.kraken;
      // (A saucer the kraken is reaching for or holding is its business, so it is left alone.)
      if (k && !u.held && !((k.ufoStrike !== null || k.ufoHeld) && u === this.ufo)) {
        const dx = Math.cos(k.heading);
        const dy = Math.sin(k.heading);
        const blobs = [{ x: k.x, y: k.y, r: k.size * 0.12 }, ...[0.2, 0.4, 0.6].map((m) => ({ x: k.x + dx * k.size * m, y: k.y + dy * k.size * m, r: k.size * 0.13 }))];
        for (const b of blobs) {
          const d = Math.hypot(u.x - b.x, u.y - b.y);
          const reach = b.r + R * 0.9;
          if (d >= reach) continue;
          const step = ease(reach - d, reach);
          u.x += (d > 1e-3 ? (u.x - b.x) / d : 0) * step;
          u.y += (d > 1e-3 ? (u.y - b.y) / d : -1) * step;
        }
      }
      // A saucer that is moving about (not hovering over a beam) flattens any diver it meets.
      if (u.state === "beam") continue;
      for (const f of this.fish) {
        if (!f.diver || !f.alive || f.riding || f.seized || f.dragger) continue;
        if (Math.abs(f.x - u.x) > R * 0.9 || Math.abs(f.y - u.y) > R * 0.45) continue;
        this.callout(f.x, f.y - 30, "DIVER RUN OVER", "255,130,100");
        this.popDiver(f, "crushed");
      }
    }
  }

  stepUfoBlasts() {
    if (!this.ufoBlasts.length) return;
    const { time } = this;
    const R = 190;
    for (const b of this.ufoBlasts.filter((q) => time >= q.at)) {
      this.ufoBlasts = this.ufoBlasts.filter((q) => q !== b);
      this.bombs.push({ x: b.x, y: b.y, born: time, r: R });
      this.splash(b.x, b.y, 1.6, undefined, { max: 320 });
      this.events.push({ kind: "eat", x: b.x, y: b.y });
      this.callout(b.x, b.y - 50, "UFO EXPLODES!", "255,170,90");
      for (const sh of this.sharks) {
        if (sh.mega || Math.hypot(sh.nodes[0] - b.x, sh.nodes[1] - b.y) > R * 1.1) continue;
        sh.heading = Math.atan2(sh.nodes[1] - b.y, sh.nodes[0] - b.x);
        sh.speed = 150;
        sh.alertUntil = time + 1.5;
      }
      for (const o of this.fish) {
        if (!o.alive) continue;
        const d = Math.hypot(o.x - b.x, o.y - b.y);
        if (d > R) continue;
        if (!o.diver) { o.alive = false; o.respawnAt = time + rand(4, 9); continue; }
        if (o.dkind === "tech" || o.riding) continue;
        if (d < R * 0.4 && Math.random() < 0.4) { this.popDiver(o, "blast"); continue; }
        const a = Math.atan2(o.y - b.y, o.x - b.x);
        o.vx = Math.cos(a) * 200;
        o.vy = Math.sin(a) * 200;
        o.stunUntil = time + 2;
      }
      // The neighbours go too, and may chain on.
      for (const u of [...this.ufos]) {
        if (Math.hypot(u.x - b.x, u.y - b.y) >= R + 60) continue;
        if (this.kraken && u === this.ufo) this.kraken.ufoHeld = false;
        u.held = false;
        this.callout(u.x, u.y - 40, "UFO BLOWN UP", "255,110,100");
        this.destroyUfo("blasted", u);
      }
    }
  }

  /** Each saucer takes its turn as the primary one, so the single-saucer logic runs for all of them. */
  stepUfos(dt: number) {
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
        // The soft ease can lose to a saucer that is bolting or being flung: inside the hard limit they are parted at once.
        const hard = sep * 0.7;
        const d2 = Math.hypot(b.x - a.x, b.y - a.y);
        if (d2 < hard) {
          const ux = d2 > 1e-3 ? (b.x - a.x) / d2 : 1;
          const uy = d2 > 1e-3 ? (b.y - a.y) / d2 : 0;
          const gap = (hard - d2) * Math.min(1, dt * 10);
          // A saucer hanging over its beam (or held) stays put; the other one gives way.
          const pa = a.held || a.state === "beam";
          const pb = b.held || b.state === "beam";
          if (!(pa && pb)) {
            const sa = pa ? 0 : pb ? 1 : 0.5;
            a.x -= ux * gap * sa; a.y -= uy * gap * sa;
            b.x += ux * gap * (1 - sa); b.y += uy * gap * (1 - sa);
          }
        }
      }
    }
    this.stepUfoCollisions(dt);
    this.stepInvasion();
  }

  startSaga(kind: SagaKind, title?: string, rgb?: string, duration?: number, banner?: string, notice?: string) {
    const { time, width: W, height: H } = this;
    const DEFS: Record<string, [string, string, number, string, string]> = {
      moon: ["BLOOD MOON", "255,70,70", 75, "THE BLOOD MOON RISES!", "the sea turns red!!! the sharks are hungry... and the divers are armed..."],
      meteor: ["METEOR SHOWER", "255,170,80", 40, "A METEOR SHOWER BEGINS!", "fire is falling from the sky!!! keep your head down..."],
      maelstrom: ["THE MAELSTROM", "120,210,255", 45, "THE MAELSTROM OPENS!", "the sea is tearing itself apart!!! hold on to something..."],
      bloom: ["JELLYFISH BLOOM", "190,150,255", 50, "THE JELLYFISH ARE BLOOMING!", "a glowing tide drifts up... mind the stings!!!"],
      migration: ["GREAT MIGRATION", "130,230,190", 80, "THE GREAT MIGRATION BEGINS!", "the whole sea is on the move!!! and something is following..."],
    };
    const def = DEFS[kind];
    if (def) { [title, rgb, duration, banner, notice] = def; }
    this.sagas.push({ kind, title: title!, rgb: rgb!, born: time, until: time + duration!, count: 0, lost: 0, total: 0, peak: 0 });
    const sg = this.sagas[this.sagas.length - 1];
    this.notices.push(notice!);
    if (kind === "meteor") this.nextMeteorAt = time + 1.5;
    if (kind === "moon") {
      this.nextMoonTech = time + 6;
      // The hungry sea sometimes brings its biggest hunter.
      if (!this.kraken && !this.sharks.some((s) => s.mega) && time >= this.titanCooldownUntil && Math.random() < 0.6) {
        if (Math.random() < 0.5) {
          // Half the time the megalodon is not far behind, and the moon ends up staging a full titans clash.
          const clash = Math.random() < 0.5;
          this.quietSpawn = true;
          this.spawnKraken(!clash);
          this.quietSpawn = false;
          this.notices.push(clash ? "the blood moon drives the kraken wild... and something huge is coming for it" : "the blood moon drives the kraken wild...");
        } else this.spawnMegalodon();
      }
    }
    if (kind === "maelstrom") {
      const n = Math.min(3, Math.max(2, Math.floor(W * H / 1800000)));
      for (let tries = 0; tries < 60 && this.vortices.length < n; tries++) {
        const r = clamp(Math.min(W, H) * 0.13 * rand(0.55, 1.6), 50, 260);
        const x = rand(W * 0.15, W * 0.85);
        const y = rand(H * 0.2, H * 0.8);
        if (this.vortices.some((v) => Math.hypot(v.x - x, v.y - y) < (v.r + r) * 1.3)) continue;
        this.vortices.push({ x, y, r, born: time, until: time + duration!, dir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1, rippleAt: time });
      }
    }
    if (kind === "bloom") {
      this.spawnBloom(26);
      this.nextBloomWave = time + 16;
      // A handful of divers come along so there is someone for the jellyfish to find.
      for (let i = 0; i < 5; i++) this.diverQueue.push(time + i * 1.1);
      this.bloomSeen.clear();
    }
    if (kind === "migration") {
      // Two whales and a giant school set out across the tank together; sharks and, sometimes, the megalodon follow.
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const before = this.whales.length;
      this.spawnWhale();
      this.spawnWhale();
      this.whales.slice(before).forEach((w, i) => {
        w.x = dir === 1 ? -20 - i * 260 : W + 20 + i * 260;
        w.y = H * (0.35 + 0.3 * i);
        w.heading = dir === 1 ? 0 : Math.PI;
      });
      this.migrants = [];
      for (let i = 0; i < 80; i++) {
        const species = randInt(0, SPECIES.length - 1);
        const f: Fish = {
          x: dir === 1 ? -rand(20, 300) : W + rand(20, 300), y: rand(H * 0.15, H * 0.85), vx: dir * 80, vy: rand(-10, 10), species, alarm: 0, alive: true,
          respawnAt: Infinity, phase: rand(0, TAU), turn: 0, depth: rand(0.55, 1), millDir: 1, temp: time + duration! + 25, migrate: dir,
        };
        this.fish.push(f);
        this.migrants.push(f);
      }
      sg.total = this.migrants.length;
    }
  }

  /** A swarm of jellyfish drifting up from below. */
  spawnBloom(count: number) {
    const { width: W, height: H } = this;
    for (let i = 0; i < count; i++) {
      this.jellies.push({ x: rand(W * 0.05, W * 0.95), y: H + rand(40, 700), size: rand(8, 13), phase: rand(0, TAU), drift: rand(-14, 14), hue: Math.random() });
    }
  }

  stepSaga(dt: number) {
    // The moment the kraken and megalodon are out together, it is a titans clash, however they got here (C, or M and K).
    if (this.titanPair() && !this.sagas.some((s) => s.kind === "clash")) {
      this.startSaga("clash", "TITANS CLASH", "235,235,245", Infinity, "THE TITANS CLASH!", "the kraken and the megalodon meet!!! the whole sea holds its breath...");
    }
    for (const sg of [...this.sagas]) this.stepOneSaga(sg, dt);
    if (!this.sagas.some((s) => s.kind === "meteor")) this.meteors.length = 0;
  }

  stepOneSaga(sg: World["sagas"][number], dt: number) {
    const { time, width: W, height: H } = this;
    if (sg.kind === "clash") {
      if (time - sg.born > 4 && !this.kraken && !this.sharks.some((s) => s.mega)) {
        this.sagas = this.sagas.filter((q) => q !== sg);
        this.notices.push("the titans have parted... the water settles...");
      }
      return;
    }
    if (time >= sg.until) {
      this.sagas = this.sagas.filter((q) => q !== sg);
      if (sg.kind !== "moon" && sg.kind !== "meteor") { this.endSaga(sg); return; }
      if (sg.kind === "moon") {
        this.notices.push("the blood moon sets... the sea breathes again...");
      } else {
        this.notices.push(`the sky clears... ${sg.count} meteors fell!`);
      }
      return;
    }
    if (sg.kind === "moon") {
      // The sharks never stop being hungry, and armed divers keep arriving to hold them off.
      for (const sh of this.sharks) if (!sh.mega && !sh.grabbed) sh.hunger = Math.max(sh.hunger, 0.9);
      if (time >= this.nextMoonTech) {
        this.nextMoonTech = time + rand(10, 14);
        if (this.isEventEnabled("diver") && this.fish.filter((f) => f.dkind === "tech" && f.alive).length < 3) {
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
    if (sg.kind === "maelstrom") { this.stepMaelstrom(sg, dt); return; }
    if (sg.kind === "bloom") { this.stepBloom(sg); return; }
    if (sg.kind === "migration") { this.stepMigration(sg); return; }
    // Meteors: burning rocks fall in from above and slam into the water at random depths.
    if (time >= this.nextMeteorAt) {
      this.nextMeteorAt = time + rand(1.5, 2.8);
      const x0 = rand(W * 0.05, W * 1.0);
      const slope = rand(-0.5, 0.5);
      const speed = rand(520, 760);
      this.meteors.push({ x: x0, y: -40, vx: slope * speed, vy: speed, ty: H * rand(0.35, 0.92), born: time });
    }
    for (const m of this.meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      // A rock that meets a saucer, diver or shark on its way down hits it right there instead of falling on.
      if (m.y < m.ty && this.meteorHitsSomething(m)) m.ty = m.y;
    }
    for (const m of this.meteors.filter((q) => q.y >= q.ty)) this.meteorImpact(m.x, m.y);
    this.meteors = this.meteors.filter((q) => q.y < q.ty && q.x > -200 && q.x < W + 200);
  }

  /** An event is over: clean up and report how it went. */
  endSaga(sg: Saga) {
    const { width: W, height: H } = this;
    const say = (_text: string, _rgb: string, notice: string) => { this.notices.push(notice); };
    if (sg.kind === "maelstrom") {
      this.vortices = [];
      if (sg.lost === 0) say("THE STORM PASSES... NO ONE WAS LOST!", "150,255,190", "the maelstrom is gone... and nobody was swallowed!!!");
      else say("THE STORM PASSES...", "170,215,255", `the maelstrom is gone... ${sg.lost} did not come back...`);
    } else if (sg.kind === "bloom") {
      this.bloomSeen.clear();
      if (sg.lost === 0) say("THE BLOOM FADES... EVERYONE IS SAFE!", "200,170,255", "the glow fades... every diver made it through!!!");
      else say("THE BLOOM FADES...", "200,170,255", `the glow fades... ${sg.lost} divers were lost...`);
    } else if (sg.kind === "migration") {
      for (const f of this.migrants) delete f.migrate;
      this.migrants = [];
      say(`THE HERD HAS CROSSED! ${sg.count} OF ${sg.total}`, "150,240,200", `the great migration is over... ${sg.count} of ${sg.total} made it across!!!`);
    }
  }

  /** Whirlpools tear across the tank: fish and divers spiral in, sharks are slung out, and whatever reaches the core is lost. */
  stepMaelstrom(sg: Saga, dt: number) {
    const { time } = this;
    for (const wp of this.vortices) {
      const fade = Math.max(0, Math.min(1, (time - wp.born) / 3, (wp.until - time) / 3));
      if (time - wp.rippleAt > 2.5) { wp.rippleAt = time; this.splash(wp.x, wp.y, 0.25, undefined, { max: wp.r * 0.65, quiet: true }); }
      const reach = wp.r * 2.8;
      for (const f of this.fish) {
        if (!f.alive || f.riding || f.seized) continue;
        const dx = f.x - wp.x;
        const dy = f.y - wp.y;
        const d = Math.hypot(dx, dy);
        if (d > reach || d < 1e-3) continue;
        const fall = Math.pow(1 - d / reach, 0.8) * fade;
        const pull = f.diver ? 140 : 560;
        if (f.diver) {
          f.x += ((-dy / d) * wp.dir * 150 - (dx / d) * 95) * fall * dt;
          f.y += ((dx / d) * wp.dir * 150 - (dy / d) * 95) * fall * dt;
        } else {
          f.vx += ((-dy / d) * wp.dir * pull - (dx / d) * 220) * fall * dt;
          f.vy += ((dx / d) * wp.dir * pull - (dy / d) * 220) * fall * dt;
        }
        if (d < wp.r * 0.32 && fade > 0.5) {
          // Swallowed whole.
          f.alive = false;
          f.respawnAt = f.diver ? Infinity : time + rand(5, 10);
          if (f.diver) { sg.lost++; this.callout(f.x, f.y - 30, "SWALLOWED!", "150,210,255"); this.diverQuip("lost"); }
          this.splash(f.x, f.y, 1.4);
        }
      }
      for (const sh of this.sharks) {
        if (sh.mega || sh.grabbed || sh.lifted) continue;
        const dx = sh.nodes[0] - wp.x;
        const dy = sh.nodes[1] - wp.y;
        const d = Math.hypot(dx, dy);
        if (d > reach || d < 1e-3) continue;
        const fall = Math.pow(1 - d / reach, 0.8) * fade * clamp(300 / sh.length, 0.4, 1.2);
        const mx = ((-dy / d) * wp.dir * 70 - (dx / d) * 30) * fall * dt;
        const my = ((dx / d) * wp.dir * 70 - (dy / d) * 30) * fall * dt;
        for (let n = 0; n < SHARK_NODES; n++) { sh.nodes[n * 2] += mx; sh.nodes[n * 2 + 1] += my; }
        if (d < wp.r * 0.7 && time >= (sh.nextFling ?? 0)) {
          // Slung across the tank.
          sh.nextFling = time + 6;
          sh.heading = Math.atan2(dy, dx) + wp.dir * 0.6;
          sh.speed = 320;
          sh.target = null;
          sh.alertUntil = time + 2;
          this.callout(sh.nodes[0], sh.nodes[1] - 40, "FLUNG!", "150,210,255");
        }
      }
    }
  }

  /** The bloom: more jellyfish rise in waves, sharks pile in on stunned divers, and we keep count of who is still afloat. */
  stepBloom(sg: Saga) {
    const { time } = this;
    if (time >= this.nextBloomWave && this.jellies.length < 60) {
      this.spawnBloom(10);
      this.nextBloomWave = time + 14;
    }
    for (const sh of this.sharks) if (!sh.mega && !sh.grabbed) sh.hunger = Math.max(sh.hunger, 0.9);
    let safe = 0;
    for (const f of this.fish) {
      if (!f.diver) continue;
      if (f.alive) { this.bloomSeen.add(f); safe++; }
    }
    for (const f of [...this.bloomSeen]) {
      if (f.alive) continue;
      this.bloomSeen.delete(f);
      // A diver that died in the water is lost; one that swam off the edge is not.
      if (this.onScreen(f)) sg.lost++;
    }
    sg.count = safe;
    sg.peak = Math.max(sg.peak, safe);
  }

  /** The great migration: fish file across the tank; those that reach the far side, and those the sharks take, are counted. */
  stepMigration(sg: Saga) {
    const { time, width: W } = this;
    let crossed = 0;
    let eaten = 0;
    for (const f of this.migrants) {
      if (!f.migrate) { crossed++; continue; }
      const out = f.migrate === 1 ? f.x > W + 30 : f.x < -30;
      if (f.alive && out && time - sg.born > 4) { f.alive = false; f.respawnAt = Infinity; delete f.migrate; crossed++; }
      else if (!f.alive) eaten++;
    }
    sg.count = crossed;
    sg.lost = eaten;
    // Partway across, something big sometimes comes after the herd.
    if (!this.migrants.length) return;
    if (!this.migrantBoss && time - sg.born > 22 && !this.kraken && !this.sharks.some((s) => s.mega)) {
      this.migrantBoss = true;
      if (this.time >= this.titanCooldownUntil && Math.random() < 0.4) { this.spawnMegalodon(); this.notices.push("a megalodon follows the herd..."); }
    }
    if (crossed + eaten >= sg.total) sg.until = Math.min(sg.until, time + 0.1);
  }
  migrantBoss = false;

  meteorHitsSomething(m: { x: number; y: number }) {
    const near = (x: number, y: number, r: number) => Math.hypot(x - m.x, y - m.y) < r;
    return this.ufos.some((u) => near(u.x, u.y, 60))
      || this.fish.some((f) => f.alive && f.diver && near(f.x, f.y, 30))
      || this.sharks.some((sh) => !sh.grabbed && near(sh.nodes[0], sh.nodes[1], 40));
  }

  meteorImpact(x: number, y: number) {
    const { time } = this;
    const R = 170;
    const shower = this.sagas.find((s) => s.kind === "meteor");
    if (shower) shower.count++;
    this.bombs.push({ x, y, born: time, r: R });
    this.splash(x, y, 0.7, undefined, { max: R * 0.8, quiet: true });
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
  startInvasion() {
    // Saucers may turn up during a titans clash, but the invasion never begins in the middle of one.
    if (this.titanPair() || this.sagas.some((s) => s.kind === "clash")) return;
    this.invasion = { total: randInt(3, 15), spawned: this.ufos.length, killed: 0, escaped: 0, nextAt: this.time + rand(7, 11), born: this.time, banner: this.time };
        this.notices.push("the aliens are invading!!! hold the line...");
  }

  stepInvasion() {
    if (this.time >= this.nextQueuedAt) {
      for (let i = 0; i < this.eventQueue.length; i++) {
        const next = this.eventQueue[i];
        if (this.eventActive(next)) continue;
        const result = this.triggerEvent(next);
        if (["started", "queued", "off", "ended"].includes(result)) {
          this.eventQueue.splice(i, 1); this.nextQueuedAt = this.time + 8; break;
        }
      }
    }
    // An invasion starts whenever a third saucer is out, and a queued event starts the moment its own kind is free.
    if (!this.invasion && this.isEventEnabled("ufo") && this.ufos.length >= 3 && !this.titanPair() && !this.sagas.some((s) => s.kind === "clash")) this.startInvasion();
    if (this.pendingTitan) { const pt = this.pendingTitan; this.pendingTitan = null; this.triggerEvent(pt); }
    for (let i = 0; i < this.sagaQueue.length; i++) {
      const next = this.sagaQueue[i];
      if (this.sagas.some((s) => s.kind === next)) continue;
      if (next === "clash" && (this.kraken || this.sharks.some((s) => s.mega))) continue;
      if (next !== "clash" && (this.titanPair() || this.sagas.some((s) => s.kind === "clash"))) continue;
      this.sagaQueue.splice(i, 1);
      const result = this.triggerEvent(next === "clash" ? "saga" : next);
      if (result === "blocked" || result === "already") this.sagaQueue.splice(i, 0, next);
      else break;
    }
    const inv = this.invasion;
    if (!inv) return;
    const { time } = this;
    if (inv.spawned < inv.total && this.ufos.length < 3 && time >= inv.nextAt && !this.titanPair() && !this.sagas.some((sg) => sg.kind === "clash")) {
      inv.nextAt = time + rand(6, 11);
      this.spawnUfo();
    }
    if (inv.spawned >= inv.total && this.ufos.length === 0) {
      this.invasion = null;
      if (inv.killed >= Math.ceil(inv.total / 2)) {
                this.notices.push("the invasion has been repelled!!! the sea is safe... for now");
      } else {
                this.notices.push("the aliens slipped away... they will be back...");
      }
    } else if (time - inv.born > 360) this.invasion = null;
  }

  stepUfo(dt: number) {
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
    if (u.state === "seek" || u.state === "beam" || (u.state === "leave" && u.ammo)) this.ufoFire(u);
    if (!this.ufos.includes(u)) return;
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
      // It settles onto its hover line instead of snapping to it, so being nudged off it never shows as a jump.
      u.y += (u.hy + Math.sin(u.phase * 2) * 4 - u.y) * Math.min(1, dt * 4);
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
          if (f.dkind === "bomber") {
            // Now and then the bomber was carrying spares.
            const spares = Math.random() < 0.15;
            u.ammo = (u.ammo ?? 0) + (spares ? 3 : 1);
            if (spares) this.notices.push("that bomber had a backpack full of bombs!");
            u.nextShot = Math.min(u.nextShot ?? Infinity, time + 1.5);
            this.callout(u.x, u.y - 40, "UFO LOADS A BOMBER", "130,255,110");
          }
        }
      }
      for (const j of this.jellies) {
        if (j.y < u.y || Math.abs(j.x - u.beamX) > 55) continue;
        j.y -= 80 * dt;
        j.x += (u.beamX - j.x) * dt * 2;
        if (j.y < u.y + 26) { j.y = -9999; u.got++; }
      }
      this.jellies = this.jellies.filter((j) => j.y > -9000);
      // The beam only lasts while there is something in it: once what it caught is aboard, or what it was after has got away
      // (jumped clear, swum off), it switches off after a moment instead of running out the clock.
      const inBeam = !!ts || this.fish.some((f) => f.alive && !f.dragger && !f.seized && f.y >= u.y && Math.abs(f.x - u.beamX) <= 55) || this.jellies.some((j) => j.y >= u.y && Math.abs(j.x - u.beamX) <= 55);
      u.idle = inBeam ? 0 : (u.idle ?? 0) + dt;
      const spent = u.idle > (u.got > 0 ? 0.6 : 1.6);
      // A shark drifting under the beam ends it early: nothing gets in the saucer's way.
      const blocked = this.sharks.some((sh) => !sh.mega && sh !== ts && Math.abs(sh.nodes[0] - u.beamX) < 90 && sh.nodes[1] > u.y);
      if (blocked || spent || time > u.beamUntil) {
        u.idle = 0;
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

  /**
   * Now and then a saucer shoots: a laser that provokes a titan in range, or a bomb dropped on whatever swims below, which
   * shoves sharks, kills fish and kills divers.
   */
  ufoFire(u: Ufo) {
    const { time } = this;
    u.nextShot ??= time + rand(3, 6);
    if (time < u.nextShot || u.y < 0) return;
    const kr = this.kraken;
    const mg = this.sharks.find((s) => s.mega && !s.retreat);
    const krNear = !!kr && Math.hypot(kr.x - u.x, kr.y - u.y) < kr.size * 1.4 + 700;
    const mgNear = !!mg && Math.hypot(mg.nodes[0] - u.x, mg.nodes[1] - u.y) < 1300;
    if ((krNear || mgNear) && Math.random() < 0.55) {
      u.nextShot = time + rand(3, 6);
      if (krNear && kr && (!mgNear || Math.random() < 0.5)) {
        this.bolts.push({ x0: u.x, y0: u.y + 14, x1: kr.x, y1: kr.y, born: time });
        if (time >= (kr.rageUntil ?? 0) - 8) this.callout(kr.x, kr.y - kr.size * 0.3, "KRAKEN PROVOKED", "255,110,100");
        kr.rageUntil = Math.max(kr.rageUntil ?? 0, time + 12);
        if (kr.state === "wrap") kr.tilt = clamp(kr.tilt - 0.1, -1, 1);
      } else if (mg) {
        this.bolts.push({ x0: u.x, y0: u.y + 14, x1: mg.nodes[0], y1: mg.nodes[1], born: time });
        mg.rageUntil = Math.max(mg.rageUntil ?? 0, time + 12);
        this.callout(mg.nodes[0], mg.nodes[1] - 60, "MEGALODON PROVOKED", "175,100,255");
        if (kr?.state === "wrap") kr.tilt = clamp(kr.tilt + 0.1, -1, 1);
      }
      return;
    }
    // A green bomb is a bomber diver it has beamed aboard, dropped on anything below: fish, divers, sharks, whales, titans.
    if (!u.ammo) { u.nextShot = time + rand(3, 6); return; }
    let tx = 0;
    let ty = 0;
    let best = 800;
    const consider = (x: number, y: number) => {
      const d = Math.hypot(x - u.x, y - u.y);
      if (y > u.y + 60 && d < best) { best = d; tx = x; ty = y; }
    };
    for (const f of this.fish) if (f.alive && !f.riding && f.y > 40) consider(f.x, f.y);
    for (const sh of this.sharks) if (!sh.grabbed) consider(sh.nodes[0], sh.nodes[1]);
    for (const w of this.whales) consider(w.x, w.y);
    if (kr) consider(kr.x, kr.y);
    if (best >= 800 || time - this.lastBoom < 0.6) { u.nextShot = time + 1.2; return; }
    u.ammo--;
    u.nextShot = time + rand(2.5, 5);
    // Most drops are plain, but now and then something odd happens. Rare beats frequent: each oddity is its own little story.
    if (Math.random() < 0.7) { this.explode(tx, ty, undefined, u); return; }
    const others = this.ufos.filter((o) => o !== u && !o.held);
    const odd: [string, number][] = [["carpet", 3], ["dud", 3], ["wild", 3], ["friendly", others.length ? 2 : 0], ["fumble", 1], ["spin", 2]];
    let pick = Math.random() * odd.reduce((s, o) => s + o[1], 0);
    const kind = odd.find((o) => (pick -= o[1]) < 0)![0];
    if (kind === "carpet") {
      // Everything aboard goes at once, in a line sweeping across the tank.
      const n = 1 + (u.ammo ?? 0);
      u.ammo = 0;
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.callout(u.x, u.y - 40, "BOMBS AWAY!", "130,255,110");
      this.notices.push(n > 1 ? "the ufo emptied the whole hold... carpet bombing!" : "the ufo sweeps its last bomb across the tank...");
      for (let i = 0; i < Math.max(n, 3); i++) this.bombQueue.push({ x: clamp(tx + dir * (i - 1) * 170, 40, this.width - 40), y: ty, at: time + i * 0.4, u });
    } else if (kind === "dud") {
      this.splash(tx, ty, 0.8);
      this.callout(tx, ty - 30, "DUD", "190,255,170");
      this.notices.push("the bomb was a dud... the bomber would like a word.");
    } else if (kind === "wild") {
      const wx = rand(this.width * 0.1, this.width * 0.9);
      const wy = rand(this.height * 0.4, this.height * 0.9);
      this.notices.push("the ufo dropped it without looking...");
      this.explode(wx, wy, undefined, u);
    } else if (kind === "friendly") {
      const o = others[randInt(0, others.length - 1)];
      this.explode(o.x, o.y + 40, undefined, u);
      this.callout(o.x, o.y - 40, "FRIENDLY FIRE", "255,110,100");
      this.destroyUfo("blasted", o);
      this.notices.push("a ufo bombed its own wingman... oops.");
    } else if (kind === "fumble") {
      this.explode(u.x, u.y + 30, undefined, u);
      this.callout(u.x, u.y - 40, "DROPPED IT ON ITSELF", "255,110,100");
      this.destroyUfo("blasted", u);
      this.notices.push("the ufo fumbled the bomb... kaboom, right in its lap.");
    } else {
      // The bomber was not done: the saucer spins wildly and a stray bomb goes off wherever it points.
      u.fast = true;
      this.callout(u.x, u.y - 40, "BOMBER ON THE LOOSE", "130,255,110");
      this.notices.push("the bomber woke up inside the ufo... it's spinning!");
      for (let i = 0; i < 3; i++) this.bombQueue.push({ x: rand(this.width * 0.1, this.width * 0.9), y: rand(this.height * 0.3, this.height * 0.9), at: time + 0.5 + i * 0.7, u });
    }
  }

  /** Delayed green blasts from a ufo's odd drops. */
  stepBombQueue() {
    if (!this.bombQueue.length) return;
    const due = this.bombQueue.filter((q) => this.time >= q.at);
    if (!due.length) return;
    this.bombQueue = this.bombQueue.filter((q) => this.time < q.at);
    for (const q of due) this.explode(q.x, q.y, undefined, q.u);
  }

  /** The diver the pointer is holding, where it is being carried to, and how fast the hand is moving. */
  heldDiver: Fish | null = null;
  holdTo = { x: 0, y: 0 };
  holdFrom = { x: 0, y: 0 };
  holdAt = 0;
  holdVel = { x: 0, y: 0 };
  holdLines = 0;
  lastHoldLine = "";

  /** Pressing on a diver picks it up and carries it as the pointer moves. Returns true if one was grabbed. */
  holdDiverAt(x: number, y: number): boolean {
    if (this.heldDiver) return true;
    let hit: Fish | null = null;
    let best = 42;
    for (const f of this.fish) {
      if (!f.diver || !f.alive || f.riding || f.seized || f.dragger) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < best) { best = d; hit = f; }
    }
    if (!hit) return false;
    hit.held = true;
    this.heldDiver = hit;
    this.holdTo = { x, y };
    this.holdFrom = { x, y };
    this.holdAt = this.time;
    this.holdVel = { x: 0, y: 0 };
    this.holdLines = 0;
    delete hit.stunUntil;
    this.holdQuip("grab");
    return true;
  }

  dragHeldTo(x: number, y: number) {
    if (this.heldDiver) this.holdTo = { x, y };
  }

  /** Letting go: a quick tap pops the diver, a throw sends it flying limp, anything else just sets it down. */
  releaseHeld(): boolean {
    const f = this.heldDiver;
    if (!f) return false;
    this.heldDiver = null;
    delete f.held;
    const { time } = this;
    if (time - this.holdAt < 0.25 && Math.hypot(this.holdTo.x - this.holdFrom.x, this.holdTo.y - this.holdFrom.y) < 12) {
      this.popDiver(f);
      return true;
    }
    const speed = Math.hypot(this.holdVel.x, this.holdVel.y);
    if (speed > 260) {
      const k = Math.min(1, 800 / speed);
      f.vx = this.holdVel.x * k;
      f.vy = this.holdVel.y * k;
      f.stunUntil = time + 1.4;
      this.callout(f.x, f.y - 30, speed > 700 ? "YEEEET" : "WHEEE!", "255,230,120");
      this.holdQuip("throw", f);
    } else {
      f.vx = 0;
      f.vy = 0;
      this.holdQuip(this.holdLines > 4 ? "long" : "drop", f);
    }
    this.diverGoals.delete(f);
    return true;
  }

  stepHeldDiver(dt: number) {
    const f = this.heldDiver;
    if (!f) return;
    if (!f.alive || f.seized || f.dragger || f.riding) { delete f.held; this.heldDiver = null; return; }
    const nx = f.x + (this.holdTo.x - f.x) * Math.min(1, dt * 14);
    const ny = f.y + (this.holdTo.y - f.y) * Math.min(1, dt * 14);
    const k = Math.min(1, dt * 10);
    this.holdVel.x += ((nx - f.x) / Math.max(dt, 1e-3) - this.holdVel.x) * k;
    this.holdVel.y += ((ny - f.y) / Math.max(dt, 1e-3) - this.holdVel.y) * k;
    f.x = nx;
    f.y = ny;
    f.vx = 0;
    f.vy = 0;
    f.phase += dt * 11;
    // Held a while, he has things to say.
    const held = this.time - this.holdAt;
    if (held > 4 * (this.holdLines + 1) && this.holdLines < 6) { this.holdLines++; this.holdQuip("held"); }
  }

  /** Flair for a diver in the pointer's hand: a callout over his head and now and then a toast, never the same line twice running. */
  holdQuip(when: "grab" | "held" | "throw" | "drop" | "long", f: Fish | null = this.heldDiver) {
    const POOL: Record<string, string[]> = {
      grab: ["he did not consent to this.", "plucked from the sea like a prize fish.", "put me down, giant hand!", "he looks calm. he is not calm.", "a hand from above... a sign?", "he dangles, snorkel drooping."],
      held: ["he has stopped struggling. he is thinking.", "his tank gurgles. he is reconsidering things.", "he has made peace with the hand.", "he is composing a strongly worded letter.", "somewhere a shark checks its watch.", "the diver is beginning to enjoy the view."],
      throw: ["he is airborne. he regrets nothing.", "flight certified. landing: pending.", "the diver has seen the sky. briefly.", "that was not in the dive briefing.", "a perfect arc. judges give it a nine."],
      drop: ["set down gently. he straightens his mask.", "he swims off, pretending that did not happen.", "back to the water, dignity mostly intact.", "he pats his tank. all there."],
      long: ["he has seen things up there.", "released after a long hold. he is a changed diver.", "he swims away muttering about hands.", "finally. he forgot which way was down."],
    };
    const CALL: Record<string, string[]> = {
      grab: ["EEK!", "GOT HIM", "HEY!"],
      held: ["...", "hm.", "zzz"],
      throw: ["WHEEE!"],
      drop: ["phew"],
      long: ["FREE!"],
    };
    const at = f ?? null;
    const pool = POOL[when].filter((l) => l !== this.lastHoldLine);
    // The toast is a treat, not a reflex; the little callout over his head is nearly always there.
    if (when === "held" || Math.random() < 0.45) {
      this.lastHoldLine = pool[randInt(0, pool.length - 1)];
      this.notices.push(this.lastHoldLine);
    }
    if (at && Math.random() < 0.8) this.callout(at.x, at.y - 34, CALL[when][randInt(0, CALL[when].length - 1)], "255,230,120");
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

  popDiver(f: Fish, how: "crushed" | "blast" = "crushed") {
    const { x, y } = f;
    this.diverQuip(how);
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

  stepMess(dt: number) {
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
    // Scrap from a few big events can add up: keep only the freshest few hundred pieces.
    if (this.mess.length > 450) this.mess.splice(0, this.mess.length - 450);
    this.blasts = this.blasts.filter((b) => time - b.born < 0.8);
    this.callouts = this.callouts.filter((c) => time - c.born < 5);
    if (!this.mess.length) for (const sh of this.sharks) { sh.cleaning = false; sh.carrion = false; }
    // Cleaning up a carcass beside a titan is a gamble: the megalodon snaps at any shark that comes in reach of its jaws.
    const big = this.sharks.find((o) => o.mega);
    if (big && Math.random() < dt * 0.5) {
      const victim = this.sharks.find((sh) => sh.carrion && !sh.mega && Math.hypot(sh.nodes[0] - big.nodes[0], sh.nodes[1] - big.nodes[1]) < big.length * 0.07 + 40);
      if (victim && this.sharks.filter((o) => !o.mega).length > 2) {
        this.sharks = this.sharks.filter((o) => o !== victim);
        this.events.push({ kind: "eat", x: victim.nodes[0], y: victim.nodes[1] });
        this.splash(victim.nodes[0], victim.nodes[1], 1.6);
        this.callout(victim.nodes[0], victim.nodes[1] - 40, "SHARK EATEN", "255,120,110");
      }
    }
  }

  spawnDivers(batch = false): boolean {
    if (!this.isEventEnabled("diver")) return false;
    if (this.fish.filter((f) => f.diver && f.alive).length + this.diverQueue.length >= this.diverCap) return false;
    // Every call drops one in at once and may trail a couple more behind it; spam it for a crowd.
    // On their own they come in groups: usually a few, now and then a whole boatload.
    const count = batch ? (Math.random() < 0.25 ? randInt(6, 9) : randInt(2, 5)) : 1 + Math.floor(Math.pow(Math.random(), 1.8) * 3);
    let at = this.time;
    for (let i = 0; i < count; i++) { this.diverQueue.push(at); at += rand(0.6, 2); }
    return true;
  }

  /** A diver's last words, as a toast: weary, appalled or just resigned. Not every time, and never twice running. */
  diverQuip(how: "eaten" | "crushed" | "blast" | "lost") {
    const POOL: Record<string, string[]> = {
      eaten: ["really...?", "wow... just wow.", "the horror of man!", "oh come on...", "well. that happened.", "bold of him to swim there.", "he had a family. probably.", "nobody saw that. right?", "and he was SO close to the surface..."],
      crushed: ["the horror of man!", "squeezed like a lemon...", "ow. just... ow.", "did he really think that would work?", "he did not see that coming. or did he?"],
      blast: ["he lit it himself...", "really...? again?", "boom. as predicted.", "wow... the confidence.", "he was warned. loudly."],
      lost: ["the sea takes another one...", "wow. he really went in there.", "gone. just... gone.", "and not a single wave goodbye..."],
    };
    if (this.time - this.lastQuipAt < 5 || Math.random() > 0.6) return;
    const lines = POOL[how].filter((l) => l !== this.lastQuip);
    this.lastQuip = lines[randInt(0, lines.length - 1)];
    this.lastQuipAt = this.time;
    this.notices.push(this.lastQuip);
  }

  callout(x: number, y: number, text: string, rgb = "255,255,255") {
    if (this.callouts.some(c => c.text === text && this.time - c.born < 2)) return;
    this.callouts.push({ x, y, text, rgb, born: this.time });
    if (this.callouts.length > 6) this.callouts.shift();
  }

  pickDiverKind(): DiverKind {
    const kinds: [DiverKind, number][] = [["scuba", 0.3], ["photo", 0.15], ["treasure", 0.13], ["snorkel", 0.12], ["scooter", 0.2], ["bomber", 0.12]];
    // No cap on bombers: a crowd of them can chain blast after blast.
    let roll = Math.random() * kinds.reduce((sum, [, w]) => sum + w, 0);
    for (const [kind, w] of kinds) { roll -= w; if (roll <= 0) return kind; }
    return "scuba";
  }

  /**
   * A bomber goes off: a fireball and shockwave that shoves sharks away, kills fish, stuns divers, frees whatever the
   * kraken is holding, blows up ufos, and shifts the tug of war against whichever titan is closer.
   */
  explode(x: number, y: number, src?: Fish, fromUfo?: Ufo) {
    const { time } = this;
    const R = 300;
    this.lastBoom = time;
    // A bomber that goes off in the kraken's arms blows the kraken apart rather than just shoving it.
    const inArms = !!src?.seized && !!this.kraken?.caught.includes(src);
    if (src) this.diverQuip("blast");
    if (src) {
      src.alive = false;
      delete src.seized;
      if (src.dragger) { src.dragger.dragging = undefined; src.dragger = undefined; }
    }
    this.bombs.push({ x, y, born: time, r: R, green: !!fromUfo });
    this.splash(x, y, 1.9, undefined, { max: 420 });
    this.events.push({ kind: "eat", x, y });
    this.callout(x, y - 50, "BOOM!", fromUfo ? "130,255,110" : "255,190,70");
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
      } else if (fromUfo && !o.riding && d < R * 0.5) {
        // A saucer's bomb is meant to kill: divers close to it do not survive.
        this.callout(o.x, o.y - 30, "DIVER BOMBED", "255,150,110");
        this.popDiver(o, "blast");
      } else if (o.dkind === "bomber" && o.fuseAt === undefined && d < R * 0.7) {
        o.fuseAt = time + rand(1.5, 3);
      } else if (o.dkind !== "tech" && d < R * 0.8) {
        // Right next to the blast a diver does not always walk away from it.
        if (d < R * 0.35 && !o.riding && Math.random() < 0.45) { this.callout(o.x, o.y - 30, "DIVER CAUGHT IN THE BLAST", "255,150,110"); this.popDiver(o, "blast"); continue; }
        const a = Math.atan2(o.y - y, o.x - x);
        o.vx = Math.cos(a) * 240;
        o.vy = Math.sin(a) * 240;
        o.stunUntil = time + 2.5;
      }
    }
    for (const u of fromUfo ? [] : [...this.ufos]) {
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
        // Set off inside the arms, the blast is much worse for the neighbours: flung hard, and some do not survive it.
        for (const f of [...k.caught]) {
          if (f === src) continue;
          delete f.seized;
          if (inArms && Math.random() < 0.4) { this.callout(f.x, f.y - 30, "DIVER CAUGHT IN THE BLAST", "255,150,110"); this.popDiver(f, "blast"); continue; }
          const a = Math.atan2(f.y - y, f.x - x);
          const kick = inArms ? 360 : 240;
          f.vx = Math.cos(a) * kick;
          f.vy = Math.sin(a) * kick;
          if (inArms) f.stunUntil = time + 2.5;
        }
        k.caught = [];
        for (const sh of [...k.grabbed]) {
          sh.grabbed = false;
          sh.devourAt = undefined;
          if (!inArms) continue;
          if (Math.random() < 0.3 && this.sharks.filter((o) => !o.mega).length > 2) {
            this.sharks = this.sharks.filter((o) => o !== sh);
            this.events.push({ kind: "eat", x: sh.nodes[0], y: sh.nodes[1] });
            this.callout(sh.nodes[0], sh.nodes[1] - 30, "SHARK KILLED IN THE BLAST", "255,120,110");
            this.nextSharkDrift = Math.min(this.nextSharkDrift, time + rand(10, 18));
          } else {
            sh.heading = Math.atan2(sh.nodes[1] - y, sh.nodes[0] - x);
            sh.speed = 260;
            sh.target = null;
            sh.alertUntil = time + 2;
          }
        }
        k.grabbed = [];
        k.strike = null;
        k.sharkStrikes = [];
        k.nextCatch = time + 4;
        k.nextGrab = time + 6;
        const a = Math.atan2(k.y - y, k.x - x);
        k.x += Math.cos(a) * (inArms ? 120 : 50);
        k.y += Math.sin(a) * (inArms ? 120 : 50);
        if (inArms) {
          k.blastAt = time;
          k.rageUntil = time + 30;
          k.hunt = undefined;
          k.whaleUntil = 0;
          k.ufoHeld = false;
          k.wounded = true;
          k.jet = Math.max(k.jet, 0.8);
          this.callout(k.x, k.y - k.size * 0.25, "KRAKEN BLOWN APART", "255,190,70");
          // Blown about, it either bolts or comes back angrier.
          if (k.state === "grab" && Math.random() < 0.4) {
            k.state = "flee";
            k.stateAt = time;
            this.notices.push("a bomber blew up in the kraken's arms... it's fleeing!");
          } else this.notices.push("a bomber blew up in the kraken's arms... and it's furious!");
        }
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
  techVsKraken(f: Fish, k: Kraken) {
    const { time } = this;
    // A laser that lands on the kraken provokes it: it is enraged for a while, and if the shooter is within reach it lashes
    // a tentacle straight back at him.
    const bolt = () => {
      this.bolts.push({ x0: f.x, y0: f.y, x1: k.x, y1: k.y, born: time });
      f.flashAt = time;
      if (time >= (k.rageUntil ?? 0) - 8) this.callout(k.x, k.y - k.size * 0.3, "KRAKEN PROVOKED", "255,110,100");
      k.rageUntil = Math.max(k.rageUntil ?? 0, time + 12);
      if (!k.strike && !f.seized && !f.riding && k.caught.length < 5 && Math.hypot(f.x - k.x, f.y - k.y) < k.size * 1.1) k.strike = { f, at: time };
    };
    if (k.strike) {
      k.strike = null;
      k.nextCatch = time + 4;
      bolt();
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
      } else if (what === "shark") {
        const s = k.grabbed[0];
        s.grabbed = false;
        s.devourAt = undefined;
        k.grabbed = k.grabbed.filter((o) => o !== s);
      } else if (this.ufo) {
        k.ufoHeld = false;
        this.ufo.held = false;
        this.ufo.fast = true;
        this.ufo.state = "leave";
      }
      k.nextCatch = time + 3;
      return true;
    }
    if (k.state === "wrap") {
      // Shooting the kraken while it wrestles the megalodon tips the fight toward the megalodon.
      k.tilt = clamp(k.tilt - 0.1, -1, 1);
      bolt();
      return true;
    }
    return false;
  }

  /** Is this diver actually in the water (not still on his way in from an edge)? */
  onScreen(f: Fish) {
    return f.x > 20 && f.x < this.width - 20 && f.y > 30 && f.y < this.height - 20;
  }

  /**
   * A tech diver fires his blaster: at a ufo (three hits bring one down), at a fish, or just past a passing shark for show.
   * He never hits a shark.
   */
  blasterFire(f: Fish) {
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
      mg.rageUntil = Math.max(mg.rageUntil ?? 0, time + 12);
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
  blasterEscape(f: Fish, chance: number, fromX: number, fromY: number, text = "BLASTED FREE") {
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
  diverDepth(f: Fish) {
    return f.dkind === "snorkel" ? rand(0.07, 0.18) : rand(0.25, 0.7);
  }

  /** The spot photographers and rescuers head for: a kraken fight, a shark fight, or a kraken holding sharks. */
  spectacle(): { x: number; y: number; rescue: boolean } | null {
    const k = this.kraken;
    if (k && (k.state === "wrap" || k.state === "grab")) return { x: k.x, y: k.y, rescue: k.state === "grab" && k.grabbed.length > 0 };
    if (this.fight?.engaged) return { x: this.fight.mx, y: this.fight.my, rescue: false };
    return null;
  }

  /** Divers swim slowly between random spots, bolt from nearby sharks, and are chased down. */
  stepDivers(dt: number) {
    const { time, width: W, height: H } = this;
    if (!this.isEventEnabled("diver")) { this.diverQueue.length = 0; this.techQueue.length = 0; }
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
      if (f.fuseAt !== undefined && time >= f.fuseAt) {
        if (time - this.lastBoom < 0.35) f.fuseAt = this.lastBoom + 0.35 + rand(0, 0.5);
        else this.explode(f.x, f.y, f);
      }
    }
    this.stepHeldDiver(dt);
    const show = this.spectacle();
    for (const f of this.fish) {
      if (!f.diver || !f.alive || f.riding || f.dragger || f.seized || f.held) continue;
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
        const d = Math.hypot(sh.nodes[0] - f.x, sh.nodes[1] - f.y) / TRAITS[sh.kind].diver;
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

  spawnJellies() {
    if (!this.isEventEnabled("jelly")) return;
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

  /** Points along the kraken's mantle and head and the megalodon's body, each with how far its body reaches. */
  titanBlobs() {
    const pts: { x: number; y: number; r: number }[] = [];
    const kr = this.kraken;
    if (kr) {
      for (const u of [0, 0.15, 0.3, 0.45, 0.6]) pts.push({ x: kr.x + Math.cos(kr.heading) * kr.size * u, y: kr.y + Math.sin(kr.heading) * kr.size * u, r: kr.size * 0.13 });
    }
    for (const sh of this.sharks) {
      if (!sh.mega) continue;
      for (let n = 0; n < SHARK_NODES; n += 2) pts.push({ x: sh.nodes[n * 2], y: sh.nodes[n * 2 + 1], r: sh.length * 0.06 + 14 });
    }
    return pts;
  }

  spawnWhale(manual = false) {
    const { width: W, height: H } = this;
    const length = clamp(Math.min(W, H) * 0.72, 260, 850);
    if (!this.isEventEnabled("whale") || this.whales.length >= 2) return false;
    // A whale never swims in on top of a titan: it needs a clear entry (the whole body and a good run past it) on one of the two
    // sides, otherwise it does not come at all.
    const titans = this.titanBlobs();
    let entry: { side: 0 | 1; y: number } | null = null;
    for (let i = 0; i < 12 && !entry; i++) {
      const e = this.entryPoint(i < 6 ? undefined : ((i % 2) as 0 | 1));
      const ex = e.side === 0 ? -20 : W + 20;
      const clear = titans.every((t) => Math.hypot(t.x - ex, t.y - e.y) > t.r + length * 1.15 + 120 && Math.hypot(t.x - (ex + (e.side === 0 ? 1 : -1) * length * 0.5), t.y - e.y) > t.r + length * 0.5 + 120);
      if (clear) entry = e;
    }
    if (!entry && manual) entry = this.entryPoint();
    if (!entry) return false;
    const { side, y } = entry;
    this.whales.push({
      x: side === 0 ? -20 : W + 20, y, heading: (side === 0 ? 0 : Math.PI) + rand(-0.12, 0.12),
      speed: rand(22, 30), length, phase: 0, traveled: 0, rippleAt: 0,
    });
    return true;
  }

  /**
   * A whale that ends up in a titan's body (it has just come in, and nothing is already fighting over it) is seized and eaten on the
   * spot: the whale is gone and what is left of it drifts down as scraps. The sharks that come to clean it up are close to the
   * titan that did it, and can be grabbed too.
   */
  devourWhale(wh: Whale, by: "kraken" | "mega", x: number, y: number, how: "seize" | "crush" | "eat" = "seize") {
    const { time } = this;
    if (this.whaleFight?.whale === wh) this.endWhaleFight();
    if (this.kraken?.whaleTarget === wh) { this.kraken.whaleUntil = 0; this.kraken.whaleTarget = undefined; this.kraken.whaleMode = undefined; }
    if (this.kraken?.hunt === wh) this.kraken.hunt = undefined;
    this.whales = this.whales.filter((w) => w !== wh);
    for (let u = 0.1; u < 1; u += 0.2) {
      const p = this.whalePoint(wh, u);
      this.events.push({ kind: "eat", x: p.x, y: p.y });
    }
    this.splash(x, y, 3);
    this.callout(x, y - 60, by === "mega" ? "MEGALODON SEIZES WHALE" : how === "crush" ? "KRAKEN CRUSHES WHALE" : how === "eat" ? "KRAKEN EATS WHALE" : "KRAKEN SEIZES WHALE", "255,120,110");
    this.notices.push(by === "mega" ? "a whale swam into the megalodon... gone in a single bite!" : how === "crush" ? "the kraken crushed the whale... the sharks move in!" : how === "eat" ? "the kraken dragged the whale under... and ate it!" : "a whale swam into the kraken... and was dragged under!");
    const bits: [string, string][] = [["#", "205,220,240"], ["%", "170,190,225"], ["@", "235,240,250"], ["*", "200,70,80"], [":", "190,60,70"], ["o", "245,245,240"]];
    for (let i = 0; i < 60; i++) {
      const p = this.whalePoint(wh, rand(0.05, 0.95));
      const a = rand(0, TAU);
      const sp = rand(10, 60);
      const [glyph, rgb] = bits[i % bits.length];
      this.mess.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
    }
    this.sharks
      .filter((sh) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.leaving && !sh.dragging && !(this.fight && (sh === this.fight.a || sh === this.fight.b)))
      .sort((a, b) => Math.hypot(a.nodes[0] - x, a.nodes[1] - y) - Math.hypot(b.nodes[0] - x, b.nodes[1] - y))
      .slice(0, 5)
      .forEach((sh) => { sh.cleaning = true; sh.carrion = true; sh.target = null; sh.alertUntil = time + 1.2; });
  }

  /** Two similar-sized sharks circle each other and lunge. */
  spawnFight() {
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

  stepFight() {
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

  spawnWhirl() {
    if (this.whirl) return;
    const { width: W, height: H, time } = this;
    const r = clamp(Math.min(W, H) * 0.12 * rand(0.5, 1.7), 45, 240);
    this.whirl = {
      x: rand(W * 0.2, W * 0.8), y: rand(H * 0.25, H * 0.75), r, born: time, until: time + rand(9, 14),
      dir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1, rippleAt: time,
    };
  }

  /** Pull a loose knot of fish into a spinning bait ball while the sharks close in. */
  spawnBaitBall() {
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

  stepCritters(dt: number) {
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
    const wh = wCur;
    if (wh) {
      wh.phase += dt * 0.45;
      if (wh.fleeing) {
        // It swims off only as fast as it has turned toward the way out: it curves away with its flukes beating, instead of
        // driving off along whatever way it happened to face (or sliding away like a flat cutout).
        const off = angleDiff(wh.heading, wh.fleeHeading ?? wh.heading);
        const lined = Math.pow(Math.max(0, Math.cos(off)), 1.5);
        // It gets away briskly (about three times its cruising pace once lined up, which is quick for something its size)
        // instead of scooting off slowly from a standstill.
        wh.speed += ((40 + 46 * lined) - wh.speed) * Math.min(1, dt * 2.4);
        wh.heading += clamp(off, -(0.8 + 0.5 * (1 - lined)) * dt, (0.8 + 0.5 * (1 - lined)) * dt);
        wh.phase += dt * 1.4;
      }
      // A whale never swims toward a predator: it veers off when a megalodon or kraken is bearing down.
      if (!wh.fleeing && this.whaleFight?.whale !== wh) {
        // Any titan's body counts (the mega's whole length, the kraken's mantle and head), however it feels about whales:
        // getting close is death, so it tries to turn clear of one before it clips or bumps it.
        const pts: { x: number; y: number; r: number }[] = [];
        for (const sh of this.sharks) {
          if (!sh.mega || sh.retreat) continue;
          for (let n = 0; n < SHARK_NODES; n += 2) pts.push({ x: sh.nodes[n * 2], y: sh.nodes[n * 2 + 1], r: sh.length * 0.06 + 14 });
        }
        const kr = this.kraken;
        if (kr && kr.state !== "flee" && !(kr.whaleTarget === wh && kr.whaleUntil > 0)) {
          for (const u of [0, 0.2, 0.4, 0.6]) pts.push({ x: kr.x + Math.cos(kr.heading) * kr.size * u, y: kr.y + Math.sin(kr.heading) * kr.size * u, r: kr.size * 0.14 });
        }
        let hp: { x: number; y: number } | null = null;
        let close = 1;
        const seen = wh.length * 0.9;
        for (let u = 0; u <= 1; u += 0.25) {
          const bx = wh.x - Math.cos(wh.heading) * wh.length * u;
          const by = wh.y - Math.sin(wh.heading) * wh.length * u;
          for (const p of pts) {
            const c = (Math.hypot(p.x - bx, p.y - by) - p.r) / (seen + p.r);
            if (c < close) { close = c; hp = p; }
          }
        }
        if (hp && close < 1) {
          const m = this.whaleMid(wh);
          const away = Math.atan2(m.y - hp.y, m.x - hp.x);
          const diff = angleDiff(wh.heading, away);
          // It turns the short way round, except when the threat is dead ahead, where it commits to one side for as long
          // as the threat is near. Small differences are ignored, so a titan swimming past never makes it dither.
          wh.veer ??= diff >= 0 ? 1 : -1;
          // Always a slow, heavy turn: that is the whale's weakness, and why a titan can run one down.
          const rate = 0.22 + 0.06 * (1 - Math.max(0, close));
          // It swims off while it turns, so the turn is an arc away from the threat, not a spin on the spot.
          wh.speed += (30 - wh.speed) * Math.min(1, dt * 1.2);
          if (Math.abs(diff) > 0.3) wh.heading += (Math.abs(diff) > 2.6 ? wh.veer : Math.sign(diff)) * Math.min(Math.abs(diff), rate * dt);
        } else wh.veer = undefined;
      }
      wh.x += Math.cos(wh.heading) * wh.speed * dt;
      wh.y += Math.sin(wh.heading) * wh.speed * dt;
      wh.traveled += wh.speed * dt;
      // A whale that has only just come in and is already inside a titan has nowhere to go: it is seized and eaten on the spot.
      if (wh.traveled < wh.length * 1.6 && !wh.fleeing && this.whaleFight?.whale !== wh) {
        const hit = this.titanBlobs();
        let eater: { x: number; y: number } | null = null;
        for (let u = 0; u <= 1 && !eater; u += 0.2) {
          const bp = this.whalePoint(wh, u);
          const t = hit.find((b) => Math.hypot(b.x - bp.x, b.y - bp.y) < b.r + wh.length * 0.04);
          if (t) eater = t;
        }
        const byKraken = !!eater && !!this.kraken && Math.hypot(this.kraken.x - eater!.x, this.kraken.y - eater!.y) < this.kraken.size;
        // A megalodon's jaws close at once; a kraken reaching a whale starts the lunge, poke or squeeze instead, and what happens to
        // the whale is decided at the end of it.
        if (eater && !byKraken) {
          this.devourWhale(wh, "mega", eater.x, eater.y);
          continue;
        }
      }
      // Whales never clip each other: an overlapping pair is eased apart, each giving way on its own side.
      for (const other of this.whales) {
        if (other === wh) continue;
        const a = this.whaleMid(wh);
        const b = this.whaleMid(other);
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const minD = (wh.length + other.length) * 0.5;
        if (d < minD && d > 1e-3) {
          // Resolved in full every frame, split evenly: an overlap is never left standing for more than a step.
          const push = (minD - d) * 0.5;
          const nx = (a.x - b.x) / d;
          const ny = (a.y - b.y) / d;
          wh.x += nx * push;
          wh.y += ny * push;
          other.x -= nx * push;
          other.y -= ny * push;
        }
      }
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
      if (!wh.fleeing && this.whaleFight?.whale !== wh && !(this.kraken?.whaleTarget === wh && this.kraken.whaleUntil > 0)) {
        wh.songAt ??= time + rand(5, 10);
        if (time >= wh.songAt) {
          wh.songAt = time + rand(22, 40);
          this.splash(wh.x, wh.y, 0.9, undefined, { song: true, max: wh.length * 1.4, quiet: true });
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
      if (wh.traveled > Math.max(W, H) * 1.0 + wh.length * 1.15 + 80 || (wh.fleeing && Math.max(-wh.x, wh.x - W, -wh.y, wh.y - H) > wh.length * 1.1)) {
        if (this.whaleFight?.whale === wh) this.endWhaleFight();
        if (this.kraken?.whaleTarget === wh) { this.kraken.whaleUntil = 0; this.kraken.whaleTarget = undefined; }
        this.whales = this.whales.filter((w) => w !== wh);
      }
    }
    }
    this.whales = whaleOrder.filter((w) => this.whales.includes(w));

    // The whirlpool: fish are swept into a spiral for a few seconds, then flung out.
    const wp = this.whirl;
    if (wp) {
      const left = wp.until - time;
      const fade = Math.min(1, (time - wp.born) / 2, left / 2);
      if (time - wp.rippleAt > 2.5) { wp.rippleAt = time; this.splash(wp.x, wp.y, 0.25, undefined, { max: wp.r * 0.65, quiet: true }); }
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

  /** strength: ~0.25 hover wake, ~0.55 drag trail, 2.5 click or finished task. */
  splash(x: number, y: number, strength = 1, hue?: 0 | 1, opts?: { dir?: number; weight?: number; max?: number; quiet?: boolean; song?: boolean }) {
    if (this.ripples.length >= (strength < 1.2 ? 28 : 36)) return;
    // Only a heavy splash gets the burst at its centre; a trail is just clean rings.
    if (strength >= 1.2 && !opts?.quiet) this.events.push({ kind: "splash", x, y, strength });
    const far = Math.max(x, this.width - x);
    const deep = Math.max(y, this.height - y);
    const full = Math.hypot(far, deep) + 40;
    // Light touches die out nearby; only a heavy splash crosses the whole tank.
    const max = opts?.max ? Math.min(full, opts.max) : strength >= 1.2 ? full * 0.65 : Math.min(full, 80 + 170 * strength);
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
  stepRipples(dt: number) {
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

  collide(a: Ripple, b: Ripple, dt: number) {
    const D = Math.hypot(b.x - a.x, b.y - a.y);
    // Trail ripples (hover/drag) overlap by design; only a heavy splash scatters against others.
    if (a.strength < 1.2 && b.strength < 1.2) return;
    if (D > a.r + b.r + RIPPLE_BAND || D < Math.abs(a.r - b.r) - RIPPLE_BAND || a.r < 4 || b.r < 4) return;
    this.breakContact(a, b, dt);
    this.breakContact(b, a, dt);
  }

  breakContact(a: Ripple, other: Ripple, dt: number) {
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

  rebuildHash() {
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

  bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  stepFish(dt: number) {
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
      // (A migrating school is free to leave by the far side.)
      if (!f.migrate) {
        if (f.x < m) ax += (m - f.x) * 7;
        else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      }
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      // Ambient current and a little individual restlessness.
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      // Swim level, except when bolting from danger.
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);
      // A migrating fish keeps heading across the tank, whatever the school does.
      if (f.migrate) { ax += (f.migrate * sp.maxSpeed * 0.95 - f.vx) * 4; ay -= f.vy * 1.2; }

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

  stepSharks(dt: number) {
    const { sharks, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const cxW = W / 2;
    const cyW = H / 2;
    const mega = sharks.find((x) => x.mega);
    const kraken = this.kraken;
    const whale = this.whaleFight?.whale ?? (mega ? this.nearestWhale(mega.nodes[0], mega.nodes[1]) : null);
    const fight = this.fight;
    this.frenzy = Math.max(0, this.frenzy - dt * 0.05);
    if (this.frenzy > 0.6 && time >= this.frenzyNoteAt) { this.frenzyNoteAt = time + rand(40, 70); this.notices.push(pickLine(FRENZY_LINES)); }
    // The long middle of a titans clash gets a line now and then, so it never goes mute.
    if (time >= this.ambientAt) {
      this.ambientAt = time + rand(18, 32);
      if (this.sagas.some((s) => s.kind === "clash") && this.kraken && sharks.some((x) => x.mega)) this.notices.push(pickLine(CLASH_AMBIENT));
    }
    if (this.blood && time > this.blood.until) this.blood = null;

    for (const sh of sharks) {
      const tr = TRAITS[sh.mega ? "classic" : sh.kind];
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
      let stalk = false;
      let rallied = false;
      let preyAlign = 1;
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
        // Prey that is close but off to the side is not sprinted at: a shark is too long to turn that tight at speed, so it would just circle it.
        if (d < L * 1.3) preyAlign = Math.max(0, Math.cos(angleDiff(sh.heading, Math.atan2(ty, tx))));
        // Species that stalk creep up on their prey and only burst at close range; blood in the water makes everyone reckless.
        stalk = !sh.mega && !t.diver && tr.stalk >= 0.4 && d > L * (0.9 + 1.4 * tr.stalk) && this.frenzy < 0.35;
      } else {
        // A kill nearby draws the pack: idle sharks that are not full swim in to the spot.
        const bl = this.blood;
        if (bl && !sh.mega && sh.hunger > 0.25 && !sh.cleaning && Math.hypot(bl.x - hx, bl.y - hy) < minSide * 1.2) {
          const bx = bl.x - hx;
          const by = bl.y - hy;
          const bd = Math.hypot(bx, by) || 1;
          dx += (bx / bd) * 2.4;
          dy += (by / bd) * 2.4;
          rallied = true;
        }
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
          const turnMax = (sh.pounceUntil ?? 0) > time ? 0.7 : kraken ? 0.25 : 0.4;
          sh.megaHeading = cur + clamp(angleDiff(cur, want), -turnMax * dt, turnMax * dt);
        }
        // Wrapped by the kraken it whips its head about; a winning megalodon thrashes harder as the fight goes on.
        let wobble = 0;
        if (kraken?.state === "wrap" && kraken.wrapping === sh && kraken.maul) {
          wobble = Math.sin((time - kraken.stateAt) * 7.2) * 0.55;
        } else if (kraken?.state === "wrap" && kraken.wrapping === sh && kraken.coiled) {
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
            this.whaleFight = { whale, mega: sh, start: time, until: Infinity, nextHit: Infinity, doomed: Math.random() < 0.75, bite: Math.random() < 0.4 ? rand(0.17, 0.24) : rand(0.38, 0.5), locked: false };
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
          if (!wf.locked && toBite < L * 0.05 + 16) {
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
        // The kraken is far stronger than what it holds: past a comfortable reach the arms haul it back in hard and its
        // thrashing dies down, so it can be flung about but never drags the arms out across the tank. Now and then
        // it is reeled right in, and a long stretch can make it lose its grip.
        const maxReach = kraken.size * 0.7;
        const over = d - maxReach;
        sh.taut = clamp(over / (kraken.size * 0.2), 0, 1);
        sh.stretch = over > 0 ? (sh.stretch ?? 0) + dt : Math.max(0, (sh.stretch ?? 0) - dt);
        const reel = Math.max(0, Math.sin(time * 0.5 + sh.id * 1.7)) > 0.85 ? 1.6 : 0;
        const pull = ((d > kraken.size * 0.4 + L * 0.2 ? 0.25 + 1.2 * jolt : 0.1) + 2.8 * sh.taut + reel) * reached;
        const slack = 1 - 0.75 * sh.taut;
        dx = (ox / d) * pull + (-oy / d) * thrash * slack;
        dy = (oy / d) * pull + (ox / d) * thrash * slack;
        // A shark that keeps straining at the end of the arms may wrench free; a sawshark can saw its way out, leaving
        // scraps of squid behind.
        if (reached >= 1) {
          const sawFree = sh.kind === "sawshark" && Math.random() < dt * 0.12;
          const slipFree = (sh.stretch ?? 0) > 2 && Math.random() < dt * 0.5;
          if (sawFree || slipFree) {
            sh.grabbed = false;
            sh.devourAt = undefined;
            sh.stretch = 0;
            kraken.grabbed = kraken.grabbed.filter((o) => o !== sh);
            kraken.nextGrab = Math.max(kraken.nextGrab, time + rand(2, 4));
            this.splash(hx, hy, 1.6);
            if (sawFree) {
              this.callout(hx, hy - 40, "SAWSHARK CUTS FREE", "150,255,190");
              this.notices.push("the sawshark sawed its way out of the kraken's arm!");
              const bits: [string, string][] = [["@", "225,225,232"], ["8", "205,205,215"], ["o", "190,190,205"], ["%", "170,170,190"]];
              for (let i = 0; i < 14; i++) {
                const a = rand(0, TAU);
                const sp = rand(10, 50);
                const [glyph, rgb] = bits[i % bits.length];
                this.mess.push({ x: hx + Math.cos(a) * rand(0, 30), y: hy + Math.sin(a) * rand(0, 20), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
              }
            } else this.notices.push("a shark slipped the kraken's grip!");
          }
        }
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
          mega && { x: mega.nodes[0], y: mega.nodes[1], reach: Math.max(W, H) * 0.9 * tr.fear, sprint: 0.5, push: 11 },
          // The kraken is a real threat: sharks give it a wide berth (wider and more urgent while it is enraged) and bolt when it is near.
          kraken && { x: kraken.x, y: kraken.y, reach: kraken.size * (1.9 + 0.6 * this.krakenRage()) * tr.fear, sprint: 0.6, push: 17 + 6 * this.krakenRage() },
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
            const w = 3 + threat.push * Math.pow(1 - d / threat.reach, 1.5);
            dx += (ox / d) * w;
            dy += (oy / d) * w;
            if (d < threat.reach * threat.sprint) fleeing = true;
            hunting = false;
            sh.target = null;
          } else if (tr.scavenger > 0.5 && d < threat.reach * 1.9 && (kraken?.state === "wrap" || this.mess.length > 8)) {
            // The bold ones hover just outside a titan's reach, waiting for what the fight leaves behind.
            const w = 1.3 * (d / (threat.reach * 1.9));
            dx -= (ox / d) * w;
            dy -= (oy / d) * w;
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
      // Nothing swims through the kraken's body: a shark that strays into it is shoved out and bolts.
      if (kraken && !sh.mega && !sh.grabbed && !sh.lifted) {
        const kr = kraken.size * 0.42;
        const kox = hx - kraken.x;
        const koy = hy - kraken.y;
        const kd = Math.hypot(kox, koy) || 1;
        if (kd < kr) {
          const shove = (kr - kd) * dt * 6;
          for (let n = 0; n < SHARK_NODES; n++) { sh.nodes[n * 2] += (kox / kd) * shove; sh.nodes[n * 2 + 1] += (koy / kd) * shove; }
          dx += (kox / kd) * 20;
          dy += (koy / kd) * 20;
          fleeing = true;
        }
      }
      const desired = Math.atan2(dy, dx);
      // Sharks can't pivot on the spot: the turning circle grows with speed.
      const agility = Math.min(sh.mega ? (sh.retreat ? 0.6 : sh.biteTarget ? 0.7 : 0.3) : held ? 3 : fighting ? 1.8 : fleeing ? 2 : hunting ? 1.7 + closing : 0.8, sh.speed / (L * 0.22)) * (sh.mega ? 1 : tr.turn);
      const maxTurn = agility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = (30 + L * 0.04) * tr.speed;
      // Sprints cost stamina and a spent shark has to coast until it recovers; stalking and cruising are free.
      sh.stamina = sh.stamina ?? 1;
      if (sh.winded && sh.stamina > 0.4) sh.winded = false;
      const sprinting = hunting && !stalk && !fleeing && !sh.mega && !sh.winded;
      if (sprinting && (closing > 0 || this.frenzy > 0.35)) sh.stamina = Math.max(0, sh.stamina - dt / (8 * tr.stamina));
      else sh.stamina = Math.min(1, sh.stamina + dt / 5);
      if (sh.stamina <= 0) sh.winded = true;
      const huntMul = (stalk ? 0.85 : sh.winded ? 1.05 : (1.45 + closing * 1.5) * tr.burst * (1 + 0.3 * this.frenzy)) * (0.45 + 0.55 * preyAlign);
      sh.mood = sh.mega ? undefined : fleeing ? "wary" : stalk ? "stalk" : hunting && sh.winded ? "winded" : hunting ? "strike" : rallied || this.frenzy > 0.5 ? "frenzy" : (sh.fedUntil ?? 0) > time ? "feed" : "cruise";
      const tailTo = sh.mega ? 1 : (sh.mood === "stalk" ? 0.55 : sh.mood === "strike" ? 1.35 : sh.mood === "frenzy" ? 1.5 : sh.mood === "winded" ? 0.8 : 1) * tr.tail;
      sh.tailAmp = (sh.tailAmp ?? 1) + (tailTo - (sh.tailAmp ?? 1)) * Math.min(1, dt * 3);
      const targetSpeed = sh.mega ? (kraken?.state === "wrap" ? (kraken.lunging ? 55 : 12) : this.whaleFight?.mega === sh ? (this.whaleFight.locked ? 62 : 175) : sh.retreat ? (sh.leaveCalm ? 64 : 140) : kraken ? 46 : whale && !whale.fleeing && !sh.retreat && sh.whaleAttack !== false ? (Math.hypot(this.whaleMid(whale).x - nodes[0], this.whaleMid(whale).y - nodes[1]) < whale.length * 1.3 ? 120 : 75) : 30 + L * 0.015) : held ? 30 + 150 * (sh.taut ?? 0) : fighting ? cruise * (lunging ? 2.4 : 1.3) : fleeing ? cruise * 2.3 : hunting ? cruise * huntMul : cruise * (rallied ? 1.5 : 1);
      // A megalodon closing on a whale surges: it builds speed to chase and lunges the last stretch at its bite spot, instead of
      // the whale being drawn in.
      const surging = sh.mega && this.whaleFight?.mega === sh && !this.whaleFight.locked;
      // An enraged megalodon swims a little faster, not so much that it looks wrong beside everything else.
      sh.speed += (targetSpeed * (sh.mega ? (1 + 0.12 * (sh.rageLevel ?? 0)) * ((sh.pounceUntil ?? 0) > time ? 1.7 : 1) : 1) - sh.speed) * Math.min(1, dt * (sh.mega && sh.retreat ? (sh.leaveCalm ? 0.45 : 1.7) : surging ? 2.4 : 1.1));
      // A megalodon keeps a slow, heavy tail beat even when it surges (more push per stroke, not faster strokes), and only lashes quickly while thrashing.
      sh.phase += dt * (sh.mega ? 1.0 + Math.min(sh.speed, 200) / 120 + 2.2 * (sh.thrash ?? 0) : (2 + sh.speed / 24) * tr.tail * (sh.mood === "stalk" ? 0.7 : 1));

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
            if (f.dkind === "bomber" && f.fuseAt !== undefined && time - this.lastBoom >= 0.3) { this.explode(f.x, f.y, f); continue; }
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
            if (f.diver) this.diverQuip("eaten");
            if (f.diver && !sh.mega) sh.fedUntil = time + 40;
            f.respawnAt = time + rand(3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y });
            if (!sh.mega) {
              this.frenzy = Math.min(1, this.frenzy + (f.diver ? 0.35 : 0.04));
              if (f.diver || this.frenzy > 0.5) this.blood = { x: f.x, y: f.y, until: time + 7 };
            }
          }
        }
      }
    }
  }

  /** Sharks come and go: now and then one swims in from an edge, or a spare one leaves. */
  stepSharkDrift() {
    const { time, width: W, height: H } = this;
    if (this.sharks.some((sh) => sh.leaving && Math.max(-sh.nodes[0], sh.nodes[0] - W, -sh.nodes[1], sh.nodes[1] - H) > sh.length * 1.05)) {
      this.sharks = this.sharks.filter((sh) => !(sh.leaving && Math.max(-sh.nodes[0], sh.nodes[0] - W, -sh.nodes[1], sh.nodes[1] - H) > sh.length * 1.05));
    }
    if (this.sharkCap < 4 || time < this.nextSharkDrift || W === 0) return;
    // Around a titan the tank stays full: sharks arrive quickly, none leave, and a couple extra are allowed
    // so there are always some close enough to come to the rescue.
    const titan = !!this.kraken || this.sharks.some((sh) => sh.mega);
    this.nextSharkDrift = time + (titan ? rand(18, 32) : rand(18, 50));
    const staying = this.sharks.filter((sh) => !sh.mega && !sh.leaving);
    const cap = this.sharkCap;
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
  addShark() {
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
  endDrag(sh: Shark) {
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
  findPrey(sh: Shark): Fish | null {
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
      // Prey it is already chasing stays chased even once it slips past the snout, so a shark never drops it and picks another every half second.
      if (cos < 0.2 && f !== sh.target) continue;
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

  respawn() {
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface World extends TitanMethods {}
Object.assign(World.prototype, titanMethods);
