import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
process.on('uncaughtException', error => { console.error(error.message); process.exitCode=1; });
const bundle=await build({stdin:{contents:'export { World } from "./src/world"; export * from "./src/encounters"; export * from "./src/encounters-draw";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,stepEncounters,drawMothership,drawEoe}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
let seed=12345; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const make=(count=12)=>{
 const w=new World([{kind:'classic',size:.8}],5);w.resize(1800,1200,13,19);w.settings.events='off';
 const base=w.fish[0];
 w.fish=Array.from({length:count},(_,i)=>({...base,diver:true,dkind:['scuba','tech','photo','scooter'][i%4],x:400+i*40,y:500,alive:true,phase:i,respawnAt:Infinity}));
 return w;
};
const w=make();
assert.equal(w.triggerEvent('mothership'),'started');
assert.equal(w.triggerEvent('mothership'),'already');
assert.equal(w.eventStatus('mothership'),'running');
let maxDrones=0,shots=0,hp=w.mothership.hp,sawCollapse=false;
for(let i=0;i<60*170;i++){
 w.time+=1/60;stepEncounters(w,1/60);
 maxDrones=Math.max(maxDrones,w.attackDrones.length);shots=Math.max(shots,w.encounterShots.length);
 if(w.mothership){assert.ok(Number.isFinite(w.mothership.hp));hp=Math.min(hp,w.mothership.hp);sawCollapse||=w.mothership.phase==='collapse';}
}
assert.ok(maxDrones>0&&maxDrones<=8,'bounded attack-drone swarm');
assert.ok(shots>0&&shots<=64,'bounded telegraphed and friendly shots');
assert.ok(hp<220,'divers can damage the mothership');
assert.ok(sawCollapse,'a full squad can win');
assert.equal(w.mothership,null,'encounter finishes');
assert.equal(w.attackDrones.length,0,'no orphan drones');
assert.equal(w.ufos.length,0,'attack drones never enter the hijackable UFO pool');
const empty=make(0);empty.sharks=[];empty.triggerEvent('mothership');
for(let i=0;i<60*30;i++){empty.time+=1/60;stepEncounters(empty,1/60);}
assert.equal(empty.mothership,null,'an empty tank cannot leave an immortal boss');
const e=make(25);e.diverCap=25;
assert.equal(e.triggerEvent('eoe'),'started');
assert.equal(e.eventStatus('eoe'),'running');
assert.equal(e.triggerEvent('diver'),'blocked','new spawns wait out the sequence');
const participants=[...e.fish];let crosses=0;
for(let i=0;i<60*53;i++){e.step(1/60);crosses=Math.max(crosses,e.eoe?.converted??0);}
assert.equal(crosses,25,'the full crew becomes crosses');
assert.ok(participants.every(f=>!f.alive&&f.respawnAt===Infinity),'departures do not respawn as ordinary fish');
assert.equal(e.eoe,null,'EOE finishes and releases the event gate');
assert.ok(e.cooldownUntil.eoe>=3600,'natural event has a long cooldown');
const short=make(0);assert.equal(short.triggerEvent('eoe'),'started','EOE is independent of diver count and can occur in an empty tank');
short.setEventEnabled('mothership',false);assert.equal(short.triggerEvent('mothership'),'off');
const off=make(25);off.setEventEnabled('eoe',false);assert.equal(off.triggerEvent('eoe'),'off');
const render=make(25);render.triggerEvent('eoe');render.time=25;stepEncounters(render,1/60);
for(const saver of [false,true]){
 let marks=0;drawEoe((x,y)=>{assert.ok(Number.isFinite(x+y));marks++;},render,13,19,saver);
 assert.ok(marks>300&&marks<10000,'recognizable but bounded EOE drawing');
}
const mother=make();mother.triggerEvent('mothership');mother.time=6;stepEncounters(mother,1/60);
let marks=0;drawMothership((x,y)=>{assert.ok(Number.isFinite(x+y));marks++;},mother,13,19);
assert.ok(marks>100&&marks<10000,'bounded mother silhouette');
for(const scenarioSeed of [381,20261028,9001]){
 seed=scenarioSeed;
 const tank=make(16);tank.settings.events='busy';tank.nextEoeAt=Infinity;
 tank.triggerEvent('mothership');tank.spawnWhale(true);tank.spawnWhale(true);
 for(let i=0;i<3;i++){tank.spawnSub();tank.spawnUfo();}
 tank.spawnWhirl();tank.spawnJellies();
 for(let frame=0;frame<1200;frame++){
  tank.step(1/60);
  assert.ok(tank.attackDrones.length<=8&&tank.encounterShots.length<=64,'combined encounters stay bounded');
  if(frame%60===0){
   const actors=[...tank.fish,...tank.subs,...tank.ufos,...tank.whales,...tank.attackDrones,...tank.torpedoes];
   assert.ok(actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)),'overlapping traffic, currents and combat keep finite positions');
   assert.ok(tank.sharks.every(s=>s.nodes.every(Number.isFinite)),'shark bodies remain finite');
  }
 }
}
console.log('PASS: mothership victory/retreat, drone and shot caps, no drone hijacking, independent EOE departures/cooldown, toggles and bounded drawings');
console.log('PASS: three seeded integrated runs with mothership combat, UFOs, submarines, whales and whirlpools');
