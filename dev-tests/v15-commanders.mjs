import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({stdin:{contents:'export { World } from "./src/world"; export * from "./src/commanders"; export { startMothership } from "./src/encounters"; export { craftVelocity } from "./src/handling"; export { stepMothershipFx } from "./src/mothership-fx";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {stepMothershipFx,World,stepCommanders,stepDiverFeedback,beginCommanderHold,releaseCommander,commanderMissiles,startMothership,craftVelocity}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
let seed=1500;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function make(){const w=new World([{kind:'classic',size:.8}],10);w.resize(3000,2000,13,19);w.time=30;w.settings.events='off';w.sharks=[];w.fish=[];return w;}
function sub(w,id='a'){w.setWorkers([...w.subs.filter(s=>s.crew).map(s=>({source:s.crew,id:s.sessionId})),{source:'codex',id}]);const s=w.subs.find(s=>s.sessionId===id);Object.assign(s,{x:1000,y:1000,arrival:undefined,hitAt:-99});return s;}
function advance(w,duration,dt=.05){let remaining=duration;while(remaining>1e-8){const step=Math.min(dt,remaining);w.time+=step;stepCommanders(w,step);remaining-=step;}}
function mega(w){w.spawnMegalodon();const m=w.sharks.find(s=>s.mega);for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=1000-i*10;m.nodes[i+1]=1000;}return m;}
function diver(w,kind='scuba',x=1000,y=1080){const f={x,y,vx:0,vy:0,species:0,alarm:0,alive:true,respawnAt:Infinity,phase:0,turn:0,depth:1,millDir:1,diver:true,dkind:kind,temp:Infinity};w.fish.push(f);return f;}
{
 const w=make(),a=sub(w,'a'),b=sub(w,'b');w.setWorkers([{source:'codex',id:'a'},{source:'codex',id:'a'},{source:'codex',id:'b'}]);assert.equal(w.subs.length,2);assert.equal(a.hull,16);assert.equal(a.maxHull,16);assert.equal(b.hull,16);
 stepCommanders(w,0);assert.equal(w.fish.filter(f=>f.engineerFor===a).length,2);assert.equal(w.fish.filter(f=>f.engineerFor===b).length,2);
 w.setWorkers([{source:'codex',id:'a'}]);assert.ok(b.leaving);assert.ok(!a.leaving);w.setWorkers([{source:'codex',id:'a'},{source:'codex',id:'b'}]);assert.ok(!b.leaving);assert.equal(w.subs.length,2);
}
{
 const w=make(),s=sub(w);s.hull=8;stepCommanders(w,0);const crew=w.fish.filter(f=>f.engineerFor===s);for(const f of crew){f.docked=false;f.x=s.x;f.y=s.y+38;}
 advance(w,2.9);assert.equal(s.hull,8,'repair requires uninterrupted contact');advance(w,7.1);assert.ok(s.hull>11&&s.hull<11.6,'two engineers share a 0.5 HP/s cap');
 const hp=s.hull;s.hitAt=w.time;advance(w,2.5);assert.equal(s.hull,hp,'recent damage interrupts welding');
 s.emp={until:w.time+20,sink:0,rise:0,homeY:s.y,drift:0};advance(w,4);assert.equal(s.hull,hp,'EMP blocks repairs');s.emp=undefined;
 const lost=crew[0];lost.alive=false;s.engineerReplaceAt=w.time+1;s.safeSince=w.time;s.hitAt=-99;advance(w,7.9);assert.equal(w.fish.filter(f=>f.engineerFor===s&&f.alive).length,1);advance(w,.2);assert.equal(w.fish.filter(f=>f.engineerFor===s&&f.alive).length,2,'safe active commander replaces a lost engineer');
}
{
 const simulate=dt=>{const w=make(),s=sub(w),m=mega(w);assert.ok(beginCommanderHold(w,s,m));s.commanderHold.rate=2;s.commanderHold.until=Infinity;advance(w,3,dt);return s.hull;};assert.ok(Math.abs(simulate(.01)-simulate(.1))<1e-8,'hold damage is frame-rate independent');
 const w=make(),s=sub(w),m=mega(w);s.hull=1;beginCommanderHold(w,s,m);s.commanderHold.rate=2;s.commanderHold.until=Infinity;advance(w,3.9);assert.equal(s.hull,1,'initial grab has a rescue grace window');advance(w,.7);assert.ok(!w.subs.includes(s),'prolonged hold becomes lethal');
}
{
 const w=make(),s=sub(w),m=mega(w);beginCommanderHold(w,s,m);const offset=s.commanderHold.x;m.nodes[0]+=40;advance(w,.05);assert.ok(Math.abs((s.x-m.nodes[0])-offset)>3,'v1.5: the hull lags the grip on a spring instead of snapping to it');advance(w,.6);assert.ok(Math.abs((s.x-m.nodes[0])-offset)<19,'hold follows original impact offset');releaseCommander(w,s,true);assert.equal(s.commanderHold,undefined);assert.ok(craftVelocity(w,s),'jaw fling persists as independent craft motion');
}
{
 const w=make(),s=sub(w),m=mega(w);beginCommanderHold(w,s,m);for(let i=0;i<3;i++)diver(w);stepCommanders(w,.01);assert.equal(s.commanderHold,undefined,'combat divers cut held commander free');assert.ok(w.notices.some(n=>n.includes('cut their commander free')));
}
{
 const w=make(),a=sub(w,'a'),b=sub(w,'b');stepCommanders(w,0);advance(w,3);assert.equal(commanderMissiles(w).length,0,'no titan or ambient nuke targets');startMothership(w);const boss=w.mothership;Object.assign(boss,{phase:'battle',x:1600,y:300});
 stepCommanders(w,0);assert.equal(a.missileUsed,undefined);assert.equal(a.launchAt,w.time+2);a.emp={until:w.time+10,sink:0,rise:0,homeY:a.y,drift:0};advance(w,1);assert.equal(a.launchAt,undefined,'EMP cancels preparation without spending missile');a.emp=undefined;
 advance(w,1.1);assert.equal(commanderMissiles(w).length,1,'first ready commander launches');assert.ok(b.missileUsed);assert.ok(!a.missileUsed,'shared cooldown blocks another commander');
 const missile=commanderMissiles(w)[0];const hp=boss.hp;w.destroySub(b,'test owner destroyed');Object.assign(missile,{x:boss.x,y:boss.y,born:w.time-1});stepCommanders(w,0);assert.equal(boss.hp,hp-boss.maxHp*.25,'independent missile deals 25% maximum health');assert.equal(commanderMissiles(w).length,0);assert.ok(boss.nextShot>=w.time+5);assert.ok(w.bombs.some(b=>b.profile==='nuke'));
 advance(w,20);assert.ok(!a.missileUsed,'fleet launch cooldown remains active');
 assert.ok(b.missileReadyAt>w.time+150,'a fired missile reloads slowly');
 {const bomb=w.bombs.find(b=>b.profile==='nuke');assert.ok(bomb.style&&bomb.r>=600,'nuke footprint is large and irregular');
  const near=diver(w,'scuba',bomb.x+250,bomb.y);near.vx=0;near.vy=0;const far=diver(w,'scuba',bomb.x+900,bomb.y);const x0=near.x;bomb.born=w.time;for(let i=0;i<40;i++){w.time+=.03;stepMothershipFx(w,.03);}
  assert.ok(Math.abs(near.vx)+Math.abs(near.vy)>150,'the shockwave throws things hard');assert.equal(far.vx,0,'beyond the footprint nothing moves');}
}
{
 const w=make();for(let i=0;i<2;i++){const f=diver(w,'scuba',500+i*10,500);f.alive=false;f.deathCause='LASER FIRE';}stepDiverFeedback(w);assert.equal(w.callouts.filter(c=>c.text==='LASER FIRE x2').length,1,'nearby same-cause deaths group');assert.equal(w.notices.filter(n=>n.includes('laser fire')).length,1);stepDiverFeedback(w);assert.equal(w.notices.filter(n=>n.includes('laser fire')).length,1,'death feedback emits once');
 for(let i=0;i<6;i++){const f=diver(w,'scuba',i*400,1200);f.alive=false;f.deathCause='EXPLOSION';}stepDiverFeedback(w);assert.ok(w.callouts.filter(c=>c.small&&c.rgb==='255,165,130').length<=4,'death label cap');
 const revived=w.fish[0];revived.alive=true;stepDiverFeedback(w);assert.equal(revived.deathCause,undefined,'revival clears stale attribution');revived.alive=false;revived.deathCause='LIGHTNING';w.time+=11;stepDiverFeedback(w);assert.ok(w.notices.some(n=>n.includes('lightning')),'a revived identity can emit another death');
 const living=make();for(let i=0;i<10;i++)diver(living,'scuba',300+i*200,600);stepDiverFeedback(living);assert.ok(living.callouts.filter(c=>c.small).length<=3,'local chatter remains bounded');
}
{
 const w=make();w.settings.events='normal';stepCommanders(w,0);advance(w,350,1);assert.equal(w.fish.filter(f=>f.alive&&f.dkind==='support'&&!f.engineerFor).length,2,'natural support crew cap');
 const owner=sub(w);stepCommanders(w,0);const exposed=w.fish.find(f=>f.engineerFor===owner);exposed.docked=false;w.destroySub(owner,'test cleanup');stepCommanders(w,0);assert.equal(exposed.engineerFor,undefined,'exposed engineer is detached rather than teleported on owner destruction');assert.ok(exposed.alive);
}
{
 const w=make(),f=diver(w),m=mega(w);m.dragging=f;f.dragger=m;const random=Math.random;Math.random=()=>.1;w.endDrag(m);Math.random=random;assert.equal(f.alive,false);assert.equal(f.deathCause,'SHARK BITE','swallow attribution survives drag cleanup');stepDiverFeedback(w);assert.ok(w.callouts.some(c=>c.text==='SHARK BITE'));
 const surface=make(),departed=diver(surface);departed.alive=false;departed.deathCause='SURFACED';stepDiverFeedback(surface);assert.equal(surface.callouts.length,0,'ordinary departure is not a death');
}
console.log('PASS: v1.5 commander identity, repair, titan holds, rescues, nukes and local feedback');


