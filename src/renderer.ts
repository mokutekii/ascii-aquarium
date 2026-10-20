/**
 * Draws the World as a grid of ASCII cells:
 *   1. a pure black cell grid
 *   2. a wake field that diffuses where things swim, lighting the dots cyan
 *   3. fish as minimal ASCII dashes, one per cell, glinting on hard turns
 *   4. sharks rasterised cell-by-cell with supersampled edges: grey blocks
 *      shaded by the light, dense glyphs, and shimmering accent colours
 */
import { clamp, hash3, smoothstep } from "./math";
import { SHARK_NODES, type Shark, type SharkKind, type World } from "./world";

const ALPHA_LEVELS = 6;
const FISH_ALPHAS = [0.28, 0.42, 0.58, 0.74, 0.9];

// Dot colour classes: blue, green, red, pale; the last entry is the cyan wake.
const DOT_RGB: [number, number, number][] = [
  [48, 52, 235],
  [52, 205, 60],
  [228, 50, 44],
  [190, 212, 255],
  [110, 230, 255],
];
const WAKE = DOT_RGB.length - 1;
// Splash ripples fade through these purples as the ring spreads: lavender at the origin, deep violet at the edge.
const RIPPLE_BASE = DOT_RGB.length;
DOT_RGB.push([226, 208, 255], [196, 160, 250], [166, 124, 240], [140, 100, 226], [116, 82, 204]);
const RIPPLE_STEPS = 5;
const DOT_BASE_ALPHA = DOT_RGB.map(() => 1);

const ACCENTS = ["#e0892c", "#e03a32", "#b44ae0", "#33c8cc", "#3cb54a", "#3150e8", "#d9c14a"];

// Sparse glyphs on bright skin, dense glyphs in shadow, so the texture
// reinforces the shading instead of fighting it.
const SKIN_RAMP = ":;t%SX8#@";
const FIN_GLYPHS = "%;tS:";
const RIDGE_GLYPHS = "@8%";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";


const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_FIN = 3;
const FLAG_RIDGE = 4;
const FLAG_EYE = 5;
/** Dark skin markings: tiger bars, zebra-shark spots. */
const FLAG_MARK = 6;
const MARK_GLYPHS = "#%@";

// Sub-cell sample offsets for anti-aliased silhouettes.
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

/** Classic top-down half-width at s ∈ [0, 1] (snout → tail), as a fraction of length. */
function classicHalfWidth(s: number) {
  if (s < 0.13) return 0.09 * Math.pow(Math.sin(((s / 0.13) * Math.PI) / 2), 0.95);
  if (s < 0.3) return 0.09 + 0.016 * smoothstep(0.13, 0.3, s);
  if (s < 0.84) return 0.019 + 0.087 * Math.pow(1 - (s - 0.3) / 0.54, 1.25);
  const k = (s - 0.84) / 0.16;
  return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
}

/** Body outline and fin layout per species. All values are fractions of length. */
interface SharkShape {
  halfWidth: (s: number) => number;
  /** Pectoral fin: leading root, trailing root, tip position along the body, and reach. */
  pectoral: [number, number, number, number];
  /** Notched (falcate) trailing edge on the pectorals. */
  falcate: boolean;
  /** Pelvic fins: leading root, trailing root, tip, reach. */
  pelvic: [number, number, number, number];
  /** Forked caudal fin reach, or 0 when the tail is a ribbon (zebra shark). */
  caudal: number;
  dorsal: [number, number];
  secondDorsal: [number, number];
  /**
   * Hammerheads' cephalofoil: half-span, how far its tips sweep back, its depth, and the
   * notch in the middle of the front edge. All fractions of length; absent for other sharks.
   */
  head?: { span: number; sweep: number; depth: number; notch: number };
  /** null when the eyes sit somewhere else (hammerhead: on the cephalofoil tips). */
  eye: [number, number] | null;
  gills: [number, number];
  /** Skin colour multipliers (r, g, b). */
  tint: [number, number, number];
}

