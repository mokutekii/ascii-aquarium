import type { World } from "./world";
import type { Put } from "./deepdraw";
import { clamp, rand, randInt } from "./math";
export type WreckKind = "ufo" | "sub" | "mothership";
export interface CraftDebris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  side: -1 | 1;
  born: number;
  kind?: WreckKind;
  part?: number;
  angle?: number;
  spin?: number;
  scale?: number;
  buoyancy?: number;
}

const pieces: Record<WreckKind, readonly (readonly string[])[]> = {
  ufo: [[" .--. ", "/ ^^ \\", "`----'"], ["(====", " o o "], [" [@] ", " /|\\ ", "  v  "]],
  sub: [[" /==>", "[###>", " \\==>"], ["  | ", " _|_", "[#__]"], ["<###]", "<===|", "  /|"]],
  mothership: [[" /======", "/:://::/", "\\======"], [" .---. ", "[ /@\\ ]", " '---' "], [" /###\\ ", "[o===o]", " \\___/ "]],
};
export function spawnCraftDebris(w: World, kind: WreckKind, x: number, y: number, size: number, kick = 80) {
  w.debris ??= [];
  const count = randInt(3, 5), scale = kind === "mothership" ? clamp(size / 340, 1.25, 2.3) : kind === "sub" ? 1.05 : 1;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-.25, .25), side: -1 | 1 = Math.cos(a) < 0 ? -1 : 1;
    w.debris.push({ x: x + Math.cos(a) * size * .12, y: y + Math.sin(a) * size * .07, vx: Math.cos(a) * rand(kick * .5, kick), vy: Math.sin(a) * kick * .45 + 18, side, born: w.time, buoyancy: rand(-22, 38), kind, part: i % 3, angle: rand(-.3, .3), spin: rand(-.5, .5), scale });
  }
  w.debris = w.debris.slice(-100);
}

export function drawCraftDebris(put: Put, w: World, cw: number, ch: number) {
  for (const d of w.debris) {
    const age = w.time - d.born, fade = clamp((8 - age) / 2, 0, 1), kind = d.kind ?? "ufo";
    const rows = pieces[kind][d.part ?? (d.side < 0 ? 0 : 1)], angle = (d.angle ?? 0) + (d.spin ?? .1) * age, c = Math.cos(angle), s = Math.sin(angle), scale = d.scale ?? 1;
    const color = kind === "sub" ? `rgba(215,190,100,${fade})` : kind === "mothership" ? `rgba(180,160,255,${fade})` : `rgba(155,225,240,${fade})`;
    for (let r = 0; r < rows.length; r++)
      for (let col = 0; col < rows[r].length; col++) {
        const glyph = rows[r][col];
        if (glyph === " ")
          continue;
        const x = (col - rows[r].length / 2) * cw * scale, y = (r - rows.length / 2) * ch * scale;
        put(d.x + x * c - y * s, d.y + x * s + y * c, glyph, color, true);
      }
    if (age < .5)
      put(d.x + cw, d.y - ch, "*", `rgba(255,210,130,${1 - age * 2})`, true);
  }
}
