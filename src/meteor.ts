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

/** Effective distance inside the same irregular ellipse drawn for a meteor pressure front. */
export function meteorDistance(style: MeteorStyle, dx: number, dy: number, bodyRadius = 0) {
 const angle=Math.atan2(dy/style.aspect,dx);
 return (Math.hypot(dx,dy/style.aspect)-bodyRadius/Math.min(1,style.aspect))/meteorRadius(style,angle);
}
