import { queueShot, resolveShots, type Combatant } from "./combat";
import { clamp, TAU } from "./math";
import type { Fish, World } from "./world";

export interface AttackDrone { id: number; x: number; y: number; hp: number; stunned: number; nextShot: number }
export interface EncounterShot { x0: number; y0: number; x1: number; y1: number; born: number; fireAt: number; hostile: boolean; resolved: boolean; source?:Combatant; target?:Combatant; damage?:number; flash?:boolean }
export interface Mothership {
  x: number; y: number; size: number; hp: number; maxHp: number; born: number;
  phase: "arrive" | "battle" | "collapse" | "leave"; phaseAt: number;
  nextDrone: number; nextShot: number; emptyAt: number; serial: number;
}
export interface EoeCross { fish: Fish; x: number; y: number; turnAt: number; converted: boolean }
export interface Eoe { born: number; until: number; crosses: EoeCross[]; converted: number; cleared: boolean; souls: { x:number; y:number; ox:number; oy:number; phase:number }[] }
export interface DiverCombat { nextShot: number; hits: number; hitAt: number; nextRepair: number }

const crew = (w: World) => w.fish.filter(f => f.diver && f.alive && !f.riding && !f.seized && !f.dragger && !f.held);

export function startMothership(w: World): boolean {
  if (w.mothership || w.eoe || !w.isEventEnabled("mothership")) return false;
  const hp = 220 + Math.min(30, crew(w).length) * 5;
  w.mothership = { x: w.width * 0.5, y: -180, size: clamp(Math.min(w.width, w.height) * 0.42, 240, 640),
    hp, maxHp: hp, born: w.time, phase: "arrive", phaseAt: w.time, nextDrone: w.time + 6,
    nextShot: w.time + 9, emptyAt: 0, serial: 0 };
  w.attackDrones = []; w.encounterShots = []; w.diverCombat = new WeakMap();
  w.notices.push("the mothership has eclipsed the surface...");
  return true;
}

export function eoeReady(w: World): boolean {
  return !w.eoe && w.isEventEnabled("eoe");
}

export function startEoe(w: World): boolean {
  if (!eoeReady(w)) return false;
  const divers = w.fish.filter(f => f.alive && f.diver).slice(0,120);
  for (const f of divers) { f.eoeBound = true; delete f.fuseAt; delete f.riding; delete f.seized; delete f.dragger; }
  const souls = w.fish.filter(f=>f.alive).slice(0,100).map((f,i)=>({x:f.x,y:f.y,ox:f.x,oy:f.y,phase:i*2.4}));
  // EOE is its own cinematic event; an invasion never owns its title or progression.
  w.invasion=null;w.sagas=[];w.mothership=null;w.attackDrones=[];w.encounterShots=[];
  w.meteors=[];w.fight=null;w.whirl=null;w.vortices=[];w.kraken=null;w.leviathan=null;
  w.eventQueue.length=0;w.sagaQueue=[];w.pendingTitan=null;w.krakenQueued=false;
  w.diverQueue=[];w.techQueue=[];
  w.eoe = { born:w.time,until:w.time+52,converted:0,cleared:false,souls,crosses:divers.map((fish,i)=>({
    fish,x:fish.x,y:fish.y,turnAt:w.time+17+i/Math.max(1,divers.length-1)*11,converted:false,
  })) };
  w.cooldownUntil.eoe=w.time+3600;
  w.notices.push("Disgusting...");
  return true;
}

