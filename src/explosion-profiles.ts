export type ExplosionKind = "torpedo" | "bomber" | "sub" | "ufo" | "drone" | "meteor" | "nuke" | "mothership";
export interface ExplosionProfile { radius:number; damage:number; impulse:number; duration:number; glow:number }
/** Event severity is explicit. Random sparks never secretly alter combat damage. */
export const EXPLOSIONS: Record<ExplosionKind,ExplosionProfile> = {
  torpedo:{radius:65,damage:4,impulse:65,duration:.7,glow:10},
  bomber:{radius:300,damage:4,impulse:180,duration:1.4,glow:22},
  sub:{radius:190,damage:4,impulse:180,duration:1.4,glow:18},
  ufo:{radius:190,damage:4,impulse:180,duration:1.4,glow:20},
  drone:{radius:140,damage:3,impulse:150,duration:1.2,glow:18},
  meteor:{radius:300,damage:4,impulse:220,duration:1.4,glow:26},
  nuke:{radius:640,damage:0,impulse:520,duration:2.4,glow:44},
  mothership:{radius:650,damage:4,impulse:260,duration:1.5,glow:36},
};
export function blastFalloff(distance:number,radius:number){return Math.max(0,1-Math.max(0,distance)/Math.max(1,radius));}
export function blastMass(actor:object){return "maxHp" in actor?5:"hull" in actor?("crew" in actor&&(actor as {crew?:unknown}).crew?2:1.5):"stunned" in actor?1.2:1;}
