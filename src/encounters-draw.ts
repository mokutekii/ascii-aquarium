import { drawSaucerHull } from "./saucer-draw";
import { clamp, TAU } from "./math";
import type { World } from "./world";
import type { Put } from "./deepdraw";
export function drawMothership(put: Put, w: World, cw: number, ch: number, motion = true) {
  const boss = w.mothership;
  if (!boss)
    return;
  const t = w.time, L = boss.size;
  const dying = boss.phase === "collapse" ? clamp((t - boss.phaseAt) / 5, 0, 1) : 0;
  const collapseAge = boss.phase === "collapse" ? t - boss.phaseAt : 0;
  const warp = boss.warp, warpAge = warp ? (t - warp.at) * 1.2 / (warp.charge ?? 1.2) : 0;
  const leaving = boss.departure;
  const leaveAge = t - boss.phaseAt;
  const leaveFade = leaving?.mode === "warp" && leaveAge >= 1
    ? leaveAge >= 1.65 ? 0 : motion ? .2 + .8 * Math.cos((leaveAge - 1) * Math.PI * 2) ** 2 : clamp((1.65 - leaveAge) / .65, 0, 1)
    : 1;
  const alpha = (warp ? clamp(Math.abs(warpAge - 1.2) / 1.2, 0, 1) : collapseAge >= 2.4 ? 0 : 1) * leaveFade;
  const bank = boss.attitude?.bank ?? 0;
  const bankC = Math.cos(bank), bankS = Math.sin(bank);
  const fadedPut: Put = (x, y, glyph, color, force) => {
    if (alpha <= 0)
      return;
    if (t-(boss.hitAt??-99)<.35) color="rgb(255,95,95)";
    const rgb = color.match(/^rgb\(([^)]+)\)$/), rgba = color.match(/^rgba\(([^,]+,[^,]+,[^,]+),([^)]+)\)$/);
    const dx = x - boss.x, dy = y - boss.y;
    put(boss.x + dx * bankC - dy * bankS, boss.y + dx * bankS + dy * bankC,
      glyph, rgb ? `rgba(${rgb[1]},${alpha})` : rgba ? `rgba(${rgba[1]},${Number(rgba[2]) * alpha})` : color, force);
  };
  drawSaucerHull(fadedPut, boss.x, boss.y, L * .95, cw, ch, t, true, false, dying);
  if (w.yeat > 0) {
    // Traveling ribs and concentric reactor rings follow the banked hull.
    const pulse = .65 + .35 * Math.sin(t * 2.4) ** 2;
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * TAU + t * .22;
      for (const r of [.38, .68, .96])
        fadedPut(boss.x + Math.cos(a) * L * r, boss.y + Math.sin(a) * L * r * .25,
          i % 6 ? "." : "+", `rgba(180,235,255,${w.yeat * pulse * (r > .9 ? .9 : .6)})`, true);
    }
  }
  const damage = 1 - boss.hp / boss.maxHp;
  for (let i = 0; i < Math.floor(damage * 15); i++) {
    const x = boss.x + Math.sin(i * 2.4) * L * .75, y = boss.y + Math.cos(i * 3.1) * L * .12;
    fadedPut(x, y, i % 2 ? "/" : "+", "rgb(255,160,110)", true);
  }
  const core = 0.65 + 0.35 * Math.sin(t * 2) ** 2;
  fadedPut(boss.x, boss.y, damage > .5 ? "#" : "@", `rgba(${damage > .5 ? "255,205,245" : "210,150,255"},${core})`, true);
  const spin = boss.spin, spinAge = spin ? t - spin.at : 0;
  const rotation = spin ? Math.max(0, spinAge - 1.2) * TAU / 1.6 : 0;
  for (let i = 0; i < 9; i++) {
    const angle = i * TAU / 9 + rotation;
    const x = boss.x + (spin ? Math.cos(angle) * L * .8 : (i - 4) * L * 0.13);
    const y = boss.y + (spin ? Math.sin(angle) * L * .14 : L * .12);
    fadedPut(x, y, spinAge > 0 && spinAge < 1.2 ? "*" : (Math.floor(t * 3) + i) % 3 ? "o" : "*", spin ? "rgb(220,255,230)" : "rgb(120,255,170)", true);
  }
  if (leaving) {
    if (leaveAge < 1.2) for (let i = 0; i < 80; i++) {
      const a = i / 80 * TAU;
      fadedPut(boss.x + Math.cos(a) * L * .98, boss.y + Math.sin(a) * L * .27,
        leaveAge > .65 ? "*" : ".", "rgb(190,255,220)", true);
    }
    if (leaving.mode === "jet" && leaveAge >= 1) for (let i = 1; i <= 24; i++) {
      const trail = i / 24;
      put(boss.x - leaving.vx * L * (.8 + trail), boss.y - leaving.vy * L * (.8 + trail),
        i % 3 ? "=" : "+", `rgba(145,225,255,${(1 - trail) * .85})`, true);
    }
  }
  if (spin) {
    const radius = L * .95 + Math.min(1, Math.max(0, spinAge - 1.2) / 1.1) * 400;
    for (let i = 0; i < 100; i++) {
      const a = i / 100 * TAU + rotation, windup = spinAge < 1.2;
      put(boss.x + Math.cos(a) * (windup ? L * .99 : radius), boss.y + Math.sin(a) * (windup ? L * .28 : radius), windup ? "." : i % 5 ? "~" : "*", `rgba(160,255,210,${windup ? .25 + .6 * spinAge / 1.2 : Math.max(.15, .65 - (spinAge - 1.2) * .1)})`);
    }
  }
  if (warp && warpAge < 1.2) {
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * TAU;
      put(warp.x + Math.cos(a) * L * .95, warp.y + Math.sin(a) * L * .26, ".", "rgb(200,130,255)", true);
    }
    put(warp.x, warp.y, "+", "rgb(245,160,255)", true);
  }
  if (boss.phase === "collapse" && collapseAge < 2.4) {
    // Ruptures run across the rim, then contract toward the core before release.
    const contraction = clamp((2.4 - collapseAge) / .9, 0, 1);
    for (let i = 0; i < 12; i++) {
      if (collapseAge < i * .12)
        continue;
      const x = boss.x + (i / 11 - .5) * L * 1.7 * contraction, y = boss.y + Math.sin(i * 2.4) * L * .12 * contraction;
      const r = ch * (1 + (collapseAge - i * .12) % .35 * 8);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU;
        put(x + Math.cos(a) * r, y + Math.sin(a) * r, "*", "rgb(220,240,255)", true);
      }
    }
  }
  for (const drone of w.attackDrones) {
    const color = drone.stunned > t ? "255,245,190" : "150,255,185";
    for (const [row, line] of [" /-\\ ", "<=o=>", " \\-/ "].entries())
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== " ")
          put(drone.x + (i - 2) * cw, drone.y + (row - 1) * ch, line[i], `rgb(${color})`, true);
      }
  }
}

