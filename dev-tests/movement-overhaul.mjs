import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:'export {World} from "./src/world";export * from "./src/mega-swim";export * from "./src/mega-motion";export * from "./src/mega-hunt";export * from "./src/tractor";export * from "./src/whirl-motion";export * from "./src/evasion";export * from "./src/kraken-reach";export * from "./src/titans";export {resolveShots} from "./src/combat";export {clipLightning} from "./src/thunderstorm";export {toastText} from "./src/lines";export {toastDuration} from "./src/toast-life";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const {World,stepMegaSpine,beginMegaWhip,megaTailFrame,createWhirl,moveWhirl,stepWhirlFish,stepWhirlFlights,tractorBottom,tractorIntake,tractorContains,evadeThreat,bodyPoints,krakenReachVisual,stepKrakenArmPoses}=api;
const original=Math.random;let seed=20261104;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const make=()=>{const w=new World([{kind:'classic',size:.8}],12);w.resize(1800,1200,13,19);w.settings.events='off';w.time=100;w.sharks=[];w.whales=[];w.fish=[];return w;};
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
try{
  {
    const w=make();w.spawnMegalodon(0);const m=w.sharks[0];m.length=250;m.speed=40;m.phase=2;
    for(let i=0;i<m.nodes.length/2;i++){m.nodes[i*2]=500-i*250/(m.nodes.length/2-1);m.nodes[i*2+1]=400;}
    const small={...m,mega:false,nodes:Float32Array.from(m.nodes)};
    const large={...m,length:900,speed:144,nodes:Float32Array.from(m.nodes,n=>n*3.6)};
    small.heading=large.heading=0;api.stepSharkSpine(small);api.stepMegaSpine(large,1/60);
    for(let i=0;i<small.nodes.length;i++)assert.ok(Math.abs(large.nodes[i]/3.6-small.nodes[i])<.001,'scaled Megalodon follows exactly the base shark path');
    for(const u of [0,.25,.5,.75,1])assert.ok(Math.abs(api.sharkSwimOffset(large,u)/3.6-api.sharkSwimOffset(small,u))<.001,'head sway and body wave are the same scaled swim');
  }
  {
    assert.ok(api.megaSwimRate(400)<2.8,'even the fastest swim has a slow tail cadence');
    const w=make();w.spawnMegalodon(0);w.spawnKraken(true,true);const m=w.sharks[0];m.heading=0;m.nodes[0]=900;m.nodes[1]=600;
    w.kraken.x=850;w.kraken.y=600;api.loseMegaTrail(m,w.time);
    for(let i=0;i<6;i++){w.time+=1;const aim=api.megaIntent(w,m,null,null,null);assert.ok(aim.x>m.nodes[0]&&Math.abs(aim.y-600)<.01,'ink recovery holds the existing course despite a nearby Kraken');}
  }
  seed=20261104;
  {
    const w=make();w.spawnMegalodon(0);const m=w.sharks[0];m.heading=0;m.turn=0;m.length=900;
    const count=m.nodes.length/2,seg=m.length/(count-1);m.nodes[0]=900;m.nodes[1]=600;
    for(let i=1;i<count;i++){const a=Math.PI+i*.045;m.nodes[i*2]=m.nodes[(i-1)*2]+Math.cos(a)*seg;m.nodes[i*2+1]=m.nodes[(i-1)*2+1]+Math.sin(a)*seg;}
    for(let frame=0;frame<600;frame++){
      m.nodes[0]+=150/60;api.stepMegaSpine(m,1/60);
      for(let i=1;i<count;i++){const a=Math.atan2(m.nodes[i*2+1]-m.nodes[(i-1)*2+1],m.nodes[i*2]-m.nodes[(i-1)*2]);assert.ok(Math.abs(delta(a,Math.PI))<1.06,'long body cannot accumulate a crescent around the head');}
    }
    const a=Math.atan2(m.nodes.at(-1)-m.nodes.at(-3),m.nodes.at(-2)-m.nodes.at(-4));assert.ok(Math.abs(delta(a,Math.PI))<.15,'body straightens after the head settles on a course');
  }
  seed=20261104;
  const paths=[];
  for(const fps of [15,30,60])for(const side of [-1,1]){
    const w=make();w.spawnMegalodon(0);const m=w.sharks[0];m.heading=0;m.speed=150;m.phase=0;
    const seg=m.length/(m.nodes.length/2-1);for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=1000-i/2*seg;m.nodes[i+1]=600;}
    stepMegaSpine(m,1/fps);beginMegaWhip(m,side);
    let previous=Float32Array.from(m.nodes),oldFin=megaTailFrame(m),peak=0;
    for(let frame=0;frame<fps*3;frame++){
      m.nodes[0]+=m.speed/fps;m.phase+=6/fps;stepMegaSpine(m,1/fps);
      const f=megaTailFrame(m),angles=[];
      for(let i=2;i<m.nodes.length;i+=2){
        assert.ok(Math.abs(Math.hypot(m.nodes[i]-m.nodes[i-2],m.nodes[i+1]-m.nodes[i-1])-seg)<.002,'whip preserves every physical segment');
        const a=Math.atan2(m.nodes[i+1]-m.nodes[i-1],m.nodes[i]-m.nodes[i-2]);angles.push(a);
        const old=Math.atan2(previous[i+1]-previous[i-1],previous[i]-previous[i-2]);
        assert.ok(Math.abs(delta(a,old))<12/fps,'whip does not snap a joint between frames');
        if(angles.length>1)assert.ok(Math.abs(delta(a,angles.at(-2)))<.115,'no spatial kink at a joint');
      }
      assert.ok(Math.abs(delta(Math.atan2(f.s,f.c),Math.atan2(oldFin.s,oldFin.c)))<12/fps,'fin moves with its stalk');
      peak=Math.max(peak,Math.abs(api.sharkSpinePoint(m,m.nodes.length/2-1).y-600));previous=Float32Array.from(m.nodes);oldFin=f;
    }
    assert.ok(peak>m.length*.035,'stroke visibly moves the tail');paths.push({fps,side,peak});
  }
  for(const side of [-1,1]){const p=paths.filter(p=>p.side===side);assert.ok(Math.max(...p.map(p=>p.peak))/Math.min(...p.map(p=>p.peak))<1.3,'tail stroke is consistent across frame rates');}

  // A nearby target cannot rotate the creature into a bite or move prey for it.
  {
    const w=make();w.spawnMegalodon(0);const m=w.sharks[0];m.heading=0;m.megaHeading=0;m.speed=120;
    for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=900-i/2*m.length/(m.nodes.length/2-1);m.nodes[i+1]=600;}
    const f={x:900,y:450,vx:0,vy:0,alive:true,diver:true};w.fish=[f];
    m.hunt={phase:'sprint',prey:{kind:'fish',fish:f},at:100,until:110,dx:0,dy:0};
    for(let i=0;i<15;i++){const h=m.heading;w.time+=1/60;w.stepSharks(1/60);assert.ok(Math.abs(delta(m.heading,h))<.025,'near prey cannot force a head swivel');}
    assert.deepEqual({x:f.x,y:f.y},{x:900,y:450},'interception never repositions prey');
  }
  // Beam origin overlap, tapered edge and mothership geometry use the capture boundary.
  {
    const w=make();w.spawnUfo();const u=w.ufos[0];Object.assign(u,{x:900,y:180,beamX:900,state:'beam',aim:{x:900,y:1100}});
    w.spawnMegalodon(0);const m=w.sharks[0];for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=900-i/2*8;m.nodes[i+1]=190;}
    assert.ok(tractorBottom(w,u)<=tractorIntake(w,u)+.1,'overlap at emitter blocks the cone');
    assert.equal(tractorContains(w,u,{x:900,y:700}),false);
    w.sharks=[];w.mothership={x:900,y:500,size:300,phase:'battle'};
    const bottom=tractorBottom(w,u);assert.ok(bottom<500&&bottom>180,'mothership stops beam');
    assert.equal(tractorContains(w,u,{x:900,y:650}),false,'capture shares the visible cutoff');
  }
  // Ordinary craft are reliably caught; the simulated arm tip physically arrives first.
  {
    const w=make();w.spawnSub();const sub=w.subs[0];Object.assign(sub,{x:900,y:600,arrival:undefined,hull:8});
    const front={x:400,y:600,alive:true},behind={x:1300,y:600,alive:true};w.fish=[front,behind];
    w.encounterShots=[{x0:100,y0:600,x1:1600,y1:600,born:w.time-1,fireAt:w.time-.01,hostile:true,resolved:false,damage:1}];
    api.resolveShots(w);assert.equal(front.alive,false,'laser burns through small fish before a hull');assert.equal(sub.hull,7);assert.equal(behind.alive,true,'solid hull protects fish behind it');
    const trace=api.clipLightning(w,[{x:900,y:-40},{x:900,y:1000}]);assert.equal(trace.target,sub);assert.ok(trace.end.y<600&&trace.end.y>500,'lightning meets the surface instead of crossing the hull');
  }
  {
    const speed=(width,height)=>{const w=make();w.resize(width,height,13,19);w.spawnMegalodon(0);const m=w.sharks[0];m.length=800;m.heading=0;m.speed=220;m.nodes[0]=width/2;m.nodes[1]=height/2;
      for(let i=0;i<90;i++){w.time+=1/30;api.megaIntent(w,m,{x:width-50,y:height/2},null,null);api.stepMegaSpeed(w,m,0,1/30,220,false);}return m.speed;};
    assert.ok(speed(450,800)<speed(3600,2400)*.85,'the same creature brakes in confined water instead of using an open-water sprint');
  }
  for(let run=0;run<8;run++){
    const w=make();w.spawnKraken(true,true);const k=w.kraken;Object.assign(k,{x:650,y:600,heading:Math.PI,state:'grab',stateAt:100,nextCatch:0,nextHunt:Infinity,until:200,megaDelay:Infinity});
    w.spawnUfo();const u=w.ufos[0];Object.assign(u,{x:650+k.size*.75,y:600,hy:600,state:'seek',hits:0});
    let held=false;
    for(let i=0;i<180;i++){w.time+=1/60;w.stepKraken(1/60);stepKrakenArmPoses(w);if(k.ufoHeld){const tip=krakenReachVisual(k,u);assert.ok(tip&&Math.hypot(tip.x-u.x,tip.y-u.y)<100,'grip requires the visible tip to arrive');held=true;break;}}
    assert.ok(held,'ordinary reachable UFO is caught reliably');
  }
  {
    const w=make();w.spawnUfo();const u=w.ufos[0];Object.assign(u,{x:900,y:600,state:'seek',hits:6,blink:{until:0,readyAt:0,nextHop:0,ghosts:[]}});
    assert.ok(evadeThreat(w,u,{x:800,y:600}));assert.ok(u.x>950,'phase reflex moves away from contact');
    assert.equal(evadeThreat(w,u,{x:800,y:600}),false,'reflex cannot repeat without a cooldown');
    const f={x:900,y:600,vx:0,vy:0,alive:true,diver:true,sande:{until:Infinity,burstUntil:0,nextHop:0,readyAt:0,dodgeReady:0,ghosts:[]}};w.fish=[f];
    assert.ok(evadeThreat(w,f,{x:800,y:600}));assert.ok(Math.hypot(f.x-900,f.y-600)>100);
  }
  {
    const w=make(),sizes=[],speeds=[],strengths=[],bins=new Set();let previous;
    for(let i=0;i<150;i++){
      const v=createWhirl(w,w.time+30,i%2===0);sizes.push(v.r);speeds.push(v.motion.speed);strengths.push(v.suction);
      assert.ok(v.motion.speed <= (i % 2 === 0 ? 38 : 24), 'drift stays below the event cap');
      bins.add(`${Math.floor(v.x/w.width*3)},${Math.floor(v.y/w.height*3)}`);
      if(previous)assert.ok(Math.hypot(v.x/w.width-previous.x/w.width,v.y/w.height-previous.y/w.height)>.15,'recent spawn regions are not immediately reused');
      previous={x:v.x,y:v.y};let travelled=0;for(let j=0;j<150;j++){const x=v.x,y=v.y;w.time+=1/30;moveWhirl(w,v,1/30);travelled+=Math.hypot(v.x-x,v.y-y);}assert.ok(travelled>35,'funnels travel visibly along their curved path');
    }
    assert.ok(Math.max(...speeds) / Math.min(...speeds) > 2, 'slow and fast drifts differ');
    assert.ok(Math.max(...strengths) / Math.min(...strengths) > 2, 'gentle and strong pulls differ');
    assert.ok(Math.max(...sizes)/Math.min(...sizes)>5,'small and large sizes are distinct');assert.equal(bins.size,9,'placement covers every tank region');
  }
  for(const fps of [15,30,60]){
    const w=make(),v=createWhirl(w,w.time+30,true);Object.assign(v,{x:900,y:600,r:150,baseR:150,born:90,suction:1.2});w.vortices=[v];
    const f={x:1040,y:600,vx:0,vy:0,alive:true,diver:true};w.fish=[f];let maxDistance=0;
    for(let i=0;i<fps*6;i++){w.time+=1/fps;stepWhirlFish(w,v,f,1/fps,true);stepWhirlFlights(w,1/fps);maxDistance=Math.max(maxDistance,Math.hypot(f.x-v.x,f.y-v.y));}
    assert.ok(f.alive&&maxDistance>v.r*1.8,`survivor is flung clear before funnel expiry (${fps} Hz, distance ${maxDistance}, alive ${f.alive})`);
  }
  for(const tone of ['boss','clash','ghost'])assert.equal(api.toastText('The Kraken HAS Awoken!',tone),'the kraken has awoken');
  {
    const w=make();w.spawnUfo();w.destroyUfo('shot',w.ufos[0]);
    assert.ok(w.debris.length>0&&w.debris.every(d=>d.life===15),'UFO hull pieces persist for 15 seconds');
    const scrap=w.mess.filter(m=>m.rgb==='130,185,200');assert.ok(scrap.length>0&&scrap.every(m=>m.life===15),'loose UFO scrap also persists for 15 seconds');
  }
  assert.equal(api.toastDuration(0,0),9000);assert.ok(api.toastDuration(0,13000)<=1000,'duplicate notifications have a finite maximum lifetime');
  console.log('PASS: continuous tail/fin at 15/30/60 Hz, natural near-target turns, physical Kraken catches, beam blockers, evasion, distributed moving vortexes and swimmer flings, lowercase and bounded toasts');
}finally{Math.random=original;}
