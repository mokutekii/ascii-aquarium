import type { SharkKind } from "./types";

/**
 * What makes each species behave differently. All are multipliers on the classic shark (1 everywhere), so the
 * numbers read as "how much more or less than a plain shark".
 */
export interface SharkTraits {
  /** Cruise speed. */
  speed: number;
  /** How hard it sprints once it commits to a strike. */
  burst: number;
  /** Turning circle: higher is nimbler. */
  turn: number;
  /** How long a sprint lasts (a mako is spent in a few seconds, a nurse barely tires). */
  stamina: number;
  /** Tail-beat rate. */
  tail: number;
  /** Stalks (creeps up slowly) before it strikes, 0 to 1; low means it just charges. */
  stalk: number;
  /** Interest in divers: scales how far away it notices one. */
  diver: number;
  /** How wide a berth it gives the titans. */
  fear: number;
  /** Drifts in to the edge of a titan fight to pick at the scraps. */
  scavenger: number;
}

const classic: SharkTraits = { speed: 1, burst: 1, turn: 1, stamina: 1, tail: 1, stalk: 0.5, diver: 1, fear: 1, scavenger: 0 };

export const TRAITS: Record<SharkKind, SharkTraits> = {
  classic,
  // Cruises low and slow, then explodes: a sprinter that tires fast and spooks easily.
  mako: { ...classic, speed: 1.15, burst: 1.5, turn: 1.3, stamina: 0.5, tail: 1.25, stalk: 0.2, fear: 1.15 },
  // The diver specialists: they head for people before fish, and turn on a coin.
  hammerhead: { ...classic, speed: 0.95, turn: 1.2, stamina: 1.2, stalk: 0.7, diver: 1.6 },
  greathammer: { ...classic, speed: 0.9, burst: 1.1, turn: 0.85, stamina: 1.5, tail: 0.85, stalk: 0.8, diver: 1.8, fear: 0.8 },
  // Whips in fast and short: little endurance.
  thresher: { ...classic, burst: 1.25, turn: 1.1, stamina: 0.7, tail: 1.1, stalk: 0.6 },
  // The scavengers: slow, patient, bold around the titans, and not much interested in divers.
  tiger: { ...classic, speed: 0.95, stamina: 1.3, stalk: 0.6, diver: 0.8, fear: 0.7, scavenger: 1 },
  nurse: { ...classic, speed: 0.65, burst: 0.8, turn: 0.8, stamina: 2, tail: 0.7, stalk: 0.9, diver: 0.45, fear: 0.6, scavenger: 1 },
  zebra: { ...classic, speed: 0.8, burst: 0.9, stamina: 1.2, tail: 0.8, stalk: 0.4, diver: 0.7, fear: 0.9 },
  // The silent stalker: drifts slowly, creeps right up on divers it picks out, then lunges in one hard burst.
  ghost: { ...classic, speed: 0.7, burst: 1.9, turn: 1.1, stamina: 0.8, tail: 0.6, stalk: 1, diver: 1.7, fear: 0.4 },
  sawshark: { ...classic, speed: 0.95, burst: 1.15, turn: 1.1, stamina: 0.9, stalk: 0.5 },
};

/** A shark's current frame of mind, which drives its pace, posture and tail. */
export type SharkMood = "cruise" | "stalk" | "strike" | "winded" | "feed" | "frenzy" | "wary";
