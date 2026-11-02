import type { Shark } from "./types";
import { angleDiff, clamp } from "./math";

export const sharkSwimWave=(u:number,phase:number)=>(.2+.8*Math.pow(u,1.6))*Math.sin(phase-u*6.6);
export const megaSwimRate=(speed:number)=>1.3+Math.min(200,speed)/140;
const strokes = new WeakMap<Shark, { age: number; side: number }>();
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Only the back half to the tail takes part in a stroke: the head and front half stay rigid and keep their aim. */
export const megaStrokeMask = (u: number) => smooth(.45, 1, u);
/** The tail strike is a weapon: it coils, snaps through (the contact window) and settles. */
export const MEGA_STRIKE_COIL = .65, MEGA_STRIKE_SNAP = .3;
export function megaStrokeAge(sh: Shark) { return strokes.get(sh)?.age; }
export function megaStrokeActive(sh: Shark) { return strokes.has(sh); }
/** A heavy stroke first coils against its release direction, then snaps through and settles. */
export function megaWhipEnvelope(age: number, u: number) {
  const t = age - u * .12;
  if (t < 0 || t > 1.65) return 0;
  if (t < .65) return -.7 * smooth(0, .65, t);
  if (t < .9) return -.7 + 1.8 * smooth(.65, .9, t);
  return 1.1 * (1 - smooth(.9, 1.65, t));
}
export function beginMegaWhip(sh: Shark, side = 1) {
  if (!strokes.has(sh)) strokes.set(sh, { age: 0, side });
}
/** Every shark follows its previous path; turns propagate down the body. */
export function stepSharkSpine(sh:Shark,dt=1/60){
  const nodes=sh.nodes,count=nodes.length/2,segment=sh.length/(count-1);
  let previous=sh.heading+Math.PI;
  for(let i=1;i<count;i++){
    const x=nodes[(i-1)*2],y=nodes[(i-1)*2+1];
    let wanted=Math.atan2(nodes[i*2+1]-y,nodes[i*2]-x);
    if(sh.mega){
      const forward=sh.heading+Math.PI;
      const settle=(1-Math.exp(-dt*.35))*(1-clamp(Math.abs(sh.turn)/.15,0,1));
      wanted+=angleDiff(wanted,forward)*settle;
      wanted=forward+clamp(angleDiff(forward,wanted),-1.05,1.05);
    }
    const limit=sh.mega ? .035+.035*i/count : .16;
    const angle=previous+clamp(angleDiff(previous,wanted),-limit,limit);
    nodes[i*2]=x+Math.cos(angle)*segment;nodes[i*2+1]=y+Math.sin(angle)*segment;previous=angle;
  }
}
/** Normal swimming is exactly the base shark wave, including gentle head sway. */
export function sharkSwimOffset(sh:Shark,u:number){
  const speed=sh.mega?sh.speed*250/Math.max(250,sh.length):sh.speed;
  const swim=sh.length*.05*clamp(speed/60,.4,1.4)*(sh.tailAmp??1)*sharkSwimWave(u,sh.phase);
  if(!sh.mega)return swim;
  const stroke=strokes.get(sh),whip=stroke?sh.length*.16*Math.pow(u,1.5)*megaStrokeMask(u)*megaWhipEnvelope(stroke.age,u)*stroke.side:0;
  const shake=sh.shake?sh.length*.025*sh.shake.amp*Math.sin(sh.shake.phase)*(1-u)**2:0;
  return swim+whip+shake;
}
export function sharkSpinePoint(sh:Shark,i:number){
  const n=sh.nodes,count=n.length/2,a=Math.max(0,i-1),b=Math.min(count-1,i+1);
  const dx=n[a*2]-n[b*2],dy=n[a*2+1]-n[b*2+1],d=Math.hypot(dx,dy)||1,off=sharkSwimOffset(sh,i/(count-1));
  return {x:n[i*2]-dy/d*off,y:n[i*2+1]+dx/d*off};
}
export function stepMegaSpine(sh:Shark,dt:number){
  const stroke=strokes.get(sh);if(stroke){stroke.age+=dt;if(stroke.age>1.8)strokes.delete(sh);}
  if(sh.shake)sh.shake.phase+=dt*Math.PI*5;
  stepSharkSpine(sh,dt);
}

/** Body and fin share the same physical tail stalk; there is no second fin oscillator. */
export function megaTailFrame(sh: Shark, sp?: ArrayLike<number>) {
  if(!sp){const visible=new Float32Array(sh.nodes.length);for(let i=0;i<sh.nodes.length/2;i++){const p=sharkSpinePoint(sh,i);visible[i*2]=p.x;visible[i*2+1]=p.y;}sp=visible;}
  const n=sp.length/2, f=.9*(n-1), i=Math.floor(f), u=f-i;
  const bx=sp[i*2]*(1-u)+sp[i*2+2]*u, by=sp[i*2+1]*(1-u)+sp[i*2+3]*u;
  const a=Math.atan2(sp[(n-1)*2+1]-sp[(n-4)*2+1],sp[(n-1)*2]-sp[(n-4)*2]);
  return {bx,by,c:Math.cos(a),s:Math.sin(a),flex:0};
}
