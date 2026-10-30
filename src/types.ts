import { angleDiff, clamp, current, rand, randInt, TAU } from "./math";
import { pickSpecies, SPECIES } from "./species";
import type { SharkMood } from "./sharks";
export const SHARK_NODES = 20;
export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse" | "sawshark" | "ghost";
/** Which sharks to put in the water; size is relative to the biggest. */
export type SharkSpec = {
  kind: SharkKind;
  size: number;
};
// The landing hero: four of the same shark at different depths.
export const DEFAULT_SHARKS: SharkSpec[] = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.7 },
  { kind: "classic", size: 0.84 },
  { kind: "classic", size: 0.77 },
];
export type DiverKind = "scuba" | "photo" | "treasure" | "snorkel" | "scooter" | "tech" | "bomber";
/** How heavy a diver is (0 light → 1 heavy): heavier ones swing slower in the kraken's arms. */
export const DIVER_MASS: Record<DiverKind, number> = {
  snorkel: 0, photo: 0.25, scuba: 0.5, bomber: 0.5, tech: 0.65, scooter: 0.8, treasure: 1,
};
/** Drones resist forces about as much as a bomber diver. */
export const DRONE_MASS = 1 + DIVER_MASS.bomber * .4;
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
  /** Committed to the rare EOE departure sequence. */
  eoeBound?: true;
  /** What kind of diver this is; changes its look and how it swims. */
  dkind?: DiverKind;
  /** The shark carrying this diver around in its jaws. */
  dragger?: Shark;
  /** Photographers: when the last flash went off, and when the next one will. */
  flashAt?: number;
  nextFlash?: number;
  /** Tech divers: the wreck they swim to for scrap, when they finish arming, and when the next shot is due. */
  salvage?: {
    x: number;
    y: number;
  };
  /** Bombers: when the fuse is lit (a red ! shows over his head) and when he goes off. */
  hotAt?: number;
  fuseAt?: number;
  equipUntil?: number;
  /** Salvaged alien plating: absorbs one incoming encounter hit. */
  alienArmor?: boolean;
  shieldUntil?: number;
  nextShot?: number;
  /** Tech divers get one roll at blasting themselves free of a grab: undefined = not rolled, false = used up. */
  escapeRoll?: boolean;
  /** Knocked out by a jellyfish until this time: limp, drifting, and easy prey. */
  stunUntil?: number;
  /** Migrating fish swim steadily across the tank in this direction (1 = left to right). */
  migrate?: 1 | -1;
  /** Held in the kraken's arms, thrashed about until crushAt. */
  seized?: true;
  crushAt?: number;
  /** Scooter divers: already had a go at freeing a shark from the kraken. */
  tried?: true;
  /** Held by the pointer: carried wherever the mouse goes until let go. */
  held?: true;
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
  /** Cleaning up whale scraps: so close to the titan that did it that it can be grabbed or bitten like anything else there. */
  carrion?: boolean;
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
  rechallengeAt?: number;
  /** Sent in to help a megalodon the kraken is crushing. */
  rallying?: boolean;
  /** A megalodon chases a fleeing kraken only until this time. */
  chaseUntil?: number;
  /** A provoked megalodon is enraged until this time; rageLevel (0-1, set every step) is what the renderer reads. */
  rageUntil?: number;
  rageLevel?: number;
  /** Frame of mind (see sharks.ts), sprint stamina (0 spent to 1 fresh; `winded` until it recovers) and the tail amplitude the renderer reads. */
  mood?: SharkMood;
  stamina?: number;
  winded?: boolean;
  tailAmp?: number;
  /** The megalodon is surging at the kraken until this time (it picked the fight, or is running a fleeing kraken down); pounceAt is when it may next start one. */
  pounceUntil?: number;
  pounceAt?: number;
  megaHeading?: number;
  /** A megalodon's smoothed turn rate (rad/s): it eases in and out of each turn rather than snapping. */
  megaTurn?: number;
  swimSpine?: Float32Array;
  swimEnergy?: number;
  impactAt?: number;
  impactAge?: number;
  impactSide?: number;
  edgeCourse?: { x: number; y: number; until: number };
  /** When a laser last struck it: a megalodon's hide flashes red for a moment. */
  hitAt?: number;
  /** Hunting a mothership on its own initiative. */
  hullHunt?: boolean;
  /** Jaws clamped on the mothership: held at the snout and bitten repeatedly until it lets go. */
  hullClamp?: { until: number; nextBite: number; dx: number; dy: number };
  nextClampAt?: number;
  strikeAt?: number;
  strikeOffset?: { x: number; y: number };
  clashCourse?: { kraken: Kraken; at: number; heading: number };
  blastFlee?: { x: number; y: number; until: number };
  /** A megalodon stays until this time: pushed out while enraged, so it only starts to leave a few seconds after it calms down. */
  calmUntil?: number;
  /** Winner stays to challenge the remaining tank for one minute. */
  victoryUntil?: number;
  /** Leaving on its own (not driven off): swims out at an easy cruise instead of bolting. */
  leaveCalm?: boolean;
  /** How hard a megalodon is thrashing (0 cruising → 1+ wrapped by the kraken or clamped on the whale): drives a bigger, faster body wave. */
  thrash?: number;
  /** A megalodon that just bit something waits until this time before biting again. */
  nextBite?: number;
  /** A shark flung out of a maelstrom waits until this time before it can be flung again. */
  nextFling?: number;
  /** Does this megalodon go for whales? Decided on arrival: some just share the water with one. */
  whaleAttack?: boolean;
  /** When the kraken's arms set on this shark: the arms take a moment to reach it before it is hauled in. */
  grabbedAt?: number;
  /** Held by the kraken: seconds spent stretched past the arms' comfortable reach, and how tight the arms are (0 slack, 1 taut). */
  stretch?: number;
  taut?: number;
  /** Something that touched a megalodon's body: it turns to bite it and gives up after `until`. */
  chompAt?: number;
  biteTarget?: {
    shark?: Shark;
    fish?: Fish;
    until: number;
  };
  born?: number;
  until?: number;
  burstUntil?: number;
  nextBurst?: number;
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
  until?: number;
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
  /** Smoothed turn rate (rad/s), so heading changes ease in and out. */
  angVel?: number;
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
  rechallengeAt?: number;
  rechallenger?: "mega" | "kraken";
  nextGrab: number;
  /** Divers it is holding, and when it can seize the next one. */
  caught: Fish[];
  /** A saucer it is striking at or holding, and when it lets go. */
  ufoStrike: number | null;
  ufoHeld: boolean;
  ufoTarget?: Ufo;
  ufoUntil: number;
  /** How hard it is jetting (0 still → 1 fleeing), and the phase of the ripple running down its arms. */
  jet: number;
  wave: number;
  /** Until when it has a whale wrapped (0 when it does not). */
  whaleUntil: number;
  whaleTarget?: Whale;
  /** Sharks have been called in to rescue the megalodon it is crushing. */
  rally: boolean;
  /** Jetting across the tank to clamp onto the megalodon; the fight proper starts when it lands. */
  lunging?: boolean;
  /** A tentacle lashing out at a diver: the grab lands when it arrives. */
  strike: {
    f: Fish;
    at: number;
  } | null;
  nextCatch: number;
  /** Hurt in a fight: flees faster and inks for longer. */
  wounded: boolean;
  /** An arm shot at a megalodon that is getting away, to drag it back; harpoonAt is when it may next try, doom that this drag ends with the kraken winning. */
  harpoon?: {
    target: Shark;
    at: number;
  };
  harpoonAt?: number;
  /** The retreating megalodon the harpoon chance has already been rolled for. */
  harpoonFor?: Shark;
  doom?: boolean;
  /** The megalodon caught it from behind (a pounce or a chase): a short, violent clamp rather than a lunge; fatal if the chase ran it down. */
  ambush?: boolean;
  /** The arms have actually closed round the megalodon (a moment after it lands): only then is it declared wrapped and the tug of war starts. */
  coiled?: boolean;
  /** The megalodon has the kraken's head in its jaws and is whipping it about (a pounce or a run-down), with its arms flailing loose. */
  maul?: boolean;
  /** When the jaws actually closed on the kraken; until then the megalodon is still swimming in. */
  biteAt?: number;
  fatal?: boolean;
  /** Fleeing: whether its ink throws the megalodon off, and whether that has been announced. */
  inkEscape?: boolean;
  inkShown?: boolean;
  /** Until when it is enraged (set by a blast in its arms), and when it was last blown about. */
  rageUntil?: number;
  /** It stays until this time: pushed out while enraged, so it only starts to leave a few seconds after it calms down. */
  calmUntil?: number;
  /** Winner stays to challenge the remaining tank for one minute. */
  victoryUntil?: number;
  /** Which flee (stateAt) the exit heading was picked for, and the heading itself. */
  exitAt?: number;
  exitHeading?: number;
  blastAt?: number;
  /** Divers' sway on the tug of war: negative favours the megalodon, positive the kraken. */
  tilt: number;
  /** Arms blooming out toward sharks, any number at once: each grab lands when its arm arrives, if the shark is still there. */
  /** The facing it has committed to after turning for something outside its arm arc, and until when. */
  faceWant?: number;
  faceUntil?: number;
  sharkStrikes?: {
    sh: Shark;
    at: number;
    dur: number;
  }[];
  /** Where along a whale's body (0 head → 1 tail) the kraken has hold of it. */
  whaleU?: number;
  /** The whale it is swimming across the tank to (it goes to the whale, never the other way round). */
  hunt?: Whale;
  huntAt?: number;
  nextHunt?: number;
  /** Swimming in on the mothership to wrap its hull, until this time; nextHull is when it may try again. */
  hullUntil?: number;
  chargeArmsFirst?: boolean;
  maulRun?: { at: number; heading: number };
  nextHull?: number;
  gripArms?: number;
  nextGripArmAt?: number;
  rageStretchUntil?: number;
  nextRageStretch?: number;
  defenseUntil?: number;
  /** When it was last struck by fire: its hide flashes red for a moment. */
  hitAt?: number;
  nextDefenseAt?: number;
  /** Next time it may snatch a drone while holding a whale. */
  nextSnatchAt?: number;
  hullStrike?: { target: import("./encounters").Mothership; at: number; launched?: boolean; launchedAt?: number; heading?: number; reachAt?: number; evadeChecked?: boolean };
  /** What it does to a whale it has reached: jab at it, or squeeze it. */
  whaleMode?: "poke" | "squeeze";
  whaleStart?: number;
  /** When it landed on the whale it lunged at (its arms only take hold from here), and how long it will hold on. */
  whaleLanded?: number;
  /** 0-1 how far the arms are flared out mid jet stroke while it lunges (undefined when not lunging at a whale). */
  stroke?: number;
  /** The big push it is coasting on while lunging at a whale: when it started and how hard. */
  lastV?: number;
  landAt?: number;
  landV?: number;
  faceMin?: number;
  passTo?: {
    x: number;
    y: number;
  };
  megaSeenAt?: number;
  huffDir?: number;
  huffUntil?: number;
  wanderAt?: number;
  wanderTo?: number;
  pushP?: number;
  pushAt?: number;
  pushV?: number;
  whaleDur?: number;
  nextJab?: number;
  jabAt?: number;
  jabU?: number;
}
export interface Jelly {
  x: number;
  y: number;
  size: number;
  phase: number;
  drift: number;
  hue: number;
  /** Velocity from being knocked about (decays away). */
  vx?: number;
  vy?: number;
  /** Last zap, and who it hit (drawn as a bolt for a moment). */
  chargedUntil?: number;
  empPulseAt?: number;
  zapAt?: number;
  zapTarget?: Fish;
  /** Squash and wobble from being shoved: the spring position and speed, and the direction it was pushed. */
  sq?: number;
  sqv?: number;
  ax?: number;
  ay?: number;
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
  /** Which way it is turning to swing clear of a titan, kept until the danger passes. */
  veer?: 1 | -1;
  /** The body as a chain of joints from the head, with a hard limit on how sharply it bends (so it never folds into a Z). */
  spine?: {
    x: number;
    y: number;
  }[];
  spineAt?: number;
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
export interface CraftAttitude {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bank: number;
  rate: number;
  face: 1 | -1;
}

export interface Ufo {
  emp?: import("./thunderstorm").EmpState;
  /** Hull damage accumulated toward the shared craft hull budget. */
  hits?: number;
  hitAt?: number;
  x: number;
  y: number;
  enterAt?: number;
  /** Hover height. */
  hy: number;
  floatVx?: number;
  floatVy?: number;
  /** Motion-driven attitude, sampled after steering, currents and pointer movement. */
  attitude?: CraftAttitude;
  tx: number;
  state: "enter" | "seek" | "beam" | "leave";
  phase: number;
  beamUntil: number;
  beams: number;
  maxBeams: number;
  beamX: number;
  beamTarget?: Fish | Jelly;
  cargo?: Set<Fish | Jelly>;
  escapeAt?: number;
  giveUpAt?: number;
  beamRestUntil?: number;
  invasionBombAt?: number;
  aim: {
    x: number;
    y: number;
  } | null;
  /** Seconds spent hovering with no clear target. */
  waited: number;
  /** Seconds the beam has had nothing in it. */
  idle?: number;
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
  /** When it next fires a laser or drops a bomb. */
  nextShot?: number;
  /** Bomber divers beamed aboard, each dropped later as a green bomb. */
  ammo?: number;
}
export type SagaKind = "moon" | "clash" | "meteor" | "maelstrom" | "bloom" | "migration";
/** An announced event: it runs by itself, with a banner and a bar that report how it is going. */
export interface Saga {
  vortices?: Whirl[];
  migrants?: Fish[];
  bloomSeen?: Set<Fish>;
  nextEventAt?: number;
  kind: SagaKind;
  title: string;
  rgb: string;
  born: number;
  until: number;
  /** What the bar counts: strikes, fish across, treasure hauled out, divers still safe. */
  count: number;
  lost: number;
  total: number;
  peak: number;
}
export interface Whirl {
  spin?: number;
  suction?: number;
  baseR?: number;
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
/** Chance the kraken swallows a shark it has held long enough, once per visit; otherwise the shark gets away. */
export const KRAKEN_EAT_CHANCE = 0.2;
/** Seconds a tentacle takes to reach its target (the renderer extends the arm over the same time). */
export const STRIKE_TIME = 0.9;
/** How far round from straight behind its head the kraken can reach: 270 degrees in all. Past this it has to turn to face. */
export const KRAKEN_ARC = 2.35;
/** Shared hull budget for ordinary submarines and UFOs. */
export const CRAFT_HULL_HP = 8;
export const UFO_HITS_TO_BREAK = CRAFT_HULL_HP;
/** Hammerheads and sawsharks hit submarines and saucers this much harder than an ordinary shark. */
export const CRAFT_WEAKNESS = 1.5;
