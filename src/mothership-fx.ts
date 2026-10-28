import { clamp, TAU } from "./math";
import type { World } from "./world";
import type { Mothership, AttackDrone } from "./encounters";
import type { Put } from "./deepdraw";

export interface AlienScrap { x:number; y:number; vx:number; vy:number; born:number; fuse?:number; glyph:string }
export interface MothershipWreck { x:number; y:number; born:number; size:number; hit?: Set<object>[] }

export function dropDrone(w:World,d:AttackDrone){
  if(w.alienScrap.length>=100)return;
  w.alienScrap.push({x:d.x,y:d.y,vx:0,vy:25,born:w.time,fuse:w.time+4,glyph:"@"});
  w.callout(d.x,d.y-25,"UNSTABLE CORE","120,235,255");
}

export function beginWreck(w:World,b:Mothership){
  w.mothershipWreck={x:b.x,y:b.y,size:b.size,born:w.time};
  for(let i=0;i<40;i++){
    const a=i*2.39996,speed=65+(i%7)*23;
    w.alienScrap.push({x:b.x+Math.cos(a)*b.size*.35,y:b.y+Math.sin(a)*b.size*.12,
      vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,born:w.time,glyph:["#","%","=","+","/"][i%5]});
  }
  w.alienScrap=w.alienScrap.slice(-100);
}

// Apply pressure once as each expanding wavefront crosses an actor, independent of frame rate.
function pressure(w:World,x:number,y:number,previous:number,radius:number,power:number,hit:Set<object>){
  const kick=(p:{x:number;y:number;vx?:number;vy?:number},mass=1,identity:object=p)=>{
    if(hit.has(identity))return;
    let dx=p.x-x,dy=p.y-y,d=Math.hypot(dx,dy);
    if(d>radius||d<previous)return;
    hit.add(identity);
    if(d<1){dx=0;dy=1;d=1;}
    const force=power/mass;
    p.x=clamp(p.x+dx/d*force*.3,15,w.width-15);p.y=clamp(p.y+dy/d*force*.3,20,w.height-25);
    if(p.vx!==undefined)p.vx+=dx/d*force;
    if(p.vy!==undefined)p.vy+=dy/d*force;
  };
  for(const f of w.fish)if(f.alive&&!f.held&&!f.seized&&!f.riding&&!f.dragger){kick(f);f.alarm=1;}
  for(const s of w.subs)if(!s.seizedByKraken)kick(s,3);
  for(const u of w.ufos)if(!u.held)kick(u,2);
  for(const d of w.attackDrones)kick(d);
  for(const whale of w.whales){
    const x=whale.x,y=whale.y;kick(whale,7);
    if(whale.spine)for(const p of whale.spine){p.x+=whale.x-x;p.y+=whale.y-y;}
  }
  if(w.kraken)kick(w.kraken,6);
  if(w.leviathan)kick(w.leviathan,8);
  for(const s of w.sharks)if(!s.grabbed){
    const p={x:s.nodes[0],y:s.nodes[1]},ox=p.x,oy=p.y;kick(p,s.mega?6:2,s);
    for(let i=0;i<s.nodes.length;i+=2){s.nodes[i]+=p.x-ox;s.nodes[i+1]+=p.y-oy;}
  }
  for(const s of w.alienScrap)kick(s,.7);
}

export function teleportImpact(w:World,b:Mothership){
  for(const d of w.attackDrones)d.y=Math.max(d.y,b.y+b.size*.255+55);
  for(const f of w.fish){
    if(!f.alive||f.held||f.seized||f.riding||f.dragger)continue;
    if(((f.x-b.x)/(b.size*.95+25))**2+((f.y-b.y)/(b.size*.26+25))**2>1)continue;
    f.y=clamp(b.y+b.size*.26+55,30,w.height-30);f.vy=220;f.alarm=1;
    if(f.diver){
      const state=w.diverCombat.get(f)??{hits:0,hitAt:-99,nextShot:w.time+2,nextRepair:w.time+4};
      if(f.alienArmor)f.alienArmor=false;else state.hits++;
      state.hitAt=w.time;w.diverCombat.set(f,state);f.stunUntil=w.time+1.2;
      if(state.hits>=3)w.popDiver(f,"blast");
    }
  }
  for(const s of [...w.subs]){
    if(Math.abs(s.x-b.x)>b.size*.95+100||Math.abs(s.y-b.y)>b.size*.26+40)continue;
    s.hull-=2;s.hitAt=w.time;s.y=clamp(b.y+b.size*.26+90,40,w.height-40);
    s.fleeUntil=w.time+4;s.fleeFrom={x:b.x,y:b.y};
    w.callout(s.x,s.y-30,"HULL IMPACT","255,150,100");
    if(s.hull<=0)w.destroySub(s,"the mothership materialized through a submarine!");
  }
}