export function stepEncounters(w: World, dt: number) {
  if (!w.eoe && w.settings.events !== "off" && w.time >= w.nextEoeAt) {
    w.nextEoeAt = w.time + 60;
    if (w.time >= (w.cooldownUntil.eoe ?? 0) && eoeReady(w) && Math.random() < 1 / 120) startEoe(w);
  }
  const eoe = w.eoe;
  if (eoe) {
    const age = w.time - eoe.born;
    for (let i = 0; i < eoe.crosses.length; i++) {
      const cross = eoe.crosses[i], f = cross.fish;
      if (!cross.converted && w.time >= cross.turnAt) {
        cross.converted = true; eoe.converted++;
        cross.x = f.x; cross.y = f.y;
        // A scripted visual departure, rather than an ordinary death or explosion.
        f.alive = false; f.respawnAt = Infinity; delete f.eoeBound;
      }
      if (cross.converted) continue;
      if (!f.alive || f.riding || f.seized || f.dragger) continue;
      const tx = w.width * (0.1 + 0.8 * (i + 0.5) / eoe.crosses.length);
      const ty = w.height * (0.62 + 0.15 * Math.sin(i * 2.4));
      const ease = Math.min(1, dt * 0.7);
      f.x += (tx - f.x) * ease; f.y += (ty - f.y) * ease;
      f.vx *= 0.9; f.vy *= 0.9;
    }
    if (age >= 17 && age < 39) {
      const moonX=w.width*.5,moonY=w.height*.22;
      for(const soul of eoe.souls){
        const dx=moonX-soul.x,dy=moonY-soul.y;
        soul.x+=(dx*.18+Math.cos(w.time+soul.phase)*12)*dt;
        soul.y+=(dy*.18+Math.sin(w.time+soul.phase)*12)*dt;
      }
    }
    if(age>=29&&!eoe.cleared){
      eoe.cleared=true;
      for(const f of w.fish){f.alive=false;f.respawnAt=Infinity;delete f.eoeBound;}
      w.fish=[];w.sharks=[];w.whales=[];w.jellies=[];w.ufos=[];w.subs=[];w.torpedoes=[];
      w.mess=[];w.debris=[];w.bombs=[];w.blasts=[];w.bolts=[];w.ripples=[];w.events=[];w.callouts=[];
      w.heldDiver=null;w.whaleFight=null;w.agitated.clear();w.provocations.clear();w.retaliationArcs=[];w.baitBall=null;
    }
    if(age>=52){
      w.eoe=null;w.seed();
      for(const f of w.fish)f.x=f.vx>0?-30:w.width+30;
      w.nextEventAt=w.time+35;w.nextBusyDiverAt=w.time+15;
      w.notices.push("individual lives return to the sea...");
    }
  }
  const boss = w.mothership;
  w.encounterShots = w.encounterShots.filter(s => w.time - s.fireAt < 0.4);
  if (!boss) return;
  const divers = crew(w);
  if (boss.phase === "arrive") {
    boss.y += (w.height * 0.16 - boss.y) * Math.min(1, dt * 0.75);
    if (w.time - boss.born > 5) { boss.phase = "battle"; boss.phaseAt = w.time; }
  }
  if (boss.phase === "collapse" || boss.phase === "leave") {
    w.attackDrones.length = 0; w.encounterShots.length = 0;
    if (boss.phase === "leave") boss.y -= dt * 100;
    if (w.time - boss.phaseAt > 5) {
      w.notices.push(boss.phase === "collapse" ? "the mothership has fallen..." : "the mothership withdraws beyond the light...");
      w.mothership = null;
    }
    return;
  }
  if (boss.phase !== "battle") return;
  boss.x = w.width * 0.5 + Math.sin((w.time - boss.born) * 0.19) * w.width * 0.18;
  boss.y = w.height * 0.16 + Math.sin(w.time * 0.45) * 12;
  const defenders=divers.length+w.subs.length+(w.kraken?1:0)+w.sharks.filter(s=>s.mega).length;
  if (!defenders) boss.emptyAt ||= w.time;
  else boss.emptyAt = 0;
  if (w.time - boss.born > 160 || (boss.emptyAt > 0 && w.time - boss.emptyAt > 14)) {
    boss.phase = "leave"; boss.phaseAt = w.time; return;
  }
  if (w.time >= boss.nextDrone) {
    boss.nextDrone = w.time + 4;
    if (w.attackDrones.length < 8) w.attackDrones.push({ id: ++boss.serial, x: boss.x, y: boss.y + 50,
      hp: 3, stunned: 0, nextShot: w.time + 2 });
  }
  const targets:Combatant[]=[...divers,...w.subs.filter(s=>!s.leaving),...w.sharks.filter(s=>!s.grabbed),...(w.kraken?[w.kraken]:[]),...(w.leviathan?[w.leviathan]:[])];
  const warn=(source:Combatant,target:Combatant)=>queueShot(w,source,target,true);
  if (targets.length && w.time >= boss.nextShot) {
    boss.nextShot = w.time + 4;
    const humanTargets:Combatant[]=[...divers,...w.subs];
    const choices=humanTargets.length?humanTargets:targets;
    warn(boss,choices[Math.floor(w.time)%choices.length]);
  }
  for (const drone of w.attackDrones) {
    if (drone.stunned > w.time) continue;
    const angle = w.time * 0.6 + drone.id * 2.4;
    const tx = boss.x + Math.cos(angle) * boss.size * 0.8;
    const ty = boss.y + 180 + Math.sin(angle * 0.8) * 100;
    drone.x += (clamp(tx, 40, w.width - 40) - drone.x) * Math.min(1, dt * 1.4);
    drone.y += (clamp(ty, 70, w.height * 0.6) - drone.y) * Math.min(1, dt * 1.4);
    if (targets.length && w.time >= drone.nextShot) {
      drone.nextShot = w.time + 3.5 + drone.id % 3;
      warn(drone,targets[(drone.id+Math.floor(w.time/8))%targets.length]);
    }
  }
  for (let i = 0; i < divers.length; i++) {
    const f = divers[i];
    let state = w.diverCombat.get(f);
    if (!state) { state = { nextShot: w.time + (i % 6) * 0.3, hits: 0, hitAt: -99, nextRepair: w.time + 4 }; w.diverCombat.set(f, state); }
    if ((f.stunUntil ?? 0) > w.time) continue;
    const flank = f.dkind === "scooter" ? 0.9 : 0.65;
    const angle = TAU * i / Math.max(1, divers.length) + w.time * 0.12;
    const tx = clamp(boss.x + Math.cos(angle) * boss.size * flank, 50, w.width - 50);
    const ty = clamp(boss.y + 240 + Math.abs(Math.sin(angle)) * 220, 120, w.height - 70);
    // Reposition the squad after ordinary swimming; nearby dangers still affect them.
    f.x += clamp(tx - f.x, -140 * dt, 140 * dt);
    f.y += clamp(ty - f.y, -110 * dt, 110 * dt);
    for (const shot of w.encounterShots) if (shot.hostile && !shot.resolved && w.time < shot.fireAt && Math.hypot(f.x - shot.x1, f.y - shot.y1) < 75) {
      f.x = clamp(f.x + (f.x < boss.x ? -1 : 1) * dt * (f.dkind === "scooter" ? 260 : 170), 30, w.width - 30);
    }
    if (f.dkind === "tech" && w.time >= state.nextRepair) {
      state.nextRepair = w.time + 4;
      for (const ally of divers) {
        const allyState = w.diverCombat.get(ally);
        if (allyState && Math.hypot(f.x - ally.x, f.y - ally.y) < 220) allyState.hits = Math.max(0, allyState.hits - 1);
      }
    }
    if (w.time < state.nextShot) continue;
    state.nextShot = w.time + (f.dkind === "bomber" ? 3.5 : f.dkind === "photo" ? 2.5 : 1.8);
    const drone = w.attackDrones.filter(d => d.hp > 0).reduce<AttackDrone | null>((best, d) => !best || Math.hypot(f.x-d.x,f.y-d.y) < Math.hypot(f.x-best.x,f.y-best.y) ? d : best, null);
    const target = drone || boss;
    if (Math.hypot(f.x - target.x, f.y - target.y) > 850) continue;
    queueShot(w,f,target,false,f.dkind==="photo"?0:f.dkind==="bomber"?3:1,f.dkind==="photo");
    f.flashAt=w.time;
    if(f.dkind==="photo")w.callout(f.x,f.y-35,"SNAP!","255,250,205");
  }
  resolveShots(w);
  w.attackDrones = w.attackDrones.filter(d => d.hp > 0);
  if (boss.hp <= 0) {
    boss.phase = "collapse"; boss.phaseAt = w.time;
    w.splash(boss.x,boss.y,2.2,undefined,{quiet:true,max:boss.size});
  }
}
