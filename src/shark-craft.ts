import type { World, Shark, Ufo } from "./world";
import type { Sub } from "./deep";
import { isCraftHeld } from "./handling";
import { rand } from "./math";
type Target=Ufo|Sub;
const plans=new WeakMap<Shark,{target?:Target;until:number;next:number}>();
export function sharkCraftTarget(w:World,sh:Shark):Target|undefined {
  if(sh.mega||sh.grabbed||sh.lifted||sh.leaving||!["hammerhead","greathammer","sawshark"].includes(sh.kind))return;
  let plan=plans.get(sh);
  if(plan?.target&&w.time<plan.until&&(w.ufos.includes(plan.target as Ufo)||w.subs.includes(plan.target as Sub)))return plan.target;
  if(plan&&w.time<plan.next)return;
  plan={until:0,next:w.time+rand(6,10)};plans.set(sh,plan);
  if(Math.random()>.35)return;
  const choices=[...w.ufos.filter(u=>!u.held&&u.state!=="enter"&&u.state!=="leave"),...w.subs.filter(s=>!s.seizedByKraken&&!s.arrival&&!s.leaving)]
    .filter(t=>!isCraftHeld(w,t)&&Math.hypot(t.x-sh.nodes[0],t.y-sh.nodes[1])<sh.length*2.2);
  choices.sort((a,b)=>Math.hypot(a.x-sh.nodes[0],a.y-sh.nodes[1])-Math.hypot(b.x-sh.nodes[0],b.y-sh.nodes[1]));
  if(!choices.length)return;
  plan.target=choices[0];plan.until=w.time+3;sh.alertUntil=w.time+2;
  return plan.target;
}
export function strikeCraft(w:World,sh:Shark) {
  sh.strikeAt=w.time;plans.set(sh,{until:0,next:w.time+6});
}
export function sharkWeapon(sh:Shark) {
  const x=sh.nodes[0],y=sh.nodes[1],a=Math.atan2(y-sh.nodes[3],x-sh.nodes[2]);
  if(sh.kind==="sawshark")return [0,.075,.15].map(u=>({x:x+Math.cos(a)*sh.length*u,y:y+Math.sin(a)*sh.length*u,r:sh.length*.03+5}));
  if(sh.kind==="hammerhead"||sh.kind==="greathammer")return [-1,0,1].map(u=>({x:x-Math.sin(a)*sh.length*.115*u,y:y+Math.cos(a)*sh.length*.115*u,r:sh.length*.04+5}));
  return [{x,y,r:sh.length*.055+8}];
}
export function clearSharkStrikeOffset(sh:Shark) {
  if(!sh.strikeOffset)return;
  for(let i=0;i<4;i++){const w=(1-i/4)**2;sh.nodes[i*2]-=sh.strikeOffset.x*w;sh.nodes[i*2+1]-=sh.strikeOffset.y*w;}
  sh.strikeOffset=undefined;
}
export function animateSharkStrike(sh:Shark,time:number) {
  const age=time-(sh.strikeAt??-Infinity);if(age<0||age>.85)return;
  const env=Math.sin(Math.PI*age/.85),saw=sh.kind==="sawshark";
  const forward=saw?Math.sin(age*32)*sh.length*.035*env:0;
  const across=saw?Math.sin(age*16)*sh.length*.008*env:Math.sin(age*9)*sh.length*.065*env;
  const x=Math.cos(sh.heading)*forward-Math.sin(sh.heading)*across,y=Math.sin(sh.heading)*forward+Math.cos(sh.heading)*across;
  for(let i=0;i<4;i++){const w=(1-i/4)**2;sh.nodes[i*2]+=x*w;sh.nodes[i*2+1]+=y*w;}
  sh.strikeOffset={x,y};
}
