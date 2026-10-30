import { detonateDrone } from "./drones";
import type { World, Ufo, Jelly, Fish } from './world';
import type { Sub } from './deep';
import type { AttackDrone, Mothership } from './encounters';
import { rand, randInt, clamp } from './math';
import { UFO_HITS_TO_BREAK } from './types';
import { interruptTractor } from './tractor';
import { kickCraft, cancelCraftMotion, isCraftDriven } from './handling';
export interface EmpState { until: number; sink: number; rise: number; homeY: number; drift: number }
export interface Thunderstorm { born: number; until: number; next: number }
export interface LightningBolt { born: number; duration: number; conduit: boolean; points: {x:number;y:number}[]; branches: {x:number;y:number}[][] }
type Target = Ufo | Sub | Mothership | AttackDrone | Jelly | Fish;
export interface LightningChain { target: Target; from: {x:number;y:number}; at: number; seen: Set<object>; left: number }
const craft = (p: Target): p is Ufo | Sub | Mothership | AttackDrone => 'maxBeams' in p || 'hull' in p || 'maxHp' in p || 'stunned' in p;
const live = (w: World, p: Target) => 'maxBeams' in p ? w.ufos.includes(p) : 'hull' in p ? w.subs.includes(p) : 'maxHp' in p ? w.mothership === p && p.hp > 0 && p.phase === 'battle' : 'stunned' in p ? w.attackDrones.includes(p) && p.hp>0 : 'alive' in p ? p.alive : w.jellies.includes(p);
function conductors(w: World): Target[] { return [...w.attackDrones.filter(d=>d.hp>0&&!d.detonated),...w.ufos.filter(u=>!u.held && u.state!=='enter' && u.state!=='leave'), ...w.subs.filter(s=>!s.seizedByKraken&&!s.leaving), ...(w.mothership?.phase==='battle'?[w.mothership]:[]), ...w.jellies]; }
export function startThunderstorm(w: World) {
 if(w.thunderstorms.length)return;
 w.thunderstorms.push({born:w.time,until:w.time+rand(35,60),next:w.time+rand(1,2.5)});
 w.notices.push('thunder rolls over the sea... the sky is looking for a conductor.');
}
/** Light and thunder frighten small wildlife; only the two aggressive titans briefly bristle. */
function reactToLightning(w: World, from: {x:number;y:number}, to: {x:number;y:number}) {
 const dx=to.x-from.x,dy=to.y-from.y,len2=dx*dx+dy*dy||1;
 const nearest=(x:number,y:number)=>{const u=clamp(((x-from.x)*dx+(y-from.y)*dy)/len2,0,1);return {x:from.x+dx*u,y:from.y+dy*u};};
 for(const sh of w.sharks){
  const p=nearest(sh.nodes[0],sh.nodes[1]);
  if(Math.hypot(sh.nodes[0]-p.x,sh.nodes[1]-p.y)>220+Math.min(180,sh.length*.15))continue;
  if(sh.mega){sh.rageUntil=Math.max(sh.rageUntil??0,w.time+3);sh.hitAt=w.time;}
  else{sh.blastFlee={x:p.x,y:p.y,until:w.time+3};sh.target=null;sh.alertUntil=w.time+3;}
 }
 for(const wh of w.whales){
  const body=[0,.4,.8].map(u=>w.whalePoint(wh,u));
  const near=body.find(b=>{const p=nearest(b.x,b.y);return Math.hypot(b.x-p.x,b.y-p.y)<260;});
  if(!near)continue;
  const p=nearest(near.x,near.y);wh.fleeing=true;wh.fleeHeading=Math.atan2(near.y-p.y,near.x-p.x);
 }
 const k=w.kraken;
 if(k){const p=nearest(k.x,k.y);if(Math.hypot(k.x-p.x,k.y-p.y)<220+k.size*.2){k.rageUntil=Math.max(k.rageUntil??0,w.time+3);k.hitAt=w.time;}}
 // Ghost Leviathan deliberately receives no target, recoil or agitation.
}
type Point = { x: number; y: number };
export const LIGHTNING_ATTRACTION = .3;
/** Start in open water; attraction can bend only a nearby strike toward a conductor. */
export function sampleLightningStrike(w: World): { point: Point; target?: Target } {
 const point={x:rand(w.width*.03,w.width*.97),y:rand(w.height*.08,w.height*.95)};
 const choices=conductors(w).map(target=>({target,d:Math.hypot(target.x-point.x,target.y-point.y)})).sort((a,b)=>a.d-b.d);
 const jelly=choices.find(c=>w.jellies.includes(c.target as Jelly)&&c.d<420);
 if(jelly && Math.random()<.48)return {point:{x:jelly.target.x,y:jelly.target.y},target:jelly.target};
 const nearest=choices[0];
 if(nearest && (nearest.d<32 || (nearest.d<280 && Math.random()<LIGHTNING_ATTRACTION*(1-nearest.d/280))))
   return {point:{x:nearest.target.x,y:nearest.target.y},target:nearest.target};
 return {point};
}
/** Midpoint displacement creates large kinks plus smaller serrations at several scales. */
function jagged(from: Point, to: Point, depth=5): Point[] {
 const dx=to.x-from.x,dy=to.y-from.y,d=Math.hypot(dx,dy)||1;
 if(depth===0||d<14)return [{...from},{...to}];
 const off=rand(-1,1)*Math.min(125,d*.26);
 const middle={x:(from.x+to.x)/2-dy/d*off,y:(from.y+to.y)/2+dx/d*off};
 const first=jagged(from,middle,depth-1),second=jagged(middle,to,depth-1);
 return [...first.slice(0,-1),...second];
}
function bolt(w: World, from:Point, to:Point, conduit=false) {
 reactToLightning(w,from,to);
 const points=jagged(from,to,6),branches:Point[][]=[];
 const length=Math.hypot(to.x-from.x,to.y-from.y),direction=Math.atan2(to.y-from.y,to.x-from.x);
 for(const fraction of [.23,.43,.64,.79]){
   const root=points[Math.floor((points.length-1)*fraction)];
   const side=Math.random()<.5?-1:1,angle=direction+side*rand(.5,1.15),reach=length*rand(.12,.32);
   const tip={x:root.x+Math.cos(angle)*reach,y:root.y+Math.sin(angle)*reach};
   const branch=jagged(root,tip,4);branches.push(branch);
   if(length>300){const split=branch[Math.floor(branch.length*.55)],a=angle-side*.6;
     branches.push(jagged(split,{x:split.x+Math.cos(a)*reach*.4,y:split.y+Math.sin(a)*reach*.4},3));}
 }
 w.lightningBolts.push({born:w.time,duration:rand(.18,1.25),conduit,points,branches});
}
export function fryAt(w: World, x:number,y:number,radius=85, cause: "lightning" | "jelly" = "lightning") {
 let fish=0;
 for(const f of w.fish){
  if(!f.alive||f.eoeBound||Math.hypot(f.x-x,f.y-y)>radius)continue;
  if(f.diver){
   f.alienArmor=false;f.shieldUntil=0;
   const scrap=w.mess.length;
   w.popDiver(f,'blast',false);
   w.mess.splice(scrap);
   w.lightningBones.push({x:f.x,y:f.y,born:w.time,angle:rand(-.4,.4)});
   w.diverQuip(cause);
   w.callout(f.x,f.y-30,'EXTRA CRISPY','170,230,255');
  }else{f.alive=false;f.respawnAt=w.time+rand(7,13);fish++;}
 }
 if(fish>=5)w.notices.push('a whole school got flash-fried... no batter required.');
}
/** A strike only follows conductive bodies; sharks are never targets. */
export function strikeLightning(w:World,target?:Target) {
 if(!target){
  const strike=sampleLightningStrike(w);target=strike.target;
  if(!target){const from={x:clamp(strike.point.x+rand(-w.width*.22,w.width*.22),0,w.width),y:-40};bolt(w,from,strike.point);fryAt(w,strike.point.x,strike.point.y,140);return;}
 }
 const boss=w.mothership;
 if(boss?.phase==='battle' && !boss.emp && w.time >= (boss.lightningEvadeAt ?? 0) && Math.hypot(target.x-boss.x,target.y-boss.y)<boss.size+700){
  boss.lightningEvadeAt=w.time+3;
  const direction=target.x>boss.x?-1:1;
  boss.cruise={x:clamp(boss.x+direction*500,100,w.width-100),y:clamp(boss.y+180,80,w.height*.7),until:w.time+5};
  kickCraft(w,boss,direction*130,70);
  w.callout(boss.x,boss.y-boss.size*.3,'ION SURGE - EVADING','150,230,255');
 }
 w.lightningChains.push({target,from:{x:target.x+rand(-90,90),y:-40},at:w.time+.3,seen:new Set(),left:w.jellies.includes(target as Jelly)&&w.jellies.filter(j=>Math.hypot(j.x-target!.x,j.y-target!.y)<900).length>=3 ? 16 : randInt(4,9)});
}
export function stepThunderstorms(w:World,dt:number) {
 for(const storm of w.thunderstorms){if(w.time>=storm.until)continue;if(w.time>=storm.next){storm.next=w.time+(Math.random()<.25?rand(.35,1.2):rand(3,9));strikeLightning(w);}}
 const ended=w.thunderstorms.some(s=>w.time>=s.until);
 w.thunderstorms=w.thunderstorms.filter(s=>w.time<s.until);
 if(ended&&!w.thunderstorms.length)w.notices.push('the thunder fades... everyone can stop being a lightning rod.');
 for(const chain of [...w.lightningChains]){
  if(w.time<chain.at)continue;
  const p=chain.target;
  w.lightningChains=w.lightningChains.filter(c=>c!==chain);
  if(!live(w,p))continue;
  chain.seen.add(p);
  bolt(w,chain.from,p,'size' in p&&!craft(p));
  fryAt(w,p.x,p.y,craft(p)?100:70);
  let broken=false;
  if('maxBeams' in p){
   p.hits=(p.hits??0)+2;p.hitAt=w.time;
   if(p.hits>=UFO_HITS_TO_BREAK){w.destroyUfo('blasted',p,'lightning split a UFO... that ends the circuit.');broken=true;}
  }else if('hull' in p){
   p.hull-=2;p.hitAt=w.time;
   if(p.hull<=0){w.destroySub(p,'lightning breached a submarine... circuit broken.');broken=true;}
  }else if('maxHp' in p){
   p.hp-=p.maxHp*.06;p.hitAt=w.time;p.warp=undefined;p.spin=undefined;
   broken=p.hp<=0;
   w.notices.push('lightning hammered the mothership... its systems go dark.');
  }else if('stunned' in p){
   p.hp-=2;
   if(p.hp<=0){detonateDrone(w,p,'lightning popped a drone... the circuit breaks.');broken=true;}
   else p.stunned=Infinity;
  }else if('size' in p){
   p.chargedUntil=w.time+rand(10,20);p.zapAt=w.time;p.zapTarget=undefined;
   w.callout(p.x,p.y-35,chain.left>9?'CHAIN REACTION':'SUPERCHARGED','150,245,255');
  }
  if(craft(p)&&!broken){
   if('maxBeams' in p)interruptTractor(w,p,'EMP');
   cancelCraftMotion(w,p);
   w.encounterShots=w.encounterShots.filter(s=>s.source!==p||s.fireAt<=w.time);
   p.emp={until:w.time+rand(2.5,6),sink:rand(18,65),rise:rand(25,110),homeY:p.emp?.homeY??clamp(p.y,50,w.height*.8),drift:rand(-12,12)};
   w.callout(p.x,p.y-35,'EMP - SYSTEMS OFFLINE','150,220,255');
  }
  if(broken||--chain.left<=0)continue;
  const reach='size' in p&&!craft(p)?Math.max((p.chargedUntil??0)>w.time?850:550,p.size*25):480;
  const choices=conductors(w).filter(q=>!chain.seen.has(q)&&live(w,q)&&Math.hypot(q.x-p.x,q.y-p.y)<reach);
  choices.sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  const next=choices[0];
  if(next)w.lightningChains.push({...chain,target:next,from:{x:p.x,y:p.y},at:w.time+.12});
 }
 for(const jelly of w.jellies){
  if((jelly.chargedUntil??0)<=w.time || w.time-(jelly.empPulseAt??-99)<2.5)continue;
  jelly.empPulseAt=w.time;
  const radius=clamp(jelly.size*6,75,160);
  for(const p of conductors(w)){
   if(!craft(p)||!live(w,p)||Math.hypot(p.x-jelly.x,p.y-jelly.y)>radius)continue;
   if('maxBeams' in p)interruptTractor(w,p,'EMP');
   cancelCraftMotion(w,p);
   w.encounterShots=w.encounterShots.filter(s=>s.source!==p||s.fireAt<=w.time);
   p.emp={until:Math.max(p.emp?.until??0,w.time+rand(1,2)),sink:rand(8,18),rise:rand(45,85),homeY:p.emp?.homeY??clamp(p.y,50,w.height*.8),drift:rand(-4,4)};
   if('stunned' in p)p.stunned=Infinity;
   w.callout(p.x,p.y-35,'JELLY EMP','150,245,255');
  }
 }
 for(const drone of w.attackDrones)if(drone.emp&&!isCraftDriven(w,drone))stepEmp(w,drone,dt);
 w.lightningBolts=w.lightningBolts.filter(b=>w.time-b.born<b.duration);
 for(const b of w.lightningBones)b.y+=18*dt;
 w.lightningBones=w.lightningBones.filter(b=>w.time-b.born<8);
}
/** Loss of power disables steering and weapons, then restores altitude at an individual pace. */
export function stepEmp(w:World,p:Ufo|Sub|Mothership|AttackDrone,dt:number) {
 const emp=p.emp;if(!emp)return false;
 const oldY=p.y;
 if(w.time<emp.until){p.y=Math.min(w.height-35,p.y+emp.sink*dt);p.x+=emp.drift*dt;}
 else {
  const diff=emp.homeY-p.y;
  p.y+=Math.sign(diff)*Math.min(Math.abs(diff),emp.rise*dt);
  p.x+=(clamp(p.x,60,w.width-60)-p.x)*Math.min(1,dt*.6);
  if(Math.abs(diff)<5){p.emp=undefined;if('stunned' in p)p.stunned=w.time;w.callout(p.x,p.y-30,'SYSTEMS ONLINE','150,255,190');}
 }
 if('hy' in p){p.hy=p.y;p.beamX=p.x;if(p.pilot){p.pilot.x=p.x;p.pilot.y+=p.y-oldY;}}
 if('vx' in p){p.vx=0;p.vy=0;}
 return true;
}
