import type { World } from "./world";
import type { Sub } from "./deep";
import type { Fish, Shark, Kraken, Ufo } from "./types";
import { clamp, rand } from "./math";
import { bodyPoints, bodiesOverlap, segmentHit } from "./collision-bodies";
import { cancelCraftMotion, isCraftDriven, isCraftHeld, kickCraft } from "./handling";
import { markTitanThrow } from "./hull-combat";
import { interruptTractor } from "./tractor";
import { detonateDrone } from "./drones";
import { EXPLOSIONS } from "./explosion-profiles";

export interface CommanderHold {
  titan: Shark | Kraken;
  at: number; until: number; rate: number; x: number; y: number;
  rescueHits: number[];
}
export interface CommanderMissile { x: number; y: number; born: number; target: NonNullable<World["mothership"]>; trail: {x:number;y:number}[] }
interface FleetState {
  launchReady: number; missiles: CommanderMissile[]; nextSupport: number;
  rescueImmune: WeakMap<object, number>; nextSpeech: WeakMap<Fish, number>;
  deaths: WeakMap<Fish, boolean>; lastDeath: Map<string, number>;
  lastTime: number;
}
const fleets = new WeakMap<World, FleetState>();
function state(w: World) {
  let s = fleets.get(w);
  if (!s || w.time < s.lastTime) {
    s = {launchReady:0,missiles:[],nextSupport:w.time+30,rescueImmune:new WeakMap(),nextSpeech:new WeakMap(),deaths:new WeakMap(),lastDeath:new Map(),lastTime:w.time};
    fleets.set(w,s);
  }
  s.lastTime = w.time;
  return s;
}
export const commanderMissiles = (w: World) => state(w).missiles;
export const subMaxHull = (s: Sub) => s.maxHull ?? (s.crew ? 16 : 8);
export function beginCommanderHold(w: World, sub: Sub, titan: Shark | Kraken) {
  if (!sub.crew || sub.commanderHold || sub.leaving || w.time < (sub.nextTitanGrab ?? 0) || isCraftHeld(w,sub)) return false;
  const mega = "nodes" in titan;
  const x = mega ? titan.nodes[0] : titan.x, y = mega ? titan.nodes[1] : titan.y;
  cancelCraftMotion(w,sub);
  sub.commanderHold = {titan,at:w.time,until:w.time+rand(mega?5:6,mega?8:10),rate:rand(mega?1.5:1,mega?2.5:2),x:sub.x-x,y:sub.y-y,rescueHits:[]};
  sub.launchAt=undefined;
  if (!mega) { sub.seizedByKraken=true; sub.seizedAt=w.time; }
  w.callout(sub.x,sub.y-55,"COMMANDER SEIZED - COVER THE CREW","255,180,120");
  // A commander is a heavy catch: the seizure lands with a thud, like a titan taking a saucer.
  w.titanImpact(.75);
  w.splash(sub.x,sub.y,2,undefined,{weight:3,max:260,quiet:true});
  w.notices.push(mega?"the megalodon has clamped on the commander":"the kraken has seized the commander");
  return true;
}
export function releaseCommander(w: World, sub: Sub, thrown: boolean) {
  const h=sub.commanderHold;
  if (!h) return;
  sub.commanderHold=undefined;sub.seizedByKraken=false;sub.krakenReachAt=undefined;
  sub.nextTitanGrab=w.time+8;sub.fleeUntil=w.time+8;
  const mega="nodes" in h.titan;
  const from={x:"nodes" in h.titan?h.titan.nodes[0]:h.titan.x,y:"nodes" in h.titan?h.titan.nodes[1]:h.titan.y};
  sub.fleeFrom=from;
  if (thrown) {
    const a=mega?h.titan.heading+Math.sin(w.time*19)*.8:Math.atan2(rand(80,w.height-80)-sub.y,rand(80,w.width-80)-sub.x);
    kickCraft(w,sub,Math.cos(a)*(mega?560:500),Math.sin(a)*(mega?440:400));
    markTitanThrow(w,sub);
    sub.hitAt=w.time;
    w.titanImpact(.85);
    w.callout(sub.x,sub.y-45,mega?"COMMANDER FLUNG":"KRAKEN HURLS COMMANDER","255,170,100");
    w.notices.push(mega?"the megalodon has flung the commander":"the kraken has hurled the commander");
  } else w.callout(sub.x,sub.y-45,"COMMANDER FREED","130,255,210");
}
function engineer(w: World, sub?: Sub): Fish {
  const f:Fish={x:sub?.x??rand(50,w.width-50),y:sub?.y??-30,vx:0,vy:0,species:0,alarm:0,alive:true,respawnAt:Infinity,phase:rand(0,6.28),turn:0,depth:1,millDir:1,diver:true,dkind:"support",temp:sub?Infinity:w.time+150,engineerFor:sub,docked:!!sub};
  w.fish.push(f);return f;
}
function available(f:Fish,w:World) { return f.alive&&!f.riding&&!f.held&&!f.seized&&!f.dragger&&!f.eoeBound&&(f.stunUntil??0)<=w.time; }
function swim(f:Fish,x:number,y:number,dt:number,speed=90) {
  const dx=x-f.x,dy=y-f.y,d=Math.hypot(dx,dy)||1;
  f.vx=dx/d*Math.min(speed,d*2);f.vy=dy/d*Math.min(speed,d*2);f.x+=f.vx*dt;f.y+=f.vy*dt;f.phase+=dt*3;
}
/** Fleet support is a single owner of diver movement while on a repair or rescue task. */
export function stepCommanders(w:World,dt:number) {
  const s=state(w),time=w.time;
  for (const f of w.fish) f.supportDuty=false;
  for (const sub of w.subs) {
    if (!sub.crew) continue;
    sub.maxHull=16;
    const crew=w.fish.filter(f=>f.engineerFor===sub&&f.alive);
    if (sub.engineerReplaceAt===undefined) { for(let i=crew.length;i<2;i++) engineer(w,sub);sub.engineerReplaceAt=time+60; }
    const threat=w.kraken&&Math.hypot(w.kraken.x-sub.x,w.kraken.y-sub.y)<w.kraken.size+200 || w.sharks.some(sh=>sh.mega&&Math.hypot(sh.nodes[0]-sub.x,sh.nodes[1]-sub.y)<500);
    if (threat||time-sub.hitAt<8||sub.emp||sub.commanderHold) sub.safeSince=time;
    sub.safeSince??=time;
    if (!sub.leaving&&crew.length<2&&time>=sub.engineerReplaceAt&&time-sub.safeSince>=8) { engineer(w,sub);sub.engineerReplaceAt=time+60; }
    if (sub.seizedByKraken&&!sub.commanderHold&&w.kraken) beginCommanderHold(w,sub,w.kraken);
    const h=sub.commanderHold;
    if (h) {
      const mega="nodes" in h.titan;
      const live=mega?w.sharks.includes(h.titan as Shark):w.kraken===h.titan;
      if (!live || isCraftHeld(w,sub) || (!mega&&!sub.seizedByKraken)) { releaseCommander(w,sub,false);continue; }
      const tx="nodes" in h.titan?h.titan.nodes[0]:h.titan.x,ty="nodes" in h.titan?h.titan.nodes[1]:h.titan.y;
      // Preserve the original contact offset. The body never rotates to fit the jaws. It is a heavy catch: the hull lags behind
      // the grip on a spring, the kraken swings it slowly round and draws it in before the throw, the megalodon's head shake
      // drags it side to side.
      const age=time-h.at,wind=clamp(1-(h.until-time)/.9,0,1);
      let ox=h.x,oy=h.y;
      if(!mega){
        const sway=Math.sin(age*2.1)*.4*clamp(age/.8,0,1),c=Math.cos(sway),sn=Math.sin(sway),draw=1-.3*wind;
        ox=(h.x*c-h.y*sn)*draw;oy=(h.x*sn+h.y*c)*draw;
      }
      const nx=tx+ox,ny=ty+oy,pull=1-Math.exp(-dt*(mega?6:3));
      const px=sub.x,py=sub.y;
      sub.x+=(nx-sub.x)*pull;sub.y+=(ny-sub.y)*pull;
      sub.vx=(sub.x-px)/Math.max(dt,.001);sub.vy=(sub.y-py)/Math.max(dt,.001);
      sub.hull=Math.max(time-h.at<=4?1:0,sub.hull-h.rate*dt);sub.hitAt=time;
      if(sub.hull<=0) { w.destroySub(sub,"a titan tore the commander apart...");continue; }
      if(time>=h.until) releaseCommander(w,sub,true);
    }
    if(sub.leaving) {sub.launchAt=undefined;continue;}
    if(threat||sub.hull<8) {
      const k=w.kraken,sh=w.sharks.find(sh=>sh.mega);
      const from=k??(sh?{x:sh.nodes[0],y:sh.nodes[1]}:undefined);
      if(from){sub.fleeFrom=from;sub.fleeUntil=time+2;}
    }
    const boss=w.mothership;
    if(sub.missileUsed&&time>=(sub.missileReadyAt??0))sub.missileUsed=false;
    const canLaunch=boss?.phase==="battle"&&!sub.missileUsed&&!sub.commanderHold&&!sub.emp&&!sub.arrival&&!isCraftDriven(w,sub)&&time>=s.launchReady;
    if(!canLaunch) sub.launchAt=undefined;
    else if(sub.launchAt===undefined){sub.launchAt=time+2;w.callout(sub.x,sub.y-60,"DORSAL MISSILE ARMING","255,220,140");}
    else if(time>=sub.launchAt){
      sub.launchAt=undefined;sub.missileUsed=true;sub.missileReadyAt=time+240;s.launchReady=time+30;
      s.missiles.push({x:sub.x,y:sub.y-45,born:time,target:boss!,trail:[]});
      w.notices.push(`${sub.crew} commander launches a deterrent missile...`);
    }
  }
  for(const f of w.fish) if(f.engineerFor&&!w.subs.includes(f.engineerFor)) { if(f.docked){f.alive=false;} else {f.engineerFor=undefined;f.temp=time+50;} }
  if(time>=s.nextSupport){s.nextSupport=time+rand(35,65);if(w.isEventEnabled("diver")&&w.fish.filter(f=>f.alive&&f.dkind==="support"&&!f.engineerFor).length<2)engineer(w);}
  const repaired=new Set<Sub|Ufo>();
  for(const f of w.fish){
    if(!f.diver||!available(f,w)) {f.weldAt=undefined;continue;}
    const sub=f.engineerFor;
    if(f.docked&&sub){f.x=sub.x;f.y=sub.y;f.supportDuty=true;if(sub.leaving||sub.hull>=subMaxHull(sub)||sub.commanderHold||sub.emp)continue;f.docked=false;f.x=sub.x+25;f.y=sub.y+35;}
    if(f.dkind!=="support") continue;
    if(sub?.leaving){f.supportDuty=true;swim(f,sub.x,sub.y,dt);if(Math.hypot(f.x-sub.x,f.y-sub.y)<30){f.docked=true;f.weldAt=undefined;}continue;}
    const candidates: (Sub|Ufo)[]=sub?[sub]:[...w.subs.filter(a=>!a.leaving),...w.ufos.filter(a=>a.pilot?.alive&&a.state!=="leave")];
    const target=candidates.filter(a=>"hull" in a?a.hull<subMaxHull(a):(a.hits??0)>0).sort((a,b)=>Math.hypot(a.x-f.x,a.y-f.y)-Math.hypot(b.x-f.x,b.y-f.y))[0];
    if(!target){f.weldAt=undefined;f.repairTarget=undefined;if(sub){f.supportDuty=true;swim(f,sub.x,sub.y,dt);if(Math.hypot(f.x-sub.x,f.y-sub.y)<30)f.docked=true;}continue;}
    f.supportDuty=true;
    const blocked=target.emp||isCraftDriven(w,target)||("hull" in target?target.commanderHold||target.seizedByKraken:target.held)
    ;if(f.weldAt!==undefined&&(target.hitAt??-99)>f.weldAt)f.weldAt=undefined;
    const changed=f.repairTarget!==target;f.repairTarget=target;
    swim(f,target.x,target.y+38,dt,75);
    if(blocked||changed||Math.hypot(f.x-target.x,f.y-target.y-38)>30){f.weldAt=undefined;continue;}
    f.weldAt??=time;
    if(time-f.weldAt>=3&&!repaired.has(target)){repaired.add(target);if("hull" in target)target.hull=Math.min(subMaxHull(target),target.hull+dt*.5);else target.hits=Math.max(0,(target.hits??0)-dt*.5);}
  }
  rescueCommanders(w,dt);
  for(const m of [...s.missiles]){
    if(w.mothership!==m.target||m.target.phase!=="battle"||time-m.born>12){s.missiles.splice(s.missiles.indexOf(m),1);continue;}
    m.trail.push({x:m.x,y:m.y});if(m.trail.length>16)m.trail.shift();
    const a=time-m.born<.65?-Math.PI/2:Math.atan2(m.target.y-m.y,m.target.x-m.x),x=m.x,y=m.y;
    m.x+=Math.cos(a)*360*dt;m.y+=Math.sin(a)*360*dt;
    if(segmentHit(x,y,m.x,m.y,bodyPoints(w,m.target))!==Infinity){
      const b=m.target;b.hp=Math.max(0,b.hp-b.maxHp*.25);b.hitAt=time;b.warp=undefined;b.spin=undefined;
      b.nextShot=Math.max(b.nextShot,time+5);b.nextTeleport=Math.max(b.nextTeleport,time+5);b.nextSpin=Math.max(b.nextSpin??0,time+5);
      w.encounterShots=w.encounterShots.filter(shot=>shot.source!==b||shot.fireAt<=time);
      cancelCraftMotion(w,b);kickCraft(w,b,(b.x-m.x)*.5,-160);b.cruise={x:clamp(b.x+(b.x<w.width/2?-250:250),80,w.width-80),y:80,until:time+5};
      const style={seed:rand(0,Math.PI*2),aspect:rand(.8,1.1),fronts:3,rate:rand(.7,1),roughness:rand(.14,.28)};
      w.bombs.push({x:m.x,y:m.y,born:time,r:EXPLOSIONS.nuke.radius,profile:"nuke",style});w.splash(m.x,m.y,4,undefined,{max:800,weight:3});
      // The fireball vaporizes nearby drones; everything else is thrown by the expanding pressure front.
      for(const d of [...w.attackDrones])if(Math.hypot(d.x-m.x,d.y-m.y)<EXPLOSIONS.nuke.radius*.75)detonateDrone(w,d,"a drone was vaporized by the deterrent blast...");
      for(const u of w.ufos)if(Math.hypot(u.x-m.x,u.y-m.y)<EXPLOSIONS.nuke.radius)interruptTractor(w,u);
      w.callout(m.x,m.y-70,"DETERRENT IMPACT","255,230,170");s.missiles.splice(s.missiles.indexOf(m),1);
    }
  }
}
function rescueCommanders(w:World,dt:number){
  const s=state(w);
  for(const f of w.fish){
    if(!f.diver||f.docked||!available(f,w)||!["scuba","scooter","tech"].includes(f.dkind??"scuba"))continue;
    const sub=w.subs.find(a=>a.commanderHold&&Math.hypot(a.x-f.x,a.y-f.y)<650);
    const h=sub?.commanderHold;if(!sub||!h)continue;
    f.supportDuty=true;swim(f,sub.x,sub.y+110,dt,95);
    if(Math.hypot(f.x-sub.x,f.y-sub.y)>300||w.time<(f.nextShot??0)||w.time<(s.rescueImmune.get(h.titan)??0))continue;
    // Blocked rescue shots do not count toward release.
    const blocked=w.ufos.some(u=>!u.pilot?.alive&&!u.held&&segmentHit(f.x,f.y,sub.x,sub.y,bodyPoints(w,u))!==Infinity);
    if(blocked)continue;
    f.nextShot=w.time+1.1;f.flashAt=w.time;
    w.bolts.push({x0:f.x,y0:f.y,x1:sub.x,y1:sub.y,born:w.time,team:"human"});
    h.rescueHits=h.rescueHits.filter(at=>w.time-at<=3);h.rescueHits.push(w.time);
    if(h.rescueHits.length>=3){s.rescueImmune.set(h.titan,w.time+6);releaseCommander(w,sub,false);w.notices.push("the divers cut their commander free...");}
  }
}
/** Central death detection covers direct predator kills as well as popDiver paths. */
export function stepDiverFeedback(w:World){
  const s=state(w);
  for(const f of w.fish){
    if(!f.diver)continue;
    if(f.alive&&s.deaths.has(f)){s.deaths.delete(f);f.deathCause=undefined;}
    if(!f.alive&&!s.deaths.has(f)){
      s.deaths.set(f,true);if(f.docked||f.deathCause==="SURFACED")continue;
      const cause=f.deathCause??(f.dragger?"SHARK BITE":f.seized?"KRAKEN CRUSH":"LOST IN THE DEEP");
      const nearby=w.callouts.find(c=>c.small&&c.text.startsWith(cause)&&w.time-c.born<1&&Math.hypot(c.x-f.x,c.y-f.y)<160);
      if(nearby){const n=Number(nearby.text.match(/x(\d+)$/)?.[1]??1)+1;nearby.text=`${cause} x${n}`;}
      else {const deaths=w.callouts.filter(c=>c.small&&c.rgb==="255,165,130");if(deaths.length>=4)w.callouts=w.callouts.filter(c=>c!==deaths[0]);w.callouts.push({x:f.x,y:f.y-35,text:cause,rgb:"255,165,130",born:w.time,small:true});}
      if(!["SHARK BITE","LOST IN THE DEEP"].includes(cause)&&w.time-(s.lastDeath.get(cause)??-99)>=10){s.lastDeath.set(cause,w.time);w.notices.push(`a diver was lost: ${cause.toLowerCase()}...`);}
    }
    if(!f.alive||f.docked||!available(f,w)||w.time<(s.nextSpeech.get(f)??0))continue;
    s.nextSpeech.set(f,w.time+rand(15,35));
    if(w.callouts.filter(c=>c.small&&w.time-c.born<4).length>=3)continue;
    const shark=w.sharks.some(sh=>Math.hypot(sh.nodes[0]-f.x,sh.nodes[1]-f.y)<350);
    const lines=f.weldAt!==undefined?["hold still, captain.","just a little welding.","that should stop the leak."]:f.supportDuty?["I've got your back.","cutting you loose!","cover me!"]:shark?["is that a shark?","please be a dolphin.","nice teeth. far too many."]:["this water smells funny.","who packed my lunch?","lovely day down here.","did anyone hear that?","my fins are squeaking.","we should do this more often."];
    w.whisper(f.x,f.y-35,lines[Math.floor(Math.random()*lines.length)],"160,215,225");
  }
}
