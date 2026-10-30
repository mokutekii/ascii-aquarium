import type { World } from "./world";
import { isCraftHeld, isCraftDriven, moveCraft } from "./handling";
import { clamp } from "./math";
/** Personal space before hull collision, shared by both fleets. Pointer control always wins. */
export function spaceFleet(w: World, dt: number) {
  const cell=clamp(Math.round(w.width/124),8,13);
  const fleet=[...w.ufos.map(actor=>({actor,rx:Math.max(40,Math.min(w.width,w.height)*.07),ry:Math.max(40,Math.min(w.width,w.height)*.07)*.35+12})),
    ...w.subs.map(actor=>({actor,rx:cell*12,ry:cell*5}))];
  const force=fleet.map(()=>({x:0,y:0}));
  const movable=(a:typeof fleet[number]['actor'])=>!isCraftHeld(w,a)&&!isCraftDriven(w,a)&&('maxBeams' in a ? !a.held&&a.state!=='beam'&&w.time>=(a.enterAt??0) : !a.seizedByKraken&&w.time>=(a.arrival?.at??0));
  for(let i=0;i<fleet.length;i++) for(let j=i+1;j<fleet.length;j++) {
    const a=fleet[i],b=fleet[j],dx=a.actor.x-b.actor.x,dy=a.actor.y-b.actor.y;
    const q=Math.hypot(dx/(a.rx+b.rx+90),dy/(a.ry+b.ry+90));
    if(q>=1.3)continue;
    const angle=dx||dy?Math.atan2(dy,dx):(i*2.39996+j*.77);
    const push=(1.3-q)*125, nx=Math.cos(angle)*push,ny=Math.sin(angle)*push;
    force[i].x+=nx;force[i].y+=ny;force[j].x-=nx;force[j].y-=ny;
  }
  fleet.forEach(({actor},i)=>{
    if(!movable(actor))return;
    const f=force[i],size=Math.hypot(f.x,f.y),scale=Math.min(1,95/(size||1));
    const vx=f.x*scale,vy=f.y*scale;
    moveCraft(w,actor,vx*dt,vy*dt);
    if('maxBeams' in actor){actor.floatVx=(actor.floatVx??0)+vx*dt;actor.floatVy=(actor.floatVy??0)+vy*dt;}
    else {actor.vx+=vx*dt;actor.vy+=vy*dt;}
  });
}
