import type { Fish, World, Shark, Ufo, Kraken } from "./world";
import type { Leviathan, Sub, GhostTarget } from "./deep";
import type { Mothership, AttackDrone, EncounterShot } from "./encounters";
import { actorAlive, actorPosition, provoke, type Offender } from "./provocation";

export type Combatant=Fish|Sub|Ufo|Shark|Kraken|Mothership|AttackDrone|Leviathan;
const muzzle=(w:World,o:Combatant)=>{
  const p=actorPosition(o);
  if(o===w.mothership)return {x:p.x,y:p.y+w.mothership!.size*.171};
  if("maxBeams" in o)return {x:p.x,y:p.y+Math.max(40,Math.min(w.width,w.height)*.07)*.18};
  if(w.fish.includes(o as Fish)){
    const f=o as Fish,cw=Math.max(8,Math.min(13,Math.round(w.width/124))),a=Math.atan2(f.vy,f.vx||1);
    const front=f.dkind==="photo"?.1:1.9,side=f.dkind==="photo"?2.2:1.1;
    return {x:p.x+Math.cos(a)*cw*front+Math.sin(a)*cw*side,y:p.y+Math.sin(a)*cw*front-Math.cos(a)*cw*side};
  }
  return p;
};
export function queueShot(w:World,source:Combatant,target:Combatant,hostile:boolean,damage=1,flash=false){
  if(w.encounterShots.length>=64)return;
  const a=muzzle(w,source),b=actorPosition(target);
  w.encounterShots.push({x0:a.x,y0:a.y,x1:b.x,y1:b.y,born:w.time,fireAt:w.time+(hostile?1.1:.12),hostile,resolved:false,source,target,damage,flash});
}
const radius=(w:World,o:Combatant)=>o===w.mothership?w.mothership!.size*.22:"nodes" in o?o.length*.08:"hull" in o?50:"maxBeams" in o?65:"size" in o?o.size*.22:28;

/** Tracking during aim, a locked warning, then a visible hit or miss at the same endpoint. */
export function resolveShots(w:World){
  for(const shot of w.encounterShots){
    if(shot.resolved)continue;
    if(shot.source){
      if(!actorAlive(w,shot.source)){shot.resolved=true;shot.fireAt=Math.min(shot.fireAt,w.time-.4);continue;}
      if("maxBeams" in shot.source && shot.hostile===!!shot.source.pilot?.alive){shot.resolved=true;shot.fireAt=w.time-.4;continue;}
      const a=muzzle(w,shot.source);
      shot.x0=a.x;shot.y0=a.y;
    }
    if(shot.target&&!shot.resolved&&(w.time-shot.born<.4||!shot.hostile)){
      const b=actorPosition(shot.target);shot.x1=b.x;shot.y1=b.y;
    }
    if(shot.resolved||w.time<shot.fireAt)continue;
    shot.resolved=true;
    if(!shot.target||!actorAlive(w,shot.target))continue;
    const p=actorPosition(shot.target),r=radius(w,shot.target);
    if(Math.hypot(p.x-shot.x1,p.y-shot.y1)>r)continue;
    // Heavy noncombatants can shield a target; a beam stops at the whale's visible body.
    const dx=shot.x1-shot.x0,dy=shot.y1-shot.y0,l2=dx*dx+dy*dy;
    let block=Infinity;
    for(const wh of w.whales)for(let u=0;u<=1;u+=.1){
      const b=w.whalePoint(wh,u),t=l2?((b.x-shot.x0)*dx+(b.y-shot.y0)*dy)/l2:0;
      if(t<.02||t>.98||t>=block)continue;
      if((b.x-shot.x0-dx*t)**2+(b.y-shot.y0-dy*t)**2<(wh.length*.075)**2){block=t;wh.fleeing=true;}
    }
    if(block<Infinity){shot.x1=shot.x0+dx*block;shot.y1=shot.y0+dy*block;w.splash(shot.x1,shot.y1,.5,undefined,{quiet:true,max:100});continue;}
    const target=shot.target,damage=shot.damage??1;
    if(w.attackDrones.includes(target as AttackDrone)){
      const drone=target as AttackDrone;drone.hp-=damage;if(shot.flash)drone.stunned=w.time+2.5;
    }else if(target===w.mothership)w.mothership!.hp-=damage;
    else if(w.subs.includes(target as Sub)){
      const sub=target as Sub;sub.hull--;sub.hitAt=w.time;sub.fleeUntil=w.time+3;sub.fleeFrom={x:shot.x0,y:shot.y0};
      if(sub.hull<=0)w.destroySub(sub,"alien fire has breached a submarine...");
    }else if(w.ufos.includes(target as Ufo)){
      const u=target as Ufo;u.hits=(u.hits??0)+damage;if(u.hits>=3)w.destroyUfo("shot",u);
    }else if(w.sharks.includes(target as Shark)){
      const sh=target as Shark;
      if(sh.mega&&shot.source)provoke(w,sh,shot.source as Offender);
      else {sh.heading=Math.atan2(p.y-shot.y0,p.x-shot.x0);sh.speed=150;sh.target=null;sh.alertUntil=w.time+1.5;}
    }else if(target===w.kraken&&shot.source)provoke(w,w.kraken!,shot.source as Offender);
    else if(target===w.leviathan&&shot.source){
      const source=shot.source;
      if(source===w.mothership||w.attackDrones.includes(source as AttackDrone)||w.ufos.includes(source as Ufo)||w.subs.includes(source as Sub)||w.fish.includes(source as Fish)){
        w.agitateLeviathan(p.x,p.y,r,source as GhostTarget);
      }
    }
    else if(w.fish.includes(target as Fish)){
      const f=target as Fish;
      if(f.alienArmor){f.alienArmor=false;w.callout(f.x,f.y-30,"ARMOR","120,235,255");continue;}
      let state=w.diverCombat.get(f);
      if(!state){state={nextShot:w.time+1,hits:0,hitAt:-99,nextRepair:w.time+4};w.diverCombat.set(f,state);}
      if(w.time-state.hitAt<2)continue;
      state.hits++;state.hitAt=w.time;f.stunUntil=w.time+1.2;
      if(state.hits>=3)w.popDiver(f,"blast");else w.callout(f.x,f.y-30,"HIT","255,150,100");
    }
    w.events.push({kind:"eat",x:shot.x1,y:shot.y1});
  }
}