export function drawEncounterShots(put: Put, w: World, cw: number, ch: number) {
  const t = w.time;
  for (const shot of w.encounterShots) {
    if (!shot.hostile && t < shot.fireAt)
      continue;
    const warning = shot.hostile && t < shot.fireAt;
    const age = t - shot.fireAt;
    const alpha = warning ? 0.2 + 0.15 * Math.sin(t * 4) ** 2 : Math.max(0, 1 - age / 0.4);
    const color = shot.flash ? "255,250,210" : shot.rgb ?? (shot.hostile ? "255,90,135" : "130,255,235");
    if (shot.flash) {
      if (!warning)
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU, r = cw * (1.5 + Math.max(0, age) * 8);
          put(shot.x0 + Math.cos(a) * r, shot.y0 + Math.sin(a) * r, i % 2 ? "+" : "*", `rgba(255,250,210,${alpha})`, true);
        }
      continue;
    }
    const length = Math.hypot(shot.x1 - shot.x0, shot.y1 - shot.y0);
    const n = Math.min(150, Math.ceil(length / cw));
    for (let i = 0; i <= n; i++) {
      if (warning && i % 3)
        continue;
      const u = i / Math.max(1, n);
      put(shot.x0 + (shot.x1 - shot.x0) * u, shot.y0 + (shot.y1 - shot.y0) * u, warning ? "." : "*", `rgba(${color},${alpha})`, true);
    }
    if (warning)
      put(shot.x1, shot.y1, "+", "rgb(255,135,155)", true);
    if (!warning && alpha > 0) {
      put(shot.x0, shot.y0, "@", `rgba(${color},${alpha})`, true);
      put(shot.x0 - cw, shot.y0, "<", `rgba(${color},${alpha})`, true);
      put(shot.x0 + cw, shot.y0, ">", `rgba(${color},${alpha})`, true);
    }
    if (!warning && shot.flash)
      put(shot.x0, shot.y0, "*", "rgb(255,255,225)", true);
  }
  for (const f of w.fish) {
    if (!f.alive || !f.diver || !w.diverCombat.has(f))
      continue;
    const rgb = f.dkind === "tech" ? "100,235,255" : f.dkind === "photo" ? "255,250,210" : f.dkind === "bomber" ? "255,170,80" : "160,255,195";
    const phase = t * 1.8 + f.phase;
    for (let i = 0; i < 4; i++) {
      const a = phase + i * TAU / 4;
      put(f.x + Math.cos(a) * cw * 2.5, f.y + Math.sin(a) * ch * 2.5, ".", `rgba(${rgb},0.65)`);
    }
  }
}
/** Slender crosses stay anchored where each creature merged. */
export function mergerCrossFrame(w: World, cross: NonNullable<World["eoe"]>["crosses"][number], i: number, cw: number, ch: number, motion = true) {
  const age = w.time - w.eoe!.born;
  const growth = clamp((w.time - cross.turnAt - .12) / .65, 0, 1);
  const alpha = clamp(Math.min((w.time - cross.turnAt) / .3, (52 - age) / 5), 0, 1);
  const height = Math.max(ch * 9, Math.min(w.height * .32, ch * (11 + cross.scale * 4 + (i % 4)))) * growth;
  const phase = i * 2.39996;
  const dx = motion ? cw * .12 * (Math.sin(w.time * 17 + phase) + .4 * Math.sin(w.time * 23 + phase)) : 0;
  const dy = motion ? ch * .035 * Math.sin(w.time * 13 + phase) : 0;
  const pulse = motion ? .9 + .1 * Math.sin(w.time * 2.2 + phase) : 1;
  return { alpha: alpha * pulse, dx, dy, top: cross.y - height * .26, bottom: cross.y + height * .74, arm: cw * (cross.scale > 1.7 ? 2.5 : 1.5) * growth };
}

