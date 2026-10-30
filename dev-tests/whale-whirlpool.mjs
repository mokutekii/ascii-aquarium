import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ stdin: { contents: 'export { World } from "./src/world"; export { separateTraffic } from "./src/collisions";', resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false });
const { World, separateTraffic } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
const make = () => { const w = new World([{ kind: 'classic', size: .8 }], 24); w.resize(1800,1200,13,19); w.settings.events='off'; w.sharks=[]; return w; };
{
 const w=make(); w.spawnWhale(true); const wh=w.whales[0];
 for(let i=0;i<=20;i++) { const p=w.whalePoint(wh,i/20); assert.ok(p.x < -wh.length*.1 || p.x > w.width+wh.length*.1, 'entire whale starts outside'); }
 const x=wh.x; w.time+=1/60; w.stepCritters(1/60);
 assert.ok(Math.abs(wh.x-x)<1, 'entry advances at swimming pace');
 Object.assign(wh,{x:900,y:600,traveled:10000,spine:undefined});
 w.time+=1/60; w.stepCritters(1/60); assert.ok(w.whales.includes(wh),'travel counter never removes a visible whale');
 w.spawnWhale(true); const other=w.whales[1]; Object.assign(other,{x:920,y:600,heading:wh.heading,spine:undefined});
 const before=w.whales.map(a=>({x:a.x,y:a.y}));
 w.time+=1/60; w.stepCritters(1/60); separateTraffic(w,1/60);
 w.whales.forEach((a,i)=>assert.ok(Math.hypot(a.x-before[i].x,a.y-before[i].y)<2,'overlap never teleports a whale'));
 Object.assign(wh,{fleeing:true,fleeHeading:wh.heading+Math.PI}); const heading=wh.heading;
 w.time+=1/60; w.stepCritters(1/60); assert.ok(Math.abs(wh.heading-heading)<=.28/60+1e-8,'fleeing follows a broad arc');
}
{
 const w=make(); w.time=5; const wp={x:900,y:600,r:150,born:0,until:30,dir:1,rippleAt:5,spin:1,suction:1};
 const f=w.fish[0]; w.fish=[f]; Object.assign(f,{x:975,y:600,alive:true,vx:100,vy:0});
 const distance=()=>Math.hypot(f.x-wp.x,f.y-wp.y);
 for(let i=0;i<60;i++) { f.x+=100/60; w.pullWhirlObjects(wp,1/60); }
 assert.ok(distance()<75,'inner current overcomes outward swimming');
 const measure=(suction,spin)=>{Object.assign(f,{x:975,y:600});w.pullWhirlObjects({...wp,suction,spin},1/60);return {d:distance(),angle:Math.atan2(f.y-600,f.x-900)};};
 assert.ok(measure(1.8,1).d<measure(.7,1).d,'stronger suction pulls harder');
 assert.ok(measure(1,2).angle>measure(1,.5).angle,'spin varies independently');
 const sizes=[],speeds=[]; for(let i=0;i<20;i++){w.whirl=null;w.spawnWhirl();sizes.push(w.whirl.r);speeds.push(w.whirl.spin);}
 assert.ok(Math.max(...sizes)>Math.min(...sizes)*1.5); assert.ok(Math.max(...speeds)>Math.min(...speeds)*1.5);
}
console.log('PASS: offscreen whale entry, continuous movement and exit, broad turns, inward current and varying whirlpools');
