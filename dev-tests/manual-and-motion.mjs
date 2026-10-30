import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: 'export {World} from "./src/world"; export * from "./src/handling"; export * from "./src/hull-combat"; export * from "./src/encounters"; export * from "./src/kraken-reach"; export * from "./src/provocation"; export * from "./src/mega-swim";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const {World,kickCraft,stepHandling,startMothership,stepMegaSpine,krakenArmRoot,inKrakenReachArc,provoke,stepProvocations}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
let seed=1729; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const make=()=>{const w=new World([{kind:'classic',size:.8}],120);w.resize(3000,2100,13,19);w.time=30;w.settings.events='off';w.sharks=[];return w;};
{
 const w=make();
 assert.equal(w.triggerEvent('whirl'),'started');
 for(let i=0;i<12;i++)assert.equal(w.triggerEvent('whirl'),'already');
 assert.equal(w.whirlpools.length,1);
 assert.equal(w.triggerEvent('whale'),'started');assert.equal(w.triggerEvent('whale'),'started');
 for(let i=0;i<6;i++)assert.equal(w.triggerEvent('whale'),'already');assert.equal(w.whales.length,2);
 for(let i=0;i<150;i++)assert.equal(w.triggerEvent('diver'),'started');
 assert.ok(w.diverQueue.length>120,'manual divers bypass the ambient cap');
 for(const kind of ['fight','bait','meteor','maelstrom','migration','bloom','moon']){assert.equal(w.triggerEvent(kind),'started');assert.equal(w.triggerEvent(kind),'already');}
 assert.equal(w.fights.length,1);assert.equal(w.baitBalls.length,1);
 assert.equal(w.sagas.filter(s=>s.kind==='meteor').length,1);
 assert.ok(w.vortices.length>=2);

 for(let i=0;i<180;i++)w.step(1/60);
 assert.ok(w.whirlpools.length===1);assert.ok(w.whales.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.y)));
}
{
 const w=make();w.spawnKraken(true);w.spawnMegalodon();const k=w.kraken,m=w.sharks.find(s=>s.mega);
 Object.assign(k,{x:1500,y:1050,heading:0,state:'wrap',stateAt:w.time,wrapping:m,maul:true,biteAt:undefined,coiled:true,lunging:false,nextShake:Infinity});
 for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=k.x-k.size*.8-i*10;m.nodes[i+1]=k.y;}
 const start=k.x;let minStep=Infinity;
 for(let i=0;i<90;i++){const x=k.x,y=k.y;w.time+=1/60;w.stepKraken(1/60);minStep=Math.min(minStep,Math.hypot(k.x-x,k.y-y));assert.equal(k.biteAt,undefined);}
 assert.ok(minStep>.2&&k.x>start+50,'prey keeps jetting during closing in');
 for(const angle of [-Math.PI,-2,-1,0,1,2,Math.PI]){const target={x:k.x+Math.cos(angle)*500,y:k.y+Math.sin(angle)*500};const root=krakenArmRoot(k,target);assert.ok(Math.hypot(root.x-k.x,root.y-k.y)<k.size*.1);}
 assert.equal(inKrakenReachArc(k,{x:k.x+500,y:k.y}),false,'front 90 degree blind sector remains');
}
for(const threat of ['mothership','mega','kraken']){
 const w=make();w.spawnWhale(true);const wh=w.whales[0];Object.assign(wh,{x:1600,y:1050,heading:0,traveled:wh.length*2,spine:undefined});
 const center=w.whaleMid(wh);
 if(threat==='mothership'){startMothership(w);Object.assign(w.mothership,{x:center.x,y:center.y-400,phase:'battle'});}
 if(threat==='mega'){w.spawnMegalodon();const m=w.sharks[0];for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=center.x+i;m.nodes[i+1]=center.y-300;}}
 if(threat==='kraken'){w.spawnKraken(true);Object.assign(w.kraken,{x:center.x,y:center.y-400,heading:0,state:'grab'});}
 w.time+=1/60;w.stepCritters(1/60);assert.ok(wh.fleeing,`whale flees ${threat}`);assert.ok(Math.sin(wh.fleeHeading)>.5);
}
{
 const w=make();startMothership(w);const b=w.mothership;Object.assign(b,{phase:'battle',x:w.width-20,y:500});kickCraft(w,b,600,0);stepHandling(w,.1);assert.ok(b.x>w.width,'mothership knockback crosses the viewport without a wall bounce');
 w.spawnMegalodon();const m=w.sharks.find(s=>s.mega);m.born=0;m.heading=0;m.megaHeading=0;m.speed=100;m.hullHunt=true;
 for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=w.width-150-i*10;m.nodes[i+1]=600;}
 const turns=[];for(let i=0;i<1800;i++){w.time+=1/60;w.stepSharks(1/60);turns.push(m.megaTurn??0);}
 assert.ok(m.nodes[0]<w.width-300,'Megalodon arcs into open water after an edge approach');
 const active=turns.filter(v=>Math.abs(v)>.02);let changes=0;for(let i=1;i<active.length;i++)if(Math.sign(active[i])!==Math.sign(active[i-1]))changes++;
 assert.ok(changes<5,`boundary turn stays committed (${changes} reversals)`);
}
console.log('PASS: stackable creatures, capped events, freely moving Kraken pursuit, rooted 270-degree reach, whale fear and smooth offscreen mothership impacts');
