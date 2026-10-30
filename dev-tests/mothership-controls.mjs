import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world"; export {startMothership,clickMothership,launchMothershipDrone,stepEncounters} from "./src/encounters"; export {allocateKrakenArms} from "./src/drone-arm"; export {stepReturningDrones} from "./src/drones"; export {stepMothershipRegen,stepHullCombat,stepSharkCraftContacts} from "./src/hull-combat"; export {provokeSharkCraft,sharkDroneTarget} from "./src/drones"; export {resolveShots} from "./src/combat"; export {parseAquariumCommand} from "./src/commands";',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {World,startMothership,clickMothership,launchMothershipDrone,stepEncounters,resolveShots,parseAquariumCommand,stepSharkCraftContacts,provokeSharkCraft,sharkDroneTarget,allocateKrakenArms,stepReturningDrones,stepMothershipRegen,stepHullCombat}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const make=()=>{const w=new World([{kind:'classic',size:.8}],24);w.resize(3200,2200,13,19);w.time=20;w.sharks=[];w.fish=[];startMothership(w);Object.assign(w.mothership,{phase:'battle',x:1000,y:700,size:400,nextTeleport:Infinity,nextDrone:Infinity,nextShot:Infinity});return w;};
{
 const w=make(),b=w.mothership;
 assert.equal(clickMothership(w,10,10),false);
 for(let i=0;i<12;i++)assert.equal(clickMothership(w,b.x,b.y),true);
 assert.equal(w.attackDrones.length,10);assert.equal(new Set(w.attackDrones.map(d=>d.id)).size,10);
 assert.equal(launchMothershipDrone(w,b),false);
 b.nextDrone=0;stepEncounters(w,1/60);assert.equal(w.attackDrones.length,10,'automatic launches share cap');
 w.attackDrones.pop();assert.equal(clickMothership(w,b.x,b.y),true);assert.equal(w.attackDrones.length,10);
 b.warp={at:w.time,x:1500,y:700,moved:false};assert.equal(clickMothership(w,b.x,b.y),false);
 b.warp=undefined;b.phase='collapse';assert.equal(clickMothership(w,b.x,b.y),false);
}
for(const hijacked of [false,true]){
 const w=make(),b=w.mothership;w.spawnUfo(true);const u=w.ufos.at(-1);Object.assign(u,{x:1800,y:700,hits:0});
 if(hijacked)u.pilot={alive:true,diver:true,x:u.x,y:u.y};
 w.spawnSub();const s=w.subs.at(-1);Object.assign(s,{x:2400,y:700,hull:8});
 w.encounterShots=[{x0:1450,y0:700,x1:2700,y1:700,born:19,fireAt:20,hostile:true,resolved:false,damage:1,source:b,fixedOrigin:true}];
 resolveShots(w);
 assert.equal(u.hits,hijacked?1:0,'only opposing saucers take laser damage');
 assert.equal(s.hull,hijacked?8:7,'beam continues past allied UFO to the next body');
}
for(const [input,event] of [['mothership','mothership'],['/spawn Kraken','kraken'],['event meteor','meteor'],['GHOST','leviathan'],['submarine','sub'],['SHINJISUX','eoe']])assert.equal(parseAquariumCommand(input),event);
for(const input of ['shinjisux','unknown','constructor','__proto__','event',''])assert.equal(parseAquariumCommand(input),null);
console.log('PASS: mothership clicks, shared ten-drone cap, allied laser passage, hijacked UFO damage and named commands');

for(const kind of ['classic','hammerhead','greathammer','sawshark']){
 const w=make(),b=w.mothership;w.addShark(kind);const sh=w.sharks[0];
 sh.heading=0;for(let i=0;i<sh.nodes.length;i+=2){sh.nodes[i]=1000-i*3;sh.nodes[i+1]=700;}
 const hp=b.hp;provokeSharkCraft(w,sh,b);assert.notEqual(sharkDroneTarget(w,sh),b,'small sharks never hunt the boss');
 const drone={id:1,x:1000,y:700,hp:3,stunned:0,nextShot:Infinity};w.attackDrones=[drone];
 const specialist=kind!=='classic';assert.equal(sharkDroneTarget(w,sh),specialist?drone:undefined,'only specialists hunt escorts during the boss encounter');
 stepSharkCraftContacts(w,1/60);assert.equal(b.hp,hp,'small sharks cannot damage boss hull');assert.equal(drone.hp,specialist?1:2,'specialists deal two damage; ordinary shark hits deal one');
 stepSharkCraftContacts(w,1/60);assert.equal(drone.hp,specialist?1:2,'drone strikes have a cooldown');
}
console.log('PASS: ordinary sharks spare mothership; ordinary and specialist drone damage respects cooldowns');

{
 const w=make(),b=w.mothership;b.hp=b.maxHp*.7;stepMothershipRegen(w,b,1);const hp=b.hp;
 w.time+=4.9;stepMothershipRegen(w,b,1);assert.equal(b.hp,hp,'regen waits five seconds');
 w.time+=.1;stepMothershipRegen(w,b,1);assert.ok(Math.abs(b.hp-hp-b.maxHp*.015)<1e-8,'regen restores 1.5 percent per second');
 b.hp-=1;const damaged=b.hp;stepMothershipRegen(w,b,1);assert.equal(b.hp,damaged,'damage interrupts regeneration');
 b.hp=b.maxHp*.5;w.time+=10;stepMothershipRegen(w,b,1);assert.equal(b.hp,b.maxHp*.5,'no regen at half health');
}
for(const arms of [4,8,10]){
 const w=make(),b=w.mothership;w.spawnKraken(false,true);const k=w.kraken;Object.assign(k,{x:1000,y:1000,gripArms:arms,nextGripArmAt:Infinity});
 b.grapple={kraken:k,at:w.time,nextCrush:w.time,dx:0,dy:-300,escape:'drones',escapeAt:Infinity};
 const hp=b.hp;stepHullCombat(w,1/60);assert.ok(Math.abs(hp-b.hp-b.maxHp*.005*arms)<1e-8,'hull damage scales with attached arms');
}
{
 const w=make();w.spawnKraken(false,true);const k=w.kraken;k.rageUntil=w.time+20;
 const random=Math.random;try{Math.random=()=>0;allocateKrakenArms(w,k);}finally{Math.random=random;}
 assert.ok(k.rageStretchUntil>w.time,'rage can trigger a temporary arm stretch');
 const d={id:99,x:k.x,y:k.y,hp:3,stunned:0,nextShot:Infinity,returned:{at:w.time-1.2,arm:8,action:'crush',vx:420,vy:0,startX:k.x,startY:k.y}};
 w.attackDrones=[d];stepReturningDrones(w,1/60);assert.equal(d.hp,0,'captured drone can be crushed instead of thrown');
}
console.log('PASS: faster interrupted regeneration, arm-scaled hull damage, rage stretches and drone crushing');
