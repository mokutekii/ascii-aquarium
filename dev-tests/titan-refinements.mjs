import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r = await build({stdin:{contents:'export { World } from "./src/world"; export { startMothership, stepEncounters } from "./src/encounters"; export { stepHullCombat } from "./src/hull-combat"; export { stepProvocations } from "./src/provocation"; export { stepRimMotion } from "./src/rim-wave";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,startMothership,stepEncounters,stepHullCombat,stepRimMotion,stepProvocations}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const w=new World([{kind:'classic',size:.8}],24); w.resize(2400,1600,13,19); w.time=10; w.sharks=[]; w.spawnKraken(false,true); startMothership(w);
const k=w.kraken,b=w.mothership; Object.assign(b,{phase:'battle',x:1200,y:700,nextSpin:Infinity,nextShot:Infinity}); Object.assign(k,{x:1200,y:800,maul:false,wrapping:null,whaleTarget:undefined});
k.hullStrike={target:b,at:5}; stepHullCombat(w,1/60); assert.equal(b.grapple,undefined,'elapsed wind-up alone cannot latch');
assert.equal(k.hullStrike.reachAt,w.time,'physical opening starts branching arms even before a perfect launch');w.time+=.7;stepHullCombat(w,1/60);assert.equal(b.grapple?.kraken,k,'arms close onto the physical contact after reaching');
w.time+=8;b.nextSpin=0;stepHullCombat(w,1/60);assert.ok(b.spin);assert.ok(b.grapple,'grip persists during rim wind-up');
w.time+=1.3;stepHullCombat(w,1/60);assert.equal(b.grapple,undefined,'firing breaks grip');const y=k.y;stepRimMotion(w,1/60);assert.ok(k.y>y,'released Kraken recoils away');
console.log('PASS: launch-gated latch, attached wind-up, release and outward recoil');

{
 const w=new World([{kind:'classic',size:.8}],24);w.resize(2400,1600,13,19);w.time=20;w.sharks=[];w.spawnKraken(false,true);startMothership(w);
 const k=w.kraken,b=w.mothership;Object.assign(b,{phase:'battle',phaseAt:0,x:1200,y:700,nextTeleport:Infinity,nextDrone:Infinity,nextShot:Infinity});
 Object.assign(k,{x:1000,y:850,hullStrike:{target:b,at:19.5,launched:true,launchedAt:20}});
 const savedRandom=Math.random;try{Math.random=()=>0;stepEncounters(w,1/60);}finally{Math.random=savedRandom;}assert.equal(b.warp?.charge,.4,'detects wind-up and uses quick evade');assert.equal(k.hullStrike,undefined);assert.ok(k.rageUntil>w.time && k.hullUntil>w.time,'evade provokes a short pursuit');
 const x=b.x;w.time+=.41;stepEncounters(w,1/60);assert.ok(b.warp?.moved);assert.notEqual(b.x,x,'evade moves before normal teleport charge completes');
 w.time+=.41;stepEncounters(w,1/60);assert.equal(b.warp,undefined);k.hullStrike={target:b,at:w.time-.5};stepEncounters(w,1/60);assert.equal(b.warp,undefined,'evasion cooldown leaves opportunities to latch');
 console.log('PASS: preemptive quick teleport, agitation, pursuit and evasion cooldown');
}

{
 const w=new World([{kind:'classic',size:.8}],24);w.resize(3200,2200,13,19);w.time=20;w.sharks=[];w.spawnKraken(false,true);startMothership(w);
 const k=w.kraken,b=w.mothership;Object.assign(b,{phase:'battle',x:1600,y:800,nextSpin:Infinity});
 Object.assign(k,{size:400,state:'grab',x:1600,y:1000,heading:Math.PI/2,nextHull:Infinity,hullUntil:0,maul:false,wrapping:null,whaleTarget:undefined});
 stepHullCombat(w,1/60);assert.equal(k.hullStrike,undefined,'passing the hull does not trigger an incidental wind-up');
 Object.assign(k,{x:1600,y:1900,heading:-Math.PI/2,hullUntil:w.time+12,nextHunt:Infinity});
 const startY=k.y;
 for(let i=0;i<120;i++){w.time+=1/60;w.stepKraken(1/60);}
 assert.ok(k.y<startY-45,'committed hull hunt keeps moving toward the ship');
 console.log('PASS: uncommitted pass-by and sustained deliberate hull approach');
}

for (const winner of ['kraken','mega']) {
 const w=new World([{kind:'classic',size:.8}],24);w.resize(3200,2200,13,19);w.time=50;w.sharks=[];w.spawnKraken(false,true);w.spawnMegalodon();
 const k=w.kraken,m=w.sharks.find(s=>s.mega);
 Object.assign(k,{x:1600,y:1100,state:'wrap',stateAt:30,wrapFor:1,wrapping:m,winner,coiled:true,lunging:false,maul:false,doom:false,tilt:0,nextShake:Infinity});
 w.stepKraken(1/60);
 const champion=winner==='kraken'?k:m;
 assert.ok(champion.victoryUntil>w.time+59,'actual duel winner lingers');assert.ok(champion.calmUntil>champion.victoryUntil);
 startMothership(w);const b=w.mothership;Object.assign(b,{phase:'battle',x:1500,y:700});
 w.spawnSub();const sub=w.subs.at(-1);Object.assign(sub,{x:1600,y:1000,leaving:false});
 stepProvocations(w,1/60);assert.equal(w.provocations.get(champion)?.target,b,'mothership outranks nearer craft');
 w.mothership=null;stepProvocations(w,1/60);assert.equal(w.provocations.get(champion)?.target,sub,'winner switches to surviving craft');
}
console.log('PASS: both duel winners linger, prioritize mothership, then switch to craft');

{
 const w=new World([{kind:'classic',size:.8}],24);w.resize(3200,2200,13,19);w.time=20;w.sharks=[];w.spawnKraken(false,true);startMothership(w);
 const k=w.kraken,b=w.mothership;Object.assign(b,{phase:'battle',x:1600,y:800,nextSpin:Infinity,nextShot:Infinity});
 Object.assign(k,{size:400,state:'grab',x:1600,y:1300,heading:-Math.PI/2,nextHull:Infinity,hullUntil:40,nextHunt:Infinity});
 let rotation=0;
 for(let i=0;i<900 && !b.grapple;i++){
  const heading=k.heading,x=k.x,y=k.y;w.time+=1/60;w.stepKraken(1/60);
  const turn=Math.atan2(Math.sin(k.heading-heading),Math.cos(k.heading-heading));rotation+=Math.abs(turn);
  assert.ok(Math.abs(turn)<=.5/60+1e-6,'Kraken turn rate is bounded');
  assert.ok((k.x-x)*Math.cos(heading)+(k.y-y)*Math.sin(heading)>-1,'mantle leads the swim');
  stepHullCombat(w,1/60);
 }
 assert.equal(b.grapple?.kraken,k,'tip-first approach transitions into a physical wrap');
 assert.ok(rotation<Math.PI,'grabbing hull does not need a half-turn or spin');
 console.log('PASS: tip-first thrust, bounded turning and physical hull wrap');
}

{
 const w=new World([{kind:'classic',size:.8}],24);w.resize(3200,2200,13,19);w.time=30;w.sharks=[];w.spawnKraken(false,true);startMothership(w);
 const k=w.kraken,b=w.mothership;Object.assign(b,{phase:'battle',x:1600,y:800,nextSpin:Infinity});
 Object.assign(k,{size:400,state:'grab',x:1600,y:1050,heading:0,hullUntil:45,hullStrike:{target:b,at:29},nextHull:Infinity,nextHunt:Infinity});
 stepHullCombat(w,1/60);assert.equal(k.hullStrike.reachAt,30,'side-on opening branches arms without waiting for planned orientation');
 k.x=2900;k.y=1900;w.time+=1;stepHullCombat(w,1/60);assert.equal(k.hullStrike,undefined,'missed branch disengages');assert.equal(b.grapple,undefined,'miss cannot turn into a distant grip');
}
console.log('PASS: opportunistic side-on reach and missed-reach disengagement');
