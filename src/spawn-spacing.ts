import type { World } from "./world";
import { bodyPoints } from "./collision-bodies";
import { clamp } from "./math";
const traffic = new WeakMap<World, { serial: number; next: number; ufo: number; sub: number }>();
/** Spread arrivals over all four edges and reserve destinations across both fleets. */
export function craftEntry(w: World, kind: "ufo" | "sub", manual = false) {
  let clock = traffic.get(w); if (!clock) { clock = { serial: 0, next: w.time, ufo: 0, sub: 0 }; traffic.set(w, clock); }
  const edgeSerial = clock[kind]++;
  const serial = clock.serial++, at = Math.max(w.time, clock.next);
  clock.next = at + .55;
  const cell = clamp(Math.round(w.width / 124), 8, 13);
  const rx = kind === "ufo" ? Math.max(40, Math.min(w.width, w.height) * .07) : cell * 12;
  const ry = kind === "ufo" ? rx * .35 + 12 : cell * 5;
  const occupied = [...w.ufos, ...w.subs, ...w.whales, ...w.sharks.filter(s => !s.grabbed && !s.lifted),
    ...(w.mothership && w.mothership.phase !== "collapse" ? [w.mothership] : [])].flatMap(a => bodyPoints(w, a));
  for (const u of w.ufos) if (u.state === "enter") occupied.push({x:u.tx,y:u.hy,r:rx*.6});
  for (const s of w.subs) if (s.arrival) occupied.push({x:s.arrival.x,y:s.arrival.y,r:rx*.6});
  let best: {x:number;y:number;tx:number;ty:number;face:1|-1;at:number;clearance:number}|undefined;
  const firstLane = (serial * 5 + Math.floor(Math.random()*12)) % 12;
  for (let i=0;i<48;i++) {
    const edge = (edgeSerial + Math.floor(i/12)) % 4;
    const along = (((firstLane+i)%12)+.5)/12;
    const tx = w.width*(.08+.84*(edge<2 ? ((serial*7+i*5)%23+.5)/23 : along));
    const ty = w.height*(.12+.68*(edge<2 ? along : ((serial*11+i*7)%19+.5)/19));
    const x = edge===0 ? -rx-75 : edge===1 ? w.width+rx+75 : tx;
    const y = edge===2 ? -ry-75 : edge===3 ? w.height+ry+75 : ty;
    let clearance=Infinity;
    for (const p of occupied) for (const [px,py] of [[x,y],[clamp(x,rx,w.width-rx),clamp(y,ry,w.height-ry)],[tx,ty]])
      clearance=Math.min(clearance,Math.hypot((px-p.x)/(rx+p.r+55),(py-p.y)/(ry+p.r+55))-1);
    const candidate={x,y,tx,ty,face:(tx>=x?1:-1) as 1|-1,at,clearance};
    if (!best || clearance>best.clearance) best=candidate;
    if (clearance>0) return candidate;
  }
  // Keep overcrowded arrivals outside the tank until their reserved entry time.
  if (manual) {
    const a=Math.atan2(best!.y-w.height/2,best!.x-w.width/2);
    for(let n=0;n<64 && occupied.some(p=>Math.hypot((best!.x-p.x)/(rx+p.r+55),(best!.y-p.y)/(ry+p.r+55))<1);n++) {
      best!.x+=Math.cos(a)*(rx*2+55);best!.y+=Math.sin(a)*(ry*2+55);
    }
  }
  return best!;
}
