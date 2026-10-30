import assert from 'node:assert/strict';
import {build} from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world"; export * from "./src/thunderstorm"; export * from "./src/encounters"; export * from "./src/mothership-fx"; export * from "./src/rim-wave"; export {AsciiRenderer} from "./src/renderer"; export {drawMothership} from "./src/encounters-draw"; export * from "./src/commands";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,fryAt,strikeLightning,stepThunderstorms,stepEmp,startMothership,beginWreck,stepMothershipFx,stepRimMotion,AsciiRenderer,drawMothership,parseAquariumCommand}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
let seed=8484;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const make=()=>{const w=new World([{kind:'classic',size:.8}],30);w.resize(3000,2100,13,19);w.time=100;w.settings.events='off';w.fish=[];w.sharks=[];return w;};
const ufo=(w,x,y=600)=>{w.spawnUfo(true);const u=w.ufos.at(-1);Object.assign(u,{x,y,hy:y,state:'seek',enterAt:0,nextShot:Infinity,ammo:0});return u;};
const sub=(w,x,y=600)=>{w.spawnSub(undefined,true);const s=w.subs.at(-1);Object.assign(s,{x,y,arrival:undefined,hull:8});return s;};
const steps=(w,n)=>{for(let i=0;i<n;i++){w.time+=.05;stepThunderstorms(w,.05);}};
{
 const w=make(),a=ufo(w,700),s=sub(w,1000);w.addShark('classic');const shark=w.sharks[0],nodes=[...shark.nodes];
 strikeLightning(w,a);steps(w,15);
 assert.equal(a.hits,2);assert.equal(s.hull,6);assert.ok(a.emp&&s.emp);assert.deepEqual([...shark.nodes],nodes,'lightning never targets or displaces sharks');
 const y=a.y;stepEmp(w,a,.5);assert.ok(a.y>y,'unpowered UFO sinks');
 w.time=Math.max(a.emp.until,s.emp.until)+.1;
 for(let i=0;i<500 && a.emp;i++){w.time+=.05;stepEmp(w,a,.05);}
 assert.equal(a.emp,undefined);assert.ok(Math.abs(a.y-600)<6,'craft climbs back at its individual recovery speed');
}
{
 const w=make(),a=ufo(w,700),s=sub(w,950);a.hits=6;strikeLightning(w,a);steps(w,15);
 assert.ok(!w.ufos.includes(a));assert.equal(s.hull,8,'destroying a craft opens the circuit and stops the chain');assert.equal(w.lightningBolts.length<=1,true);
}
{
 const w=make(),a=ufo(w,500),s=sub(w,1400),j={x:900,y:600,size:15,phase:0,drift:0,hue:.5};w.jellies=[j];
 strikeLightning(w,a);steps(w,15);
 assert.equal(s.hull,6,'jellyfish conducts across a gap larger than a normal hop');assert.ok(j.chargedUntil>w.time);assert.ok(w.lightningBolts.some(b=>b.conduit));
}
{
 const w=make(),a=ufo(w,900);const diver={x:900,y:610,alive:true,diver:true,dkind:'scuba',vx:0,vy:0,phase:0,alienArmor:true};
 w.fish=[diver,...Array.from({length:12},(_,i)=>({x:880+i*3,y:640,alive:true,vx:0,vy:0,diver:false,phase:0}))];
 strikeLightning(w,a);steps(w,9);
 assert.equal(diver.alive,false,'lightning kills divers even wearing conductive alien armor');assert.ok(w.fish.every(f=>!f.alive));assert.equal(w.lightningBones.length,1);assert.ok(w.notices.some(n=>/lightning|skeleton|sky|odds|thunder/.test(n)));
}
{
 const w=make();startMothership(w);const b=w.mothership;Object.assign(b,{phase:'battle',x:1600,y:600,hp:1000,maxHp:1000});strikeLightning(w,b);
 assert.ok(b.cruise && b.lightningEvadeAt>w.time,'mothership reacts to a threatening ion surge');steps(w,9);assert.equal(b.hp,940);assert.ok(b.emp);
 assert.equal(parseAquariumCommand('thunderstorm'),'storm');assert.equal(parseAquariumCommand('lightning'),'storm');
 assert.equal(w.triggerEvent('storm'),'started');assert.equal(w.triggerEvent('storm'),'already');assert.equal(w.thunderstorms.length,1);w.setEventEnabled('storm',false);assert.equal(w.triggerEvent('storm'),'off');
}
{
 const w=make();startMothership(w);const b=w.mothership;Object.assign(b,{phase:'battle',x:900,y:700});w.spawnMegalodon();w.spawnKraken(true);const m=w.sharks.find(s=>s.mega),k=w.kraken;
 for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=1300-i*10;m.nodes[i+1]=700;}
 Object.assign(k,{x:1400,y:1000,state:'wrap',wrapping:m,maul:true,biteAt:w.time});const mx=m.nodes[0],kx=k.x,ky=k.y;
 beginWreck(w,b);
 for(let i=0;i<90;i++){w.time+=1/30;stepMothershipFx(w,1/30);stepRimMotion(w,1/30);}
 assert.ok(m.nodes[0]>mx+10,'Megalodon recoils from a dying mothership');assert.ok(Math.hypot(k.x-kx,k.y-ky)>10,'Kraken recoils even if attached when the core blows');assert.equal(k.wrapping,null);
}
{
 const noop=()=>{};const ctx=new Proxy({}, {get:(o,k)=>o[k]??(String(k).startsWith('create')?()=>({addColorStop:noop}):noop),set:(o,k,v)=>(o[k]=v,true)});
 globalThis.document={createElement:()=>({getContext:()=>ctx})};const renderer=new AsciiRenderer({style:{},getContext:()=>ctx});renderer.resize(3000,2100,1);
 const w=make(),a=ufo(w,900);strikeLightning(w,a);steps(w,9);const points=[];renderer.painter=()=>({put:(...args)=>points.push(args),flush:noop});
 renderer.night=0;renderer.yeat=0;renderer.drawStormElectricity(w);const day=points.length;points.length=0;
 renderer.night=1;renderer.drawStormElectricity(w);assert.ok(points.length>day,'night adds sparking branches and particles');
 renderer.yeat=1;renderer.drawStormElectricity(w);assert.ok(points.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])));
 startMothership(w);Object.assign(w.mothership,{phase:'battle',x:1500,y:500});let base=0,yeat=0;drawMothership(()=>base++,w,13,19);w.yeatStart=w.time-10;w.yeatUntil=w.time+100;drawMothership(()=>yeat++,w,13,19);assert.ok(yeat>base,'Yeat draws extra reactor rings on the mothership');
}
{
 const w=make();w.setWorkers(true,true);assert.equal(w.subs.filter(s=>s.crew).length,2);
 assert.ok(w.notices.some(n=>n.startsWith('claude crew reporting')));assert.ok(w.notices.some(n=>n.startsWith('codex crew reporting')));
 const count=w.notices.length;w.setWorkers(true,true);assert.equal(w.notices.length,count,'polling does not repeat arrivals');
 w.setWorkers(false,false);assert.ok(w.subs.every(s=>s.leaving));assert.ok(w.mess.some(m=>m.glyph==='$'));
 w.setWorkers(true,true);assert.ok(w.subs.every(s=>!s.leaving),'returning activity reuses the departing crew submarine');
}
{
 const w=make(),a=ufo(w,900);w.addShark('classic');const small=w.sharks[0];for(let i=0;i<small.nodes.length;i+=2){small.nodes[i]=1000-i*3;small.nodes[i+1]=700;}
 w.spawnMegalodon();const mega=w.sharks.find(s=>s.mega);for(let i=0;i<mega.nodes.length;i+=2){mega.nodes[i]=1100-i*5;mega.nodes[i+1]=700;}
 w.spawnKraken(true);const k=w.kraken;Object.assign(k,{x:1000,y:900});w.spawnWhale(true);const whale=w.whales[0];Object.assign(whale,{x:1000,y:750,heading:0,spine:undefined});
 w.spawnLeviathan();const ghost=JSON.stringify(w.leviathan);strikeLightning(w,a);steps(w,9);
 assert.ok(small.blastFlee?.until>w.time);assert.ok(whale.fleeing);assert.ok(w.megaRage(mega)>0&&w.krakenRage()>0);assert.ok(w.time-mega.hitAt<.4&&w.time-k.hitAt<.4);assert.equal(JSON.stringify(w.leviathan),ghost,'Ghost ignores lightning entirely');
 w.time=Math.max(mega.rageUntil,k.rageUntil)+.01;assert.equal(w.megaRage(mega),0);assert.equal(w.krakenRage(),0);
}
for(const lethal of [false,true]){
 const w=make(),a={id:1,x:900,y:600,hp:lethal?1:3,stunned:0,nextShot:Infinity},b={id:2,x:1200,y:600,hp:3,stunned:0,nextShot:Infinity};w.attackDrones=[a,b];
 strikeLightning(w,a);steps(w,15);
 if(lethal){assert.equal(a.hp,0);assert.equal(b.hp,3,'a popped drone breaks the lightning circuit');}else{assert.equal(a.hp,1);assert.equal(b.hp,1);assert.ok(a.emp&&b.emp,'nearby drones conduct and lose power');}
}
console.log('PASS: lightning chains, circuit breaks, jelly conduits, EMP sinking/recovery, lethal bone strikes, mothership recoil/damage, titan blast recoil, commands and day/night/Yeat sparks');

