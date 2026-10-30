import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r = await build({stdin:{contents:'export {World} from "./src/world"; export {startMothership,launchMothershipDrone,MOTHERSHIP_DRONE_CAP} from "./src/encounters"; export {stepBattles} from "./src/battle";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,startMothership,launchMothershipDrone,MOTHERSHIP_DRONE_CAP,stepBattles}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
let seed=943;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const w=new World([{kind:'classic',size:.8}],24);w.resize(3000,2100,13,19);w.time=100;w.settings.events='off';w.fish=[];w.sharks=[];
startMothership(w);const b=w.mothership;Object.assign(b,{phase:'battle',x:1500,y:600});
for(let i=0;i<16;i++)assert.ok(launchMothershipDrone(w,b));assert.equal(w.attackDrones.length,MOTHERSHIP_DRONE_CAP);assert.equal(launchMothershipDrone(w,b),false);
w.fish=Array.from({length:24},(_,i)=>({x:1300+i*10,y:900,alive:true,diver:true,dkind:'scuba',vx:0,vy:0,phase:0}));
stepBattles(w,1/60);for(const f of w.fish)f.alive=false;
w.setEventEnabled('sub',false);w.time+=10;stepBattles(w,1/60);
assert.ok(w.diverQueue.length>0,'casualties open squad slots and trigger replacement divers');
console.log('PASS: sixteen-drone wing, population cap and diver casualty reinforcements');

function response(drones) {
 const w=new World([{kind:'classic',size:.8}],24);w.resize(3000,2100,13,19);w.time=100;w.settings.events='off';w.fish=[];w.sharks=[];
 startMothership(w);Object.assign(w.mothership,{phase:'battle',x:1500,y:600});
 for(let i=0;i<drones;i++)launchMothershipDrone(w,w.mothership);
 w.fish=Array.from({length:24},(_,i)=>({x:1300+i*10,y:900,alive:true,diver:true,dkind:'scuba',vx:0,vy:0,phase:0}));
 stepBattles(w,1/60);return {w,count:w.fish.filter(f=>w.diverCombat.has(f)).length};
}
const small=response(0),large=response(16);assert.ok(large.count>small.count*3,'defender force scales with active drone count');
let armed=0;for(let i=0;i<1000;i++)if(['tech','scuba','scooter','bomber'].includes(large.w.pickDiverKind()))armed++;
assert.ok(armed>900,'mothership arrivals strongly favor armed divers');
console.log('PASS: proportional defenders and attacker-biased arrivals');
