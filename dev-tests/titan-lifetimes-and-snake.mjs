import assert from 'node:assert/strict';
import {build} from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world"; export {stepGhostSwim,ghostFrame,ghostHalfWidth} from "./src/leviathan"; export {startMothership,stepEncounters} from "./src/encounters";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {World,stepGhostSwim,ghostFrame,ghostHalfWidth,startMothership}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
let seed=991;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function make(){const w=new World([{kind:'classic',size:.8}],24);w.resize(3000,2100,13,19);w.time=100;w.settings.events='off';w.sharks=[];w.fish=[];return w;}
const times={mega:[],kraken:[],mothership:[]};
for(let i=0;i<30;i++){
 const w=make();w.spawnMegalodon();w.spawnKraken(true);startMothership(w);
 times.mega.push(w.sharks[0].until-w.time);times.kraken.push(w.kraken.until-w.time);times.mothership.push(w.mothership.until-w.time);
}
for(const [kind,values] of Object.entries(times)){const max=kind==='mega'?180:300;assert.ok(values.every(t=>t<=max&&t>=100));assert.ok(new Set(values).size>25,'lifetimes are sampled per arrival');}
{
 const w=make();w.spawnMegalodon();const m=w.sharks[0];m.until=w.time-.1;m.rageUntil=w.time+100;w.step(1/60);assert.ok(m.retreat,'Megalodon timer overrides rage');
 w.spawnKraken(true);const k=w.kraken;k.until=w.time-.1;k.rageUntil=w.time+100;w.stepKraken(1/60);assert.equal(k.state,'flee','Kraken timer overrides rage');
}
for(const state of ['drift','charge']){
 const w=make();w.spawnLeviathan();const lv=w.leviathan;lv.state=state;lv.speed=state==='charge'?250:48;
 for(let frame=0;frame<7200;frame++){
  const old=lv.heading;stepGhostSwim(lv,lv.heading+1,1/60);
  assert.ok(Math.abs(lv.heading-old)<=lv.speed/(lv.length*.38)/60+1e-9,'turn radius scales with body length and speed');
  if(frame%20===0)for(let u=.22;u<.98;u+=.04){const p=ghostFrame(lv,u);assert.ok(Math.hypot(lv.x-p.x,lv.y-p.y)>ghostHalfWidth(lv.length,u)+lv.length*.045,'head stays outside its trunk');}
 }
 assert.ok(lv.trail.length<10000,'head path remains bounded');
}
console.log('PASS: randomized titan lifetime ceilings, rage expiry, snake following and head/body clearance');
