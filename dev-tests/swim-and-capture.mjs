import assert from 'node:assert/strict';
import {build} from 'esbuild';
const r=await build({stdin:{contents:'export {World} from "./src/world";export {stepMegaSpine} from "./src/mega-swim";export {tractorIntake} from "./src/tractor";',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',write:false});
const {World,stepMegaSpine,tractorIntake}=await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].contents).toString('base64')}`);
const make=()=>{const w=new World([{kind:'classic',size:.8}],24);w.resize(4000,2600,13,19);w.time=20;w.sharks=[];w.fish=[];w.jellies=[];w.settings.events='off';return w;};
{
 const w=make();w.spawnMegalodon();const m=w.sharks[0];Object.assign(m,{heading:0,speed:80,phase:0,rageLevel:1,thrash:0});
 for(let i=0;i<m.nodes.length;i+=2){m.nodes[i]=2400-i/2*m.length/(m.nodes.length/2-1);m.nodes[i+1]=1300;}
 let low=Infinity,high=-Infinity;
 for(let frame=0;frame<600;frame++){
  m.nodes[0]+=80/60;m.phase+=1.7/60;stepMegaSpine(m,1/60);
  const mid=(Math.floor(m.nodes.length/4))*2;low=Math.min(low,m.nodes[mid+1]);high=Math.max(high,m.nodes[mid+1]);
  let previous=m.heading+Math.PI;
  for(let i=2;i<m.nodes.length;i+=2){
   assert.ok(Math.abs(Math.hypot(m.nodes[i]-m.nodes[i-2],m.nodes[i+1]-m.nodes[i-1])-m.length/(m.nodes.length/2-1))<.01,'swim conserves segment lengths');
   const a=Math.atan2(m.nodes[i+1]-m.nodes[i-1],m.nodes[i]-m.nodes[i-2]);assert.ok(Math.abs(Math.atan2(Math.sin(a-previous),Math.cos(a-previous)))<.121,'body cannot fold at a joint');previous=a;
  }
 }
 assert.ok(high-low>m.length*.015,'physical midbody undulates during straight enraged travel');
 m.biteTarget={fish:{alive:false,x:9999,y:9999},until:w.time+5};w.stepSharks(1/60);assert.equal(m.biteTarget,undefined,'missing prey does not leave a stale bite course');
}
const craft=w=>{w.spawnUfo(true);const u=w.ufos[0];Object.assign(u,{x:2000,y:500,hy:500,tx:2000,state:'beam',enterAt:0,beamX:2000,beamUntil:200,maxBeams:3,got:0,keep:true,escapeAt:undefined,giveUpAt:undefined,ammo:0,nextShot:Infinity,hijackChecked:true});return u;};
{
 const w=make(),u=craft(w);w.addShark('classic');const s=w.sharks[0];s.length=300;s.heading=0;s.speed=200;
 for(let i=0;i<s.nodes.length;i+=2){s.nodes[i]=2000-i*3;s.nodes[i+1]=900;}
 u.targetShark=s;u.aim={x:2000,y:900};
 for(let i=0;i<1200 && w.sharks.includes(s);i++){w.time+=1/60;w.stepUfos(1/60);w.stepSharks(1/60);}
 assert.ok(!w.sharks.includes(s),'whole shark enters the intake and is removed');assert.equal(u.targetShark,null);assert.equal(s.lifted,false);assert.equal(u.state,'leave');assert.equal(u.got,1);
}
const random=Math.random;try{Math.random=()=>.9;
 for(const kind of ['fish','diver','bomber','jelly','large-jelly']){
  const w=make(),u=craft(w);let p;
  if(kind.includes('jelly')){p={x:2000,y:900,size:kind==='large-jelly'?90:12,phase:0,drift:0,hue:.5};w.jellies=[p];}
  else {p={x:2000,y:900,alive:true,diver:kind!=='fish',dkind:kind==='bomber'?'bomber':'scuba',vx:0,vy:0,phase:0};w.fish=[p];}
  u.beamTarget=p;u.cargo=new Set([p]);u.aim={x:p.x,y:p.y};
  for(let i=0;i<1500 && (kind.includes('jelly')?w.jellies.includes(p):p.alive);i++){w.time+=1/60;w.stepUfos(1/60);}
  assert.ok(kind.includes('jelly')?!w.jellies.includes(p):!p.alive,`${kind} completes intake capture`);assert.equal(u.got,1);assert.ok(!u.cargo.has(p));
  for(let i=0;i<50 && u.state==='beam';i++){w.time+=1/60;w.stepUfos(1/60);}
  assert.equal(u.state,'leave',`${kind} leaves inside UFO instead of hanging in a green beam`);
 }
}finally{Math.random=random;}
console.log('PASS: physical Megalodon swimming, flexible bounded spine, lost-target cleanup and completed shark/fish/diver/bomber/jellyfish abductions');

{
 const w=make(),u=craft(w);const caught={x:2000,y:tractorIntake(w,u)-10,alive:true,diver:false,vx:0,vy:0},nearby={x:2000,y:800,alive:true,diver:false,vx:0,vy:0};
 w.fish=[caught,nearby];u.beamTarget=caught;u.cargo=new Set([caught]);u.aim={x:2000,y:900};w.time+=1/60;w.stepUfos(1/60);
 assert.equal(caught.alive,false);assert.equal(nearby.alive,true);assert.equal(u.state,'beam','the beam finishes every creature it has begun lifting');
 for(let i=0;i<1200 && u.state==='beam';i++){w.time+=1/60;w.stepUfos(1/60);}
 assert.equal(nearby.alive,false);assert.equal(u.got,2);assert.equal(u.state,'leave');
}
