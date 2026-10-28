import { clamp } from "./math";
import type { Put } from "./deepdraw";
/** The v1.3 dome and disc with a shallow shaded underside, drawn as one rigid craft. */
export function drawClassicSaucer(put: Put, x: number, y: number, half: number, cw: number, ch: number, time: number, piloted = false) {
  const dome = Math.max(2, Math.round(half * .5 / cw)), second = dome >= 4 ? 1 : 0;
  for (let i = -dome; i <= dome; i++)
    put(x + i * cw, y - ch, Math.abs(i) >= dome - 1 ? "." : piloted ? (i < 0 ? "[" : "]") : "-", "rgb(150,225,255)", true);
  if (second)
    for (let i = -(dome - 2); i <= dome - 2; i++)
      put(x + i * cw, y - ch * 2, Math.abs(i) >= dome - 3 ? "." : "^", "rgb(150,225,255)", true);
  put(x, y - ch * (1 + second), piloted ? "O" : "^", piloted ? "rgb(255,236,205)" : "rgb(150,225,255)", true);
  for (let dx = -half; dx <= half; dx += cw)
    put(x + dx, y, Math.abs(dx) > half - cw ? (dx < 0 ? "(" : ")") : "=", "rgb(205,210,222)", true);
  for (let dx = -half * .9; dx <= half * .9; dx += cw) {
    const edge = Math.sqrt(Math.max(0, 1 - (dx / half) ** 2));
    put(x + dx, y + half * .14 * edge, Math.abs(dx) > half * .7 ? "\\" : "_", "rgb(110,140,155)");
  }
  if (piloted) {
    const blink = Math.floor(time * 5) % 2 === 0;
    put(x, y - ch * (2.4 + second), "!", blink ? "rgb(255,80,80)" : "rgb(255,190,80)", true);
  }
  const colors = piloted ? ["255,90,90", "255,170,70", "255,90,90"] : ["255,222,110", "120,255,165", "255,120,120"];
  let k = 0;
  for (let dx = -half * .8; dx <= half * .8; dx += cw * 1.5, k++)
    put(x + dx, y + ch * .9, "o", `rgb(${colors[(k + Math.floor(time * 4)) % 3]})`, true);
}
/** A rounded disc with separate upper terraces, a thick rim, and a shaded underside. */
export function drawSaucerHull(put: Put, x: number, y: number, L: number, cw: number, ch: number, time: number, boss = false, piloted = false, damage = 0) {
  for (let py = -L * .34; py <= L * .28; py += ch * .65)
    for (let px = -L; px <= L; px += cw * .65) {
      const u = px / L, v = py / L;
      const edge = Math.sqrt(Math.max(0, 1 - u * u));
      const upper = boss ? -.19 * edge : Math.min(-.11 * edge - .05 * Math.max(0, 1 - (u / .65) ** 2) - .1 * Math.max(0, 1 - (u / .3) ** 2), Math.abs(u) < .28 ? -.13 - .17 * Math.sqrt(Math.max(0, 1 - (u / .28) ** 2)) : 0);
      const lower = boss ? .19 * edge : .23 * edge + .025 * Math.max(0, 1 - (u / .22) ** 2);
      if (v < upper || v > lower)
        continue;
      const rim = Math.abs(v) < .027;
      const border = v < upper + .025 || v > lower - .025 || Math.abs(u) > .96;
      const radial = Math.atan2(v / .25, u);
      const panel = Math.sin(radial * 18 + Math.hypot(u, v * 3) * 20) > .82;
      const vent = v > .07 && Math.abs(Math.sin(u * 24)) > .87;
      const light = clamp(.9 - Math.abs(u) * .25 - Math.max(0, v) * 1.4, 0, 1);
      const crack = damage > 0 && Math.sin(px * .065 + py * .08) > 1 - damage * .8;
      const glyph = crack ? "+" : rim ? "=" : border ? "#" : vent ? "o" : panel ? "/" : v < 0 ? ":" : boss ? "." : "%";
      const rgb = crack ? "255,205,230" : rim ? (piloted ? "255,150,90" : "125,255,175") : vent ? "40,55,75" : `${Math.round(100 + 100 * light)},${Math.round(110 + 100 * light)},${Math.round(135 + 100 * light)}`;
      put(x + px, y + py, glyph, `rgba(${rgb},${1 - damage * .65})`, true);
    }
  // Trace the silhouette explicitly: fill sampling can miss a thin border between text rows.
  {
    const color = `rgba(220,235,255,${1 - damage * .65})`;
    const steps = Math.ceil(L * 2 / (cw * .45));
    for (let i = 0; i <= steps; i++) {
      const u = -1 + 2 * i / steps, edge = Math.sqrt(Math.max(0, 1 - u * u));
      const upper = boss ? -.19 * edge : Math.min(-.11 * edge - .05 * Math.max(0, 1 - (u / .65) ** 2) - .1 * Math.max(0, 1 - (u / .3) ** 2), Math.abs(u) < .28 ? -.13 - .17 * Math.sqrt(Math.max(0, 1 - (u / .28) ** 2)) : 0);
      const lower = boss ? .19 * edge : .23 * edge + .025 * Math.max(0, 1 - (u / .22) ** 2);
      put(x + u * L, y + upper * L, u < -.9 ? "/" : u > .9 ? "\\" : "_", color, true);
      put(x + u * L, y + lower * L, u < -.9 ? "\\" : u > .9 ? "/" : "_", color, true);
      put(x + u * L, y, "=", `rgba(150,255,205,${1 - damage * .65})`, true);
    }
  }
  // Inset command dome and a central underside emitter give the hull visible volume.
  const dome = L * .28;
  for (let px = -dome; px <= dome; px += cw * .8) {
    const top = -L * .13 - Math.sqrt(Math.max(0, 1 - (px / dome) ** 2)) * L * .17;
    put(x + px, y + top, Math.abs(px) > dome * .85 ? "/" : "_", boss ? "rgb(200,185,255)" : "rgb(160,220,250)", true);
  }
  put(x, y + L * .18, "@", `rgba(${boss ? "210,160,255" : "160,255,185"},${.75 + .25 * Math.sin(time * 2) ** 2})`, true);
}
