import { clamp, TAU } from "./math";
import type { World } from "./world";
import { ghostFrame, ghostHalfWidth } from "./leviathan";

export type Put = (x: number, y: number, glyph: string, color: string, force?: boolean) => void;
interface Grid { cw: number; ch: number; cols: number; rows: number }

const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** Columns from a sub's centre to the tip of its hammerhead bow, where the searchlight comes from. */
export const SUB_BOW = 10.5;

/** Sparse kelp and coral on the floor, and the cones of light from the submarines. Drawn behind the fish. */
export function drawSeabed(put: Put, world: World, g: Grid) {
  const { cw, ch, cols, rows } = g;
  const t = world.time;
  const night = world.night;
  const dim = (v: number) => Math.round(v * (1 - 0.45 * night));
  for (let c = 0; c < cols; c++) {
    const h = hash(c * 3.7);
    const base = (rows - 1) * ch;
    if (h < 0.1) {
      const tall = 3 + Math.floor(hash(c * 9.1) * 5);
      for (let r = 0; r < tall; r++) {
        const sway = Math.round(Math.sin(t * 0.9 + c * 0.7 + r * 0.55) * (r * 0.22 + 0.2));
        put((c + sway) * cw + cw / 2, base - r * ch, r % 2 ? ")" : "(", `rgb(${dim(40)},${dim(120 + r * 8)},${dim(80)})`);
      }
    } else if (h < 0.15) {
      const col = hash(c * 5.3) < 0.5 ? [dim(215), dim(100), dim(130)] : [dim(150), dim(110), dim(200)];
      put(c * cw + cw / 2, base, "&", `rgb(${col})`);
      put(c * cw + cw / 2, base - ch, hash(c * 2.2) < 0.5 ? "Y" : "%", `rgb(${col})`);
    } else if (h < 0.4) put(c * cw + cw / 2, base + 2, hash(c * 1.3) < 0.5 ? "." : ",", `rgb(${dim(110)},${dim(95)},${dim(65)})`);
  }
  // Searchlight cones from the hammerhead, soft and sparse so they never read as clutter.
  for (const sb of world.subs) {
    const col = sb.crew === "claude" ? [255, 190, 120] : sb.crew === "codex" ? [200, 170, 255] : [255, 235, 150];
    const len = sb.crew ? 190 : 140;
    for (let i = 2; i < len / cw * 1.1; i++) {
      const spread = i * 0.34;
      for (let o = -Math.floor(spread); o <= Math.floor(spread); o++) {
        if ((i + o * 3 + Math.floor(t * 4)) % 5) continue;
        const x = sb.x + sb.face * (SUB_BOW * cw + i * cw);
        const y = sb.y + sb.vy * 0.15 + o * ch + i * ch * 0.1;
        put(x, y, ".", `rgb(${col.map((v) => Math.round(v * Math.max(0.1, 0.55 - i / 90))).join(",")})`);
      }
    }
  }
}

