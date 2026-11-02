import { evadeThreat, safeEvasionPoint } from "./evasion";
import type { World } from "./world";
import type { Fish } from "./types";
import { rand } from "./math";

export interface Sande {
  until: number;
  /** While in the future the diver is running at sandevistan speed and bends time around itself. */
  burstUntil: number;
  nextHop: number;
  /** Next scheduled idle burst. */
  readyAt: number;
  /** The reflex that dodges lethal events recharges between uses. */
  dodgeReady: number;
  sfxAt?: number;
  ghosts: { x: number; y: number; at: number; ang: number }[];
}
export interface DriveItem { x: number; y: number; born: number }

const SFX = ["*zzzt*", "*vrrrm*", "*zip*", "*blip*", "*fzzzt*", "*whum*"];
export const SANDE_GHOST_LIFE = .55;
const DRIVE_LIFE = 15, MAX_ELITE = 2;

export function dropDrive(w: World, x: number, y: number) {
  w.drives.push({ x, y, born: w.time });
  w.notices.push("a sandevistan drive tumbles out of the wreck...");
}

export const isSande = (f: Fish, time: number) => !!f.sande && f.sande.until > time;

function hop(w: World, f: Fish, toward?: { x: number; y: number }) {
  const s = f.sande!;
  s.ghosts.push({ x: f.x, y: f.y, at: w.time, ang: Math.atan2(f.vy, f.vx || 1) });
  if (w.time - (s.sfxAt ?? -9) > .5) {
    s.sfxAt = w.time;
    const sfx = SFX[Math.floor(Math.random() * SFX.length)];
    w.whisper(f.x, f.y - 30, sfx, "130,255,200");
  }
  if (s.ghosts.length > 12) s.ghosts.shift();
  const a = rand(0, Math.PI * 2), d = rand(70, 190);
  // Jink through unoccupied water instead of orbiting through a nearby hull.
  const safe=safeEvasionPoint(w,f,toward??{x:f.x-Math.cos(a)*20,y:f.y-Math.sin(a)*20},d);
  if(!safe)return; f.x=safe.x;f.y=safe.y;
  f.vx *= .3; f.vy *= .3;
  delete f.stunUntil;
}

/** True when the drive's reflex saved the diver from a killing event. */
export function sandeDodge(w: World, f: Fish) {
  return evadeThreat(w,f,{x:f.x-(f.vx||40),y:f.y-(f.vy||40)});
}

function free(w: World, f: Fish) {
  if (f.dragger) { f.dragger.dragging = undefined; delete f.dragger; }
  if (f.seized) { delete f.seized; if (w.kraken) w.kraken.caught = w.kraken.caught.filter(o => o !== f); }
  if (w.heldDiver === f) { w.heldDiver = null; delete f.held; }
}

export function stepSandevistans(w: World, dt: number) {
  const { time } = w;
  const elite = () => w.fish.filter(f => f.alive && isSande(f, time));
  w.drives = w.drives.filter(d => time - d.born < DRIVE_LIFE);
  for (const d of w.drives) d.y = Math.min(w.height - 45, d.y + 14 * dt);
  for (const d of [...w.drives]) {
    if (elite().length >= MAX_ELITE) break;
    const f = w.fish.find(o => o.alive && o.diver && !o.sande && !o.docked && !o.riding && !o.held && Math.hypot(o.x - d.x, o.y - d.y) < 48);
    if (!f) continue;
    w.drives = w.drives.filter(o => o !== d);
    f.sande = { until: Infinity, burstUntil: time + 1.2, nextHop: time, readyAt: time + rand(3, 6), dodgeReady: time, ghosts: [] };
    w.whisper(f.x, f.y - 40, "*sandevistan online*", "130,255,200");
    w.notices.push("a diver plugged in a sandevistan drive...");
  }
  for (const f of w.fish) {
    const s = f.sande;
    if (!s) continue;
    s.ghosts = s.ghosts.filter(g => time - g.at < SANDE_GHOST_LIFE);
    if (!f.alive) { if (!s.ghosts.length) delete f.sande; continue; }
    if (s.until <= time) { w.whisper(f.x, f.y - 35, "*drive burned out*", "200,200,200"); delete f.sande; continue; }
    if (f.docked || f.riding) continue;
    const grabbed = !!(f.dragger || f.seized || f.held);
    const shots = w.encounterShots.filter(sh => !sh.resolved && sh.target === f);
    const hunted = w.sharks.some(sh => !sh.mega && (sh.target === f || sh.biteTarget?.fish === f) && Math.hypot(sh.nodes[0] - f.x, sh.nodes[1] - f.y) < 170);
    const blast = w.bombs.some(b => time - b.born < 1 && Math.hypot(b.x - f.x, b.y - f.y) < b.r * 1.15);
    const titan=w.kraken?.strike?.f===f?w.kraken:w.sharks.find(sh=>sh.mega&&Math.hypot(sh.nodes[0]-f.x,sh.nodes[1]-f.y)<sh.length*.3);
    if(titan&&evadeThreat(w,f,"nodes" in titan?{x:titan.nodes[0],y:titan.nodes[1]}:titan))continue;
    const threat = grabbed || shots.length > 0 || hunted || blast;
    if (threat && time >= s.nextHop) {
      if (grabbed) free(w, f);
      s.burstUntil = Math.max(s.burstUntil, time + .8);
      s.nextHop = time + rand(.35, .7);
      hop(w, f);
      continue;
    }
    if (time >= s.readyAt && s.burstUntil < time) {
      s.burstUntil = time + rand(1, 1.8);
      s.readyAt = s.burstUntil + rand(6, 10);
    }
    if (s.burstUntil > time) {
      // Time bends around it: incoming fire lags and nearby sharks slow down.
      for (const sh of shots) sh.fireAt += dt * .7;
      for (const sh of w.sharks)
        if (!sh.mega && Math.hypot(sh.nodes[0] - f.x, sh.nodes[1] - f.y) < 260) sh.speed *= Math.exp(-dt * 4);
      if (time >= s.nextHop) {
        s.nextHop = time + rand(.08, .18);
        const craft = [...w.subs, ...w.ufos].filter(c => Math.hypot(c.x - f.x, c.y - f.y) < 420)
          .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
        hop(w, f, craft);
      }
    }
  }
}
