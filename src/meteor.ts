export interface MeteorStyle {
  seed: number;
  aspect: number;
  fronts: number;
  rate: number;
  roughness: number;
}
/** Sampled once per impact. Drawing and pressure use the same angular footprint. */
export function meteorRadius(style: MeteorStyle, angle: number) {
  return 1 + style.roughness * (Math.sin(angle * 3 + style.seed) * .6 + Math.sin(angle * 7 - style.seed * .7) * .4);
}
