import assert from 'node:assert/strict';import {build} from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world"; export * from "./src/mothership-fx";export * from "./src/encounters";export * from "./src/craft-blast";export * from "./src/spawn-keys";export * from "./src/lines";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,stepMothershipFx,startMothership,stepEncounters,damageCraftInBlast,SpawnKeyRepeater,bossPresence,isBoss,isGhost,SHARK_ARRIVALS,pickLine}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const make=()=>{const w=new World([{kind:'classic',size:.8}],20);w.resize(3000,2100,13,19);w.time=100;w.settings.events='off';w.fish=[];w.sharks=[];return w;};
{
 const w=make();assert.equal(w.meteorHitsSomething({x:500,y:500}),false,'empty water is not a collision');
 w.spawnSub(undefined,true);const s=w.subs[0];Object.assign(s,{x:900,y:600,arrival:undefined});assert.equal(w.meteorHitsSomething({x:900,y:600}),true,'a point already inside a hull is a hit');assert.equal(w.meteorHitsSomething({x:900,y:680,px:900,py:500}),true,'a fast rock cannot tunnel through a sub');
 w.subs=[];w.spawnWhale(true);const wh=w.whales[0];Object.assign(wh,{x:1500,y:1000,heading:0,spine:undefined});const p=w.whalePoint(wh,.5);assert.ok(w.meteorHitsSomething(p),'whale body catches rocks');
 w.whales=[];w.jellies=[{x:900,y:600,size:15,phase:0,drift:0,hue:0}];assert.ok(w.meteorHitsSomething({x:900,y:600}));
 w.jellies=[];w.spawnKraken(true);Object.assign(w.kraken,{x:1400,y:1000,heading:0});assert.ok(w.meteorHitsSomething({x:1400+w.kraken.size*.6,y:1000}));
}
{
 const w=make();startMothership(w);const b=w.mothership;Object.assign(b,{phase:'battle',x:900,y:600,size:150,maxHp:1000,hp:1000,nextTeleport:w.time+1,nextShot:w.time,warp:{at:w.time,x:1200,y:700,moved:false},spin:{at:w.time,turns:2,hit:new Set()}});
 assert.ok(w.meteorHitsSomething({x:900,y:600}),'mothership hull intercepts a rock');
 const bomb={x:900,y:650,r:450,meteor:true,style:{seed:0,aspect:.7,fronts:2,rate:1,roughness:0}};
 w.encounterShots.push({source:b,fireAt:w.time+1});damageCraftInBlast(w,bomb);assert.equal(b.hp,940);assert.equal(b.emp,undefined,'meteor recoil is not an EMP outage');assert.equal(b.warp,undefined);assert.equal(b.spin,undefined);assert.ok(b.nextShot>w.time);assert.equal(w.encounterShots.length,0);
 damageCraftInBlast(w,bomb);assert.equal(b.hp,940,'one meteor damages once');
 const far={x:900,y:1100,r:300,meteor:true,style:bomb.style};damageCraftInBlast(w,far);assert.equal(b.hp,940,'a craft beyond the visible compressed vertical footprint is spared');
 b.hp=50;damageCraftInBlast(w,{...bomb});assert.ok(b.hp<=0);stepEncounters(w,1/60);assert.equal(b.phase,'collapse','a lethal rock starts the normal reactor collapse');
}
{
 const w=make();w.triggerEvent('meteor');assert.equal(w.triggerEvent('meteor'),'already');assert.equal(w.sagas.length,1);for(const s of w.sagas)s.nextEventAt=Infinity;
 w.meteors=[{x:900,y:100,vx:0,vy:600,ty:1800,born:w.time}];w.stepSaga(.1);assert.equal(w.meteors[0].y,160,'overlapping showers integrate a rock only once');
 w.mess=[{x:1100,y:600,vx:0,vy:0,born:w.time,glyph:'#',rgb:'255,255,255'}];w.meteorImpact(900,600);w.time+=.7;stepMothershipFx(w,.7);assert.ok(w.mess[0].vx>0,'meteor fronts move loose fragments');
}
{
 const keys=new SpawnKeyRepeater();for(const key of ['h','d','u','x']){assert.ok(keys.accept(key,false,0));assert.equal(keys.accept(key,true,100),false);assert.ok(keys.accept(key,true,250));keys.release(key);assert.ok(keys.accept(key,false,260));}
 for(const key of ['q','z','k','m','t','c','v','e','s','g','p','o','n','y','i']){assert.ok(keys.accept(key,false,0));assert.equal(keys.accept(key,true,1000),false,'events never fire from a held key');}
 for(const kind of ['kraken','mega','mothership','saga','leviathan']){const lines=Array.from({length:4},()=>bossPresence(kind));assert.equal(new Set(lines).size,4);assert.ok(lines.every(s=>kind==='leviathan'?isGhost(s):isBoss(s)));}
 for(const lines of Object.values(SHARK_ARRIVALS))assert.equal(new Set(Array.from({length:4},()=>pickLine(lines))).size,4);
}
console.log('PASS: full-body and swept meteor hits, one-time hull damage, recoil interruptions, lethal core collapse, matching shock footprints, debris pressure, independent showers, held creature keys and ominous boss pools');
