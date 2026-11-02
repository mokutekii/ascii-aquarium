import type { Kraken } from "./types";
import { clamp } from "./math";

export function krakenFightProgress(kraken: Kraken | null, time: number) {
  if (!kraken || kraken.state !== "wrap" || kraken.lunging || !kraken.coiled) return 0;
  const started = kraken.maul ? kraken.biteAt : kraken.stateAt;
  return started === undefined ? 0 : clamp((time - started) / Math.max(1, kraken.wrapFor), 0, 1);
}

/** Positive is Kraken, negative Megalodon: control and live tilt, never health or an end-time. */
export function krakenFightAdvantage(kraken: Kraken | null, time: number): number | null {
  if (!kraken || kraken.state !== "wrap" || kraken.lunging || !kraken.coiled || kraken.maul && kraken.biteAt === undefined) return null;
  const control = (kraken.winner === "kraken" ? 1 : -1) * (.15 + .45 * krakenFightProgress(kraken, time));
  return clamp(control + kraken.tilt * .65, -.95, .95);
}
