// Deterministic encounter regression checks; no browser or server required.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const cache=new Map();
function load(name){
  if(cache.has(name))return cache.get(name);
  const exports={};cache.set(name,exports);
  const source=fs.readFileSync(path.join(__dirname,'src',name+'.ts'),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:n=>n==='./combat'?{queueShot(w,source,target,hostile){w.encounterShots.push({source,target,hostile,fireAt:w.time+1});},resolveShots(){}}:load(n.slice(2)),Math,Set,Infinity});
  return exports;
}
const encounter=load('encounters'),fx=load('mothership-fx'),draw=load('encounters-draw');
const diver=(x,y)=>({x,y,vx:0,vy:0,alive:true,diver:true,phase:0,alarm:0});
function world(width=1280,height=720){return {width,height,time:0,settings:{events:'off'},nextEoeAt:Infinity,
  fish:[],subs:[],sharks:[],whales:[],ufos:[],attackDrones:[],encounterShots:[],alienScrap:[],capacitorWaves:[],mothershipWreck:null,
  diverCombat:new WeakMap(),isEventEnabled:()=>true,notices:[],callout(){},splash(){},
  absorbDiverShield(){return false;},diverQuip(){},popDiver(f){f.alive=false;},destroySub(s){this.subs=this.subs.filter(x=>x!==s);}};}
// Offensive warp: one impact, even while fading back in; stunned escorts remain at their old positions.
for(const [width,height] of [[480,360],[1280,720],[2560,1440]]){
  const w=world(width,height);encounter.startMothership(w);const b=w.mothership;
  b.phase='battle';b.nextDrone=Infinity;b.nextShot=Infinity;b.nextTeleport=0;
  const f=diver(width/2,height*.5);w.fish=[f];
  w.subs=[{x:f.x,y:f.y,hull:5}];w.attackDrones=[{id:1,x:f.x,y:0,hp:3,stunned:100,nextShot:100}];
  encounter.stepEncounters(w,1/60);const warp=b.warp;assert(warp);
  f.x=warp.x;f.y=warp.y;w.subs[0].x=warp.x;w.subs[0].y=warp.y;
  w.time=1.21;encounter.stepEncounters(w,1/60);
  assert.equal(w.diverCombat.get(f).hits,1);assert.equal(w.subs[0].hull,3);
  assert.equal(w.attackDrones[0].y,0,'escorts do not teleport with the mothership');
  w.time=1.4;encounter.stepEncounters(w,1/60);assert.equal(w.subs[0].hull,3);
  b.warp=undefined;b.hp=0;b.nextTeleport=Infinity;w.time=3;encounter.stepEncounters(w,1/60);
  assert.equal(b.phase,'collapse');
  w.time=5.5;encounter.stepEncounters(w,1/60);assert(w.mothershipWreck);assert.equal(w.alienScrap.filter(s=>s.fuse===undefined).length,40);
  w.fish=[];w.subs=[];
  for(let i=0;i<1800;i++){w.time+=1/60;encounter.stepEncounters(w,1/60);}
  assert.equal(w.mothership,null);assert.equal(w.mothershipWreck,null);assert.equal(w.alienScrap.length,0);
}
// Capacitor has two mutually exclusive outcomes: salvage or delayed pressure burst.
{
  const w=world();fx.dropDrone(w,{x:500,y:300});w.time=1;const f=diver(500,325);w.fish=[f];
  fx.stepMothershipFx(w,1/60);assert(f.alienArmor);assert.equal(w.alienScrap.length,0);assert.equal(w.capacitorWaves.length,0);
  w.fish=[];fx.dropDrone(w,{x:600,y:300});w.time=5.1;fx.stepMothershipFx(w,1/60);
  assert.equal(w.capacitorWaves.length,1);assert.equal(w.alienScrap.length,0);
}
// Each pressure front kicks once; held actors stay attached.
{
  const w=world();const f=diver(520,300),held=diver(530,300);held.held=true;w.fish=[f,held];
  fx.beginWreck(w,{x:500,y:300,size:250});w.alienScrap=[];w.time=.05;fx.stepMothershipFx(w,.05);
  const vx=f.vx;assert(vx>0);assert.equal(held.x,530);
  for(let i=0;i<15;i++){w.time+=.02;fx.stepMothershipFx(w,.02);}
  assert.equal(f.vx,vx);
  w.eoe={};fx.stepMothershipFx(w,.02);assert.equal(w.mothershipWreck,null);assert.equal(w.capacitorWaves.length,0);
}
// A fully faded ship emits no hull glyphs; all drawing coordinates remain finite.
{
  const w=world();encounter.startMothership(w);const b=w.mothership;b.phase='battle';b.x=640;b.y=200;
  let opaque=0;const put=(x,y,g,c)=>{assert(Number.isFinite(x)&&Number.isFinite(y));if(!c.endsWith(',0)'))opaque++;};
  draw.drawMothership(put,w,10,18);assert(opaque>0);
  opaque=0;b.warp={at:0,x:640,y:300,moved:true};w.time=1.2;draw.drawMothership(put,w,10,18);assert.equal(opaque,0);
}
console.log('PASS: attack teleports, collision damage, drone clearance, collapse, salvage, capacitors, pressure fronts, cleanup and fade rendering.');

