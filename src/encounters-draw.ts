import { drawSaucerHull } from "./saucer-draw";
import { clamp, TAU } from "./math";
import type { World } from "./world";
import type { Put } from "./deepdraw";

export function drawMothership(put: Put, w: World, cw: number, ch: number) {
  const boss = w.mothership;
  if (!boss) return;
  const t = w.time, L = boss.size;
  const dying = boss.phase === "collapse" ? clamp((t - boss.phaseAt) / 5, 0, 1) : 0;
  const alpha = 1 - dying * 0.8;
  drawSaucerHull(put,boss.x,boss.y,L*.95,cw,ch,t,true,false,dying);
  const core = 0.65 + 0.35 * Math.sin(t * 2) ** 2;
  put(boss.x,boss.y,"@",`rgba(210,150,255,${core})`,true);
  for (let i = 0; i < 9; i++) {
    const x = boss.x + (i - 4) * L * 0.13;
    put(x,boss.y+L*0.12,(Math.floor(t*3)+i)%3 ? "o" : "*", "rgb(120,255,170)",true);
  }
  for (const drone of w.attackDrones) {
    const color = drone.stunned > t ? "255,245,190" : "150,255,185";
    for (const [row,line] of [" /-\\ ","<=o=>"," \\-/ "].entries()) for (let i=0;i<line.length;i++) {
      if (line[i] !== " ") put(drone.x+(i-2)*cw,drone.y+(row-1)*ch,line[i],`rgb(${color})`,true);
    }
  }
  for (const shot of w.encounterShots) {
    const warning = shot.hostile && t < shot.fireAt;
    const age = t - shot.fireAt;
    const alpha = warning ? 0.2 + 0.15*Math.sin(t*4)**2 : Math.max(0,1-age/0.4);
    const color = shot.flash ? "255,250,210" : shot.hostile ? "255,90,135" : "130,255,235";
    if(shot.flash){
      if(!warning)for(let i=0;i<8;i++){
        const a=i/8*TAU,r=cw*(1.5+Math.max(0,age)*8);
        put(shot.x0+Math.cos(a)*r,shot.y0+Math.sin(a)*r,i%2?"+":"*",`rgba(255,250,210,${alpha})`,true);
      }
      continue;
    }
    const length = Math.hypot(shot.x1-shot.x0,shot.y1-shot.y0);
    const n = Math.min(150,Math.ceil(length/cw));
    for (let i=0;i<=n;i++) {
      if (warning && i%3) continue;
      const u = i/Math.max(1,n);
      put(shot.x0+(shot.x1-shot.x0)*u,shot.y0+(shot.y1-shot.y0)*u,warning ? "." : "*",`rgba(${color},${alpha})`,true);
    }
    if (warning) put(shot.x1,shot.y1,"+","rgb(255,135,155)",true);
    if(!warning&&shot.flash)put(shot.x0,shot.y0,"*","rgb(255,255,225)",true);
  }
  for (const f of w.fish) {
    if (!f.alive || !f.diver || !w.diverCombat.has(f)) continue;
    const rgb = f.dkind === "tech" ? "100,235,255" : f.dkind === "photo" ? "255,250,210" : f.dkind === "bomber" ? "255,170,80" : "160,255,195";
    const phase = t * 1.8 + f.phase;
    for (let i=0;i<4;i++) {
      const a = phase + i*TAU/4;
      put(f.x+Math.cos(a)*cw*2.5,f.y+Math.sin(a)*ch*2.5,".",`rgba(${rgb},0.65)`);
    }
  }
}

