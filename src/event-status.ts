import type { Kraken, Saga } from "./types";
import { clamp } from "./math";
import { krakenFightAdvantage } from "./fight-progress";

export type EventStatus =
  | { kind: "timer"; progress: number; counter: string }
  | { kind: "count"; progress: number; counter: string }
  | { kind: "health"; progress: number; counter: string }
  | { kind: "advantage"; progress: number; counter: string; left: string; right: string }
  | { kind: "phase"; progress: number; counter: string };

/** Timers describe the actual sampled deadline, not the number of random spawns. */
export function timerStatus(born: number, until: number, time: number): EventStatus {
  return { kind: "timer", progress: clamp((until - time) / Math.max(.001, until - born), 0, 1), counter: `${Math.max(0, Math.ceil(until - time))}s` };
}
export function countStatus(done: number, total: number, label = ""): EventStatus {
  return { kind: "count", progress: clamp(done / Math.max(1, total), 0, 1), counter: `${done} of ${total}${label ? ` ${label}` : ""}` };
}
export function healthStatus(hp: number, maxHp: number): EventStatus {
  return { kind: "health", progress: clamp(hp / Math.max(1, maxHp), 0, 1), counter: `${Math.max(0, Math.ceil(hp))}/${maxHp} HP` };
}
export function sagaStatus(saga: Saga, time: number, kraken: Kraken | null): EventStatus {
  if (saga.kind === "migration") return countStatus(saga.count, saga.total, "crossed");
  if (saga.kind !== "clash") return timerStatus(saga.born, saga.until, time);
  const advantage = krakenFightAdvantage(kraken, time);
  if (advantage !== null) return { kind: "advantage", progress: (advantage + 1) / 2, counter: "ADVANTAGE", left: "MEGALODON", right: "KRAKEN" };
  const counter = !kraken ? "closing in" : kraken.state === "flee" ? (kraken.rechallengeAt !== undefined ? "re-engaging" : "retreating") : kraken.lunging || kraken.maul && kraken.biteAt === undefined ? "closing in" : "re-engaging";
  return { kind: "phase", progress: .5, counter };
}

/** Stable command keys group varying quips; suppressed repeats still contribute to the next count. */
export class FeedbackGate {
  private groups = new Map<string, { at: number; count: number }>();
  take(key: string, now: number, interval = 3000) {
    const old = this.groups.get(key);
    const count = (old && now - old.at < 20000 ? old.count : 0) + 1;
    if (old && now - old.at < interval) { old.count = count; return null; }
    this.groups.set(key, { at: now, count });
    // A long session must not retain every arbitrary notice forever.
    if (this.groups.size > 256) for (const [k, value] of this.groups) if (now - value.at > 60000) this.groups.delete(k);
    return count;
  }
}