// A shark-sized submarine, drawn procedurally so it can pitch and sway: a rounded gunmetal hull with a red stripe and lit
// portholes, a conning tower with a periscope, tail fins and a spinning propeller, and a lamp on the nose.
export function drawSubs(put: Put, world: World, g: Grid) {
  const { cw, ch } = g;
  const t = world.time;
  for (const sb of world.subs) {
    const accent = sb.crew === "claude" ? "255,140,70" : sb.crew === "codex" ? "185,140,255" : "235,80,95";
    const hurt = t - sb.hitAt < 0.4;
    const f = sb.face;
    const Ls = SUB_BOW * 2 * cw - cw * 2;
    const Hh = ch * 1.7;
    // Nose down when diving, nose up when climbing, and a slow rolling sway on top.
    const pitch = clamp(Math.atan2(sb.vy, Math.max(30, Math.abs(sb.vx))) * 0.9, -0.4, 0.4) + Math.sin(t * 1.3 + sb.bob) * 0.05;
    const cs = Math.cos(pitch);
    const sn = Math.sin(pitch);
    const at = (x: number, y: number, glyph: string, color: string, force = true) => {
      put(sb.x + f * (x * cs - y * sn), sb.y + (x * sn + y * cs), glyph, `rgb(${hurt ? "255,120,110" : color})`, force);
    };
    const halfH = (u: number) => (u > 0 ? Hh * Math.sqrt(Math.max(0, 1 - u * u)) : Hh * Math.pow(Math.max(0, 1 - u * u), 0.9) * (0.62 + 0.38 * (u + 1)));
    for (let u = -1; u <= 1; u += (cw * 0.4) / (Ls / 2)) {
      const hh = halfH(u);
      if (hh < 1) continue;
      for (let v = -1; v <= 1; v += (ch * 0.4) / Math.max(hh, 1)) {
        const x = (u * Ls) / 2;
        const y = v * hh;
        let glyph = "=";
        let color = "135,165,200";
        if (Math.abs(u) > 0.9) { glyph = u > 0 ? ")" : "("; color = "225,238,250"; }
        else if (v < -0.8) { glyph = "_"; color = "225,238,250"; }
        else if (v > 0.8) { glyph = "-"; color = "225,238,250"; }
        else if (v > 0.2 && v < 0.5) { glyph = "="; color = accent; }
        else if (Math.abs(v + 0.18) < 0.16 && Math.abs((((u + 1) * 7) % 1) - 0.5) < 0.18 && u > -0.7 && u < 0.78) { glyph = "o"; color = Math.floor(t * 2 + u * 9) % 5 ? "255,236,160" : "255,255,230"; }
        at(x, y, glyph, color);
      }
    }
    // Conning tower, periscope and a blinking beacon.
    const tx = -Ls * 0.06;
    const tower: [number, number, string][] = [[-1, 1, "["], [0, 1, "#"], [1, 1, "]"], [-1, 2, "|"], [0, 2, "H"], [1, 2, "|"]];
    for (const [dx, row, glyph] of tower) at(tx + dx * cw, -Hh - ch * (row - 0.2) * 0.62, glyph, row === 1 ? "200,222,242" : "170,196,222");
    at(tx + cw * 0.6, -Hh - ch * 2.2, "|", "150,170,195");
    at(tx + cw * 0.6, -Hh - ch * 3, "|", "150,170,195");
    at(tx + cw * 1.5, -Hh - ch * 3.1, "-", "150,170,195");
    if (Math.floor(t * 1.6 + sb.bob) % 2) at(tx + cw * 2.3, -Hh - ch * 3.1, "*", accent);
    // Tail: upper and lower fins and a spinning propeller, with bubbles streaming back.
    const tail = -Ls / 2;
    for (const s of [-1, 1]) {
      at(tail - cw * 0.2, s * Hh * 0.45, "<", "190,212,236");
      at(tail - cw * 1.1, s * Hh * 0.95, s < 0 ? "/" : "\\", "190,212,236");
    }
    at(tail - cw * 1.4, 0, ["*", "+", "x", "+"][Math.floor(t * 14) % 4], "215,228,238");
    if (Math.floor(t * 3 + sb.bob) % 3 === 0) at(tail - cw * (3 + ((t * 4) % 3)), Math.sin(t * 5) * ch * 0.4, "o", "190,225,250", false);
    // Nose lamp, and the crew's tag underneath.
    at(Ls / 2 + cw * 0.6, 0, "@", Math.floor(t * 3) % 2 ? "255,250,210" : accent);
    if (sb.crew) at(0, Hh + ch * 1.2, sb.crew === "claude" ? "c" : "x", accent);
  }
  for (const tp of world.torpedoes) {
    tp.trail.forEach((p, i) => put(p.x, p.y, i % 2 ? "-" : "=", `rgb(${120 + i * 12},${100 + i * 8},60)`, true));
    put(tp.x, tp.y, "@", "rgb(255,210,120)", true);
  }
}

/**
 * A translucent blue leviathan: a wide cartilaginous hammerhead, visible muscle ribbons and ribs,
 * and a thick glassy trunk that narrows into a long, flowing tail. All detail stays ASCII.
 */