const SHAPES: Record<SharkKind, SharkShape> = {
  classic: {
    halfWidth: classicHalfWidth,
    pectoral: [0.15, 0.43, 0.55, 0.26],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.085,
    dorsal: [0.33, 0.47],
    secondDorsal: [0.71, 0.76],
    eye: [0.1, 0.14],
    gills: [0.19, 0.29],
    tint: [0.92, 0.97, 1.05],
  },
  // Slim neck under a wide, swept-back cephalofoil (drawn in sampleShark),
  // tall first dorsal, long upper tail lobe. Bronze-olive grey.
  hammerhead: {
    halfWidth: (s) => {
      if (s < 0.06) return 0.045;
      if (s < 0.3) return 0.045 + 0.061 * smoothstep(0.06, 0.3, s);
      return classicHalfWidth(s) * 0.92;
    },
    head: { span: 0.17, sweep: 0.035, depth: 0.09, notch: 0 },
    pectoral: [0.17, 0.4, 0.5, 0.22],
    falcate: true,
    pelvic: [0.56, 0.63, 0.67, 0.075],
    caudal: 0.11,
    dorsal: [0.28, 0.44],
    secondDorsal: [0.7, 0.74],
    eye: null,
    gills: [0.16, 0.26],
    tint: [0.96, 0.98, 0.9],
  },
  // Blunt, square snout on a heavy body; barred back. Warm grey-brown.
  tiger: {
    halfWidth: (s) => {
      if (s < 0.13) return 0.1 * Math.pow(Math.sin(((s / 0.13) * Math.PI) / 2), 0.45);
      if (s < 0.3) return 0.1 + 0.014 * smoothstep(0.13, 0.3, s);
      if (s < 0.84) return 0.019 + 0.095 * Math.pow(1 - (s - 0.3) / 0.54, 1.2);
      const k = (s - 0.84) / 0.16;
      return 0.019 * (1 - k) + 0.012 * Math.sin(k * Math.PI);
    },
    pectoral: [0.15, 0.42, 0.53, 0.25],
    falcate: true,
    pelvic: [0.57, 0.65, 0.69, 0.085],
    caudal: 0.095,
    dorsal: [0.33, 0.46],
    secondDorsal: [0.71, 0.75],
    eye: [0.08, 0.12],
    gills: [0.19, 0.28],
    tint: [1.02, 0.95, 0.84],
  },
  // Short rounded head, body done by half-length, then a long ribbon of a
  // tail fin. Broad rounded pectorals, spotted sandy skin.
  zebra: {
    halfWidth: (s) => {
      if (s < 0.1) return 0.075 * Math.pow(Math.sin(((s / 0.1) * Math.PI) / 2), 0.7);
      if (s < 0.28) return 0.075 + 0.025 * smoothstep(0.1, 0.28, s);
      if (s < 0.55) return 0.022 + 0.078 * Math.pow(1 - (s - 0.28) / 0.27, 1.1);
      const k = (s - 0.55) / 0.45;
      return 0.022 * (1 - k * k) + 0.012 * Math.sin(k * Math.PI);
    },
    pectoral: [0.12, 0.3, 0.36, 0.19],
    falcate: false,
    pelvic: [0.42, 0.48, 0.51, 0.065],
    caudal: 0,
    dorsal: [0.36, 0.44],
    secondDorsal: [0.49, 0.53],
    eye: [0.06, 0.09],
    gills: [0.13, 0.2],
    tint: [1.08, 0.97, 0.74],
  },
  // Great hammerhead: a broader, nearly straight-edged cephalofoil with a notch at the centre,
  // a towering sickle first dorsal (drawn long and bright from above), and a cooler slate skin.
  greathammer: {
    halfWidth: (s) => {
      if (s < 0.05) return 0.04;
      if (s < 0.3) return 0.04 + 0.07 * smoothstep(0.05, 0.3, s);
      return classicHalfWidth(s) * 0.95;
    },
    head: { span: 0.21, sweep: 0.006, depth: 0.085, notch: 0.014 },
    pectoral: [0.16, 0.38, 0.49, 0.24],
    falcate: true,
    pelvic: [0.55, 0.62, 0.67, 0.085],
    caudal: 0.13,
    dorsal: [0.24, 0.45],
    secondDorsal: [0.68, 0.74],
    eye: null,
    gills: [0.15, 0.25],
    tint: [0.86, 0.93, 1.02],
  },
  // Shortfin mako: a long conical snout, a torpedo body that narrows hard to the tail stalk,
  // and a tall crescent tail. Metallic indigo back.
  mako: {
    halfWidth: (s) => {
      if (s < 0.17) return 0.088 * Math.pow(Math.sin(((s / 0.17) * Math.PI) / 2), 1.5);
      if (s < 0.32) return 0.088 + 0.012 * smoothstep(0.17, 0.32, s);
      if (s < 0.86) return 0.014 + 0.086 * Math.pow(1 - (s - 0.32) / 0.54, 1.45);
      const k = (s - 0.86) / 0.14;
      return 0.014 * (1 - k) + 0.01 * Math.sin(k * Math.PI);
    },
    pectoral: [0.18, 0.4, 0.5, 0.21],
    falcate: true,
    pelvic: [0.58, 0.64, 0.68, 0.06],
    caudal: 0.13,
    dorsal: [0.34, 0.45],
    secondDorsal: [0.76, 0.79],
    eye: [0.11, 0.15],
    gills: [0.2, 0.3],
    tint: [0.78, 0.9, 1.2],
  },
  // Thresher: a compact body over the front half, then the upper tail lobe as a long whip
  // that's as long as the shark itself. Big eyes, long sickle pectorals, bronze-violet skin.
  thresher: {
    halfWidth: (s) => {
      if (s < 0.08) return 0.07 * Math.pow(Math.sin(((s / 0.08) * Math.PI) / 2), 0.75);
      if (s < 0.2) return 0.07 + 0.02 * smoothstep(0.08, 0.2, s);
      if (s < 0.48) return 0.012 + 0.078 * Math.pow(1 - (s - 0.2) / 0.28, 1.3);
      // The whip: thin, with a slight sickle swell before it tapers out.
      const k = (s - 0.48) / 0.52;
      return 0.012 * (1 - k) + 0.006 * Math.sin(k * Math.PI * 0.9) + 0.002;
    },
    pectoral: [0.12, 0.27, 0.36, 0.2],
    falcate: true,
    pelvic: [0.37, 0.41, 0.44, 0.045],
    caudal: 0,
    dorsal: [0.24, 0.32],
    secondDorsal: [0.45, 0.47],
    eye: [0.05, 0.1],
    gills: [0.11, 0.18],
    tint: [1.0, 0.9, 1.08],
  },
  // Nurse shark: a blunt, broad head, a heavy flattened body with both dorsals set far back,
  // rounded paddle pectorals, and a long low tail with no lower lobe. Tawny brown.
  nurse: {
    halfWidth: (s) => {
      if (s < 0.08) return 0.085 * Math.pow(Math.sin(((s / 0.08) * Math.PI) / 2), 0.4);
      if (s < 0.3) return 0.085 + 0.02 * smoothstep(0.08, 0.3, s);
      if (s < 0.72) return 0.022 + 0.083 * Math.pow(1 - (s - 0.3) / 0.42, 1.1);
      const k = (s - 0.72) / 0.28;
      return 0.022 * (1 - k * k) + 0.014 * Math.sin(k * Math.PI);
    },
    pectoral: [0.16, 0.34, 0.4, 0.17],
    falcate: false,
    pelvic: [0.45, 0.52, 0.55, 0.075],
    caudal: 0,
    dorsal: [0.5, 0.58],
    secondDorsal: [0.63, 0.69],
    eye: [0.05, 0.075],
    gills: [0.14, 0.22],
    tint: [1.1, 0.96, 0.76],
  },
};

const KINDS = Object.keys(SHAPES) as SharkKind[];

function inTriangle(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/** Visible dark-grey cell grid, snapped to device pixels. Shared with the sidebar backdrop. */
export function paintGrid(g: CanvasRenderingContext2D, W: number, H: number, cw: number, ch: number, dpr: number) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = "rgba(255,255,255,0.055)";
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}

