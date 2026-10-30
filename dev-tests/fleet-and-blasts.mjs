import assert from 'node:assert/strict';
import {build} from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world"; export {damageCraftInBlast} from "./src/craft-blast"; export {escortDrone,stepDroneImpacts} from "./src/drones"; export {stepSharkCraftContacts} from "./src/hull-combat"; export {kickCraft,craftVelocity} from "./src/handling"; export {queueShot,resolveShots} from "./src/combat";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {World,damageCraftInBlast,escortDrone,stepDroneImpacts,stepSharkCraftContacts,kickCraft,craftVelocity,queueShot,resolveShots}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const make=()=>{const w=new World([{kind:'classic',size:.8}],24);w.resize(6000,4000,13,19);w.time=20;w.sharks=[];w.fish=[];return w;};
const shark=(w,kind='classic')=>{w.addShark(kind);const s=w.sharks.at(-1);s.length=200;s.heading=0;for(let i=0;i<s.nodes.length;i+=2){s.nodes[i]=1400-i*3;s.nodes[i+1]=1000;}return s;};
const drone=w=>{const d={id:0,x:1500,y:1000,hp:3,stunned:0,nextShot:Infinity};w.attackDrones.push(d);return d;};
{
 const w=make();for(let i=0;i<20;i++){w.spawnUfo(true);w.spawnSub(undefined,true);}
 for(const fleet of [w.ufos,w.subs]){
  const edges=new Set(fleet.map(c=>c.x<0?'left':c.x>w.width?'right':c.y<0?'top':'bottom'));
  assert.equal(edges.size,4,'each craft type can arrive from every edge');
 }
 const slots=[...w.ufos.map(u=>u.enterAt),...w.subs.map(s=>s.arrival.at)].sort((a,b)=>a-b);
 for(let i=1;i<slots.length;i++)assert.ok(slots[i]-slots[i-1]>=.55-1e-8,'shared arrival spacing prevents simultaneous spawn piles');
 const pending=w.subs[1],x=pending.x,y=pending.y;w.stepDeep(1/60);assert.equal(pending.x,x);assert.equal(pending.y,y);
}
for(const kind of ['classic','hammerhead','sawshark']){
 const w=make(),s=shark(w,kind),d=drone(w);d.x=s.nodes[0];
 stepSharkCraftContacts(w,1/60);assert.equal(d.hp,kind==='classic'?2:1);
 stepDroneImpacts(w);assert.equal(d.detonated,undefined,'shark collision does not auto-detonate drone');
 stepSharkCraftContacts(w,1/60);assert.equal(d.hp,kind==='classic'?2:1,'overlap is not a new hit each frame');
 w.time+=1.3;stepSharkCraftContacts(w,1/60);assert.equal(d.hp,kind==='classic'?1:0);
 if(kind==='classic'){w.time+=1.3;stepSharkCraftContacts(w,1/60);assert.equal(d.hp,0,'three ordinary hits kill drone');}
}
{
 const w=make(),d=drone(w);const f={alive:true,diver:true,dkind:'tech',x:1000,y:1000,vx:0,vy:0};w.fish.push(f);
 for(let i=0;i<3;i++){queueShot(w,f,d,false);w.time+=.2;resolveShots(w);assert.equal(d.hp,2-i,'three lasers kill drone');}
}
{
 const w=make(),d=drone(w);shark(w);const b={x:500,y:200,size:200};
 escortDrone(w,b,d,2200,1000,1/60);const first=d.y-1000;assert.ok(d.x>1500);
 d.x=1500;d.y=1000;w.time+=.2;escortDrone(w,b,d,2200,1000,1/60);assert.ok((d.y-1000)*first<0,'nearby shark produces a zigzag dodge');
 kickCraft(w,d,300,0);const x=d.x,y=d.y;escortDrone(w,b,d,2200,1000,1/60);assert.equal(d.x,x);assert.equal(d.y,y,'thrown drones cannot steer themselves');
}
{
 const w=make();w.spawnSub(undefined,true);w.spawnUfo(true);const s=w.subs[0],u=w.ufos[0],d=drone(w);Object.assign(s,{x:1000,y:1000,hull:8,arrival:undefined});Object.assign(u,{x:1100,y:1000,hits:0});d.x=1000;
 const blast={x:1000,y:1000,r:200};damageCraftInBlast(w,blast);assert.equal(s.hull,4);assert.equal(u.hits,4);assert.equal(d.hp,0);assert.ok(craftVelocity(w,u).vx>0,'survivors receive outward knockback');
 damageCraftInBlast(w,blast);assert.equal(s.hull,4);assert.equal(u.hits,4,'one explosion cannot hit twice');
 damageCraftInBlast(w,{...blast});assert.equal(w.subs.length,0);assert.equal(w.ufos.length,0,'two explosions destroy full-health craft');
}
{
 const w=make();for(let i=0;i<3;i++){w.spawnSub(undefined,true);Object.assign(w.subs.at(-1),{x:1000+i*250,y:1000,hull:3,arrival:undefined});}
 const [a,b,c]=w.subs;w.destroySub(a,'test');w.time+=.26;w.stepUfoBlasts();assert.ok(!w.subs.includes(b));assert.ok(w.subs.includes(c),'chain reaction waits between explosions');
 w.time+=.26;w.stepUfoBlasts();assert.ok(!w.subs.includes(c),'a destroyed craft propagates the chain');
}
console.log('PASS: four-edge staggered entries, three-hit drones, specialist damage, zigzag evasion, manual throw control, four-damage blasts and delayed craft chain reactions');