export function stepMothershipFx(w:World,dt:number){
  if(w.eoe){w.mothershipWreck=null;w.alienScrap=[];w.capacitorWaves=[];return;}
  const wreck=w.mothershipWreck;
  if(wreck){
    const age=w.time-wreck.born;
    wreck.hit??=[new Set(),new Set(),new Set()];
    for(const [i,delay] of [0,.65,1.45].entries()){
      const a=age-delay;if(a<0||a>4)continue;
      pressure(w,wreck.x,wreck.y,Math.max(0,a-dt)*650,a*650,delay===0?250:120,wreck.hit[i]);
    }
    if(age>8)w.mothershipWreck=null;
  }
  for(const s of w.alienScrap){
    s.x+=s.vx*dt;s.y=clamp(s.y+s.vy*dt,20,w.height-35);
    s.vx*=Math.exp(-dt*1.2);s.vy+=(18-s.vy)*Math.min(1,dt*.8);
    const diver=w.fish.find(f=>f.alive&&f.diver&&!f.alienArmor&&!f.held&&!f.seized&&!f.riding&&!f.dragger&&Math.hypot(f.x-s.x,f.y-s.y)<40);
    if(diver&&w.time-s.born>.8){
      diver.alienArmor=true;s.born=-Infinity;s.fuse=undefined;
      w.callout(diver.x,diver.y-35,"ALIEN ARMOR","120,235,255");continue;
    }
    if(s.fuse!==undefined&&w.time>=s.fuse){
      w.capacitorWaves.push({x:s.x,y:s.y,born:w.time,size:1});s.born=-Infinity;
    }
  }
  w.alienScrap=w.alienScrap.filter(s=>w.time-s.born<24);
  for(const wave of w.capacitorWaves){const a=w.time-wave.born;wave.hit??=[new Set()];pressure(w,wave.x,wave.y,Math.max(0,a-dt)*320,a*320,100,wave.hit[0]);}
  w.capacitorWaves=w.capacitorWaves.filter(s=>w.time-s.born<1.5).slice(-16);
  // Divers actively retrieve safe wreckage after the main pressure fronts have passed.
  if((wreck&&w.time-wreck.born>4)||w.alienScrap.some(s=>s.fuse!==undefined))for(const f of w.fish){
    if(!f.alive||!f.diver||f.alienArmor||f.held||f.seized||f.riding||f.dragger)continue;
    const s=w.alienScrap.reduce<AlienScrap|undefined>((best,s)=>(s.fuse===undefined||Math.hypot(s.x-f.x,s.y-f.y)<240)&&(!best||Math.hypot(s.x-f.x,s.y-f.y)<Math.hypot(best.x-f.x,best.y-f.y))?s:best,undefined);
    if(s){f.x+=clamp(s.x-f.x,-100*dt,100*dt);f.y+=clamp(s.y-f.y,-100*dt,100*dt);}
  }
}

export function drawMothershipFx(put:Put,w:World,cw:number,ch:number){
  const ring=(x:number,y:number,r:number,alpha:number,flat=false)=>{
    const n=Math.min(240,Math.max(24,Math.ceil(r*TAU/cw)));
    for(let i=0;i<n;i++){const a=i/n*TAU;put(x+Math.cos(a)*r,y+Math.sin(a)*r*(flat?.22:1),flat?"=":"*",`rgba(125,225,255,${alpha})`,true);}
  };
  const wreck=w.mothershipWreck;
  if(wreck){const age=w.time-wreck.born;
    for(const delay of [0,.65,1.45]){const a=age-delay;if(a>=0&&a<4){ring(wreck.x,wreck.y,a*650,(1-a/4)*.9);ring(wreck.x,wreck.y,a*900,(1-a/4),true);}}
    if(age<.4)for(let i=-10;i<=10;i++)put(wreck.x+i*cw,wreck.y,"=",`rgba(230,250,255,${1-age/.4})`,true);
  }
  for(const wave of w.capacitorWaves)ring(wave.x,wave.y,(w.time-wave.born)*320,1-(w.time-wave.born)/1.5);
  for(const s of w.alienScrap){const hot=s.fuse!==undefined;put(s.x,s.y,hot?(Math.floor(w.time*7)%2?"@":"!"):s.glyph,hot?"rgb(255,175,95)":"rgb(140,220,255)",true);}
  for(const f of w.fish)if(f.alive&&f.alienArmor){put(f.x-cw*2,f.y,"[","rgb(125,225,255)",true);put(f.x+cw*2,f.y,"]","rgb(125,225,255)",true);}
}