{
 const w=make();assert.equal(parseAquariumCommand('smite'),'smite');assert.equal(parseAquariumCommand('/strike'),'smite');
 assert.equal(w.triggerEvent('smite'),'started');assert.equal(w.thunderstorms.length,0,'manual strikes do not require a storm');
 assert.ok(w.lightningBolts.length+w.lightningChains.length>0);assert.ok(w.notices.some(n=>/smite|conduct|divine|delivery|grounded/.test(n)));
}
{
 const w=make();w.jellies=Array.from({length:12},(_,i)=>({x:400+i*100,y:600,size:15,phase:0,drift:0,hue:.5}));
 strikeLightning(w,w.jellies[0]);steps(w,50);
 assert.equal(w.jellies.filter(j=>j.chargedUntil>w.time).length,12,'dense jelly clusters sustain a super chain beyond nine hops');
 assert.equal(w.lightningChains.length,0,'super chains terminate without revisiting conductors');
 const durations=[];for(let i=0;i<30;i++){strikeLightning(w,w.jellies[0]);steps(w,7);durations.push(...w.lightningBolts.map(b=>b.duration));}
 assert.ok(Math.min(...durations)<.4&&Math.max(...durations)>.9,'strikes vary between quick flashes and lingering bolts');
}
console.log('PASS: manual smite, quips, dense jelly super chains and varied flash duration');

