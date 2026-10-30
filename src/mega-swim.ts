import type { Shark } from "./types";
import { angleDiff, clamp } from "./math";
/** The physical spine follows its course and carries the stroke, just like the smaller sharks. */
export function stepMegaSpine(sh: Shark, dt: number) {
  if (sh.impactAt !== undefined) sh.impactAge = (sh.impactAge ?? 0) + dt;
  const nodes=sh.nodes, count=nodes.length/2, segment=sh.length/(count-1);
  let guide=sh.swimSpine;
  if (!guide || guide.length!==nodes.length) { guide=new Float32Array(nodes);sh.swimSpine=guide; }
  const dx=nodes[0]-guide[0],dy=nodes[1]-guide[1];
  if(Math.hypot(dx,dy)>sh.length*.3) for(let i=0;i<guide.length;i+=2){guide[i]+=dx;guide[i+1]+=dy;}
  guide[0]=nodes[0];guide[1]=nodes[1];
  let angle=sh.heading+Math.PI;
  for(let i=1;i<count;i++){
    const u=i/(count-1),x=guide[(i-1)*2],y=guide[(i-1)*2+1];
    const follow=Math.atan2(guide[i*2+1]-y,guide[i*2]-x);
    angle+=clamp(angleDiff(angle,follow),-.055*(.6+.4*u),.055*(.6+.4*u));
    guide[i*2]=x+Math.cos(angle)*segment;guide[i*2+1]=y+Math.sin(angle)*segment;
  }
  const energy=clamp(.65+sh.speed/150+(sh.rageLevel??0)*.4+(sh.thrash??0)*.5,.65,1.8);
  sh.swimEnergy=(sh.swimEnergy??.65)+(energy-(sh.swimEnergy??.65))*(1-Math.exp(-dt*2));
  angle=sh.heading+Math.PI;
  for(let i=1;i<count;i++){
    const u=i/(count-1),a=Math.max(0,i-1),b=Math.min(count-1,i+1);
    const tangent=Math.atan2(guide[b*2+1]-guide[a*2+1],guide[b*2]-guide[a*2]);
    const age = (sh.impactAt === undefined ? Infinity : (sh.impactAge ?? 0));
    const lag = age - u * .45;
    const whip = lag >= 0 && lag < 1.5 ? Math.sin(lag * 7) * Math.exp(-lag * 2.2) * (sh.impactSide ?? 1) : 0;
    const wave=sh.length * .11 * Math.pow(u, 1.1) * whip + sh.length*.043*(.08*u+.92*Math.pow(u,1.45))*sh.swimEnergy*Math.sin(sh.phase-u*6.2);
    const tx=guide[i*2]-Math.sin(tangent)*wave,ty=guide[i*2+1]+Math.cos(tangent)*wave;
    const target=Math.atan2(ty-nodes[(i-1)*2+1],tx-nodes[(i-1)*2]);
    const limit=.065+.055*u;
    angle+=clamp(angleDiff(angle,target),-limit,limit);
    nodes[i*2]=nodes[(i-1)*2]+Math.cos(angle)*segment;
    nodes[i*2+1]=nodes[(i-1)*2+1]+Math.sin(angle)*segment;
  }
}
