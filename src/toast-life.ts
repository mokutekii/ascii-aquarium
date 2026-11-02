const timers=new WeakMap<HTMLElement,ReturnType<typeof setTimeout>>();
export const toastDuration=(born:number,now:number)=>Math.max(250,Math.min(9000,14000-(now-born)));
/** A repeat may extend its hold, but never renew an announcement indefinitely. */
export function expireToast(el:HTMLElement,lives:WeakMap<HTMLElement,Animation>){
  const now=performance.now();el.dataset.born??=String(now);
  const duration=toastDuration(Number(el.dataset.born),now);
  lives.get(el)?.cancel();clearTimeout(timers.get(el));
  try{
    const life=el.animate([{opacity:1},{opacity:1,offset:.55},{opacity:0}],{duration,fill:"forwards"});
    life.onfinish=()=>el.remove();lives.set(el,life);
  }catch{
    el.style.transition="opacity 1s ease-out";
    setTimeout(()=>{el.style.opacity="0";},Math.max(0,duration-1000));
  }
  timers.set(el,setTimeout(()=>el.remove(),duration+50));
}
