import assert from 'node:assert/strict';import {build} from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world";export * from "./src/thunderstorm";export * from "./src/battle";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});const {World,strikeLightning,sampleLightningStrike,stepThunderstorms,fireUfoBattle,attackProfile}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
let seed=932;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const make=()=>{const w=new World([{kind:'classic',size:.8}],20);w.resize(3000,2100,13,19);w.time=100;w.settings.events='off';w.sharks=[];w.fish=[];return w;};
const add=(w,x=1500,y=300)=>{w.spawnUfo(true);const u=w.ufos.at(-1);Object.assign(u,{x,y,hy:y,state:'seek',enterAt:0,ammo:0,nextShot:Infinity,hijackChecked:true});return u;};
{
 const w=make();for(let i=0;i<8;i++)add(w,200+i*250);w.startInvasion();const inv=w.invasion;assert.equal(inv.spawned,8);assert.ok(inv.total>8);const total=inv.total;
 const u=add(w);assert.equal(inv.total,total+1);assert.equal(inv.spawned,9);assert.equal(inv.members.size,9);
 w.resolveInvasionUfo(u,'killed');w.resolveInvasionUfo(u,'escaped');assert.equal(inv.killed,1);assert.equal(inv.escaped,0,'a UFO resolves once');w.ufos=w.ufos.filter(x=>x!==u);
 for(const x of [...w.ufos])w.destroyUfo('blasted',x,undefined,true);
 let guard=0;while(w.invasion&&guard++<100){w.time+=12;w.stepInvasion();assert.ok(inv.killed+inv.escaped<=inv.total);assert.ok(inv.spawned<=inv.total);for(const x of [...w.ufos])w.destroyUfo('blasted',x,undefined,true);}
 assert.equal(w.invasion,null);assert.equal(inv.spawned,inv.total);assert.equal(inv.killed+inv.escaped,inv.total);
}
{
 const w=make(),a=add(w);w.startInvasion();const inv=w.invasion;Object.assign(a,{state:'leave',x:100,y:-200,ammo:0});w.stepUfos(1/60);assert.equal(inv.escaped,1);w.resolveInvasionUfo(a,'escaped');assert.equal(inv.escaped,1);
}
const lift=invading=>{const w=make(),u=add(w);const f={x:1500,y:700,alive:true,diver:false,vx:0,vy:0,phase:0};w.fish=[f];if(invading)w.startInvasion();Object.assign(u,{state:'beam',beamX:1500,aim:{x:1500,y:700},beamTarget:f,cargo:new Set([f]),beamUntil:200,escapeAt:undefined,giveUpAt:undefined,ammo:0,nextShot:Infinity});const y=f.y;w.stepUfos(1/60);return y-f.y;};
assert.ok(lift(true)>lift(false)*1.25,'invasion beams pull faster than ordinary visits');
{
 const w=make(),u=add(w);w.spawnSub(undefined,true);Object.assign(w.subs[0],{x:1700,y:800,arrival:undefined});assert.equal(fireUfoBattle(w,u),false,'ordinary saucer does not open an invasion gunfight');w.startInvasion();attackProfile(w,u).nextShot=0;fireUfoBattle(w,u);assert.ok(w.encounterShots.length>0,'invasion saucers fire without a mothership or hijacked opponent');
 u.ammo=2;u.invasionBombAt=0;u.nextShot=0;w.ufoFire(u);assert.ok(u.ammo<2,'bomb runs are not starved by the invasion laser cadence');
}
{
 const w=make();for(let i=0;i<18;i++)add(w,200+(i%6)*500,350+Math.floor(i/6)*600);
 let water=0,target=0;for(let i=0;i<3000;i++){const s=sampleLightningStrike(w);if(s.target)target++;else water++;}
 assert.ok(water>2400&&target>10,`water remains the majority with mild attraction (${water}/${water+target})`);
 strikeLightning(w,w.ufos[0]);for(let i=0;i<8;i++){w.time+=.05;stepThunderstorms(w,.05);}
 const b=w.lightningBolts[0];assert.ok(b.branches.length>=4);
 const direct=Math.hypot(b.points.at(-1).x-b.points[0].x,b.points.at(-1).y-b.points[0].y);let length=0;for(let i=1;i<b.points.length;i++)length+=Math.hypot(b.points[i].x-b.points[i-1].x,b.points[i].y-b.points[i-1].y);
 assert.ok(length>direct*1.12,'lightning is kinked at multiple scales rather than a decorated straight segment');
}
console.log('PASS: invasion enrollment and one-time resolution, bounded progress, faster abductions, independent guns/bombs, random-water lightning and branching geometry');
