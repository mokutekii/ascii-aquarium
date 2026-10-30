import { meteorDistance, type MeteorStyle } from "./meteor";
import { cancelCraftMotion } from "./handling";
import { rand } from "./math";
import type { World } from "./world";
import { UFO_HITS_TO_BREAK } from "./types";
import { bodyPoints } from "./collision-bodies";
import { kickCraft } from "./handling";
import { scareWhalesFromBlast } from "./whale-scale";
const hits = new WeakMap<object, Set<object>>();
/** Every explosion applies four hull damage once; destroyed craft schedule their own delayed blast. */
export function damageCraftInBlast(w: World, bomb: { x: number; y: number; r: number; meteor?: boolean; style?: MeteorStyle }, radius = bomb.r) {
  scareWhalesFromBlast(w, bomb.x, bomb.y, radius);
  let hit = hits.get(bomb); if (!hit) { hit = new Set(); hits.set(bomb, hit); }
  const contains=(p: {x:number;y:number;r:number}) => bomb.meteor && bomb.style
    ? meteorDistance(bomb.style,p.x-bomb.x,p.y-bomb.y,p.r)<=radius
    : Math.hypot(p.x-bomb.x,p.y-bomb.y)-p.r<=radius;
  const boss=w.mothership;
  if(bomb.meteor && boss?.phase === "battle" && !hit.has(boss) && bodyPoints(w,boss).some(contains)) {
    hit.add(boss);boss.hp-=boss.maxHp*.06;boss.hitAt=w.time;boss.warp=undefined;boss.spin=undefined;
    const angle=Math.atan2(boss.y-bomb.y,boss.x-bomb.x);
    cancelCraftMotion(w,boss);kickCraft(w,boss,Math.cos(angle)*190,Math.sin(angle)*150);
    boss.nextShot=Math.max(boss.nextShot,w.time+rand(1,2));
    boss.nextTeleport=Math.max(boss.nextTeleport,w.time+rand(2,4));
    boss.nextSpin=Math.max(boss.nextSpin??0,w.time+2);
    w.encounterShots=w.encounterShots.filter(s=>s.source!==boss||s.fireAt<=w.time);
    w.callout(boss.x,boss.y-boss.size*.3,"METEOR IMPACT - FIRING INTERRUPTED","255,180,130");
  }
  for (const craft of [...w.subs, ...w.ufos, ...w.attackDrones]) {
    // The mothership's own explosions never take out its drones.
    if ("stunned" in craft && (bomb as { source?: unknown }).source !== undefined && ((bomb as { source?: unknown }).source === w.mothership || w.attackDrones.includes((bomb as { source?: unknown }).source as never))) continue;
    if (hit.has(craft) || !bodyPoints(w, craft).some(contains)) continue;
    hit.add(craft);
    const a = Math.atan2(craft.y - bomb.y, craft.x - bomb.x);
    kickCraft(w, craft, Math.cos(a) * 180, Math.sin(a) * 180);
    if ("hull" in craft) {
      craft.hull -= 4; craft.hitAt = w.time;
      if (craft.hull <= 0) w.destroySub(craft, "a blast breached a submarine... chain reaction!");
    } else if ("maxBeams" in craft) {
      craft.hits = (craft.hits ?? 0) + 4; craft.hitAt = w.time;
      if (craft.hits >= UFO_HITS_TO_BREAK) w.destroyUfo("blasted", craft);
    } else {
      // Shock shielding absorbs collateral blasts; direct fire and impacts remain lethal.
      craft.hp = Math.max(1, craft.hp - 1);
    }
  }
}
