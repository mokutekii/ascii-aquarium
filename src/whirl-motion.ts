import type { World, Fish } from "./world";
import type { Whirl } from "./types";
import { clamp, rand, angleDiff } from "./math";
import { evadeThreat } from "./evasion";
const history=new WeakMap<World,{x:number;y:number}[]>();
export function createWhirl(w:World,until:number,storm=false,others:Whirl[]=[]) {
  const scale=Math.min(w.width,w.height), band=Math.random();
  const r=scale*(band<.3?rand(.035,.07):band<.75?rand(.08,.14):rand(.16,.24));
  const recent=history.get(w)??[],cluster=Math.random()<.12;
  let x=w.width/2,y=w.height/2,best=-Infinity;
  for(let i=0;i<36;i++){
    const px=rand(r*.65+20,w.width-r*.65-20),py=rand(r*.65+30,w.height-r*.65-20);
    const last=recent.at(-1);
    if(i<30&&last&&Math.hypot(px/w.width-last.x,py/w.height-last.y)<.22)continue;
    const old=recent.reduce((d,p)=>Math.min(d,Math.hypot(px/w.width-p.x,py/w.height-p.y)),1);
    const gap=others.reduce((d,p)=>Math.min(d,Math.hypot(px-p.x,py-p.y)/(p.r+r)),3);
    const score=old*3+(cluster?0:Math.min(2,gap))+Math.random()*.2;
    if(score>best){best=score;x=px;y=py;}
  }
  recent.push({x:x/w.width,y:y/w.height});history.set(w,recent.slice(-12));
  const wp:Whirl={x,y,r,baseR:r,born:w.time,until,dir:Math.random()<.5?-1:1,rippleAt:w.time,spin:rand(.55,1.45),suction:rand(.45,1.4),
    motion:{heading:rand(-Math.PI,Math.PI),speed:rand(storm?15:10,storm?38:24),turn:rand(-.12,.12),phase:rand(0,100),growth:rand(.08,.25)}};
  return wp;
}
export function moveWhirl(w:World,wp:Whirl,dt:number){
  wp.baseR??=wp.r;wp.spin??=1;wp.suction??=1;
  const m=wp.motion??={heading:rand(-Math.PI,Math.PI),speed:rand(10,24),turn:rand(-.12,.12),phase:rand(0,100),growth:rand(.08,.25)};
  wp.r=wp.baseR*(1+m.growth*Math.sin((w.time-wp.born)*.5+m.phase));
  const margin = Math.min(wp.r * .65 + 25, Math.min(w.width, w.height) * .32);
  let ax=0,ay=0;
  if(wp.x<margin+80)ax+=(margin+80-wp.x)/80;
  if(wp.x>w.width-margin-80)ax-=(wp.x-(w.width-margin-80))/80;
  if(wp.y<margin+80)ay+=(margin+80-wp.y)/80;
  if(wp.y>w.height-margin-80)ay-=(wp.y-(w.height-margin-80))/80;
  m.heading+=m.turn*Math.sin(w.time*.19+m.phase)*dt;
  if(ax||ay)m.heading+=clamp(angleDiff(m.heading,Math.atan2(ay,ax)),-1.1*dt,1.1*dt);
  wp.x=clamp(wp.x+Math.cos(m.heading)*m.speed*dt,margin,w.width-margin);
  wp.y=clamp(wp.y+Math.sin(m.heading)*m.speed*dt,margin,w.height-margin);
}
interface Ride {wp:Whirl;at:number;angle:number;r0:number;dur:number;core:boolean;vx:number;vy:number}
const rides=new WeakMap<Fish,Ride>();
const flights=new WeakMap<Fish,{until:number;immune:number;vx:number;vy:number}>();
function fling(w:World,f:Fish,ride:Ride){
  rides.delete(f);const a=ride.angle+ride.wp.dir*(Math.PI/2-.5),speed=rand(250,380) * Math.sqrt(ride.wp.suction ?? 1);
  flights.set(f,{until:w.time+1.7,immune:w.time+5,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed});
  f.vx=Math.cos(a)*speed;f.vy=Math.sin(a)*speed;f.alarm=1;
  if(f.diver)w.whisper(f.x,f.y-30,"flung clear...","120,225,255");
}
export function stepWhirlFish(w:World,wp:Whirl,f:Fish,dt:number,destructive:boolean){
  if(f.held||f.dragger||w.time<(flights.get(f)?.immune??0))return;
  let ride=rides.get(f);if(ride&&ride.wp!==wp)return;
  const dx=f.x-wp.x,dy=f.y-wp.y,d=Math.hypot(dx,dy),fade=Math.max(0,Math.min(1,(w.time-wp.born)/2,(wp.until-w.time)/2));
  const reach = whirlReach(wp);
  if(!ride){
    if(d>reach||fade<=0)return;
    if(d<Math.min(wp.r*1.5,reach*.58)&&fade>.35){
      if(evadeThreat(w,f,wp))return;
      ride={wp,at:w.time,angle:Math.atan2(dy,dx),r0:Math.max(d,wp.r*.1),dur:rand(1.5,2.5),core:destructive&&d<wp.r*.32,vx:0,vy:0};rides.set(f,ride);
    }else{
      const strength=(1-d/reach)*fade*dt,inv=1/Math.max(1,d);
      f.x+=(-dy*wp.dir*(wp.spin??1)*75-dx*(wp.suction??1)*105)*inv*strength;
      f.y+=(dx*wp.dir*(wp.spin??1)*75-dy*(wp.suction??1)*105)*inv*strength;return;
    }
  }
  const p=clamp((w.time-ride.at)/ride.dur,0,1);
  if(ride.core&&p>.4){
    rides.delete(f);if(evadeThreat(w,f,wp)||w.absorbDiverShield(f)){flights.set(f,{until:0,immune:w.time+3,vx:0,vy:0});return;}
    f.alive=false;f.respawnAt=f.diver?Infinity:w.time+rand(5,10);
    if(f.diver){f.deathCause="WHIRLPOOL";const saga=w.sagas.find(s=>s.vortices?.includes(wp));if(saga)saga.lost++;w.diverQuip("lost");}return;
  }
  if(p>=1||wp.until-w.time<.3){fling(w,f,ride);return;}
  const flow=whirlFlow(wp,f.x,f.y),blend=1-Math.exp(-dt*8);
  ride.vx+=(flow.x-ride.vx)*blend;ride.vy+=(flow.y-ride.vy)*blend;
  f.x+=ride.vx*dt;f.y+=ride.vy*dt;f.alarm=1;
  ride.angle=Math.atan2(f.y-wp.y,f.x-wp.x);
}
export function whirlReach(wp: Whirl) {
  return wp.r * (1.25 + 1.35 * (wp.suction ?? 1));
}
/** Broad inflow, with faster rotation in the inner water. */
function whirlFlow(wp:Whirl,x:number,y:number){
  const dx=x-wp.x,dy=y-wp.y,d=Math.max(1,Math.hypot(dx,dy)),u=d/Math.max(1,wp.r);
  const fall=Math.max(0,1-d/whirlReach(wp)),spin=(wp.spin??1)*Math.min(230,wp.r*1.1)/(1+u*.8)*fall;
  const inward=(wp.suction??1)*Math.min(220,wp.r*1.6)*fall*Math.min(1,u*2);
  return {x:(-dy*wp.dir*spin-dx*inward)/d,y:(dx*wp.dir*spin-dy*inward)/d};
}
export function stepWhirlFlights(w:World,dt:number){
  for(const f of w.fish){
    if(!f.alive||f.held||f.seized||f.riding||f.docked){rides.delete(f);flights.delete(f);continue;}
    const ride=rides.get(f);if(ride&&!w.whirlpools.includes(ride.wp)&&!w.vortices.includes(ride.wp))fling(w,f,ride);
    const flight=flights.get(f);if(!flight)continue;
    if(w.time<flight.until){f.x=clamp(f.x+flight.vx*dt,20,w.width-20);f.y=clamp(f.y+flight.vy*dt,35,w.height-25);flight.vx*=Math.exp(-dt*.9);flight.vy*=Math.exp(-dt*.9);}
    if(w.time>flight.immune)flights.delete(f);
  }
}