// Abstract horned silhouette from the supplied references, in normalized coordinates.
const ANGEL = [[-.62,-.56],[-.52,-.96],[-.40,-1],[-.32,-.48],[-.12,-.58],[.10,-.62],[.18,-1],[.30,-1.08],[.40,-.55],[.60,-.40],[.56,-.28],[.84,-.22],[.98,-.10],[.85,.02],[.64,.02],[.62,.24],[.50,.38],[.40,.34],[.44,.10],[.30,.01],[.23,.22],[.27,.46],[.50,.88],[.60,1],[-.56,1],[-.42,.60],[-.15,.35],[-.25,.25],[-.44,.60],[-.56,.66],[-.76,.60],[-.80,.44],[-.62,.30],[-.60,.03],[-.88,-.08],[-.92,-.22],[-.80,-.42]];
function inside(x:number,y:number) {
  let hit = false;
  for (let i=0,j=ANGEL.length-1;i<ANGEL.length;j=i++) {
    const a=ANGEL[i],b=ANGEL[j];
    if ((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
  }
  return hit;
}

export function drawEoe(put:Put,w:World,cw:number,ch:number,saver:boolean) {
  const event=w.eoe;
  if (!event) return;
  const age=w.time-event.born;
  const fade=clamp(Math.min(age/6,(52-age)/9),0,1);
  const cx=w.width/2,cy=w.height*0.46;
  const sy=w.height*0.38,sx=Math.min(w.width*0.22,sy*0.72);
  const wings=clamp((age-7)/9,0,1);
  const line=(ax:number,ay:number,bx:number,by:number,color:string,glyph="=")=>{
    const count=Math.min(130,Math.ceil(Math.hypot(bx-ax,by-ay)/cw));
    for(let i=0;i<=count;i++){const u=i/Math.max(1,count);put(ax+(bx-ax)*u,ay+(by-ay)*u,glyph,color,true);}
  };
  // Feather-like rays unfurl from the shoulders, with branching, asymmetric tips.
  const pairs=saver?5:9;
  for(let i=0;i<pairs;i++) for(const side of [-1,1]) {
    const u=i/Math.max(1,pairs-1);
    const reach=w.width*(0.25+0.2*Math.sin(u*Math.PI))*wings;
    const baseY=cy-sy*0.2+u*sy*0.35;
    const tipX=cx+side*reach,tipY=cy-sy*(1.1-u*1.5)+Math.sin(age*0.3+i)*sy*0.018;
    const color=`rgba(${age>23?"255,165,100":"255,220,245"},${fade*(0.5+0.4*wings)})`;
    line(cx+side*sx*0.3,baseY,tipX,tipY,color);
    line(cx+side*reach*0.65,baseY+(tipY-baseY)*0.65,tipX-side*reach*0.1,tipY-sy*0.15,color,"/");
  }
  if(age<10){
  for(let y=-1.08;y<=1;y+=ch/sy) for(let x=-1;x<=1;x+=cw/sx) {
    if(!inside(x,y))continue;
    const eye=(Math.hypot(x+.25,y+.50)<.035)||(Math.hypot(x+.12,y+.51)<.035);
    const core=Math.hypot(x+.03,(y-.05)*0.8)<.13;
    if(eye||core) {put(cx+x*sx,cy+y*sy,"@",`rgba(90,45,80,${fade})`,true);continue;}
    const edge=!inside(x+cw/sx,y)||!inside(x,y+ch/sy);
    put(cx+x*sx,cy+y*sy,edge?"#":":",`rgba(${edge?"255,245,250":"225,185,220"},${fade*(edge?.95:.5)})`,true);
  }
  }else{
    // Rei/Lilith's human face replaces the early horned omen during Instrumentality.
    const hx=cx,hy=cy-sy*.38,rx=sx*.55,ry=sy*.48;
    for(let y=-ry;y<=ry;y+=ch)for(let x=-rx;x<=rx;x+=cw){
      const face=(x/rx)**2+(y/ry)**2;
      if(face>1)continue;
      const hair=y<-ry*.45||Math.abs(x)>rx*.82;
      const eyes=Math.abs(y+ry*.03)<ch*.7&&Math.abs(Math.abs(x)-rx*.35)<cw*1.3;
      const mouth=Math.abs(y-ry*.45)<ch*.5&&Math.abs(x)<rx*.18;
      put(hx+x,hy+y,eyes?"-":mouth?"_":hair?"/":":",`rgba(${eyes||mouth?"120,65,95":hair?"215,225,245":"255,220,235"},${fade*.85})`,true);
    }
    for(let row=0;row<Math.ceil(sy*.85/ch);row++){
      const y=cy+row*ch,half=sx*(.26+row*ch/sy*.23);
      for(let x=-half;x<=half;x+=cw)put(cx+x,y,Math.abs(x)>half-cw?"|":":",`rgba(245,205,225,${fade*.65})`,true);
    }
    for(const side of [-1,1]){
      line(cx+side*sx*.27,cy, cx+side*sx*.95,cy+sy*.15,`rgba(255,230,240,${fade*.85})`,"=");
      line(cx+side*sx*.95,cy+sy*.15,cx+side*sx*1.08,cy-sy*.1,`rgba(255,230,240,${fade*.85})`,"|");
    }
  }
  const moonX=cx,moonY=w.height*.22,moonR=Math.min(w.width,w.height)*.095;
  if(age>11){
    for(let a=0;a<TAU;a+=.07)put(moonX+Math.cos(a)*moonR,moonY+Math.sin(a)*moonR,"o",`rgba(150,80,105,${fade})`,true);
    for(let y=-moonR;y<=moonR;y+=ch)for(let x=-moonR;x<=moonR;x+=cw)if(x*x+y*y<moonR*moonR)put(moonX+x,moonY+y,"#","rgb(8,1,8)",true);
  }
  if(age>=17)for(const soul of event.souls){
    const alpha=clamp(Math.min((age-17)/2,(52-age)/8),0,1);
    if(age<40){
      put(soul.ox,soul.oy,"+",`rgba(175,255,190,${alpha*.7})`,true);
      put(soul.ox,soul.oy-ch,"|",`rgba(175,255,190,${alpha*.7})`,true);
      put(soul.x,soul.y,"o",`rgba(255,85,105,${alpha})`,true);
    }else{
      const distance=(age-39)*Math.min(w.width,w.height)*.04;
      put(moonX+Math.cos(soul.phase)*distance,moonY+Math.sin(soul.phase)*distance,".",`rgba(255,215,220,${alpha})`,true);
    }
  }
  // The halo grows into a horizon; cross departures are staggered across the crew.
  const radius=Math.min(w.width,w.height)*(0.1+0.36*wings);
  const samples=saver?56:110;
  for(let i=0;i<samples;i++) {
    const a=i/samples*TAU;
    put(cx+Math.cos(a)*radius,cy-sy*.8+Math.sin(a)*radius*.2,".",`rgba(255,210,190,${fade*.8})`,true);
  }
  for(const cross of event.crosses) {
    if(!cross.converted)continue;
    const a=clamp(Math.min((w.time-cross.turnAt)/.8,(52-age)/8),0,1);
    const color=`rgba(185,255,205,${a})`;
    for(let row=-5;row<=2;row++)put(cross.x,cross.y+row*ch,"|",color,true);
    for(let col=-2;col<=2;col++)put(cross.x+col*cw,cross.y-ch*3,col===0?"+":"-",color,true);
  }
}
