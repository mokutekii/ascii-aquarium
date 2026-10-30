import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
process.on('uncaughtException', error => { console.error(error.message); process.exitCode=1; });
const bundle=await build({stdin:{contents:'export { World } from "./src/world"; export * from "./src/encounters"; export * from "./src/encounters-draw";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,stepEncounters,drawMothership,drawEoe,mergerCrossFrame}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
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
 w.step(1/60);
 maxDrones=Math.max(maxDrones,w.attackDrones.length);shots=Math.max(shots,w.encounterShots.length);
 if(w.mothership){assert.ok(Number.isFinite(w.mothership.hp));hp=Math.min(hp,w.mothership.hp);sawCollapse||=w.mothership.phase==='collapse';}
}
assert.ok(maxDrones>0&&maxDrones<=8,'bounded attack-drone swarm');
assert.ok(shots>0&&shots<=64,'bounded telegraphed and friendly shots');
assert.ok(hp<280,'divers can damage the mothership');
assert.ok(sawCollapse||!w.mothership,'a lightly opposed mothership can survive and withdraw');
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
const participants=[...e.fish],expectedCrosses=e.eoe.crosses.length;let crosses=0;
for(let i=0;i<60*53;i++){e.step(1/60);crosses=Math.max(crosses,e.eoe?.converted??0);}
assert.equal(crosses,expectedCrosses,'every living actor becomes a cross');
assert.ok(crosses>25,'sharks join the divers');
assert.ok(participants.every(f=>!f.alive&&f.respawnAt===Infinity),'departures do not respawn as ordinary fish');
assert.equal(e.eoe,null,'EOE finishes and releases the event gate');
assert.ok(e.cooldownUntil.eoe>=3600,'natural event has a long cooldown');
assert.equal(e.triggerEvent('eoe'),'blocked','the easter egg runs only once per app run');
const short=make(0);assert.equal(short.triggerEvent('eoe'),'started','EOE is independent of diver count and can occur in an empty tank');
short.setEventEnabled('mothership',false);assert.equal(short.triggerEvent('mothership'),'off');
const off=make(25);off.setEventEnabled('eoe',false);assert.equal(off.triggerEvent('eoe'),'off');
const render=make(25);render.triggerEvent('eoe');render.time=25;stepEncounters(render,1/60);render.time+=1;
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

// Every actor class leaves a cross at the actual merger location, including late arrivals.
const all=make(8);
all.triggerEvent('mothership');all.spawnWhale(true);all.spawnJellies();all.spawnUfo();all.spawnSub();
all.kraken={x:700,y:300,caught:[],grabbed:[]};all.leviathan={x:850,y:350};
all.attackDrones=[{id:1,x:900,y:500,hp:3,stunned:0,nextShot:0}];
all.mothership.y=200;for(const u of all.ufos)u.y=220;
const expected=[...all.fish,...all.sharks,...all.whales,...all.jellies,...all.ufos,...all.subs,...all.attackDrones,all.kraken,all.leviathan,all.mothership];
assert.equal(all.triggerEvent('eoe'),'started');
assert.equal(all.eoe.crosses.length,expected.length);
assert(expected.every(a=>all.eoe.seen.has(a)));
const chosen=all.eoe.crosses.find(c=>c.actor===all.fish[0]);
all.fish[0].x=537;all.fish[0].y=419;
all.time=25;stepEncounters(all,1/60);
assert.equal(chosen.sourceX,537);assert.equal(chosen.sourceY,419);assert(chosen.converted);
const assigned={x:chosen.x,y:chosen.y};
// Offscreen arrivals must move into the visible water before they can merge.
for(let i=0;i<240;i++)all.step(1/60);
assert.equal(all.eoe.converted,expected.length);
assert.equal(all.kraken,null);assert.equal(all.leviathan,null);assert.equal(all.mothership,null);
assert.equal(all.attackDrones.length+all.subs.length+all.whales.length+all.jellies.length+all.ufos.length+all.sharks.length,0);
assert.equal(chosen.x,assigned.x);assert.equal(chosen.y,assigned.y);
assert.equal(all.spawnSub('codex'),false,'activity cannot introduce unmerged craft');
console.log('PASS: all life categories merge, crosses retain actual locations, and EOE cannot replay.');

// The ending flair appears once before the ordinary return-of-life line.
const ending=make(8);ending.triggerEvent('eoe');ending.notices=[];
ending.time=47;stepEncounters(ending,1/60);stepEncounters(ending,1/60);
assert.deepEqual(ending.notices,['Congratulations...']);
ending.time=52;stepEncounters(ending,1/60);
assert.deepEqual(ending.notices,['Congratulations...','individual lives return to the sea...']);
// A natural trigger is deliberately far rarer than ordinary encounters.
const random=Math.random;
for(const [roll,starts] of [[.0002,false],[.00005,true]]){
 const rare=make(0);rare.settings.events='normal';rare.nextEoeAt=0;
 Math.random=()=>roll;stepEncounters(rare,1/60);Math.random=random;
 assert.equal(!!rare.eoe,starts);
}
const scattered=make(400);scattered.triggerEvent('eoe');
const times=scattered.eoe.crosses.map(c=>c.turnAt-scattered.eoe.born);
assert(times.every(t=>t>=4&&t<=24));
assert(times.filter(t=>t>=19).length>times.filter(t=>t<9).length*2,'random selection accelerates');
assert(new Set(times.map(t=>t.toFixed(4))).size>300,'individual selections are independently staggered');
console.log('PASS: very rare natural trigger, accelerating random capture, and one ending flair before restoration.');

const tremor=make(8);tremor.triggerEvent('eoe');tremor.time=25;stepEncounters(tremor,1/60);
const cross=tremor.eoe.crosses[0],anchor={x:cross.x,y:cross.y};
let first;
for(let i=0;i<120;i++){
 tremor.time=25+i/60;const frame=mergerCrossFrame(tremor,cross,0,13,19);
 assert(Math.abs(frame.dx)<=13*.168+1e-8&&Math.abs(frame.dy)<=19*.035+1e-8,'sub-cell vibration remains restrained');
 if(i===0)first=frame.dx;else if(i===119)assert.notEqual(first,frame.dx);
 assert.equal(cross.x,anchor.x);assert.equal(cross.y,anchor.y);
 const still=mergerCrossFrame(tremor,cross,0,13,19,false);assert.equal(still.dx,0);assert.equal(still.dy,0);
}
console.log('PASS: bounded animated cross tremor, fixed merger anchors, and reduced-motion stillness.');

// No life can be selected above the rising LCL; survivors continue swimming.
const moving=make(30);moving.triggerEvent('eoe');
for(const c of moving.eoe.crosses)c.turnAt=0;
moving.fish[0].x=600;moving.fish[0].y=100;
const survivor=moving.fish[0],before={x:survivor.x,y:survivor.y};
for(let i=0;i<120;i++)moving.step(1/60);
assert(survivor.alive,'above-water life is ineligible');
assert(Math.hypot(survivor.x-before.x,survivor.y-before.y)>10,'survivors are not frozen');
assert.equal(moving.eoe.converted,0,'low LCL cannot select actors in the upper sea');
for(let i=0;i<60*27;i++){
 moving.step(1/60);
 const surface=moving.height*(1-Math.min(1,(moving.time-moving.eoe.born)/20));
 for(const c of moving.eoe.crosses)if(c.converted){assert(c.y>=surface);assert(c.sourceY>=moving.height*(1-Math.min(1,(c.turnAt-moving.eoe.born)/20)));}
}
const positions=moving.eoe.crosses.filter(c=>c.converted).map(c=>c.x.toFixed(3)+','+c.y.toFixed(3));
assert.equal(new Set(positions).size,positions.length,'crowded life reserves distinct cross positions');
assert.equal(moving.eoe.converted,moving.eoe.crosses.length,'every survivor eventually converts');
console.log('PASS: moving survivors, LCL-only selection, spaced crosses, and complete capture.');