export function drawGhost(put: Put, world: World, g: Grid) {
  const lv = world.leviathan;
  if (!lv) return;
  const { cw, ch } = g;
  const L = lv.length;
  const t = world.time;
  const light = world.yeat;
  const agitated = lv.rageUntil > t;
  const warning = agitated ? 0.5 + 0.5 * Math.sin(t * (lv.state === "charge" ? 5 : 2.4)) : 0;
  const frame = (u: number) => ghostFrame(lv, u);
  const half = (u: number) => ghostHalfWidth(L, u);
  const blue = (shade: number, alpha: number) => {
    const v = Math.round(clamp(shade, 0, 1) * 7) / 7;
    const a = Math.round(clamp(alpha + light * 0.12 + warning * 0.15, 0, 1) * 12) / 12;
    return `rgba(${Math.round(40 + 150 * v)},${Math.round(110 + 135 * v)},255,${a.toFixed(2)})`;
  };
  const line = (ax: number, ay: number, bx: number, by: number, glyph: string, color: string) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cw * 0.65)));
    for (let i = 0; i <= steps; i++) put(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps, glyph, color, true);
  };

  // The glass membrane leaves the shoals and seabed visible through its interior.
  for (let u = 0.035; u < 0.992; u += cw * 0.7 / L) {
    const f = frame(u);
    const hw = half(u);
    const steps = Math.max(1, Math.ceil(hw / (cw * 0.7)));
    const shimmer = 0.5 + 0.5 * Math.sin(u * 27 - t * 0.85);
    for (let j = -steps; j <= steps; j++) {
      const v = j / steps;
      const edge = Math.abs(v) > 0.9;
      const weave = Math.sin(u * 85 + v * 5 - lv.phase * 0.4);
      const glyph = edge ? (v < 0 ? "~" : "-") : weave > 0.5 ? ":" : ".";
      put(f.x + f.nx * v * hw, f.y + f.ny * v * hw, glyph,
        blue(edge ? 0.75 + 0.25 * shimmer : 0.3, edge ? 0.78 + 0.2 * shimmer : 0.22 + 0.08 * shimmer), true);
    }
  }

  // Blue muscle ribbons and warm orange nerve lights suspended inside the transparent sheath.
  for (let u = 0.07; u < 0.95; u += cw * 0.65 / L) {
    const f = frame(u);
    const hw = half(u);
    for (const s of [-1, 1]) {
      const v = s * (0.32 + 0.11 * Math.sin(u * 20 - lv.phase * 0.55));
      put(f.x + f.nx * hw * v, f.y + f.ny * hw * v, "=", blue(0.55, 0.85), true);
      put(f.x + f.nx * hw * v * 0.5, f.y + f.ny * hw * v * 0.5, ":", "rgba(130,120,235,0.6)", true);
    }
    if (Math.floor(u * 110) % 8 === 0) {
      const v = 0.2 * Math.sin(u * 65);
      put(f.x + f.nx * hw * v, f.y + f.ny * hw * v, "*", "rgba(255,170,85,0.85)", true);
    }
  }

  // Curved rings reveal the volume of the body, with a wave of light travelling down the ribs.
  for (let u = 0.13; u < 0.96; u += 0.045) {
    const hw = half(u);
    const shimmer = Math.pow(0.5 + 0.5 * Math.sin(u * 25 - t * 0.9), 3);
    const steps = Math.max(6, Math.ceil(hw * 2 / cw));
    for (let j = 0; j <= steps; j++) {
      const v = -1 + j * 2 / steps;
      const f = frame(u + 0.017 * (1 - v * v));
      const edge = Math.abs(v) > 0.8;
      put(f.x + f.nx * hw * v, f.y + f.ny * hw * v, edge ? "+" : v < -0.3 ? "/" : v > 0.3 ? "\\" : "=",
        blue(edge ? 1 : 0.75, 0.6 + shimmer * 0.35), true);
    }
  }

  // Paired translucent fins sweep back from the shoulders, with slender trailing tendrils.
  for (const root of [0.24, 0.38, 0.53, 0.68]) {
    for (const s of [-1, 1]) {
      const base = frame(root);
      const reach = L * (0.17 - root * 0.12);
      let px = base.x + base.nx * s * half(root) * 0.85;
      let py = base.y + base.ny * s * half(root) * 0.85;
      const count = Math.max(12, Math.ceil(reach * 2 / cw));
      for (let j = 1; j <= count; j++) {
        const u = j / count;
        const outward = half(root) + Math.sin(u * Math.PI * 0.8) * reach * 0.65;
        const back = reach * u * 1.8;
        const wave = Math.sin(lv.phase - u * 3 + root * 8) * reach * 0.08 * u;
        const x = base.x - base.tx * back + base.nx * (s * outward + wave);
        const y = base.y - base.ty * back + base.ny * (s * outward + wave);
        line(px, py, x, y, u > 0.75 ? "~" : "-", blue(0.8, 0.65 * (1 - u * 0.5)));
        // A sparse veil between the outer fin ray and the flank.
        if (j % 2 === 0 && u < 0.7) {
          const inner = frame(clamp(root + back / L, 0, 0.98));
          line(inner.x + inner.nx * s * half(root) * 0.6, inner.y + inner.ny * s * half(root) * 0.6,
            x, y, ".", blue(0.35, 0.12));
        }
        px = x; py = y;
      }
    }
  }

  // The broad hammerhead is a single swept skull with upturned, rounded ends.
  const head = frame(0.035);
  const atHead = (forward: number, side: number) => ({
    x: head.x + head.tx * forward + head.nx * side,
    y: head.y + head.ty * forward + head.ny * side,
  });
  const span = L * 0.36;
  for (const s of [-1, 1]) {
    const steps = Math.ceil(span / (cw * 0.65));
    for (let j = 0; j <= steps; j++) {
      const u = j / steps;
      const sweep = -L * 0.065 * Math.sin(u * Math.PI) + L * 0.035 * Math.pow(u, 5);
      const thick = L * (0.027 * Math.pow(1 - u, 0.8) + 0.008 + 0.009 * Math.exp(-Math.pow((u - 0.96) / 0.07, 2)));
      const rows = Math.max(1, Math.ceil(thick / (cw * 0.65)));
      for (let r = -rows; r <= rows; r++) {
        const v = r / rows;
        const p = atHead(sweep + thick * v, s * span * u);
        const edge = Math.abs(v) > 0.78;
        const shine = 0.5 + 0.5 * Math.sin(u * 13 + t * 0.7 + s);
        const stripe = !edge && Math.abs(v + 0.25 * Math.sin(u * 10)) < 0.18;
        put(p.x, p.y, edge ? "=" : stripe ? ":" : ".", edge ? blue(0.9, 0.7 + 0.2 * shine)
          : stripe ? "rgba(190,135,235,0.70)" : blue(0.55, 0.4), true);
      }
    }
  }

  // Glowing eyes and warm sensory spots, sized with the skull rather than the font.
  for (const s of [-1, 1]) {
    for (const [side, forward, radius] of [[0.045, 0.018, 0.011], [0.095, 0.006, 0.009], [0.16, -0.022, 0.006]]) {
      const p = atHead(L * forward, s * L * side);
      for (let a = 0; a < TAU; a += 0.4) {
        put(p.x + Math.cos(a) * L * radius, p.y + Math.sin(a) * L * radius,
          "o", "rgba(255,205,105,0.9)", true);
      }
      put(p.x, p.y, "*", "rgba(255,247,190,0.98)", true);
    }
  }

  // A small dark, open mouth, edged in ice blue; two fine jaw tips point forward.
  const mouth = atHead(L * 0.045, 0);
  for (let a = 0; a < TAU; a += 0.22) {
    const p = atHead(L * (0.045 + Math.cos(a) * (lv.state === "charge" ? 0.032 : 0.022)), Math.sin(a) * L * (lv.state === "charge" ? 0.034 : 0.025));
    put(p.x, p.y, "o", blue(0.9, 0.85), true);
  }
  put(mouth.x, mouth.y, " ", "rgba(5,20,40,0.4)", true);
  for (const s of [-1, 1]) {
    const a = atHead(L * 0.055, s * L * 0.02);
    const b = atHead(L * 0.087, s * L * 0.009);
    line(a.x, a.y, b.x, b.y, "-", blue(1, 0.9));
  }

  // A few moving pinpricks of light shimmer along the outer membrane.
  for (let i = 0; i < 22; i++) {
    const u = 0.12 + hash(i * 7.3) * 0.82;
    const shimmer = Math.pow(Math.max(0, Math.sin(t * 0.8 + i * 2.4)), 10);
    if (shimmer < 0.25) continue;
    const f = frame(u);
    const side = (i % 2 ? -1 : 1) * half(u) * 0.9;
    put(f.x + f.nx * side, f.y + f.ny * side, "+", blue(1, shimmer), true);
  }
}