export class AsciiRenderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = "ui-monospace, Menlo, monospace";

  private dotKind = new Uint8Array(0); // 0 none, 1 blue, 2 green, 3 red, 4 pale
  private dotPhase = new Float32Array(0);
  private dotFreq = new Float32Array(0);
  private energy = new Float32Array(0);
  private energyTmp = new Float32Array(0);
  private night = 0;
  private heat = new Float32Array(0);
  /** Ripple progress (0 near the origin to 1 at the far edge, +0.01) per cell; 0 means no ripple. */
  private tint = new Float32Array(0);
  private bucketOf = new Uint8Array(0);
  private bucketOrder = new Int32Array(0);
  private bucketCounts = new Int32Array(DOT_RGB.length * ALPHA_LEVELS + 1);
  private dotStyles: string[] = [];

  private sharkFlag = new Uint8Array(0);
  private sharkShade = new Float32Array(0);
  private sharkKey = new Uint32Array(0);
  private sharkDepth = new Float32Array(0);
  private sharkKind = new Uint8Array(0);
  /** Cells darkened by a shark's shadow on the seabed. */
  private sharkShadow = new Uint8Array(0);
  private spine = new Float32Array(SHARK_NODES * 2);
  private arc = new Float32Array(SHARK_NODES);
  private arcTotal = 1;
  private shape = SHAPES.classic;
  private sharkId = 0;
  private finTipLeft = 0;
  private finTipRight = 0;
  // Scratch outputs of sampleShark(), to avoid allocating per sample.
  private hitFlag = 0;
  private hitShade = 0;
  private hitS = 0;
  private hitV = 0;
  private hitDist = 0;

  /** Cells holding a fish this frame (frame stamp); dots skip them. */
  private fishStamp = new Uint32Array(0);
  private frameId = 0;
  /** Fish cells bucketed by brightness, so each bucket is one fillStyle. */
  private fishBuckets: number[][] = FISH_ALPHAS.map(() => []);
  private fishStyles = FISH_ALPHAS.map((a) => `rgba(230,238,255,${a})`);

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");

    for (let c = 0; c < DOT_RGB.length; c++) {
      const [r, g, b] = DOT_RGB[c];
      for (let l = 0; l < ALPHA_LEVELS; l++) {
        const a = (DOT_BASE_ALPHA[c] * (l + 1)) / ALPHA_LEVELS;
        this.dotStyles.push(`rgba(${r},${g},${b},${a.toFixed(3)})`);
      }
    }
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
  }

  setFontFamily(family: string) {
    if (family) this.fontFamily = family;
  }

  resize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.cw = clamp(Math.round(width / 124), 8, 13);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;

    const n = this.cols * this.rows;
    this.dotKind = new Uint8Array(n);
    this.dotPhase = new Float32Array(n);
    this.dotFreq = new Float32Array(n);
    this.energy = new Float32Array(n);
    this.energyTmp = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.tint = new Float32Array(n);
    this.bucketOf = new Uint8Array(n);
    this.bucketOrder = new Int32Array(n);
    this.sharkFlag = new Uint8Array(n);
    this.sharkShade = new Float32Array(n);
    this.sharkKey = new Uint32Array(n);
    this.sharkDepth = new Float32Array(n);
    this.sharkKind = new Uint8Array(n);
    this.sharkShadow = new Uint8Array(n);
    this.fishStamp = new Uint32Array(n);

    for (let i = 0; i < n; i++) {
      const col = i % this.cols;
      const row = (i / this.cols) | 0;
      // No ambient dots: the grid stays black. Only the cyan wake lights cells.
      this.dotKind[i] = 0;
      this.dotPhase[i] = hash3(col, row, 23) * Math.PI * 2;
      this.dotFreq[i] = 0.3 + hash3(col, row, 37) * 1.1;
    }
    this.paintBackground();
  }

  private paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    paintGrid(g, W, H, cw, ch, dpr);
  }

  render(world: World, dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;
    this.night = world.night;

    this.consumeEvents(world);
    this.rasterizeSharks(world.sharks, t);
    this.depositWake(world);
    this.diffuse(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.night > 0) {
      ctx.fillStyle = `rgba(0,10,30,${(0.3 * this.night).toFixed(3)})`;
      ctx.fillRect(0, 0, this.cols * this.cw, this.rows * this.ch);
    }

    this.markFish(world);
    this.drawDots(t);

    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawHeat();
    this.drawFish();
    this.drawJellies(world);
    this.drawWhale(world);
    this.drawWhirl(world);
    this.drawAngler(world);
    this.drawKraken(world);
    this.drawSharks(t);
    if (this.night > 0) {
      ctx.fillStyle = `rgba(0,8,26,${(0.2 * this.night).toFixed(3)})`;
      ctx.fillRect(0, 0, this.cols * this.cw, this.rows * this.ch);
    }
  }


  /** Collects glyphs by grid cell (first one wins unless forced), then draws them in one pass. */
  private painter() {
    const { ctx, cw, ch, cols, rows } = this;
    const cells = new Map<number, [string, string]>();
    const put = (x: number, y: number, glyph: string, color: string, force = false) => {
      const col = Math.floor(x / cw);
      const row = Math.floor(y / ch);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return;
      const key = row * cols + col;
      if (force || !cells.has(key)) cells.set(key, [glyph, color]);
    };
    const flush = () => {
      for (const [key, [glyph, color]] of cells) {
        ctx.fillStyle = color;
        ctx.fillText(glyph, (key % cols) * cw + cw / 2, Math.floor(key / cols) * ch + ch / 2 + 1);
      }
    };
    return { put, flush };
  }

  /**
   * The kraken: a bulbous head with one huge slit-pupilled eye in the middle of it, and ten
   * thick tentacles that burst out around the back of the head, sweep back and curl at the tips.
   * Tentacles holding a shark lunge to it and coil along its body; the whole thing shudders in its grip.
   */
  private drawKraken(world: World) {
    const k = world.kraken;
    if (!k) return;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    const grip = k.state === "grab";
    const hx = k.x + (grip ? Math.sin(k.phase * 7.3) * 3 : 0);
    const hy = k.y + (grip ? Math.cos(k.phase * 9.1) * 3 : 0);
    const dx = Math.cos(k.heading);
    const dy = Math.sin(k.heading);
    const S = k.size;
    const back = k.heading + Math.PI;
    const R = S * 0.17 * (1 + 0.04 * Math.sin(k.phase * 1.1));
    const cx = hx + dx * R * 0.2;
    const cy = hy + dy * R * 0.2;
    const holders = k.grabbed.length;
    const HOLD = [1, 2, 4, 5, 7, 8];
    const limbs = 10;

    for (let a = 0; a < limbs; a++) {
      const phi = (a / (limbs - 1) - 0.5) * 2 * 1.75;
      const ang0 = back + phi;
      const rx = cx + Math.cos(ang0) * R * 0.75;
      const ry = cy + Math.sin(ang0) * R * 0.75;
      const feeder = a === 4 || a === 5;
      const N = 80;
      const pts: number[] = [];
      const holds = grip && holders > 0 && HOLD.includes(a);
      if (holds) {
        const sh = k.grabbed[a % holders];
        const n0 = 5 + (a % 3) * 3;
        const x0 = sh.nodes[n0 * 2];
        const y0 = sh.nodes[n0 * 2 + 1];
        const vx = x0 - rx;
        const vy = y0 - ry;
        const vl = Math.hypot(vx, vy) || 1;
        const bow = S * 0.2 * Math.sin(k.phase * 1.5 + a * 1.3);
        const bx = (rx + x0) / 2 + (-vy / vl) * bow;
        const by = (ry + y0) / 2 + (vx / vl) * bow;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          if (t < 0.7) {
            const u = t / 0.7;
            pts.push((1 - u) * (1 - u) * rx + 2 * (1 - u) * u * bx + u * u * x0, (1 - u) * (1 - u) * ry + 2 * (1 - u) * u * by + u * u * y0);
          } else {
            // Coil around the shark's body, following its spine.
            const u = (t - 0.7) / 0.3;
            const f = n0 + u * 4;
            const i0 = Math.min(SHARK_NODES - 2, Math.floor(f));
            const w = f - i0;
            const sx = sh.nodes[i0 * 2] * (1 - w) + sh.nodes[i0 * 2 + 2] * w;
            const sy = sh.nodes[i0 * 2 + 1] * (1 - w) + sh.nodes[i0 * 2 + 3] * w;
            const tx = sh.nodes[i0 * 2 + 2] - sh.nodes[i0 * 2];
            const ty = sh.nodes[i0 * 2 + 3] - sh.nodes[i0 * 2 + 1];
            const tl = Math.hypot(tx, ty) || 1;
            const wrap = Math.sin(u * 11 + a + k.phase * 2) * sh.length * 0.055;
            pts.push(sx + (-ty / tl) * wrap, sy + (tx / tl) * wrap);
          }
        }
      } else {
        // Leaves the head radially, then sweeps back and hooks inward at the tip.
        const len = feeder ? S * 1.5 : S * (0.7 + 0.3 * Math.abs(Math.sin(a * 2.3)) + 0.25 * (Math.abs(phi) / 1.75));
        const ds = len / N;
        const curl = -phi * 0.55;
        let x = rx;
        let y = ry;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          pts.push(x, y);
          const wave = Math.sin(k.phase * 1.3 - t * 5 + a * 0.9) * 0.42 * Math.pow(t, 0.8);
          const ang = back + phi * (1 - 0.55 * t) + curl * t * t - k.bend * 0.4 * t + wave;
          x += Math.cos(ang) * ds;
          y += Math.sin(ang) * ds;
        }
      }
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const j = Math.min(N - 1, i);
        const tx = pts[(j + 1) * 2] - pts[j * 2];
        const ty = pts[(j + 1) * 2 + 1] - pts[j * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl;
        const ny = tx / tl;
        const half = feeder ? 1 : Math.round(2.3 * Math.pow(1 - t, 1.5));
        for (let o = -half; o <= half; o++) {
          const edge = Math.abs(o) === half && half > 0;
          const glyph = holds && t > 0.97 ? "@" : feeder && t > 0.93 ? "@" : edge ? "o" : t < 0.25 ? "#" : t < 0.7 ? "o" : ".";
          const shade = 190 - 85 * t - (edge ? 25 : 0);
          put(pts[i * 2] + nx * o * cw * 0.85, pts[i * 2 + 1] + ny * o * cw * 0.85, glyph, `rgb(${shade + 15},${40 + 24 * (1 - t)},${84 + 26 * (1 - t)})`);
        }
      }
    }

    // The head: a mottled dome.
    const ramp = ":;t%S8#@";
    for (let y = cy - R; y <= cy + R; y += ch * 0.7) {
      for (let x = cx - R; x <= cx + R; x += cw * 0.7) {
        const d = Math.hypot(x - cx, y - cy) / R;
        if (d > 1) continue;
        const shade = Math.min(0.99, 0.2 + 0.55 * d + 0.2 * (y > cy ? 1 : 0));
        const wart = (Math.floor(x / cw) * 7 + Math.floor(y / ch) * 13) % 9 === 0;
        const c = 214 - shade * 110;
        put(x, y, wart ? "*" : ramp[Math.floor(shade * ramp.length)], `rgb(${c},${Math.max(30, c - 90)},${Math.max(60, c - 60)})`, true);
      }
    }

    // One huge eye in the middle of the head: pale rim, amber iris, a glowing vertical slit.
    const re = R * 0.52;
    for (let y = cy - re; y <= cy + re; y += ch * 0.7) {
      for (let x = cx - re; x <= cx + re; x += cw * 0.7) {
        const e = Math.hypot(x - cx, y - cy) / re;
        if (e > 1) continue;
        if (e > 0.8) put(x, y, "O", "rgb(250,244,232)", true);
        else if (Math.abs(x - cx) < cw * 0.55 && e < 0.7) put(x, y, "|", "rgb(255,250,225)", true);
        else if (e > 0.4) put(x, y, "@", "rgb(236,164,50)", true);
        else put(x, y, "@", "rgb(120,40,20)", true);
      }
    }
    flush();
  }

  /** Jellyfish: a pulsing glass bell with trailing strands, glowing cyan to violet. */
  private drawJellies(world: World) {
    if (!world.jellies.length) return;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    for (const j of world.jellies) {
      const r = j.size * (1 + 0.14 * Math.sin(j.phase));
      const rgb = `${Math.round(120 + 80 * j.hue)},${Math.round(205 - 65 * j.hue)},255`;
      for (let y = j.y - r * 0.85; y <= j.y + r * 0.12; y += ch * 0.7) {
        for (let x = j.x - r; x <= j.x + r; x += cw * 0.7) {
          const nx = (x - j.x) / r;
          const ny = (y - j.y) / (r * 0.85);
          const d = nx * nx + ny * ny;
          if (d > 1) continue;
          const rim = d > 0.68;
          put(x, y, rim ? (ny < -0.2 ? "-" : nx < 0 ? "(" : ")") : (Math.floor(x / cw) + Math.floor(y / ch)) % 4 === 0 ? "." : ":", `rgba(${rgb},${rim ? 0.95 : 0.55})`, true);
        }
      }
      for (let x = j.x - r; x <= j.x + r; x += cw) put(x, j.y + r * 0.16, "~", `rgba(${rgb},0.9)`, true);
      for (let sIdx = 0; sIdx < 6; sIdx++) {
        const len = 8 + (sIdx % 3) * 3;
        for (let i = 1; i <= len; i++) {
          const sway = Math.sin(j.phase * 0.8 - i * 0.55 + sIdx) * cw * 1.3 * (i / len);
          put(j.x + (sIdx - 2.5) * r * 0.36 + sway, j.y + r * 0.16 + i * ch * 0.9, i < len * 0.6 ? "|" : i < len * 0.85 ? ":" : ".", `rgba(${rgb},${(0.8 * (1 - i / (len + 2))).toFixed(2)})`);
        }
      }
    }
    flush();
  }

  /** A whale: a huge slow body that undulates, with pectoral fins and horizontal flukes. */
  private drawWhale(world: World) {
    const w = world.whale;
    if (!w) return;
    const { cw } = this;
    const { put, flush } = this.painter();
    const L = w.length;
    const dx = Math.cos(w.heading);
    const dy = Math.sin(w.heading);
    const px = -dy;
    const py = dx;
    const centre = (u: number): [number, number] => {
      const bend = Math.sin(w.phase - u * 3.2) * 0.035 * L * u;
      return [w.x - dx * L * u + px * bend, w.y - dy * L * u + py * bend];
    };
    const half = (u: number) => L * 0.1 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.04)), 0.8) * (u < 0.8 ? 1 : Math.max(0.12, (1 - u) / 0.2));
    const ramp = ".:;%S8#";
    for (let u = 0; u <= 0.93; u += (cw * 0.6) / L) {
      const [cx, cy] = centre(u);
      const [nx2, ny2] = centre(u + 0.01);
      const tl = Math.hypot(nx2 - cx, ny2 - cy) || 1;
      const nx = -(ny2 - cy) / tl;
      const ny = (nx2 - cx) / tl;
      const hw = half(u);
      const steps = Math.max(1, Math.ceil(hw / (cw * 0.6)));
      for (let o = -steps; o <= steps; o++) {
        const v = o / steps;
        const bx = cx + nx * v * hw;
        const by = cy + ny * v * hw;
        const belly = Math.max(-1, Math.min(1, (by - cy) / Math.max(hw, 1)));
        const dark = 0.5 - 0.5 * belly;
        const c = 150 - dark * 70;
        put(bx, by, ramp[Math.min(ramp.length - 1, Math.floor(dark * ramp.length))], `rgb(${c - 20},${c + 5},${c + 45})`, true);
      }
    }
    const [ex, ey] = centre(0.07);
    put(ex + px * half(0.07) * 0.5, ey + py * half(0.07) * 0.5, "o", "rgb(240,240,230)", true);
    // Flukes at the tail, pectoral fin along the flank.
    const [tx0, ty0] = centre(0.96);
    for (let i = -14; i <= 14; i++) {
      const f = i / 14;
      put(tx0 + px * f * L * 0.13 - dx * Math.abs(f) * L * 0.03, ty0 + py * f * L * 0.13 - dy * Math.abs(f) * L * 0.03, "~", "rgb(120,150,195)", true);
    }
    const [fx, fy] = centre(0.3);
    for (let i = 0; i <= 8; i++) put(fx + px * (half(0.3) + i * cw * 0.9) - dx * i * cw * 0.5, fy + py * (half(0.3) + i * cw * 0.9) - dy * i * cw * 0.5, "/", "rgb(130,160,200)", true);
    flush();
  }

  /** A whirlpool: four spiral arms of foam turning around the centre. */
  private drawWhirl(world: World) {
    const wp = world.whirl;
    if (!wp) return;
    const { put, flush } = this.painter();
    const fade = Math.max(0, Math.min(1, (world.time - wp.born) / 2, (wp.until - world.time) / 2));
    for (let arm = 0; arm < 4; arm++) {
      for (let i = 0; i <= 70; i++) {
        const t = i / 70;
        const rad = wp.r * 2.3 * t;
        const ang = wp.dir * (t * 6 + world.time * 2.2) + (arm * Math.PI) / 2;
        put(wp.x + Math.cos(ang) * rad, wp.y + Math.sin(ang) * rad * 0.8, t < 0.15 ? "@" : "~", `rgba(110,220,235,${(0.8 * fade * (1 - t * 0.7)).toFixed(2)})`, true);
      }
    }
    flush();
  }

  /** An anglerfish: a dim toothy body in the dark, a stalk, and a glowing lure. */
  private drawAngler(world: World) {
    const an = world.angler;
    if (!an) return;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    const t = world.time;
    const fade = Math.max(0, Math.min(1, (t - an.born) / 2, (an.until - t) / 3));
    const f = an.face;
    const a = an.size;
    const b = an.size * 0.75;
    const ramp = "S%8#";
    for (let y = an.y - b; y <= an.y + b; y += ch * 0.7) {
      for (let x = an.x - a; x <= an.x + a; x += cw * 0.7) {
        const nx = (x - an.x) / a;
        const ny = (y - an.y) / b;
        if (nx * nx + ny * ny > 1) continue;
        put(x, y, ramp[Math.min(3, Math.floor((0.3 + 0.35 * Math.hypot(nx, ny) + 0.2 * ny) * 4))], `rgba(74,98,126,${(0.85 * fade).toFixed(2)})`, true);
      }
    }
    const open = t < an.snapUntil;
    for (let i = 0; i < 6; i++) {
      const x = an.x + f * (a * 0.5 + i * cw * 0.9);
      put(x, an.y + b * 0.2 - (open ? ch : 0), "v", `rgba(225,230,235,${fade.toFixed(2)})`, true);
      put(x, an.y + b * 0.2 + (open ? ch * 1 : ch * 0.1), "^", `rgba(225,230,235,${fade.toFixed(2)})`, true);
    }
    put(an.x + f * a * 0.35, an.y - b * 0.25, "O", `rgba(255,190,70,${fade.toFixed(2)})`, true);
    put(an.x - f * a * 1.05, an.y, f > 0 ? ">" : "<", `rgba(74,98,126,${fade.toFixed(2)})`, true);
    // Stalk arching up and over to the lure.
    const sx = an.x + f * a * 0.3;
    const sy = an.y - b * 0.7;
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      const cxm = (sx + an.lx) / 2;
      const cym = Math.min(sy, an.ly) - an.size * 0.5;
      put((1 - u) * (1 - u) * sx + 2 * (1 - u) * u * cxm + u * u * an.lx, (1 - u) * (1 - u) * sy + 2 * (1 - u) * u * cym + u * u * an.ly, ",", `rgba(140,170,190,${fade.toFixed(2)})`, true);
    }
    put(an.lx, an.ly, "@", `rgba(215,255,255,${fade.toFixed(2)})`, true);
    flush();
  }

  // ── simulation → field ──────────────────────────────────────────────

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private stamp(field: Float32Array, x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  private consumeEvents(world: World) {
    for (const e of world.events) {
      if (e.kind === "eat") {
        this.stamp(this.heat, e.x, e.y, 2, 1);
        this.stamp(this.energy, e.x, e.y, 3, 0.9);
      } else {
        this.stamp(this.energy, e.x, e.y, e.strength && e.strength < 0.5 ? 2 : e.strength && e.strength > 1.5 ? 8 : 6, Math.min(1.6, 1.4 * (e.strength ?? 1)));
      }
    }
    world.events.length = 0;
    // Draw each splash ring as it travels; it dims as it spreads.
    for (const rp of world.ripples) {
      const fade = 1 - rp.r / rp.max;
      const steps = Math.max(12, Math.ceil((Math.PI * 2 * rp.r) / (this.cw * 0.8)));
      const thick = rp.strength > 1.5 ? 2 : rp.strength >= 1.2 ? 1 : 0;
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const amp = rp.amp[Math.floor((k / steps) * rp.amp.length)];
        if (amp < 0.05) continue;
        const x = rp.x + Math.cos(a - Math.PI) * rp.r;
        const y = rp.y + Math.sin(a - Math.PI) * rp.r;
        this.stamp(this.energy, x, y, thick, (thick === 0 ? 0.8 * fade : Math.min(0.5, 0.2 * fade * rp.strength)) * amp);
        const ci = this.cellIndex(x, y);
        if (ci >= 0) this.tint[ci] = Math.max(this.tint[ci], 1 - fade + 0.01);
      }
    }
  }

  private depositWake(world: World) {
    const { energy } = this;
    for (const f of world.fish) {
      if (!f.alive) continue;
      const i = this.cellIndex(f.x, f.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.012 + f.alarm * 0.03);
    }
    for (const sh of world.sharks) {
      // The tail sweeps the most water.
      for (let k = SHARK_NODES - 6; k < SHARK_NODES; k++) {
        const i = this.cellIndex(sh.nodes[k * 2], sh.nodes[k * 2 + 1]);
        if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.05 + sh.speed * 0.0012);
      }
    }
    if (world.pointer.active) {
      this.stamp(energy, world.pointer.x, world.pointer.y, 1, 0.08);
    }
    if (world.angler) this.stamp(energy, world.angler.lx, world.angler.ly, 3, 0.7);
  }

  /** Blur + decay so wakes spread out like ripples and fade. */
  private diffuse(dt: number) {
    const { cols, rows, energy, energyTmp: tmp, heat } = this;
    const decay = Math.exp(-dt * 1.5);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    // Spread the ripple colour with the glow, and drop it once the glow is gone.
    const tint = this.tint;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (tmp[i] < 0.2) { tint[i] = 0; continue; }
        let m = tint[i];
        if (c > 0 && tint[i - 1] > m) m = tint[i - 1];
        if (c < cols - 1 && tint[i + 1] > m) m = tint[i + 1];
        if (r > 0 && tint[i - cols] > m) m = tint[i - cols];
        if (r < rows - 1 && tint[i + cols] > m) m = tint[i + cols];
        tint[i] = m;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
    const heatDecay = Math.exp(-dt * 2.2);
    for (let i = 0; i < heat.length; i++) heat[i] *= heatDecay;
  }

  // ── sharks ──────────────────────────────────────────────────────────

  /**
   * Classify one point against the current shark (spine/arc already built).
   * Body coordinates: s along the spine (0 snout → 1 tail), v across it.
   * Writes hit* fields and returns whether the point is on the shark.
   */
  private sampleShark(px: number, py: number, L: number) {
    const { spine, arc } = this;
    const N = SHARK_NODES;
    let best = Infinity;
    let bestS = 0;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;
    for (let k = 0; k < N - 1; k++) {
      const ax = spine[k * 2];
      const ay = spine[k * 2 + 1];
      const sx = spine[(k + 1) * 2] - ax;
      const sy = spine[(k + 1) * 2 + 1] - ay;
      const len2 = sx * sx + sy * sy || 1;
      const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
      const qx = ax + sx * u;
      const qy = ay + sy * u;
      const d2 = (px - qx) ** 2 + (py - qy) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.sqrt(len2);
        bestS = (arc[k] + u * len) / this.arcTotal;
        bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
        bestNx = (-sy / len) * bestSign;
        bestNy = (sx / len) * bestSign;
      }
    }

    const a = Math.sqrt(best);
    const s = bestS;
    const u = s * L;
    const shape = this.shape;
    const w = shape.halfWidth(s) * L;
    this.hitDist = a;
    this.hitS = s;
    this.hitV = a * bestSign;

    const head = this.shape.head;
    if (head && u < L * (head.sweep + head.depth + head.notch)) {
      // Cephalofoil: a wide wing across the snout, its tips swept back toward the eyes,
      // and on a great hammerhead a shallow notch in the middle of the front edge.
      const span = L * head.span;
      const r = a / span;
      const front = L * head.sweep * r * r + L * head.notch * Math.max(0, 1 - r / 0.14);
      // Full depth almost to the tips, so the wing reads as a solid bar rather than a thin line.
      const depth = L * head.depth * (1 - 0.2 * r * r * r * r);
      if (r <= 1 && u >= front && u <= front + depth) {
        this.hitFlag = r > 0.84 ? FLAG_EYE : FLAG_BODY;
        this.hitShade = r > 0.84 ? 0 : 0.62 - 0.2 * r + (u < front + L * 0.012 ? 0.1 : 0);
        return true;
      }
    }

    if (a <= w) {
      const across = a / (w || 1);
      // Rounded back lit from the top-left; flanks fall off into shadow.
      const facing = (bestNx * -0.6 + bestNy * -0.8) * across;
      let shade = 0.58 - across * across * 0.42 + facing * 0.26;
      let flag = FLAG_BODY;
      if (s > shape.dorsal[0] && s < shape.dorsal[1] && across < 0.3) {
        // First dorsal fin, catching the light.
        flag = FLAG_RIDGE;
        shade = 1;
      } else if (s > shape.secondDorsal[0] && s < shape.secondDorsal[1] && across < 0.4) {
        shade = Math.max(shade, 0.82);
      } else if (shape.eye && s > shape.eye[0] && s < shape.eye[1] && across > 0.6) {
        flag = FLAG_EYE;
        shade = 0;
      } else if (s > shape.gills[0] && s < shape.gills[1] && across > 0.58) {
        // Five gill slits.
        if (Math.floor(((s - shape.gills[0]) / (shape.gills[1] - shape.gills[0])) * 5) % 2 === 0) shade *= 0.45;
      } else if (s < 0.05) {
        // Pale snout tip.
        shade = Math.max(shade, 0.7);
      } else if (shape === SHAPES.zebra && s > 0.08 && s < 0.55 && (across < 0.1 || Math.abs(across - 0.6) < 0.08)) {
        // Zebra sharks carry pale ridges down the back.
        shade = Math.max(shade, 0.8);
      } else if (this.marked(s, a * bestSign, L, across)) {
        flag = FLAG_MARK;
      }
      this.hitFlag = flag;
      this.hitShade = shade;
      return true;
    }

    const tip = bestSign > 0 ? this.finTipRight : this.finTipLeft;
    const [p0, p1, p2] = shape.pectoral;
    if (
      inTriangle(u, a, L * p0, 0, L * p1, 0, L * p2, tip) &&
      // Falcate (sickle) fins get a concave trailing edge.
      !(shape.falcate && inTriangle(u, a, L * p1, 0, L * (p1 + (p2 - p1) * 0.33), tip * 0.55, L * p2, tip))
    ) {
      this.hitFlag = this.marked(s, a * bestSign, L, 0) ? FLAG_MARK : FLAG_FIN;
      this.hitShade = 0.38 + 0.22 * (1 - clamp(a / tip, 0, 1));
      return true;
    }
    const [v0, v1, v2, vr] = shape.pelvic;
    if (
      inTriangle(u, a, L * v0, 0, L * v1, 0, L * v2, L * vr) ||
      // Forked caudal fin.
      (shape.caudal > 0 && inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * shape.caudal))
    ) {
      this.hitFlag = FLAG_FIN;
      this.hitShade = 0.36;
      return true;
    }
    return false;
  }

  /** Whether a body point (s along, v across) falls on a dark marking. */
  private marked(s: number, v: number, L: number, across: number) {
    if (this.shape === SHAPES.tiger) {
      // Wavy vertical bars over the back half, fading out toward the head.
      if (s < 0.2 || s > 0.9 || across > 0.85) return false;
      const wobble = 0.35 * Math.sin((v / L) * 25 + s * 5);
      const bar = Math.sin(s * Math.PI * 2 * 9 + wobble);
      return bar > 0.65 - 0.5 * smoothstep(0.2, 0.42, s) + 0.4 * smoothstep(0.8, 0.9, s);
    }
    if (this.shape === SHAPES.zebra) {
      // Leopard spots on a jittered grid, so they ride along with the skin.
      if (s < 0.07) return false;
      const gu = (s * L) / (L * 0.06);
      const gv = v / (L * 0.045);
      const cu = Math.floor(gu);
      const cv = Math.floor(gv);
      const jx = hash3(cu, cv, this.sharkId) * 0.5 + 0.25;
      const jy = hash3(cu, cv, this.sharkId + 11) * 0.5 + 0.25;
      return (gu - cu - jx) ** 2 + (gv - cv - jy) ** 2 < 0.08;
    }
    return false;
  }

  /**
   * Build a smooth, undulating render spine from the sim spine, then
   * supersample every cell in the shark's bounding box against the shape.
   * Fully covered cells become solid skin; partial cells become edge glyphs.
   */
  private rasterizeSharks(sharks: Shark[], t: number) {
    const { sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind, sharkShadow, spine, arc, cw, ch, cols, rows } = this;
    sharkFlag.fill(0);
    sharkShadow.fill(0);

    for (const sh of sharks) {
      const L = sh.length;
      const N = SHARK_NODES;
      const n = sh.nodes;
      const swim = clamp(sh.speed / 60, 0.4, 1.4);
      this.shape = SHAPES[sh.kind];
      this.sharkId = sh.id;
      const kindIndex = KINDS.indexOf(sh.kind);

      // Travelling body wave, growing toward the tail.
      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const amp = L * 0.05 * (0.1 + 0.9 * Math.pow(s, 1.8)) * swim;
        const off = amp * Math.sin(sh.phase - s * 5.2);
        spine[k * 2] = n[k * 2] - ty * off;
        spine[k * 2 + 1] = n[k * 2 + 1] + tx * off;
      }
      arc[0] = 0;
      for (let k = 1; k < N; k++) {
        arc[k] =
          arc[k - 1] +
          Math.hypot(spine[k * 2] - spine[(k - 1) * 2], spine[k * 2 + 1] - spine[(k - 1) * 2 + 1]);
      }
      this.arcTotal = arc[N - 1] || 1;

      // Bank into turns: the inside fin foreshortens, the outside one spreads.
      const bank = clamp(sh.turn * 0.45, -0.35, 0.35);
      const flex = 1 + 0.06 * Math.sin(sh.phase * 0.5);
      const reachFin = this.shape.pectoral[3];
      this.finTipRight = L * reachFin * flex * (1 - bank);
      this.finTipLeft = L * reachFin * flex * (1 + bank);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let k = 0; k < N; k++) {
        minX = Math.min(minX, spine[k * 2]);
        maxX = Math.max(maxX, spine[k * 2]);
        minY = Math.min(minY, spine[k * 2 + 1]);
        maxY = Math.max(maxY, spine[k * 2 + 1]);
      }
      const reach = L * 0.36;
      const c0 = Math.max(0, Math.floor((minX - reach) / cw));
      const c1 = Math.min(cols - 1, Math.floor((maxX + reach) / cw));
      const r0 = Math.max(0, Math.floor((minY - reach) / ch));
      const r1 = Math.min(rows - 1, Math.floor((maxY + reach) / ch));
      if (c0 > c1 || r0 > r1) continue;

      const skipBeyond = reach + Math.hypot(cw, ch);
      const shadowDc = Math.round((L * 0.035) / cw) + 1;
      const shadowDr = Math.round((L * 0.02) / ch) + 1;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = this.sampleShark(x + cw / 2, y + ch / 2, L);
          if (!centerHit && this.hitDist > skipBeyond) continue;
          const flag = this.hitFlag;
          const shade = this.hitShade;
          const s = this.hitS;
          const v = this.hitV;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sampleShark(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, L)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;

          const i = r * cols + c;
          // Body-anchored key so each glyph rides along with the skin.
          const key = (hash3(Math.round(s * 52), Math.round(v / (cw * 0.9)), sh.id) * 4294967295) >>> 0;
          sharkKey[i] = key;
          sharkDepth[i] = sh.depth;
          sharkKind[i] = kindIndex;

          if (centerHit && coverage >= 0.6) {
            sharkFlag[i] = flag;
            const flicker = (hash3(c, r, Math.floor(t * 6)) - 0.5) * 0.06;
            sharkShade[i] = clamp(shade + flicker, 0, 1);
            const sc = c + shadowDc;
            const sr = r + shadowDr;
            if (sc < cols && sr < rows) sharkShadow[sr * cols + sc] = 1;
          } else {
            sharkFlag[i] = FLAG_EDGE;
            sharkShade[i] = coverage;
          }
        }
      }
    }
  }

  private drawSharks(t: number) {
    const { ctx, cols, rows, cw, ch, sharkFlag, sharkShade, sharkKey, sharkDepth, sharkKind } = this;
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      const flag = sharkFlag[i];
      if (!flag) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = sharkKey[i];
      const shade = sharkShade[i];
      const dim = 0.7 + 0.3 * sharkDepth[i];
      const [tr, tg, tb] = SHAPES[KINDS[sharkKind[i]]].tint;

      // Colours re-roll on a staggered clock so the hide shimmers.
      const tick = Math.floor(t * 2.4 + (key % 997) / 97);
      const roll = hash3(key, tick, 7);

      if (flag === FLAG_EDGE) {
        // Soft, anti-aliased silhouette: no block, just a light glyph.
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        const g = (70 + shade * 80) * dim;
        ctx.fillStyle =
          roll < 0.07
            ? ACCENTS[key % ACCENTS.length]
            : `rgb(${Math.round(g * tr)},${Math.round(g * tg)},${Math.min(255, Math.round(g * tb + 6))})`;
        ctx.fillText(set[(key >>> 8) % set.length], x + cw / 2, y + ch / 2 + 1);
        continue;
      }

      let level: number;
      let glyph: string;
      if (flag === FLAG_RIDGE) {
        level = 226;
        glyph = RIDGE_GLYPHS[(key >>> 8) % RIDGE_GLYPHS.length];
      } else if (flag === FLAG_EYE) {
        level = 12;
        glyph = "o";
      } else if (flag === FLAG_MARK) {
        level = 24 + shade * 22;
        glyph = MARK_GLYPHS[(key >>> 8) % MARK_GLYPHS.length];
      } else if (flag === FLAG_FIN) {
        level = 40 + shade * 120;
        glyph = FIN_GLYPHS[(key >>> 8) % FIN_GLYPHS.length];
      } else {
        level = 46 + shade * 160;
        const jitter = ((key >>> 4) % 3) - 1;
        glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, SKIN_RAMP.length - 1)];
      }
      level *= dim;
      // Tinted per species; the classic tint is a cool blue-grey, like a back seen through deep water.
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(level * tr))},${Math.min(255, Math.round(level * tg))},${Math.min(255, Math.round(level * tb + 4))})`;
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

      let color: string;
      if (flag === FLAG_EYE) color = "#9aa0ad";
      else if (flag === FLAG_MARK) color = `rgb(${Math.round(70 * tr)},${Math.round(70 * tg)},${Math.round(70 * tb)})`;
      else if (roll < 0.09) color = ACCENTS[key % ACCENTS.length];
      else if (roll < 0.13) color = "#ffffff";
      else color = shade > 0.55 ? "#0e0f13" : "#1b1d24";
      ctx.fillStyle = color;
      ctx.fillText(glyph, x + cw / 2, y + ch / 2 + 1);
    }
  }

  // ── fish, dots, heat ────────────────────────────────────────────────

  /**
   * Snap each fish to a cell and bucket it by brightness: far fish are dim,
   * near fish brighter, and turning or panicking fish glint. Nearer fish
   * claim a cell first when two land in the same one.
   */
  private markFish(world: World) {
    const { fishStamp, fishBuckets, sharkFlag } = this;
    const frame = ++this.frameId;
    for (const bucket of fishBuckets) bucket.length = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const f of world.fish) {
        if (!f.alive || (f.depth > 0.78 ? 0 : 1) !== pass) continue;
        const i = this.cellIndex(f.x, f.y);
        if (i < 0 || fishStamp[i] === frame || sharkFlag[i]) continue;
        fishStamp[i] = frame;
        const glint = clamp(Math.abs(f.turn) / 3.5, 0, 1);
        const v = 0.3 + (0.4 * (f.depth - 0.55)) / 0.45 + 0.3 * Math.max(glint, f.alarm);
        fishBuckets[clamp(Math.floor(v * FISH_ALPHAS.length), 0, FISH_ALPHAS.length - 1)].push(i);
      }
    }
  }

  private drawFish() {
    const { ctx, cw, ch, cols, fishBuckets } = this;
    for (let b = 0; b < fishBuckets.length; b++) {
      const bucket = fishBuckets[b];
      if (!bucket.length) continue;
      ctx.fillStyle = this.fishStyles[b];
      for (const i of bucket) {
        ctx.fillText("-", (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
      }
    }
  }

  private drawHeat() {
    const { ctx, heat, cols, cw, ch } = this;
    for (let i = 0; i < heat.length; i++) {
      const h = heat[i];
      if (h < 0.08) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      ctx.fillStyle = h > 0.5 ? `rgba(255,120,60,${h.toFixed(2)})` : `rgba(220,40,40,${(h * 1.6).toFixed(2)})`;
      ctx.fillText(h > 0.6 ? "*" : "·", col * cw + cw / 2, row * ch + ch / 2 + 1);
    }
  }

  /**
   * Every cell's dot twinkles on its own clock, is modulated by slow
   * caustic light bands, and flares cyan where the wake field is strong.
   * Dots are bucketed by colour/alpha so each bucket is one fillStyle.
   */
  private drawDots(t: number) {
    const { ctx, cols, rows, cw, ch, dotKind, dotPhase, dotFreq, energy, sharkFlag, sharkShadow, fishStamp, frameId } = this;
    const { bucketOf, bucketOrder, bucketCounts } = this;
    const n = cols * rows;
    const SKIP = bucketCounts.length - 1;
    bucketCounts.fill(0);

    for (let i = 0; i < n; i++) {
      // After dark a few dots flare like bioluminescence.
      const spark = this.night > 0.2 && Math.sin(t * dotFreq[i] * 0.7 + dotPhase[i] * 3) > 0.985;
      const e = energy[i] + (spark ? 0.6 * this.night : 0);
      const kind = dotKind[i];
      if (sharkFlag[i] || fishStamp[i] === frameId || (kind === 0 && e < 0.45)) {
        bucketOf[i] = SKIP;
        continue;
      }
      let bucket: number;
      if (e > 0.45) {
        const level = clamp(Math.floor((e - 0.45) * 5), 0, ALPHA_LEVELS - 1);
        const tv = this.tint[i];
        const color = tv > 0 ? RIPPLE_BASE + Math.min(RIPPLE_STEPS - 1, Math.floor((tv - 0.01) * RIPPLE_STEPS)) : WAKE;
        bucket = color * ALPHA_LEVELS + level;
      } else {
        const col = i % cols;
        const row = (i / cols) | 0;
        // Dots stay bright and crisp; the twinkle is a gentle breathe, not a fade.
        const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
        const caustic = 0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
        let v = clamp((0.55 + 0.45 * twinkle) * caustic + e * 2, 0, 1) * (1 - 0.4 * this.night);
        if (sharkShadow[i]) v *= 0.2;
        bucket = (kind - 1) * ALPHA_LEVELS + clamp(Math.floor(v * ALPHA_LEVELS), 0, ALPHA_LEVELS - 1);
      }
      bucketOf[i] = bucket;
      bucketCounts[bucket]++;
    }

    // Counting sort cells by bucket.
    const starts = new Int32Array(bucketCounts.length);
    for (let b = 1; b < bucketCounts.length; b++) starts[b] = starts[b - 1] + bucketCounts[b - 1];
    const cursor = starts.slice();
    for (let i = 0; i < n; i++) {
      const b = bucketOf[i];
      if (b !== SKIP) bucketOrder[cursor[b]++] = i;
    }

    const small = Math.max(2, Math.round(cw * 0.19));
    const large = small + 1;
    for (let b = 0; b < SKIP; b++) {
      const count = bucketCounts[b];
      if (!count) continue;
      ctx.fillStyle = this.dotStyles[b];
      const size = b >= WAKE * ALPHA_LEVELS ? large : small;
      const start = starts[b];
      for (let k = start; k < start + count; k++) {
        const i = bucketOrder[k];
        const col = i % cols;
        const row = (i / cols) | 0;
        // Sit the dot low-right in its cell, as in the reference.
        ctx.fillRect(Math.round(col * cw + cw * 0.66 - size / 2), Math.round(row * ch + ch * 0.64 - size / 2), size, size);
      }
    }
  }
}
