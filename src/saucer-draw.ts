import { clamp } from "./math";
import type { Put } from "./deepdraw";

/** A rounded disc with separate upper terraces, a thick rim, and a shaded underside. */
export function drawSaucerHull(put:Put,x:number,y:number,L:number,cw:number,ch:number,time:number,boss=false,piloted=false,damage=0){
  for(let py=-L*.34;py<=L*.28;py+=ch*.65)for(let px=-L;px<=L;px+=cw*.65){
    const u=px/L,v=py/L;
    const edge=Math.sqrt(Math.max(0,1-u*u));
    const upper=boss?-.19*edge:-.11*edge-.05*Math.max(0,1-(u/.65)**2)-.1*Math.max(0,1-(u/.3)**2);
    const lower=boss?.19*edge:.23*edge+.025*Math.max(0,1-(u/.22)**2);
    if(v<upper||v>lower)continue;
    const rim=Math.abs(v)<.027;
    const border=v<upper+.025||v>lower-.025||Math.abs(u)>.96;
    const radial=Math.atan2(v/.25,u);
    const panel=Math.sin(radial*18+Math.hypot(u,v*3)*20)>.82;
    const vent=v>.07&&Math.abs(Math.sin(u*24))>.87;
    const light=clamp(.9-Math.abs(u)*.25-Math.max(0,v)*1.4,0,1);
    const crack=damage>0&&Math.sin(px*.065+py*.08)>1-damage*.8;
    const glyph=crack?"+":rim?"=":border?"#":vent?"o":panel?"/":v<0?":":boss?".":"%";
    const rgb=crack?"255,205,230":rim?(piloted?"255,150,90":"125,255,175"):vent?"40,55,75":`${Math.round(100+100*light)},${Math.round(110+100*light)},${Math.round(135+100*light)}`;
    put(x+px,y+py,glyph,`rgba(${rgb},${1-damage*.65})`,true);
  }
  // Trace the silhouette explicitly: fill sampling can miss a thin border between text rows.
  if(boss){
    const color=`rgba(220,235,255,${1-damage*.65})`;
    const steps=Math.ceil(L*2/(cw*.45));
    for(let i=0;i<=steps;i++){
      const u=-1+2*i/steps,edge=Math.sqrt(Math.max(0,1-u*u));
      const upper=boss?-.19*edge:-.11*edge-.05*Math.max(0,1-(u/.65)**2)-.1*Math.max(0,1-(u/.3)**2);
      const lower=boss?.19*edge:.23*edge+.025*Math.max(0,1-(u/.22)**2);
      put(x+u*L,y+upper*L,u<-.9?"/":u>.9?"\\":"_",color,true);
      put(x+u*L,y+lower*L,u<-.9?"\\":u>.9?"/":"_",color,true);
      put(x+u*L,y,"=",`rgba(150,255,205,${1-damage*.65})`,true);
    }
  }
  // Inset command dome and a central underside emitter give the hull visible volume.
  const dome=L*.28;
  for(let px=-dome;px<=dome;px+=cw*.8){
    const top=-L*.13-Math.sqrt(Math.max(0,1-(px/dome)**2))*L*.17;
    put(x+px,y+top,Math.abs(px)>dome*.85?"/":"_",boss?"rgb(200,185,255)":"rgb(160,220,250)",true);
  }
  put(x,y+L*.18,"@",`rgba(${boss?"210,160,255":"160,255,185"},${.75+.25*Math.sin(time*2)**2})`,true);
}
