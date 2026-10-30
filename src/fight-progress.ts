import type { Kraken } from "./types";
import { clamp } from "./math";

export function krakenFightProgress(kraken: Kraken | null, time: number) {
  if (!kraken || kraken.state !== "wrap" || kraken.lunging || !kraken.coiled) return 0;
  const started = kraken.maul ? kraken.biteAt : kraken.stateAt;
  return started === undefined ? 0 : clamp((time - started) / Math.max(1, kraken.wrapFor), 0, 1);
}
