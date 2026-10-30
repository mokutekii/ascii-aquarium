import assert from 'node:assert/strict';
import {build} from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world";export {spaceFleet} from "./src/fleet-spacing";export {spawnCraftScrap,spawnCraftDebris,drawCraftDebris} from "./src/wreckage";export {kickCraft} from "./src/handling";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {World,spaceFleet,spawnCraftScrap,spawnCraftDebris,drawCraftDebris,kickCraft}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
let seed=2741;const random=Math.random;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const make=()=>{const w=new World([{kind:'classic',size:.8}],24);w.resize(4000,2600,13,19);w.time=20;w.sharks=[];w.fish=[];return w;};
try{
 {
  const w=make();for(let i=0;i<8;i++){w.spawnUfo(true);Object.assign(w.ufos.at(-1),{x:2000,y:1300,state:'seek',enterAt:0});}
  for(let i=0;i<4;i++){w.spawnSub(undefined,true);Object.assign(w.subs.at(-1),{x:2000,y:1300,arrival:undefined});}
  for(let frame=0;frame<1200;frame++){w.time+=1/60;spaceFleet(w,1/60);}
  const fleet=[...w.ufos,...w.subs];
  const crowded=fleet.flatMap((a,i)=>fleet.slice(i+1).filter(b=>Math.hypot((a.x-b.x)/450,(a.y-b.y)/220)<.6));
  assert.equal(crowded.length,0,'persistent cross-fleet personal space resolves a stacked patrol group');
  const u=w.ufos[0];kickCraft(w,u,300,0);const x=u.x,y=u.y;spaceFleet(w,1/60);assert.equal(u.x,x);assert.equal(u.y,y,'manual throw overrides spacing');
 }
 {
  const w=make();w.spawnUfo(true);w.spawnUfo(true);const pick={x:1200,y:1000};w.ufos[1].aim=pick;w.pickAbductionCandidate=()=>pick;
  assert.equal(w.pickAbductionTarget(),null,'UFOs reserve distinct abduction approaches');
 }
 {
  const w=make();for(let i=0;i<10;i++){spawnCraftScrap(w,i%2?'sub':'ufo',2000,1300);spawnCraftDebris(w,i%2?'sub':'ufo',2000,1300,160);}
  assert.ok(w.mess.length<=16,'a local chain reaction has a shared spark budget');assert.ok(w.debris.length<=6,'a local chain reaction has a shared chunk budget');
  assert.ok(w.mess.every(m=>m.life>=3&&m.life<=7));assert.ok(w.debris.every(d=>d.life>=3.5&&d.life<=6));
  assert.ok(new Set(w.debris.map(d=>d.part)).size>1,'fragments use varied shapes');assert.ok(new Set(w.debris.map(d=>d.angle)).size>1,'fragment orientations vary');
  const marks=[];drawCraftDebris((...args)=>marks.push(args),w,13,19);assert.ok(marks.length<90,'scrap remains sparse on the board');
  w.time+=7.1;w.stepMess(0);assert.equal(w.mess.length,0,'small craft sparks expire promptly');
 }
 console.log('PASS: ongoing mixed-fleet spacing, manual control priority, exclusive abduction goals and sparse varied short-lived wreckage');
}finally{Math.random=random;}