{
 const w=make();const j={x:900,y:600,size:15,phase:0,drift:0,hue:.5,zapTarget:{x:9000,y:600}};w.jellies=[j];
 strikeLightning(w,j);steps(w,7);assert.equal(j.zapTarget,undefined,'storm charging clears stale yellow sting targets');
 w.jellies=[];w.lightningBolts=[];w.lightningBones=[{x:800,y:600,born:w.time,angle:0}];
 const positions=[];let scale;
 AsciiRenderer.prototype.drawStormElectricity.call({night:0,yeat:0,quality:0,cw:13,ch:19,painter:()=>({put:()=>{},flush:()=>{}}),hullPainter:(x,y,s)=>{scale=s;return {put:(x,y)=>positions.push({x,y}),flush:()=>{}};}},w);
 assert.equal(scale,.75,'bones use the same glyph scale as live divers');
 assert.ok(Math.max(...positions.map(p=>p.y))-Math.min(...positions.map(p=>p.y))<40,'skeleton stays within diver-sized proportions');
}
console.log('PASS: diver-sized zap bones and no stale yellow lightning');

{
 const w=make(),a=ufo(w,900),b=sub(w,960),outside=ufo(w,1150);
 const d={id:100,x:850,y:600,hp:3,stunned:0,nextShot:Infinity};w.attackDrones=[d];
 const j={x:900,y:600,size:15,phase:0,drift:0,hue:.5,chargedUntil:w.time+10};w.jellies=[j];
 w.encounterShots=[{source:a,fireAt:w.time+1}];
 stepThunderstorms(w,.05);
 assert.ok(a.emp&&b.emp&&d.emp,'one radial pulse disables every craft inside the small radius');
 assert.equal(outside.emp,undefined,'craft outside the pulse stays powered');
 assert.ok(a.emp.until>w.time&&a.emp.until<=w.time+2,'pulse outage lasts one to two seconds');
 assert.equal(a.hits??0,0);assert.equal(b.hull,8);assert.equal(d.hp,3,'EMP does no hull damage');
 assert.equal(w.encounterShots.length,0,'pulse cancels pending weapon fire');
 assert.equal(w.lightningChains.length,0,'EMP aura does not create damaging chains');
 assert.ok(j.chargedUntil>w.time,'pulse does not consume the remaining charge');
 const at=j.empPulseAt;w.time+=1;stepThunderstorms(w,.05);assert.equal(j.empPulseAt,at,'pulse cooldown prevents permanent continuous EMP');
 w.time+=1.6;stepThunderstorms(w,.05);assert.ok(j.empPulseAt>at,'charged jelly pulses again');
}
{
 const w=make(),f={x:900,y:600,alive:true,diver:true,dkind:'scuba',vx:0,vy:0,phase:0};w.fish=[f];w.popDiver(f,'blast',false);
 assert.ok(w.mess.length>0&&w.mess.every(m=>m.diverScrap),'diver debris keeps its own size marker');
 w.blasts=[];let count=0,scale;
 AsciiRenderer.prototype.drawMess.call({cw:13,ch:19,painter:()=>({put:()=>{throw new Error('diver debris used full-size world glyphs');},flush:()=>{}}),hullPainter:(x,y,s)=>{scale=s;return{put:()=>count++,flush:()=>{}};}},w);
 assert.equal(count,w.mess.length);assert.equal(scale,.75,'scrap glyphs match the live diver glyph scale');
}
console.log('PASS: radial damage-free jelly EMP, cooldown, weapon interruption and proportional diver scrap');

{
 const w=make(),f={x:900,y:600,alive:true,diver:true,dkind:'scuba',vx:0,vy:0,phase:0,alienArmor:true,shieldUntil:w.time+20};w.fish=[f];
 fryAt(w,900,600,70,'jelly');assert.equal(f.alive,false,'direct charged sting bypasses alien armor and its shield window');
 assert.equal(w.lightningBones.length,1);
}

{
 const w=make();w.mess=[];w.lightningBones=[];w.blasts=[{x:800,y:600,born:w.time-.4,diverPop:true}];
 const points=[];let scale;
 AsciiRenderer.prototype.drawMess.call({cw:13,ch:19,painter:()=>({put:()=>{throw new Error('diver flash used world glyphs');},flush:()=>{}}),hullPainter:(x,y,s)=>{scale=s;return{put:(x,y)=>points.push({x,y}),flush:()=>{}};}},w);
 assert.equal(scale,.75);assert.ok(points.every(p=>Math.hypot(p.x-800,p.y-600)<20),'pop flash expands at diver scale');
}
