import assert from 'node:assert/strict';
process.on('uncaughtException',error=>{console.error(error.message);process.exitCode=1;});
import { build } from 'esbuild';
const result=await build({stdin:{contents:'export {World} from "./src/world"; export {AsciiRenderer} from "./src/renderer"; export {EXPLOSIONS} from "./src/explosion-profiles";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,AsciiRenderer,EXPLOSIONS}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const noop=()=>{},halos=[];
const ctx=new Proxy({createRadialGradient(){const stops=[];halos.push(stops);return {addColorStop:(at,color)=>stops.push([at,color])};}}, {get:(o,k)=>o[k]??(String(k).startsWith('create')?()=>({addColorStop:noop}):noop),set:(o,k,v)=>(o[k]=v,true)});
globalThis.document={createElement:()=>({getContext:()=>ctx})};
const r=new AsciiRenderer({style:{},getContext:()=>ctx});r.resize(1800,1200,1);
const w=new World([{kind:"classic",size:.8}],1);w.resize(1800,1200,13,19);w.time=10;
function alpha(){return Number(halos[0][0][1].match(/,([\d.]+)\)$/)[1]);}
for(const [kind,profile] of Object.entries(EXPLOSIONS)){
 w.bombs=[{x:900,y:600,born:9.8,r:profile.radius,profile:kind}];
 r.lightCount=0;r.night=0;r.yeat=0;halos.length=0;r.drawBombs(w);assert.ok(halos.length>0,`${kind} has daylight glow`);const day=alpha();
 r.lightCount=0;r.night=1;halos.length=0;r.drawBombs(w);assert.ok(alpha()>day,`${kind} brightens at night`);
 r.lightCount=0;r.night=0;r.yeat=1;halos.length=0;r.drawBombs(w);assert.ok(alpha()>day,`${kind} brightens in Yeat`);
}
for(const tier of [0,1,2]){
 r.setQuality(tier);r.lightCount=0;halos.length=0;
 for(let i=0;i<200;i++)r.lightBloom(900,600,80,'255,200,100',.2);
 assert.equal(halos.length,[72,40,24][tier],'lighting workload has a hard per-frame cap');
}
w.bolts=[{x0:400,y0:400,x1:900,y1:600,born:9.85,team:'alien'}];
for(const [night,yeat] of [[0,0],[1,0],[0,1]]){r.lightCount=0;r.night=night;r.yeat=yeat;halos.length=0;r.drawBolts(w);assert.ok(halos.length>=2,'laser muzzle and impact glow in every lighting mode');}
console.log('PASS: all blast profiles glow in day/night/Yeat, laser impact glow, and bounded lighting tiers');
