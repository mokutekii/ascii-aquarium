import type { World } from "./world";
import { isCraftHeld, isCraftDriven, moveCraft } from "./handling";
import { clamp } from "./math";
import { subGeometry } from "./sub-geometry";
/** Personal space before hull collision, shared by both fleets. Pointer control always wins. */
export function spaceFleet(w: World, dt: number) {
  const fleet=[...w.ufos.map(actor=>({actor,rx:Math.max(40,Math.min(w.width,w.height)*.07),ry:Math.max(40,Math.min(w.width,w.height)*.07)*.35+12})),
    ...w.subs.map(actor=>{const g=subGeometry(w.width,actor);return {actor,rx:g.halfLength+g.cell,ry:g.halfHeight+g.ch*2};})];
  const force=fleet.map(()=>({x:0,y:0}));
  const movable=(a:typeof fleet[number]['actor'])=>!isCraftHeld(w,a)&&!isCraftDriven(w,a)&&('maxBeams' in a ? !a.held&&a.state!=='beam'&&w.time>=(a.enterAt??0) : !a.seizedByKraken&&w.time>=(a.arrival?.at??0));
  for(let i=0;i<fleet.length;i++) for(let j=i+1;j<fleet.length;j++) {
    const a=fleet[i],b=fleet[j],dx=a.actor.x-b.actor.x,dy=a.actor.y-b.actor.y;
    const velocity=(actor:typeof a.actor)=>'maxBeams' in actor?{x:actor.floatVx??0,y:actor.floatVy??0}:{x:actor.vx,y:actor.vy};
    const av=velocity(a.actor),bv=velocity(b.actor),vx=av.x-bv.x,vy=av.y-bv.y;
    const closing=dx*vx+dy*vy<0;
    const lead=closing?clamp(-(dx*vx+dy*vy)/(vx*vx+vy*vy||1),0,2.5):0;
    const px=dx+vx*lead,py=dy+vy*lead;
    const q=Math.min(Math.hypot(dx/(a.rx+b.rx+90),dy/(a.ry+b.ry+90)),Math.hypot(px/(a.rx+b.rx+90),py/(a.ry+b.ry+90)));
    if(q>=1.3)continue;
    // Head-on traffic changes lanes before the bows meet. Pushing along the
    // closing axis merely makes both autopilots drive back into each other.
    const angle=closing&&Math.abs(dx)>Math.abs(dy)*2
      ? (dy===0 ? (i+j)%2?Math.PI/2:-Math.PI/2 : Math.sign(dy)*Math.PI/2)
      : px||py?Math.atan2(py,px):(i*2.39996+j*.77);
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