export function drawEoe(put: Put, w: World, cw: number, ch: number, saver: boolean, motion = true) {
  if (!w.eoe)
    return;
  for (const pop of w.eoe.pops ?? []) {
    const age = w.time - pop.born;
    const fade = clamp(1 - age / .5, 0, 1);
    const size = clamp(Math.sqrt(pop.scale), .8, 2.2);
    const radius = cw * size * (motion ? .4 + age * 3 : .8);
    const count = saver ? 6 : 8;
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU;
      put(pop.x + Math.cos(a) * radius, pop.y + Math.sin(a) * radius * .8,
        i % 2 ? "." : "o", `rgba(255,255,255,${fade * .85})`, true);
    }
  }
  for (const [i, cross] of w.eoe.crosses.entries()) {
    if (!cross.converted)
      continue;
    const { alpha, top, bottom, arm } = mergerCrossFrame(w, cross, i, cw, ch, motion);
    if (alpha <= 0)
      continue;
    for (let y = top; y <= bottom; y += ch * .7)
      put(cross.x, y, "|", `rgba(215,255,230,${alpha})`, true);
    for (let x = cross.x - arm; x <= cross.x + arm; x += cw * .6)
      put(x, cross.y, "-", `rgba(235,255,240,${alpha})`, true);
    put(cross.x, cross.y, "+", `rgba(250,255,250,${alpha})`, true);
    if (motion)
      for (let k = 0; k < (saver ? 1 : 2); k++) {
        const u = (w.time * .09 + i * .61803398875 + k * .5) % 1;
        const x = cross.x + Math.cos(w.time * 1.1 + i + k) * cw * (1.3 + k * .4);
        put(x, top + (bottom - top) * u, ".", `rgba(160,255,200,${alpha * .42})`);
      }
  }
}
