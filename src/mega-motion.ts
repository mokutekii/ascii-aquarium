import type { World, Shark } from "./world";
import { angleDiff, clamp } from "./math";
import { bodyPoints, segmentHit } from "./collision-bodies";
import { actorAlive, actorPosition } from "./provocation";

export type MegaPhase = "cruise" | "intercept" | "attack" | "recover" | "chase" | "escape" | "attached";
interface Motion { phase: MegaPhase; heading: number; until: number }
const motions = new WeakMap<Shark, Motion>();
export const megaMotion = (sh: Shark) => motions.get(sh);
export function loseMegaTrail(sh:Shark,time:number){
  motions.set(sh,{phase:"recover",heading:sh.heading,until:time+7});
  sh.chaseUntil=0;sh.hunt=undefined;sh.huntPickAt=time+7;sh.edgeCourse=undefined;
}
export function recoverMega(sh: Shark, time: number) {
  motions.set(sh, {phase:"recover",heading:sh.heading,until:time+1.25});
  sh.huntPickAt=time+1.25;
}
type Point = {x:number;y:number};
export function megaIntent(w:World, sh:Shark, hunt:Point|null, hull:Point|null, whale:Point|null):Point|null {
  const previous=motions.get(sh), k=w.kraken;
  let phase:MegaPhase="cruise", target:Point|null=null;
  if((k?.state === "wrap" && k.wrapping === sh && !k.lunging && (!k.maul || k.biteAt !== undefined))||sh.hullClamp||w.whaleFight?.locked&&w.whaleFight.mega===sh) phase="attached";
  else if(sh.retreat||sh.leaving||(sh.blastFlee?.until??0)>w.time) phase="escape";
  else if(previous?.phase==="recover"&&w.time<previous.until){return {x:sh.nodes[0]+Math.cos(previous.heading)*sh.length,y:sh.nodes[1]+Math.sin(previous.heading)*sh.length};}
  else if(k&&(k.state!=="flee"||w.time<(sh.chaseUntil??0))&&(sh.victoryUntil??0)<=w.time){
    phase=k.state==="flee" || (k.maul && k.biteAt === undefined) ? "chase" : "intercept";
    const dx = k.x - sh.nodes[0], dy = k.y - sh.nodes[1];
    const distance = Math.hypot(dx, dy);
    const behind = Math.cos(Math.atan2(dy, dx) - sh.heading) < -.25;
    if (behind && distance < sh.length * .6 && previous?.phase !== "recover") {
      recoverMega(sh, w.time);
      return { x: sh.nodes[0] + Math.cos(sh.heading) * sh.length, y: sh.nodes[1] + Math.sin(sh.heading) * sh.length };
    }
    // Lead the swimming animal at its real forward speed, including during a
    // pounce. Repeatedly aiming at its current eye causes mutual pursuit loops.
    const speed = k.swimSpeed ?? 0;
    const vx = Math.cos(k.heading) * speed, vy = Math.sin(k.heading) * speed;
    const closing = Math.max(45, (phase === "chase" ? 185 : 165) - (vx * dx + vy * dy) / Math.max(1, distance));
    const lead = clamp(distance / closing, 0, 2);
    target = { x: k.x + vx * lead, y: k.y + vy * lead };
  } else if(hunt){
    phase=sh.hunt?.phase==="clamp"?"attached":"attack";
    if(phase==="attached"){
      const heading=previous?.phase==="attached"?previous.heading:sh.heading;
      target={x:sh.nodes[0]+Math.cos(heading)*sh.length,y:sh.nodes[1]+Math.sin(heading)*sh.length};
      motions.set(sh,{phase,heading,until:w.time});return target;
    }
    target=hunt;
  }
  else {const ag=w.provocations.get(sh);target=ag&&ag.until>w.time&&actorAlive(w,ag.target)?actorPosition(ag.target):hull??whale;phase=target?"intercept":"cruise";}
  motions.set(sh,{phase,heading:sh.heading,until:w.time});
  return target;
}

/** One acceleration policy, shared by cruising, attacks and fleeing. */
export function stepMegaSpeed(w:World,sh:Shark,desired:number,dt:number,attachedSpeed:number,fleeing:boolean) {
  const phase=megaMotion(sh)?.phase??"cruise", aggression=clamp(w.titanAggression(sh),0,1);
  const error=Math.abs(angleDiff(sh.heading,desired)), alignment=Math.max(0,Math.cos(error));
  let wanted=phase==="attached"?attachedSpeed:phase==="escape"?(sh.leaveCalm?60:175):phase==="recover"?70:phase==="cruise"?60:phase==="chase"?185:phase==="attack"?175+15*aggression:165;
  if(phase!=="escape"&&phase!=="attached") wanted*=.35+.65*alignment;
  if(phase!=="escape"&&phase!=="attached"){
    const hx=sh.nodes[0],hy=sh.nodes[1],fx=Math.cos(sh.heading),fy=Math.sin(sh.heading);
    // Plan speed from available water and braking distance, not a fixed boost
    // just because a target happens to be nearby.
    let room=Infinity;const buffer=Math.min(sh.length*.5,Math.min(w.width,w.height)*.45);
    if(fx<-.01)room=Math.min(room,Math.max(0,hx+buffer)/-fx);
    if(fx>.01)room=Math.min(room,Math.max(0,w.width+buffer-hx)/fx);
    if(fy<-.01)room=Math.min(room,Math.max(0,hy+buffer)/-fy);
    if(fy>.01)room=Math.min(room,Math.max(0,w.height+buffer-hy)/fy);
    const clearance=Math.max(40,room-Math.min(sh.length*.16,Math.min(w.width,w.height)*.12));
    wanted=Math.min(wanted,Math.sqrt(2*65*clearance));
    // At speed, a broad body needs more water to turn. Brake while lining up.
    const turnRadius=Math.max(sh.length*.3,sh.speed/.65);
    if(error>.45)wanted=Math.min(wanted,Math.max(65,clearance/Math.max(.5,error)*.65));
    const obstacleTargets=[...w.whales,...(w.leviathan?[w.leviathan]:[])].filter(o=>w.whaleFight?.whale!==o);
    const reach=Math.min(turnRadius+sh.speed,sh.length*.8);
    for(const actor of obstacleTargets){
      const hit=segmentHit(hx,hy,hx+fx*reach,hy+fy*reach,bodyPoints(w,actor));
      if(Number.isFinite(hit))wanted=Math.min(wanted,Math.sqrt(2*65*Math.max(35,hit*reach)));
    }
  }
  if(phase!=="escape"&&phase!=="attached")wanted*=clamp(Math.min(w.width,w.height)/(sh.length*.9),.65,1);
  if(sh.edgeCourse) wanted=Math.min(wanted,125);
  if(fleeing)wanted=175;
  const accel=phase==="attack"?24+4*aggression:phase==="escape"||phase==="chase"?25:phase==="cruise"?10:20;
  sh.speed+=clamp((wanted-sh.speed)*1.2,-(sh.edgeCourse?95:65),accel)*dt;
}
