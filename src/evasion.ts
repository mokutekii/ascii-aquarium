import type { World, Fish, Ufo } from "./world";
import { bodyPoints } from "./collision-bodies";
import { isCraftDriven } from "./handling";
import { UFO_HITS_TO_BREAK } from "./types";
import { clamp } from "./math";

type Point={x:number;y:number};
/** Evaluate actual occupied water, so a reflex cannot jump into the next hull. */
export function safeEvasionPoint(w:World,actor:Point,threat:Point,range=170) {
  const away=Math.atan2(actor.y-threat.y,actor.x-threat.x);
  const blockers=[...w.sharks,...w.subs,...w.ufos,...w.whales,...(w.kraken?[w.kraken]:[]),...(w.leviathan?[w.leviathan]:[]),...(w.mothership?[w.mothership]:[])].filter(o=>o!==actor).flatMap(o=>bodyPoints(w,o));
  let best:Point|undefined,score=-Infinity;
  for(let i=0;i<12;i++){
    const a=away+(i%2?1:-1)*Math.ceil(i/2)*Math.PI/6;
    const p={x:clamp(actor.x+Math.cos(a)*range,45,w.width-45),y:clamp(actor.y+Math.sin(a)*range,65,w.height-50)};
    const clearance=blockers.reduce((d,b)=>Math.min(d,Math.hypot(p.x-b.x,p.y-b.y)-b.r-22),200);
    if(clearance<0)continue;
    const s=Math.hypot(p.x-threat.x,p.y-threat.y)+clearance*.7-Math.hypot(p.x-actor.x,p.y-actor.y)*.1;
    if(s>score){best=p;score=s;}
  }
  return best;
}

/** Called before contact/damage, not after a victim has already been attached. */
export function evadeThreat(w:World,actor:object,threat:Point) {
  if(w.ufos.includes(actor as Ufo)){
    const u=actor as Ufo;
    if(u.held||isCraftDriven(w,u)||u.emp||(u.hits??0)<Math.ceil(UFO_HITS_TO_BREAK*.75)||u.state==="leave"||u.state==="beam")return false;
    const b=u.blink??={until:0,readyAt:0,nextHop:0,ghosts:[]};
    if(w.time<b.readyAt&&w.time>=b.until||w.time<b.nextHop)return false;
    const p=safeEvasionPoint(w,u,threat,190);if(!p)return false;
    b.ghosts.push({x:u.x,y:u.y,at:w.time,bank:u.attitude?.bank??0});b.ghosts=b.ghosts.slice(-14);
    const dy=p.y-u.y;u.x=p.x;u.y=p.y;u.hy+=dy;u.beamX=u.x;
    u.floatVx=0;u.floatVy=0;b.phased=true;b.until=Math.max(b.until,w.time+.65);b.readyAt=w.time+3;b.nextHop=w.time+.16;
    return true;
  }
  if(w.fish.includes(actor as Fish)){
    const f=actor as Fish,s=f.sande;
    if(!s||!f.alive||s.until<=w.time||w.time<s.dodgeReady||f.held||f.docked||f.riding)return false;
    const p=safeEvasionPoint(w,f,threat,165);if(!p)return false;
    s.ghosts.push({x:f.x,y:f.y,at:w.time,ang:Math.atan2(f.vy,f.vx||1)});s.ghosts=s.ghosts.slice(-12);
    if(f.dragger){f.dragger.dragging=undefined;delete f.dragger;}
    if(f.seized){delete f.seized;if(w.kraken)w.kraken.caught=w.kraken.caught.filter(o=>o!==f);}
    f.x=p.x;f.y=p.y;f.vx*=.3;f.vy*=.3;delete f.stunUntil;
    s.dodgeReady=w.time+.9;s.burstUntil=Math.max(s.burstUntil,w.time+.9);s.nextHop=w.time+.18;f.alarm=0;
    return true;
  }
  return false;
}
