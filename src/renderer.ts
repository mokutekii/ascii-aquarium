/**
 * Draws the World as a grid of ASCII cells:
 *   1. a pure black cell grid
 *   2. a wake field that diffuses where things swim, lighting the dots cyan
 *   3. fish as minimal ASCII dashes, one per cell, glinting on hard turns
 *   4. sharks rasterised cell-by-cell with supersampled edges: grey blocks
 *      shaded by the light, dense glyphs, and shimmering accent colours
 */
import { angleDiff, clamp, hash3, smoothstep } from "./math";
import { DIVER_SUIT, KRAKEN_ARC, SHARK_NODES, STRIKE_TIME, type Shark, type SharkKind, type World } from "./world";

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
const RIPPLE_STEPS = 8;
/** Eases from one colour to another over RIPPLE_STEPS steps, for a soft gradient as a ring spreads. */
const ramp = (from: [number, number, number], to: [number, number, number]) =>
  Array.from({ length: RIPPLE_STEPS }, (_, i): [number, number, number] => [0, 1, 2].map((k) => Math.round(from[k] + (to[k] - from[k]) * (i / (RIPPLE_STEPS - 1)))) as [number, number, number]);
DOT_RGB.push(...ramp([234, 224, 255], [132, 116, 214]));
const ORANGE_BASE = DOT_RGB.length;
DOT_RGB.push(...ramp([255, 234, 204], [214, 132, 74]));
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
/**
 * Sideways offset of a shark's spine at s (0 snout to 1 tail). Ordinary sharks beat faster the faster they swim; the
 * megalodon keeps a long, slow S-curve that builds toward the tail, and a bigger, tighter wave while it thrashes.
 */
function bodyWave(sh: Shark, s: number) {
  const L = sh.length;
  // About a full wavelength along the body, so the middle swings across as well as the tail: an S that travels, never a fixed crescent.
  if (!sh.mega) return L * 0.05 * (0.2 + 0.8 * Math.pow(s, 1.6)) * clamp(sh.speed / 60, 0.4, 1.4) * (sh.tailAmp ?? 1) * Math.sin(sh.phase - s * 6.6);
  const th = sh.thrash ?? 0;
  const power = clamp(0.6 + sh.speed / 150, 0.6, 1.25) * (1 + 0.55 * th);
  return L * 0.065 * (0.2 + 0.8 * Math.pow(s, 1.5)) * power * Math.sin(sh.phase - s * (5.8 + 1.2 * th));
}

/**
 * The megalodon's tail fin is a blade hinged on the tail stalk: it points along the end of the body, then pitches a
 * little behind the wave, so each stroke whips through the fin instead of sliding past it. Returns its base point and axis.
 */
function megaFinFrame(sh: Shark, sp: ArrayLike<number>, N: number) {
  const th = sh.thrash ?? 0;
  const power = clamp(0.6 + sh.speed / 150, 0.6, 1.25) * (1 + 0.55 * th);
  const fi = 0.88 * (N - 1);
  const i0 = Math.floor(fi);
  const w = fi - i0;
  const bx = sp[i0 * 2] * (1 - w) + sp[i0 * 2 + 2] * w;
  const by = sp[i0 * 2 + 1] * (1 - w) + sp[i0 * 2 + 3] * w;
  const ang = Math.atan2(sp[(N - 1) * 2 + 1] - sp[(N - 3) * 2 + 1], sp[(N - 1) * 2] - sp[(N - 3) * 2]) +
    Math.cos(sh.phase - (5.8 + 1.2 * th) - 1.0) * (0.3 + 0.12 * th) * Math.min(1.4, power);
  return { bx, by, c: Math.cos(ang), s: Math.sin(ang) };
}

/** The kraken's ivory, shared by its body and every arm that wraps something so they match exactly. */
/** Which spine node an arm takes hold at: the body, and never the saw at a sawshark's snout. */
function bodyNode(sh: Shark, a: number) {
  return sh.kind === "sawshark" ? 8 + (a % 4) * 2 : 3 + (a % 5) * 3;
}
/** Arms that can hold one shark, and ones that can wrap a megalodon; each takes hold ARM_STAGGER seconds after the last. */
const HOLD_ARMS = 3;
/** A bigger shark needs more arms to hold it: one for a small one, up to HOLD_ARMS for the biggest. */
const holdArmsFor = (sh: Shark) => Math.max(1, Math.min(HOLD_ARMS, Math.round(sh.length / 130)));
/** Every limb takes hold of a wrapped megalodon (none left waving free); the coil bands are fewer so they stay readable. */
const WRAP_ARMS = 10;
const WRAP_BANDS = 7;
const ARM_STAGGER = 0.45;
const WRAP_STAGGER = 0.15;
/** How angry the kraken looks this frame (0 calm → 1 furious): its ivory flushes red. Set once per frame by render(). */
let boneRage = 0;
function krakenBone(v: number, tint = 0) {
  const c = Math.round(Math.max(90, Math.min(252, v)));
  // Calm, the ivory carries a dark green cast.
  const r0 = c * 0.84;
  const g = c * 0.95 - tint * 0.2;
  const b = c * 0.7 - tint * 0.4;
  if (boneRage <= 0) return `rgb(${Math.round(r0)},${Math.round(g)},${Math.round(b)})`;
  // Enraged, the hide sinks to a dark olive green shot with yellow, and the brightest parts (suckers, rim highlights) glow
  // yellow instead of fading with the rest.
  if (v >= 245) return `rgb(${Math.round(r0 + (255 - r0) * boneRage)},${Math.round(g + (228 - g) * boneRage)},${Math.round(b + (60 - b) * boneRage)})`;
  return `rgb(${Math.round(r0 + (c * 0.62 - r0) * boneRage)},${Math.round(Math.max(g + (c * 0.8 - g) * boneRage, 105 * boneRage))},${Math.round(b + (c * 0.16 - b) * boneRage)})`;
}

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

const BASE_SHAPES: Record<Exclude<SharkKind, "ghost">, SharkShape> = {
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
    tint: [1.32, 0.74, 0.66],
  },
  // Sawshark: a long flat blade for a snout, its edges set with teeth, ahead of a slim,
  // sandy body with small fins and a modest tail.
  sawshark: {
    halfWidth: (s) => {
      if (s < 0.3) return 0; // the blade is drawn separately, in white (drawSawBlade)
      if (s < 0.4) return 0.012 + 0.056 * smoothstep(0.3, 0.4, s);
      if (s < 0.86) return 0.018 + 0.05 * Math.pow(1 - (s - 0.4) / 0.46, 1.2);
      const k = (s - 0.86) / 0.14;
      return 0.018 * (1 - k) + 0.01 * Math.sin(k * Math.PI);
    },
    pectoral: [0.42, 0.56, 0.64, 0.15],
    falcate: true,
    pelvic: [0.65, 0.7, 0.73, 0.055],
    caudal: 0.1,
    dorsal: [0.56, 0.63],
    secondDorsal: [0.74, 0.78],
    eye: [0.37, 0.4],
    gills: [0.42, 0.5],
    tint: [1.04, 0.96, 0.86],
  },
};

// A pale spectral cousin of the classic shark: same body, drained of colour and washed with cold cyan.
const SHAPES: Record<SharkKind, SharkShape> = { ...BASE_SHAPES, ghost: { ...BASE_SHAPES.classic, tint: [0.72, 1.18, 1.3] } };

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
  private displayScale = 1;
  setDisplayScale(scale: number) { this.displayScale = scale; }
  private width = 0;
  private height = 0;
  private yeat = 0;
  /** Event bars waiting to be drawn on top of everything else this frame. */
  private hud: (() => void)[] = [];
  private lastShake = "";
  private reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private lastYeat = 0;
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
  /** Cells of a megalodon seen by x-ray (yeat mode): the skin is dimmed so the bones show through. */
  private sharkXray = new Uint8Array(0);
  /** 0-255: how enraged the megalodon that owns this cell is (its hide deepens to crimson and glows amber). */
  private sharkRage = new Uint8Array(0);
  /** Cells darkened by a shark's shadow on the seabed. */
  private sharkShadow = new Uint8Array(0);
  private spine = new Float32Array(SHARK_NODES * 2);
  /** Scratch spine for the yeat skeleton, reused every frame instead of allocated. */
  private skeletonSpine = new Float32Array(SHARK_NODES * 2);
  private arc = new Float32Array(SHARK_NODES);
  private arcTotal = 1;
  private shape = SHAPES.classic;
  /** The megalodon's tail fin as a blade that pitches on the end of the tail, lagging the wave: base point and axis. */
  private megaFin: { bx: number; by: number; c: number; s: number } | null = null;
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
    this.sharkXray = new Uint8Array(n);
    this.sharkRage = new Uint8Array(n);
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
    this.yeat = world.yeat;
    // Yeat mode: everything goes monochrome with a hard contrast curve and a soft white halo round
    // every glyph, like the hazy grayscale album covers.
    if (this.yeat !== this.lastYeat) {
      this.lastYeat = this.yeat;
      const y = this.yeat;
      this.canvas.style.filter = y > 0 ? `grayscale(${y.toFixed(3)}) contrast(${(1 + 0.5 * y).toFixed(3)}) brightness(${(1 + 0.25 * y).toFixed(3)}) drop-shadow(0 0 ${(3 * y).toFixed(1)}px rgba(255,255,255,${(0.85 * y).toFixed(3)})) drop-shadow(0 0 ${(12 * y).toFixed(1)}px rgba(255,255,255,${(0.6 * y).toFixed(3)})) drop-shadow(0 0 ${(30 * y).toFixed(1)}px rgba(255,255,255,${(0.35 * y).toFixed(3)}))` : "";
    }

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

    if (this.yeat > 0) {
      // Crush the water to a black void and drift patchy wisps of white fog through it.
      const w = this.cols * this.cw;
      const h = this.rows * this.ch;
      ctx.fillStyle = `rgba(0,0,0,${(0.82 * this.yeat).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      // Wisps of fog form at random spots, drift, and melt away again, each on its own clock, so the
      // haze is patchy and always changing rather than one big light.
      const hash = (n: number) => {
        const x = Math.sin(n * 127.1) * 43758.5453;
        return x - Math.floor(x);
      };
      for (let i = 0; i < 10; i++) {
        const period = 9 + hash(i * 3.3) * 8;
        const clock = t / period + hash(i * 7.7);
        const slot = Math.floor(clock);
        const env = Math.pow(Math.sin(Math.PI * (clock - slot)), 1.4) * this.yeat;
        if (env < 0.02) continue;
        const seed = i * 17.3 + slot * 5.1;
        const drift = (clock - slot) * period;
        const fx = w * hash(seed) + Math.cos(hash(seed + 1) * 6.28) * drift * 5;
        const fy = h * hash(seed + 2) + Math.sin(hash(seed + 1) * 6.28) * drift * 3;
        const fr = Math.max(w, h) * (0.05 + 0.09 * hash(seed + 3));
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(hash(seed + 4) * Math.PI);
        ctx.scale(1, 0.4 + 0.3 * hash(seed + 5));
        for (let b = 0; b < 3; b++) {
          const bx = (hash(seed + 6 + b) - 0.5) * fr * 1.4;
          const by = (hash(seed + 9 + b) - 0.5) * fr * 0.8;
          const br = fr * (0.55 + 0.45 * hash(seed + 12 + b));
          const fog = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          fog.addColorStop(0, `rgba(235,235,235,${(0.1 * env).toFixed(3)})`);
          fog.addColorStop(1, "rgba(235,235,235,0)");
          ctx.fillStyle = fog;
          ctx.fillRect(bx - br, by - br, br * 2, br * 2);
        }
        ctx.restore();
      }
    }

    this.drawCurrent(world);
    this.markFish(world);
    this.drawDots(t);
    this.drawYeatGlows(world, t);

    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawHeat();
    this.drawInk(world);
    this.drawFish();
    this.drawJellies(world);
    this.drawWhale(world);
    this.drawWhirl(world);
    this.drawDivers(world);
    this.drawBolts(world);
    this.drawBombs(world);
    this.drawMess(world);
    this.drawAlerts(world);
    this.drawUfo(world);
    this.drawDebris(world);
    boneRage = world.krakenRage() * (0.88 + 0.12 * Math.sin(world.time * 5));
    // A kraken wrapped round the megalodon is drawn over it, so its arms really lie across the body instead of vanishing beneath it.
    const overShark = world.kraken?.state === "wrap" && !!world.kraken.wrapping && !world.kraken.maul;
    if (!overShark) this.drawKraken(world);
    this.drawSharks(t);
    if (overShark) this.drawKraken(world);
    this.drawWhaleBite(world);
    this.drawMegaSkeleton(world);
    this.drawWraps(world);
    boneRage = 0;
    this.drawFightHud(world);
    // The announced events stack their banners one under another, the invasion first.
    let slot = 0;
    // A boss fight owns the HUD: while the titans clash only its one line is shown, whatever else is running.
    const clash = world.sagas.find((sg) => sg.kind === "clash");
    if (clash) this.drawSagaBanner(world, clash, slot++);
    else {
      if (world.invasion) this.drawInvasion(world, slot++);
      for (const sg of world.sagas) this.drawSagaBanner(world, sg, slot++);
    }
    // Only three bars are ever drawn; the rest fold into one line.
    if (slot > 3) {
      const extra = slot - 3;
      this.hud.push(() => {
        const { put, flush } = this.painter();
        const more = `+${extra} more`;
        const cx = (this.cols * this.cw) / 2;
        for (let i = 0; i < more.length; i++) put(cx + (i - more.length / 2) * this.cw, this.ch * (3.2 + 3 * 4.2 + 0.2), more[i], this.yeat > 0.05 ? "rgb(200,205,220)" : "rgb(170,175,185)", true);
        flush(this.yeat * 8);
      });
    }
    this.drawMeteors(world);
    this.drawSawBlade(world);
    this.drawSlices(world);
    if (this.yeat > 0) {
      // Dark vignette, so the glow sits in the middle of a black frame.
      const w = this.cols * this.cw;
      const h = this.rows * this.ch;
      const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, `rgba(0,0,0,${(0.85 * this.yeat).toFixed(3)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawTitanEntrance(world);
    if (this.night > 0) {
      ctx.fillStyle = `rgba(0,8,26,${(0.2 * this.night).toFixed(3)})`;
      ctx.fillRect(0, 0, this.cols * this.cw, this.rows * this.ch);
    }
    this.drawHud();
  }


  /**
   * A kraken or megalodon swimming in shakes the whole tank for a couple of seconds and dims everything
   * except the water around it, as if it blotted out the light.
   */
  private drawTitanEntrance(world: World) {
    const te = world.titanEntry;
    const age = te ? world.time - te.born : 99;
    const still = age > 5 || this.reduced;
    const shake = still ? 0 : Math.min(1, age / 0.25) * Math.max(0, 1 - age / 2.6);
    const css = shake > 0.01 ? `translate(${(Math.sin(world.time * 47) * 5 * shake).toFixed(1)}px,${(Math.cos(world.time * 39) * 4 * shake).toFixed(1)}px)` : "";
    if (css !== this.lastShake) {
      this.lastShake = css;
      this.canvas.style.transform = css;
    }
    if (still) return;
    const env = Math.min(1, age / 0.8) * Math.max(0, 1 - age / 5);
    if (env <= 0.01) return;
    const mega = world.sharks.find((sh) => sh.mega);
    const k = world.kraken;
    const at = k && (!mega || k.born > (mega.born ?? 0)) ? { x: k.x, y: k.y, r: k.size * 0.7 } : mega ? { x: mega.nodes[0], y: mega.nodes[1], r: mega.length * 0.5 } : null;
    if (!at) return;
    const w = this.cols * this.cw;
    const h = this.rows * this.ch;
    const g = this.ctx.createRadialGradient(at.x, at.y, at.r * 0.4, at.x, at.y, Math.max(w, h) * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.35, `rgba(0,0,6,${(0.38 * env).toFixed(3)})`);
    g.addColorStop(1, `rgba(0,0,6,${(0.62 * env).toFixed(3)})`);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, w, h);
  }

  /** Clouds of kraken ink: dark, slightly violet blots that swell, drift and thin out. */
  private drawInk(world: World) {
    const { ctx } = this;
    const hash = (n: number) => {
      const x = Math.sin(n * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    for (const c of world.inks) {
      const age = world.time - c.born;
      const R = c.r0 + (c.r1 - c.r0) * Math.min(1, age / 3);
      const a = Math.min(1, age / 1.2) * Math.pow(Math.max(0, 1 - age / c.life), 0.8);
      if (a <= 0.01) continue;
      for (let b = 0; b < 3; b++) {
        const bx = c.x + (hash(c.seed + b * 3) - 0.5) * R * 0.9;
        const by = c.y + (hash(c.seed + b * 3 + 1) - 0.5) * R * 0.7;
        const br = R * (0.6 + 0.4 * hash(c.seed + b * 3 + 2));
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `rgba(2,0,10,${(0.92 * a).toFixed(3)})`);
        g.addColorStop(0.55, `rgba(20,8,44,${(0.6 * a).toFixed(3)})`);
        g.addColorStop(1, "rgba(30,14,60,0)");
        ctx.fillStyle = g;
        ctx.fillRect(bx - br, by - br, br * 2, br * 2);
      }
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
    const flush = (glow = 0) => {
      for (const [key, [glyph, color]] of cells) {
        ctx.fillStyle = color;
        if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
        ctx.fillText(glyph, (key % cols) * cw + cw / 2, Math.floor(key / cols) * ch + ch / 2 + 1);
      }
      if (glow > 0) { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; }
    };
    return { put, flush };
  }

  /**
   * The kraken, drawn as a giant squid in pale, heavy glyphs: a hatched cone mantle with fins, a
   * round head with one big hollow eye, a bunch of short arms, and four long tentacles that curl
   * into loops. Its arms always reach toward what it holds (it turns to face its prey), coil around
   * the sharks, and the whole squid shudders in its grip.
   */
  private drawKraken(world: World) {
    const k = world.kraken;
    if (!k) return;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    const wrapped = k.state === "wrap" && !!k.wrapping && !k.maul;
    const grip = k.state === "grab" || wrapped;
    const shudder = k.maul && k.biteAt !== undefined ? 16 : (wrapped ? (world.time < k.shakeUntil ? 9 : 5) * (k.ambush ? 1.5 : 1) : 3) * (1 + 0.9 * world.krakenRage());
    // Just after a blast the whole body is knocked about: the head jolts and the mantle lurches off its line, while the arms
    // flail loose. An angry kraken (blast or blood moon) also thrashes its arms harder.
    const hit = clamp(1 - (world.time - (k.blastAt ?? -99)) / 2.5, 0, 1);
    const anger = world.krakenRage();
    const hx = k.x + (grip ? Math.sin(k.phase * 3.6) * shudder : 0) + Math.sin(world.time * 31) * k.size * 0.014 * hit;
    const hy = k.y + (grip ? Math.cos(k.phase * 4.4) * shudder : 0) + Math.cos(world.time * 27) * k.size * 0.014 * hit;
    const skew = hit * (0.3 + Math.sin(world.time * 17) * 0.2);
    const dx = Math.cos(k.heading + skew);
    const dy = Math.sin(k.heading + skew);
    const px = -dy;
    const py = dx;
    const S = k.size;
    const mdx = dx;
    const mdy = dy;
    const mpx = px;
    const mpy = py;
    const armAng = k.heading + Math.PI;
    const pulse = 1 + 0.04 * Math.sin(k.phase * 1.1);
    const R = S * 0.1 * pulse;
    const held = wrapped ? [k.wrapping!] : k.grabbed;
    const holders = held.length;
    // A whale in the grip gets the same full set of limbs as a megalodon: each one grips its own spot along the body.
    const whaleHold = k.whaleTarget && k.whaleUntil > world.time && k.whaleLanded !== undefined ? k.whaleTarget : null;
    const whaleGrip = (a: number) => {
      // Each limb takes its own spot within arm's reach of where the kraken has hold of the whale.
      const spread = (((a * 0.618) % 1) - 0.5) * Math.min(0.6, (k.size * 0.8) / whaleHold!.length);
      const u = clamp((k.whaleU ?? 0.4) + spread, 0.05, 0.95);
      return world.whalePoint(whaleHold!, u);
    };
    const bone = krakenBone;
    // Charging a megalodon or a whale, the arms spread wide and then snap together as each jet stroke drives it forward.
    const attack = k.lunging || k.hunt ? clamp(k.jet, 0, 1) : 0;
    const open = (1 - Math.sin(k.phase * 1.1)) / 2;
    const spreadMul = k.stroke !== undefined ? 1 + 0.9 * k.stroke : 1 + 1.1 * attack * open;

    // Six short arms and four long looping tentacles, reaching out from the front of the head.
    const shortArms = 6;
    const limbs = shortArms + 4;
    for (let a = 0; a < limbs; a++) {
      const feeder = a >= shortArms;
      const fi = a - shortArms;
      const psi = feeder ? [-0.75, -0.25, 0.25, 0.75][fi] : (a / (shortArms - 1) - 0.5) * 2.0;
      let rootAng = armAng + psi;
      // Arms take hold one at a time: the first lands where the reach ended, the rest follow, up to what the kraken
      // could really wrap with. The rest keep waving until their turn comes, so the count only ever climbs.
      // Every limb is on the whale; only when enraged do the long tentacles stay free to flail at divers, saucers and sharks.
      const wp = whaleHold && !(anger > 0 && feeder) ? whaleGrip(a) : null;
      const sh0 = wp || holders === 0 ? null : held[a % holders];
      const sinceG = wp ? world.time - (k.whaleStart ?? world.time) : !sh0 ? 0 : wrapped ? (k.lunging ? 0 : world.time - k.stateAt) : world.time - (sh0.grabbedAt ?? -99);
      // A whale grip is taken by all the limbs together, a hair apart, not one after another.
      const armSince = wp ? sinceG - (a % 4) * 0.05 : sinceG - Math.floor(a / Math.max(1, holders)) * (wrapped ? WRAP_STAGGER : ARM_STAGGER);
      const attached = wp ? armSince >= 0 : grip && !!sh0 && (!feeder || wrapped) && Math.floor(a / holders) < (wrapped ? WRAP_ARMS : holdArmsFor(sh0)) && armSince >= 0;
      // An arm taking hold sweeps from where it was waving to its grip rather than jumping there: it always stays joined to the body.
      const prog = attached ? clamp(armSince / (0.9 + (a % 3) * 0.2), 0, 1) : 0;
      const ease = prog * prog * (3 - 2 * prog);
      // An arm that is holding something roots on the side of the head facing it, so it never has to cross the head.
      if (attached) {
        let aim: number;
        if (wp) aim = Math.atan2(wp.y - hy, wp.x - hx);
        else {
          const tgt = held[a % holders];
          const tn = bodyNode(tgt, a);
          aim = Math.atan2(tgt.nodes[tn * 2 + 1] - hy, tgt.nodes[tn * 2] - hx);
        }
        rootAng = armAng + psi + (clamp(angleDiff(armAng, aim), -1.3, 1.3) - psi) * ease;
      }
      const rx = hx + Math.cos(rootAng) * R * 0.85;
      const ry = hy + Math.sin(rootAng) * R * 0.85;
      const N = 90;
      const pts: number[] = [];
      // Round a megalodon every limb holds on, the long tentacles too.
      const holds = attached;
      const hp: number[] = [];
      if (holds) {
        const sh = wp ? null : held[a % holders];
        const n0 = sh ? bodyNode(sh, a) : 0;
        const x0 = wp ? wp.x : sh!.nodes[n0 * 2];
        const y0 = wp ? wp.y : sh!.nodes[n0 * 2 + 1];
        const vx = x0 - rx;
        const vy = y0 - ry;
        const vl = Math.hypot(vx, vy) || 1;
        const bow = S * 0.16 * Math.sin(k.phase * 1.5 + a * 1.3);
        // The control point pushes outward from the head first, so the arm leaves it radially before bending to the shark.
        const bx = (rx + x0) / 2 + (-vy / vl) * bow + Math.cos(rootAng) * vl * 0.25;
        const by = (ry + y0) / 2 + (vx / vl) * bow + Math.sin(rootAng) * vl * 0.25;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          if (t < 0.5) {
            const u = t / 0.5;
            hp.push((1 - u) * (1 - u) * rx + 2 * (1 - u) * u * bx + u * u * x0, (1 - u) * (1 - u) * ry + 2 * (1 - u) * u * by + u * u * y0);
          } else if (sh) {
            // Coil around the shark's body, following its spine.
            // Then it spirals round the body for several turns, crossing it on both sides.
            const u = (t - 0.5) / 0.5;
            const f = Math.min(SHARK_NODES - 1.01, n0 + u * 5);
            const i0 = Math.min(SHARK_NODES - 2, Math.floor(f));
            const w = f - i0;
            const sx = sh.nodes[i0 * 2] * (1 - w) + sh.nodes[i0 * 2 + 2] * w;
            const sy = sh.nodes[i0 * 2 + 1] * (1 - w) + sh.nodes[i0 * 2 + 3] * w;
            const tx = sh.nodes[i0 * 2 + 2] - sh.nodes[i0 * 2];
            const ty = sh.nodes[i0 * 2 + 3] - sh.nodes[i0 * 2 + 1];
            const tl = Math.hypot(tx, ty) || 1;
            const wrap = Math.sin(u * 20 + a + k.phase * 2) * Math.max(sh.length * 0.05, 14);
            hp.push(sx + (-ty / tl) * wrap, sy + (tx / tl) * wrap);
          } else {
            // Round the whale: the limb winds across its flank the way it winds a shark.
            const u = (t - 0.5) / 0.5;
            const wrap = Math.sin(u * 20 + a + k.phase * 2) * Math.max(whaleHold!.length * 0.08, 16);
            hp.push(x0 - Math.sin(whaleHold!.heading) * wrap, y0 + Math.cos(whaleHold!.heading) * wrap);
          }
        }
      }
      {
        // Arms fan out and wave; the long tentacles trail out and curl over into loops.
        // Jetting stretches the arms out behind it.
        const len = (feeder ? S * (1.2 + 0.18 * Math.abs(psi)) : S * (0.4 + 0.2 * Math.sin((a + 0.5) * 1.9) ** 2)) * (1 + 0.3 * k.jet);
        const ds = len / N;
        const curl = feeder ? (psi < 0 ? -1 : 1) * (3.4 + 1.2 * Math.abs(psi)) * (1 - 0.6 * k.jet) : -psi * 0.6;
        let x = rx;
        let y = ry;
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          pts.push(x, y);
          // Arms that aren't holding anything keep moving: a slow wave plus a lazy sway of their own, never frozen.
        const wave = (Math.sin(k.wave - t * (5 + 4 * k.jet) + a * 0.9) * (feeder ? 0.6 : 0.45) + Math.sin(k.phase * 0.8 + a * 1.7 - t * 2) * (feeder ? 0.3 : 0.12) + Math.sin(k.wave * 1.6 - t * 9 + a * 2) * (feeder ? 0.55 : 0.3) * Math.pow(t, 2.4)) * (1 + (k.stroke !== undefined ? 0.15 : 1.3) * k.jet + 1.6 * hit + 1.1 * anger) * (0.2 + 1.5 * Math.pow(t, 1.4));
          // Whatever the curl, no limb bends past 135 degrees either side of the line behind the head.
          const ang = armAng + clamp(psi * spreadMul * (feeder ? 0.7 : 0.9 - 0.4 * t) + curl * Math.pow(t, feeder ? 2.2 : 2) - k.bend * 0.9 * Math.pow(t, 1.3) + wave, -KRAKEN_ARC, KRAKEN_ARC);
          x += Math.cos(ang) * ds;
          y += Math.sin(ang) * ds;
        }
      }
      // The free arm is bent point by point onto its grip path as it takes hold, then coils.
      const reach = N;
      let girth = 1;
      if (holds) {
        for (let q = 0; q < pts.length; q++) pts[q] += (hp[q] - pts[q]) * ease;
        // A holding arm also thickens gradually as it lands.
        girth = 0.6 + 0.4 * ease;
      }
      for (let i = 0; i <= reach; i++) {
        const t = i / N;
        const j = Math.min(N - 1, i);
        // An arm never passes over the face: points on the head, or on the mantle in front of it, are not drawn.
        if (i > 2) {
          const ox = pts[i * 2] - hx;
          const oy = pts[i * 2 + 1] - hy;
          const along = ox * mdx + oy * mdy;
          if (Math.hypot(ox, oy) < R * 1.05 || (along > 0 && along < S * 0.62 && Math.abs(ox * mpx + oy * mpy) < R * 1.5)) continue;
        }
        const tx = pts[(j + 1) * 2] - pts[j * 2];
        const ty = pts[(j + 1) * 2 + 1] - pts[j * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl;
        const ny = tx / tl;
        // Arms that hold something (and the ones hauling it toward a megalodon) are thick, heavy limbs, not threads.
        const half = holds ? Math.max(1, Math.round((wrapped ? 2.4 : 1.6) * girth * Math.pow(1 - t, 0.8))) : Math.round((feeder ? 1.4 : 1.9) * Math.pow(1 - t, 1.2));
        // Neighbouring limbs alternate bright and dim, each with a dark rim and a thin gap cut round it, and the later one
        // sits on top, so where arms cross they read as separate arms instead of one glob.
        const tone = a % 2 ? -42 : 0;
        const apart = Math.hypot(pts[i * 2] - hx, pts[i * 2 + 1] - hy) > R * 1.6;
        if (apart && half > 0) {
          for (const o of [-half - 1, half + 1]) put(pts[i * 2] + nx * o * cw * 0.85, pts[i * 2 + 1] + ny * o * cw * 0.85, " ", "#000", true);
        }
        for (let o = -half; o <= half; o++) {
          const edge = Math.abs(o) === half && half > 0;
          const glyph = holds && t > 0.5 ? (i % 2 ? "@" : "8") : holds && t > 0.97 ? "@" : edge ? "o" : t < 0.2 ? "@" : t < 0.45 ? "8" : t < 0.75 ? "o" : ".";
          put(pts[i * 2] + nx * o * cw * 0.85, pts[i * 2 + 1] + ny * o * cw * 0.85, glyph, bone(240 - 110 * t + tone - (edge ? 70 : 0), 40 * t), apart);
        }
      }
    }

    // Mantle: a large cone out in front of the head, its tip pointing the way it swims. Hatched with slashes and outlined heavily.
    const Lm = S * 0.62 * pulse;
    // The mantle only leans a little into a turn, the tip leading while the base trails: no wriggling, the head stays steady.
    const flex = clamp(k.bend, -1, 1) * R * 1.6;
    const halfAt = (u: number) => R * 1.3 * Math.pow(1 - u, 0.9) * (1 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.2)));
    for (let y = hy - Lm - R * 2.5; y <= hy + Lm + R * 2.5; y += ch * 0.7) {
      for (let x = hx - Lm - R * 2.5; x <= hx + Lm + R * 2.5; x += cw * 0.7) {
        const rx = x - hx;
        const ry = y - hy;
        const along = rx * mdx + ry * mdy;
        const u = along / Lm;
        const uc = clamp(u, 0, 1);
        const across = rx * mpx + ry * mpy - flex * uc * uc;
        const inHead = Math.hypot(rx, ry) <= R;
        const inCone = u >= 0 && u <= 1 && Math.abs(across) <= halfAt(u);
        const fu = (u - 0.45) / 0.55;
        const fin = fu > 0 && fu <= 1 && Math.abs(across) <= halfAt(u) + R * 0.9 * Math.sin(Math.PI * fu) && Math.abs(across) > halfAt(u) * 0.85;
        if (!inHead && !inCone && !fin) continue;
        const col = Math.floor(x / cw);
        const row = Math.floor(y / ch);
        const band = (col + row) % 4;
        const rel = inCone ? Math.abs(across) / Math.max(halfAt(u), 1) : 0;
        let glyph: string;
        if (fin && !inCone && !inHead) glyph = across > 0 ? "\\" : "/";
        else if (inHead) glyph = (col * 3 + row) % 5 === 0 ? "0" : "8";
        else if (rel > 0.84) glyph = "@";
        else if (u < 0.12) glyph = "8";
        else glyph = band === 3 ? "%" : (col + row * 2) % 11 === 0 ? "*" : "/";
        const lum = inHead ? 238 : 232 - 80 * u - (rel > 0.84 ? 0 : 20);
        put(x, y, glyph, bone(lum, 30 * u), true);
      }
    }

    // One big hollow eye: a white ring around a black pupil, with a small highlight.
    const re = R * 0.62;
    const ex = hx - mdx * R * 0.1;
    const ey = hy - mdy * R * 0.1;
    for (let y = ey - re; y <= ey + re; y += ch * 0.7) {
      for (let x = ex - re; x <= ex + re; x += cw * 0.7) {
        const e = Math.hypot(x - ex, y - ey) / re;
        if (e > 1) continue;
        if (e > 0.62) put(x, y, "O", boneRage > 0 ? `rgb(255,${Math.round(255 - 50 * boneRage)},${Math.round(255 - 195 * boneRage)})` : "rgb(255,255,255)", true);
        else if (e < 0.18 && x < ex && y < ey) put(x, y, ".", "rgb(255,255,255)", true);
        else put(x, y, " ", "rgb(0,0,0)", true);
      }
    }
    flush();
  }

  /** The white slash that flashes in front of a sawshark as it cuts through the fish ahead. */
  private drawSlices(world: World) {
    const cutting = world.sharks.filter((sh) => (sh.sliceUntil ?? 0) > world.time);
    if (!cutting.length) return;
    const { put, flush } = this.painter();
    for (const sh of cutting) {
      const fade = Math.min(1, (sh.sliceUntil! - world.time) / 0.25);
      const reach = sh.length * 0.34;
      for (let a = -0.9; a <= 0.9; a += 0.15) {
        const ang = sh.heading + a;
        const x = sh.nodes[0] + Math.cos(ang) * reach;
        const y = sh.nodes[1] + Math.sin(ang) * reach;
        // A glyph along the arc's tangent.
        const t = ang + Math.PI / 2;
        const glyph = Math.abs(Math.cos(t)) > 0.92 ? "-" : Math.abs(Math.sin(t)) > 0.92 ? "|" : Math.cos(t) * Math.sin(t) > 0 ? "\\" : "/";
        put(x, y, glyph, `rgba(255,255,250,${fade.toFixed(2)})`, true);
      }
    }
    flush();
  }

  /** The sawshark's blade: a slim, bright white line for a snout. */
  private drawSawBlade(world: World) {
    const saws = world.sharks.filter((sh) => sh.kind === "sawshark");
    if (!saws.length) return;
    const { cw } = this;
    const { put, flush } = this.painter();
    for (const sh of saws) {
      const L = sh.length;
      for (let s = 0; s <= 0.31; s += (cw * 0.6) / L) {
        const f = s * (SHARK_NODES - 1);
        const i0 = Math.min(SHARK_NODES - 2, Math.floor(f));
        const w = f - i0;
        const x = sh.nodes[i0 * 2] * (1 - w) + sh.nodes[i0 * 2 + 2] * w;
        const y = sh.nodes[i0 * 2 + 1] * (1 - w) + sh.nodes[i0 * 2 + 3] * w;
        put(x, y, s < 0.03 ? "-" : "=", "rgb(255,255,250)", true);
      }
    }
    flush();
  }

  /** Jellyfish: a round, bulbed bell that pulses, with a frilled rim and short trailing strands. */
  private drawJellies(world: World) {
    if (!world.jellies.length) return;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    for (const j of world.jellies) {
      const r = j.size * (1 + 0.12 * Math.sin(j.phase));
      const rgb = `${Math.round(120 + 80 * j.hue)},${Math.round(205 - 65 * j.hue)},255`;
      const top = j.y - r * 1.5;
      for (let y = top; y <= j.y + r * 0.1; y += ch * 0.6) {
        for (let x = j.x - r; x <= j.x + r; x += cw * 0.6) {
          const nx = (x - j.x) / r;
          const ny = (y - j.y) / (r * 1.5);
          const d = nx * nx + ny * ny;
          if (d > 1) continue;
          let glyph: string;
          let alpha = 0.5 + 0.3 * world.night;
          if (d > 0.6) {
            alpha = 0.95;
            if (Math.abs(nx) < 0.45) glyph = "-";
            else if (ny < -0.4) glyph = ".";
            else glyph = nx < 0 ? "(" : ")";
          } else {
            glyph = (Math.floor(x / cw) + Math.floor(y / ch)) % 3 === 0 ? "." : ":";
          }
          put(x, y, glyph, `rgba(${rgb},${alpha})`, true);
        }
      }
      put(j.x, j.y - r * 0.55, "o", `rgba(${rgb},0.95)`, true);
      // A zap: a jagged yellow bolt from the bell to the diver.
      const zap = world.time - (j.zapAt ?? -9);
      if (zap < 0.6 && j.zapTarget) {
        const dx = j.zapTarget.x - j.x;
        const dy = j.zapTarget.y - j.y;
        const len = Math.hypot(dx, dy) || 1;
        const n = Math.max(4, Math.round(len / (cw * 0.9)));
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const jag = (Math.sin(i * 7.3 + zap * 60) * 0.5 + Math.sin(i * 3.1 + zap * 40) * 0.5) * cw * 1.4;
          put(j.x + dx * u - (dy / len) * jag, j.y + dy * u + (dx / len) * jag, i % 2 ? "/" : "\\", `rgba(255,245,130,${(1 - zap / 0.6).toFixed(2)})`, true);
        }
      }
      for (let x = j.x - r * 0.9; x <= j.x + r * 0.9; x += cw * 0.8) put(x, j.y + r * 0.16, "~", `rgba(${rgb},0.9)`, true);
      for (let sIdx = 0; sIdx < 5; sIdx++) {
        const len = 3 + (sIdx % 3);
        for (let i = 1; i <= len; i++) {
          const sway = Math.sin(j.phase * 0.8 - i * 0.6 + sIdx) * cw * 0.9 * (i / len);
          put(j.x + (sIdx - 2) * r * 0.42 + sway, j.y + r * 0.16 + i * ch * 0.9, i < len ? "|" : ":", `rgba(${rgb},${(0.8 * (1 - i / (len + 2))).toFixed(2)})`);
        }
      }
    }
    flush();
  }

  /**
   * A humpback seen from above: a blunt knobbly head, a long body that tapers to the tail,
   * two long pale flippers swept back, and wide notched flukes that sway as it swims.
   */
  /** Blood clouding out where a megalodon has clamped onto the whale. */
  private drawWhaleBite(world: World) {
    const wf = world.whaleFight;
    if (!wf || !wf.locked || !world.whales.includes(wf.whale)) return;
    const { cw } = this;
    const { put, flush } = this.painter();
    const m = wf.mega;
    const hx = m.nodes[0];
    const hy = m.nodes[1];
    const fx = Math.cos(Math.atan2(hy - m.nodes[3], hx - m.nodes[2]));
    const fy = Math.sin(Math.atan2(hy - m.nodes[3], hx - m.nodes[2]));
    const jaw = m.length * 0.075;
    // Blood clouds out from the wound.
    for (let i = 0; i < 10; i++) {
      const ang = i * 2.4 + world.time * 3;
      const r = cw * (1 + ((i * 7 + Math.floor(world.time * 6)) % 5));
      put(hx + fx * jaw * 0.5 + Math.cos(ang) * r, hy + fy * jaw * 0.5 + Math.sin(ang) * r, i % 3 ? "*" : ":", `rgb(${190 + (i % 3) * 25},40,55)`, true);
    }
    flush();
  }

  private drawWhale(world: World) {
    for (const w of world.whales) this.drawOneWhale(world, w);
  }

  private drawOneWhale(world: World, w: NonNullable<World["whale"]>) {
    const { cw } = this;
    const { put, flush } = this.painter();
    const L = w.length;
    const dx = Math.cos(w.heading);
    const dy = Math.sin(w.heading);
    const W0 = L * 0.095;
    const centre = (u: number): [number, number] => {
      // A travelling S-curve that grows toward the tail, with the head barely moving.
      const bend = Math.sin(w.phase - u * 5.2) * L * (0.016 + 0.046 * Math.pow(u, 1.4));
      const { x: bx, y: by } = world.whalePoint(w, u);
      return [bx - dy * bend, by + dx * bend];
    };
    // Position, forward tangent and side normal at a point along the body.
    const frame = (u: number) => {
      const [x0, y0] = centre(u);
      const [x1, y1] = centre(u + 0.01);
      const tl = Math.hypot(x0 - x1, y0 - y1) || 1;
      const tx = (x0 - x1) / tl;
      const ty = (y0 - y1) / tl;
      return { x: x0, y: y0, tx, ty, nx: -ty, ny: tx };
    };
    const half = (u: number) => {
      if (u < 0.14) { const q = 1 - u / 0.14; return W0 * 0.92 * Math.sqrt(Math.max(0, 1 - q * q)); }
      if (u < 0.45) return W0 * (0.92 + 0.08 * ((u - 0.14) / 0.31));
      if (u < 0.85) { const q = (u - 0.45) / 0.4; return W0 * (1 - 0.88 * (0.5 - 0.5 * Math.cos(Math.PI * q))); }
      return Math.max(2, W0 * 0.12 * (1 - (u - 0.85) / 0.15));
    };
    const ramp = ":;%8#";
    // Body, with knobbly tubercles on the head.
    for (let u = 0; u <= 0.975; u += (cw * 0.6) / L) {
      const f = frame(u);
      const hw = half(u);
      const steps = Math.max(1, Math.ceil(hw / (cw * 0.6)));
      for (let o = -steps; o <= steps; o++) {
        const v = o / steps;
        const x = f.x + f.nx * v * hw;
        const y = f.y + f.ny * v * hw;
        const centreWeight = 1 - Math.abs(v);
        const tubercle = u < 0.2 && (Math.floor(x / cw) * 5 + Math.floor(y / 14) * 7) % 6 === 0;
        const glyph = tubercle ? "*" : ramp[Math.min(ramp.length - 1, Math.floor(Math.pow(centreWeight, 0.8) * ramp.length))];
        const lum = 100 + 55 * Math.abs(v) + (tubercle ? 40 : 0);
        put(x, y, glyph, `rgb(${lum - 20},${lum + 5},${lum + 45})`, true);
      }
    }
    // Blowholes on the head (the eyes are too small to show at this scale).
    for (const sgn of [-1, 1]) {
      put(frame(0.2).x + frame(0.2).nx * half(0.2) * 0.12 * sgn, frame(0.2).y + frame(0.2).ny * half(0.2) * 0.12 * sgn, '"', "rgb(200,225,245)", true);
    }
    // Long pale flippers on both sides, swept back and swaying a little.
    const root = frame(0.3);
    for (const sgn of [-1, 1]) {
      // Each flipper paddles: it swings out and back, and the tip lags behind the root like a real fin.
      const paddle = w.phase * 2.4 + sgn * 0.5;
      const stroke = Math.sin(paddle) * 0.55;
      const ang0 = Math.atan2(root.ny * sgn, root.nx * sgn) + sgn * (0.7 + stroke) * -1;
      const flen = L * 0.11;
      let fx = root.x + root.nx * sgn * half(0.3);
      let fy = root.y + root.ny * sgn * half(0.3);
      for (let i = 0; i <= 26; i++) {
        const t = i / 26;
        const ang = ang0 - sgn * 0.6 * Math.sin(paddle - t * 2.2) * t;
        const thick = Math.round(1.6 * (1 - t));
        for (let o = -thick; o <= thick; o++) {
          put(fx - Math.sin(ang) * o * cw * 0.8, fy + Math.cos(ang) * o * cw * 0.8, Math.abs(o) === thick && thick > 0 ? "o" : "#", "rgb(222,236,246)", true);
        }
        fx += Math.cos(ang) * (flen / 26);
        fy += Math.sin(ang) * (flen / 26);
      }
    }
    // The tail is what makes it a whale: huge crescent flukes with a centre notch, a heavy
    // leading edge, swept-back tips and a scalloped trailing edge, swaying with each stroke.
    const tail = frame(0.97);
    const span = L * 0.23;
    const sweepMax = L * 0.07;
    const chordMax = L * 0.09;
    // The flukes follow the end of the body's wave and flap: the chord narrows and widens each stroke.
    const beat = Math.sin(w.phase - 0.97 * 5.2);
    const flap = 0.93 + 0.07 * Math.cos(w.phase - 0.97 * 5.2 + 1.2);
    for (const sgn of [-1, 1]) {
      const STEPS = 60;
      for (let i = 4; i <= STEPS; i++) {
        const t = i / STEPS;
        // Leading edge curves back toward the tip; the whole tail sways with the beat.
        const lateral = sgn * span * t;
        const sweep = sweepMax * Math.pow(t, 1.7) + beat * L * 0.022 * t * sgn;
        const lx = tail.x + tail.nx * lateral - tail.tx * sweep;
        const ly = tail.y + tail.ny * lateral - tail.ty * sweep;
        const chord = chordMax * flap * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.85) * (1 - 0.45 * t) * (1 + 0.12 * Math.sin(t * 38));
        const depth = Math.max(1, Math.round(chord / (cw * 0.8)));
        for (let k = 0; k <= depth; k++) {
          const glyph = k === 0 ? "@" : k === depth ? "~" : k === depth - 1 ? "%" : "#";
          const shade = 150 - 40 * (k / depth);
          put(lx - tail.tx * k * cw * 0.8, ly - tail.ty * k * cw * 0.8, glyph, `rgb(${shade - 30},${shade - 5},${shade + 40})`, true);
        }
      }
    }
    flush();
  }

  /**
   * Thick arm bands drawn over whatever the kraken holds, crossing the body diagonally from one side
   * to the other with a row of suckers down each, like a squid clamped round a shark. They squeeze
   * in and out, harder when the kraken is winning.
   */
  /** Where each held diver was last frame, smoothed into a velocity, so its arm can trail behind a swing. */
  private heldTrack = new Map<object, { x: number; y: number; t: number; vx: number; vy: number }>();

  private drawWraps(world: World) {
    const k = world.kraken;
    // The kraken seizes divers as it swims in too, so its arms are drawn from the moment it arrives.
    if (!k || k.state === "flee") return;
    const wrapped = k.state === "wrap" && !!k.wrapping && !k.maul;
    const held = wrapped ? [k.wrapping!] : k.grabbed;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    // Tentacles on divers: one lashes out to a diver it is after, then holds on and coils round it.
    const back = k.heading + Math.PI;
    const arm = (x1: number, y1: number, seed: number, thick: number, whip = 0, trail?: { x: number; y: number }) => {
      // Rooted in the fan of arms on the side facing the diver, never across the head or eye.
      // Arms only reach out from the arm side of the head, 270 degrees in all: it has to turn to face anything beyond.
      if (Math.abs(angleDiff(back, Math.atan2(y1 - k.y, x1 - k.x))) > KRAKEN_ARC + 0.1 && Math.hypot(x1 - k.x, y1 - k.y) > k.size * 0.35) return;
      const psi = clamp(angleDiff(back, Math.atan2(y1 - k.y, x1 - k.x)), -1.2, 1.2);
      const rootX = k.x + Math.cos(back + psi) * k.size * 0.085;
      const rootY = k.y + Math.sin(back + psi) * k.size * 0.085;
      const dx = x1 - rootX;
      const dy = y1 - rootY;
      const len = Math.hypot(dx, dy) || 1;
      const steps = Math.max(6, Math.round(len / (cw * 0.7)));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        // A lashing arm snakes hard from side to side while it is still reaching, then settles.
        // A steady travelling wave (one fixed rate, running out toward the tip) whose swing eases away as the arm straightens:
        // it cracks out like a whip instead of shivering. Nothing about its timing changes from frame to frame.
        const bow = Math.sin(u * Math.PI) * Math.sin(world.time * 3.2 + seed - u * 4.5) * cw * (trail ? 0.6 : 2 + 9 * whip);
        // The arm leaves the head straight outward before curving toward its target, so it never cuts across the head.
        const outX = Math.cos(back + psi);
        const outY = Math.sin(back + psi);
        // A swung arm leaves the head only slightly outward and then runs nearly straight, so at the ends of the swing,
        // where the diver sits far off to one side, it never hooks sharply near the tip.
        const lead = trail ? 0.1 : 0.3;
        const cx = rootX + outX * len * lead + dx * (trail ? 0.45 : 0.3);
        const cy = rootY + outY * len * lead + dy * (trail ? 0.45 : 0.3);
        // A swung arm flows like an idle one: the same slow travelling wave, growing toward the tip, with only a gentle lean
        // back against the swing. Never a hard S or a hook.
        const side = trail ? clamp((trail.x * -dy + trail.y * dx) / len, -len * 0.14, len * 0.14) : 0;
        const env = Math.sin(u * Math.PI) * (0.3 + 0.7 * u);
        const s2 = trail ? side * 0.6 * env - len * 0.06 * env * (Math.sin(k.wave - u * 3.4 + seed) + 0.5 * Math.sin(k.phase * 0.8 + seed * 1.7 - u * 2)) : 0;
        const x = (1 - u) * (1 - u) * rootX + 2 * (1 - u) * u * cx + u * u * x1 - (dy / len) * (bow - s2);
        const y = (1 - u) * (1 - u) * rootY + 2 * (1 - u) * u * cy + u * u * y1 + (dx / len) * (bow - s2);
        if (Math.hypot(x - k.x, y - k.y) < k.size * 0.115) continue;
        {
          const fx = Math.cos(k.heading);
          const fy = Math.sin(k.heading);
          const along = (x - k.x) * fx + (y - k.y) * fy;
          if (along > 0 && along < k.size * 0.62 && Math.abs((x - k.x) * -fy + (y - k.y) * fx) < k.size * 0.15) continue;
        }
        // One cell slimmer than the nominal thickness, so an arm that has hold of anything never swells to twice its size.
        const th = Math.max(0, Math.round((thick - 1) * (1 - 0.5 * u)));
        // A thin gap round each arm and an alternating tone keep crossing arms apart.
        const tone = Math.round(seed * 7) % 2 ? -40 : 0;
        if (u > 0.08 && th > 0) {
          for (const o of [-th - 1, th + 1]) put(x - (dy / len) * o * cw * 0.8, y + (dx / len) * o * ch * 0.8, " ", "#000", true);
        }
        for (let o = -th; o <= th; o++) {
          put(x - (dy / len) * o * cw * 0.8, y + (dx / len) * o * ch * 0.8, o !== 0 && Math.abs(o) === th ? "O" : (s + o) % 2 ? "8" : "@", o !== 0 && Math.abs(o) === th ? krakenBone(70) : krakenBone(232 + tone), true);
        }
        if (s % 2 === 0) put(x, y, "o", krakenBone(250), true);
      }
    };
    // The reach: the lead arm grows out from the body to its target along a whipping curve while a pair of shorter
    // arms flares out around it, so the whole mass of tentacles seems to blossom toward the prey.
    const bloom = (tx: number, ty: number, p: number, seed: number, thick: number, strands = 3) => {
      const e = p * p * (3 - 2 * p);
      const rx = k.x + Math.cos(back) * k.size * 0.085;
      const ry = k.y + Math.sin(back) * k.size * 0.085;
      const toX = tx - rx;
      const toY = ty - ry;
      const dist = Math.hypot(toX, toY) || 1;
      // One long tentacle grows straight out to the target, snaking a little as it goes.
      const whip = (1 - e) * 0.5;
      // Thinner arms run along behind it, a little to each side and never quite as far out, so the reach reads as a single
      // rope of strands, not a spray. How many go out fits the target: a lone arm for a diver, two for a shark, three for a saucer.
      for (const [j, side] of (strands >= 3 ? [-1, 1] : strands === 2 ? [seed % 2 < 1 ? -1 : 1] : []).entries()) {
        const ee = e * (0.7 + 0.08 * j);
        const off = side * Math.min(k.size * 0.05, dist * 0.08) * (1 - 0.5 * e);
        arm(rx + toX * ee - (toY / dist) * off, ry + toY * ee + (toX / dist) * off, seed + j * 1.7 + 1, Math.max(1, thick - 2), whip);
      }
      arm(rx + toX * e, ry + toY * e, seed, thick, whip);
    };
    if (k.strike && k.strike.f.alive) {
      const f = k.strike.f;
      bloom(f.x, f.y, Math.min(1, (world.time - k.strike.at) / STRIKE_TIME), f.x * 0.01, 2, 1);
    }
    for (const ss of k.sharkStrikes ?? []) {
      const sh = ss.sh;
      const bx = sh.nodes[12];
      const by = sh.nodes[13];
      bloom(bx, by, Math.min(1, (world.time - ss.at) / ss.dur), sh.length * 0.01, 3, sh.length > 330 ? 3 : 2);
    }
    if (k.harpoon && world.sharks.includes(k.harpoon.target)) {
      // The harpoon: one of the kraken's own arms shoots out to the megalodon's head and stays hooked while it is hauled in.
      const m = k.harpoon.target;
      bloom(m.nodes[0], m.nodes[1], Math.min(1, (world.time - k.harpoon.at) / 0.5), 5.3, 3, 1);
    }
    const uf = world.ufo;
    if (uf && k.ufoStrike !== null) {
      bloom(uf.x, uf.y, Math.min(1, (world.time - k.ufoStrike) / STRIKE_TIME), 3, 3, 3);
    }
    if (uf && k.ufoHeld) {
      arm(uf.x, uf.y, 3, 3);
      // Coils wrapped round the saucer.
      const half = Math.max(40, Math.min(world.width, world.height) * 0.07);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + world.time * 4;
        put(uf.x + Math.cos(a) * half * 1.05, uf.y + Math.sin(a) * ch * 1.4, i % 2 ? "@" : "8", krakenBone(232), true);
      }
    }
    const whaleHeld = k.whaleTarget;
    if (whaleHeld && k.whaleUntil > world.time && k.whaleLanded !== undefined) {
      // Thick arms clamped round the whale's body.
      const hw = whaleHeld.length * 0.095;
      // The limbs themselves grip the whale above; the bands below are the squeeze, drawn across its hide.
      const poke = k.whaleMode === "poke";
      const since = world.time - (k.whaleStart ?? world.time);
      const prog = clamp(since / Math.max(0.1, k.whaleUntil - (k.whaleStart ?? 0)), 0, 1);
      // The squeeze tightens as it goes on.
      const squeeze = (1 - 0.3 * prog * Math.min(1, since / 1.2)) * (1 + 0.07 * Math.sin(world.time * (6 + 8 * prog)));
      // A poke gets the same dark-edged wraps at its grip spots, just fewer, so the hold reads as an arm laid over the hide.
      for (const u of poke ? [0.3, 0.45, 0.6] : [0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.68]) {
        const cp = world.whalePoint(whaleHeld, u);
        const cq = world.whalePoint(whaleHeld, u + 0.03);
        const cx = cp.x;
        const cy = cp.y;
        const tl = Math.hypot(cp.x - cq.x, cp.y - cq.y) || 1;
        // Bands lie across the body where it really is, along the path it has swum.
        const wx = (cp.x - cq.x) / tl;
        const wy = (cp.y - cq.y) / tl;
        for (let s = -12; s <= 12; s++) {
          const v = s / 12;
          for (const o of [-1, 0, 1, 2]) {
            const edge = o === -1 || o === 2;
            put(cx - wy * v * hw * 1.1 * squeeze + wx * (v * 3 + o) * cw, cy + wx * v * hw * 1.1 * squeeze + wy * (v * 3 + o) * cw, edge ? "O" : (s + o) % 2 ? "@" : "8", edge ? krakenBone(95) : krakenBone(245), true);
          }
        }
      }
    }
    for (const f of k.caught) {
      const left = Math.max(0, (f.crushAt ?? 0) - world.time);
      // The arm lags the diver's swing: how far it bows back follows the diver's own velocity.
      const prev = this.heldTrack.get(f);
      const dtF = prev ? world.time - prev.t : 0;
      let vx = prev?.vx ?? 0;
      let vy = prev?.vy ?? 0;
      if (prev && dtF > 0.001 && dtF < 0.25) {
        const m = Math.min(1, dtF * 8);
        vx += ((f.x - prev.x) / dtF - vx) * m;
        vy += ((f.y - prev.y) / dtF - vy) * m;
      }
      this.heldTrack.set(f, { x: f.x, y: f.y, t: world.time, vx, vy });
      const reachLen = Math.hypot(f.x - k.x, f.y - k.y);
      const cap = reachLen * 0.45;
      const vm = Math.hypot(vx, vy) || 1;
      const bowBack = Math.min(vm * 0.6, cap);
      // The arm ends on the near side of the diver and carries on as a coil: one continuous winding round the body
      // (a turn and a half, spiralling in), so the grip is a complete wrap, not a hook that stops at the diver.
      const toK = Math.atan2(k.y - f.y, k.x - f.x);
      const tight = Math.min(1, 1 - left / 7);
      const rOut = cw * (3.4 - 0.9 * tight);
      const rIn = cw * (1.3 - 0.3 * tight);
      arm(f.x + Math.cos(toK) * rOut, f.y + Math.sin(toK) * rOut * 0.8, f.x * 0.01, 2, 0.12, { x: (vx / vm) * bowBack, y: (vy / vm) * bowBack });
      const TURNS = 1.5;
      const COIL = 44;
      for (let i = 0; i <= COIL; i++) {
        const v = i / COIL;
        const a = toK + v * TURNS * Math.PI * 2 + Math.sin(world.time * 2 + v * 3) * 0.12;
        const rad = rOut + (rIn - rOut) * v * (2 - v);
        for (const o of [-0.45, 0, 0.45]) {
          const rr = rad + o * cw;
          put(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr * 0.8, o !== 0 ? "O" : i % 2 ? "@" : "8", o !== 0 ? krakenBone(95) : krakenBone(232), true);
        }
      }
    }
    if (!held.length) { flush(); return; }
    for (const [hi, sh] of held.entries()) {
      // One band closes for each arm that has actually arrived (the first once its arm has landed), so the number of
      // coils always matches the number of arms visibly holding on.
      const since = wrapped ? (k.lunging ? 0 : world.time - k.stateAt) : world.time - (sh.grabbedAt ?? -99);
      let bands = 0;
      for (let rk = 0, a = hi; rk < (wrapped ? WRAP_BANDS : holdArmsFor(sh)) && a < (wrapped ? 10 : 6); rk++, a += held.length) {
        if (since - rk * (wrapped ? WRAP_STAGGER : ARM_STAGGER) >= (wrapped ? 0.6 : 1.0)) bands++;
      }
      if (bands === 0) continue;
      const L = sh.length;
      const half = (n: number) => Math.max(9, L * 0.055) * Math.pow(Math.sin(Math.PI * Math.max(0.08, Math.min(0.92, n / (SHARK_NODES - 1)))), 0.7);
      const at = (n: number): [number, number, number, number] => {
        const i = Math.max(0, Math.min(SHARK_NODES - 2, Math.floor(n)));
        const w = n - i;
        const x = sh.nodes[i * 2] * (1 - w) + sh.nodes[i * 2 + 2] * w;
        const y = sh.nodes[i * 2 + 1] * (1 - w) + sh.nodes[i * 2 + 3] * w;
        const tx = sh.nodes[i * 2 + 2] - sh.nodes[i * 2];
        const ty = sh.nodes[i * 2 + 3] - sh.nodes[i * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        return [x, y, -ty / tl, tx / tl];
      };
      for (let b = 0; b < bands; b++) {
        const centre = sh.kind === "sawshark" ? 8 + (b / Math.max(1, bands - 1)) * 7 : 3.5 + (b / Math.max(1, bands - 1)) * 12.5;
        const squeeze = 1 + 0.12 * Math.sin(world.time * (wrapped ? 5 : 3) + b * 1.4);
        const slant = 1.5 * (b % 2 ? 1 : -1);
        const STEPS = 22;
        for (let s = 0; s <= STEPS; s++) {
          const u = (s / STEPS) * 2 - 1;
          const n = centre + u * slant;
          const [x, y, nx, ny] = at(n);
          const across = u * (half(n) * 1.0 + ch * 0.2) * squeeze;
          const px = x + nx * across;
          const py = y + ny * across;
          const thick = Math.max(1, Math.round((L * 0.011 + 1.2) * (1 - 0.35 * Math.abs(u)) / (cw * 0.8)));
          for (let oy = -thick; oy <= thick; oy++) {
            for (let ox = -thick; ox <= thick; ox++) {
              if (ox * ox + oy * oy > thick * thick + 0.5) continue;
              const rim = ox * ox + oy * oy > (thick - 1) * (thick - 1) && thick > 1;
              put(px + ox * cw * 0.8, py + oy * ch * 0.8, rim ? "O" : (s + ox) % 2 ? "@" : "8", rim ? krakenBone(95) : krakenBone(232), true);
            }
          }
          // The row of suckers down the middle of the band.
          if (s % 2 === 0) put(px, py, "o", krakenBone(250), true);
        }
      }
    }
    flush();
  }

  /**
   * Says what is going on in a kraken fight: a tug-of-war bar that swings toward whoever is winning,
   * plus floating labels for results ("KRAKEN WINS", "SHARK EATEN", ...).
   */
  private drawFightHud(world: World) {
    const k = world.kraken;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    const text = (cx: number, y: number, s: string, rgb: string, alpha = 1) => {
      for (let i = 0; i < s.length; i++) if (s[i] !== " ") put(cx + (i - s.length / 2) * cw, y, s[i], `rgba(${rgb},${alpha.toFixed(2)})`, true);
    };
    if (k && k.state === "wrap" && k.wrapping && !k.lunging && k.coiled) {
      const progress = Math.max(0, Math.min(1, (world.time - k.stateAt) / k.wrapFor));
      const lead = (k.winner === "kraken" ? 1 : -1) * (0.15 + 0.85 * Math.pow(progress, 1.2));
      // A massive fight: the line lurches around, harder during the thrashing, and the divers lean it too.
      const shaking = world.time < k.shakeUntil;
      const swing = Math.sin(world.time * 9) * (shaking ? 0.2 : 0.09) + Math.sin(world.time * 23 + 1) * (shaking ? 0.12 : 0.06) + Math.sin(world.time * 4.1) * 0.08 + (shaking ? (Math.random() - 0.5) * 0.14 : 0);
      const pos = Math.max(-1, Math.min(1, lead + k.tilt * 0.5 + swing));
      const width = 22;
      const cx = Math.max(width * cw, Math.min(world.width - width * cw, k.x));
      const y = Math.max(ch * 2, k.y - k.size * 0.42);
      // White (the kraken's side, on the left) fills toward the right as it wins; blue (the megalodon's) fills toward the left as it wins.
      const mark = Math.round(((1 + pos) / 2) * (width - 1));
      let bar = "";
      for (let i = 0; i < width; i++) bar += i === mark ? "|" : i < mark ? "#" : "=";
      text(cx, y - ch * 1.1, k.maul ? (k.biteAt !== undefined ? "MAULED!!" : "CLOSING IN") : shaking ? "THRASHING!!" : "WRAPPED", "255,255,255", 0.9);
      // The kraken's share is on the left, the megalodon's on the right.
      text(cx - (width / 2 + 5) * cw, y, "KRAKEN", "235,235,240");
      text(cx + (width / 2 + 6) * cw, y, "MEGALODON", "130,175,235");
      for (let i = 0; i < width; i++) put(cx + (i - width / 2) * cw, y, bar[i], i === mark ? "rgb(255,255,255)" : i < mark ? "rgb(235,235,240)" : "rgb(110,150,225)", true);
    }
    flush();
    // Event labels: big bold coloured text with a dark outline, so they read against any background.
    if (world.callouts.length) {
      const { ctx } = this;
      ctx.save();
      ctx.font = `800 ${Math.round(ch * 1.05)}px ${this.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const c of world.callouts) {
        const age = world.time - c.born;
        const alpha = Math.max(0, Math.min(1, age / 0.2, (5 - age) / 1));
        const tw = ctx.measureText(c.text).width;
        const x = Math.max(tw / 2 + 12, Math.min(world.width - tw / 2 - 12, c.x));
        const y = Math.max(ch * 1.2, c.y - age * 8);
        // No plate: a dark outline round the bold text keeps it readable on any background.
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(0,0,0,${(0.85 * alpha).toFixed(2)})`;
        ctx.strokeText(c.text, x, y + 1);
        ctx.fillStyle = `rgba(${c.rgb},${alpha.toFixed(2)})`;
        ctx.fillText(c.text, x, y + 1);
      }
      ctx.restore();
    }
  }

  /** The red "!" over a shark that has just spotted a diver: pops in, bobs, and fades. */
  private drawAlerts(world: World) {
    const alerted = world.sharks.filter((sh) => (sh.alertUntil ?? 0) > world.time && sh.target?.diver && sh.target.alive && !sh.target.riding && (sh.fedUntil ?? 0) <= world.time);
    if (!alerted.length) return;
    const { ctx, ch } = this;
    // One small "!" per diver, floating just over the diver being hunted (not over the shark).
    const marked = new Set<object>();
    ctx.save();
    ctx.font = `700 ${Math.round(ch * 0.5)}px ${this.fontFamily}`;
    for (const sh of alerted) {
      const diver = sh.target!;
      if (marked.has(diver)) continue;
      marked.add(diver);
      const age = 1.5 - (sh.alertUntil! - world.time);
      const fade = Math.min(1, (sh.alertUntil! - world.time) / 0.3);
      ctx.fillStyle = `rgba(238,64,86,${fade.toFixed(2)})`;
      ctx.fillText("!", diver.x, diver.y - ch * 1.1 + Math.sin(age * 9) * 1.5);
    }
    ctx.restore();
  }

  /** A saucer with blinking lights and a shimmering green tractor beam when it is lifting something. */
  private drawUfo(world: World) {
    for (const u of world.ufos) this.drawOneUfo(world, u);
  }

  private drawOneUfo(world: World, u: NonNullable<World["ufo"]>) {
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    const t = world.time;
    if (u.state === "beam") {
      const bottom = Math.min(world.height, u.y + 220);
      for (let y = u.y + ch * 1.6; y < bottom; y += ch * 0.7) {
        const half = 10 + (y - u.y) * 0.16;
        const fade = Math.max(0.12, 1 - (y - u.y) / 240);
        for (let x = u.beamX - half; x <= u.beamX + half; x += cw * 0.7) {
          const edge = Math.abs(x - u.beamX) > half * 0.78;
          const shimmer = Math.sin(t * 9 + y * 0.05 + x * 0.04) > 0.2;
          put(x, y, edge ? "|" : shimmer ? ":" : ".", `rgba(170,255,205,${((edge ? 0.55 : 0.4) * fade).toFixed(2)})`);
        }
      }
    }
    const half = Math.max(40, Math.min(world.width, world.height) * 0.07);
    const piloted = !!u.pilot?.alive;
    // The glass dome spans about half the hull and gets a second row when the saucer is wide.
    const dome = Math.max(2, Math.round((half * 0.5) / cw));
    for (let i = -dome; i <= dome; i++) {
      const rim = Math.abs(i) >= dome - 1;
      put(u.x + i * cw, u.y - ch, rim ? "." : piloted ? (i < 0 ? "[" : "]") : "-", "rgb(150,225,255)", true);
    }
    const rows2 = dome >= 4 ? 1 : 0;
    if (rows2) {
      for (let i = -(dome - 2); i <= dome - 2; i++) {
        const rim = Math.abs(i) >= dome - 3;
        put(u.x + i * cw, u.y - ch * 2, rim ? "." : "^", "rgb(150,225,255)", true);
      }
    }
    put(u.x, u.y - ch * (1 + rows2), piloted ? "O" : "^", piloted ? "rgb(255,236,205)" : "rgb(150,225,255)", true);
    const domeTop = ch * (1 + rows2);
    for (let x = u.x - half; x <= u.x + half; x += cw) put(x, u.y, Math.abs(x - u.x) > half - cw ? (x < u.x ? "(" : ")") : "=", "rgb(205,210,222)", true);
    // A hijacked saucer flashes red and orange and flies a blinking beacon, so the takeover is easy to spot.
    if (piloted) {
      const blink = Math.floor(t * 5) % 2 === 0;
      put(u.x, u.y - domeTop - ch * 1.4, "!", blink ? "rgb(255,80,80)" : "rgb(255,190,80)", true);
      put(u.x - cw * (dome + 1.5), u.y - domeTop - ch, "<", blink ? "rgb(255,190,80)" : "rgb(255,80,80)", true);
      put(u.x + cw * (dome + 1.5), u.y - domeTop - ch, ">", blink ? "rgb(255,190,80)" : "rgb(255,80,80)", true);
    }
    const colors = piloted ? ["rgb(255,90,90)", "rgb(255,170,70)", "rgb(255,90,90)"] : ["rgb(255,222,110)", "rgb(120,255,165)", "rgb(255,120,120)"];
    let k = 0;
    for (let x = u.x - half * 0.8; x <= u.x + half * 0.8; x += cw * 1.5, k++) put(x, u.y + ch * 0.9, "o", colors[(k + Math.floor(t * 4)) % 3], true);
    flush();
  }

  /** The pop (a quick expanding ring of sparks) and the bits left behind until a shark eats them. */
  private drawMess(world: World) {
    if (!world.mess.length && !world.blasts.length) return;
    const { put, flush } = this.painter();
    for (const b of world.blasts) {
      const age = world.time - b.born;
      const fade = 1 - age / 0.8;
      const r = 80 * (age / 0.8);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + age * 2;
        put(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.8, i % 2 ? "*" : "+", `rgba(255,${Math.round(235 - 120 * age)},120,${fade.toFixed(2)})`, true);
      }
      if (age < 0.25) put(b.x, b.y, "#", `rgba(255,250,220,${(1 - age / 0.25).toFixed(2)})`, true);
    }
    for (const m of world.mess) {
      const fade = Math.min(1, (30 - (world.time - m.born)) / 5);
      put(m.x, m.y, m.glyph, `rgba(${m.rgb},${fade.toFixed(2)})`, true);
    }
    flush();
  }

  /** A ufo cut in half: two pieces tilting apart as they sink, with sparks at the cut. */
  private drawDebris(world: World) {
    if (!world.debris.length) return;
    const { cw, ch } = this;
    const { put, flush } = this.painter();
    const half = Math.max(40, Math.min(world.width, world.height) * 0.07);
    for (const d of world.debris) {
      const age = world.time - d.born;
      const fade = Math.max(0, 1 - age / 5);
      const tilt = 0.12 + 0.3 * Math.min(1, age / 2);
      const rgb = (v: number) => `rgba(${v},${v + 4},${v + 14},${fade.toFixed(2)})`;
      for (let k = 0; k * cw <= half; k++) {
        const x = d.x + d.side * k * cw;
        const dy = k * cw * tilt;
        put(x, d.y + dy, k === 0 ? (d.side < 0 ? "/" : "\\") : k * cw > half - cw ? (d.side < 0 ? "(" : ")") : "=", rgb(205), true);
        if (k * cw <= half * 0.5) put(x, d.y - ch + dy, k === 0 ? "|" : "-", `rgba(150,225,255,${fade.toFixed(2)})`, true);
        if (k % 2 === 1) put(x, d.y + ch * 0.9 + dy, "o", `rgba(255,${Math.floor(200 + 55 * Math.sin(age * 8 + k))},120,${fade.toFixed(2)})`, true);
      }
      if (age < 0.6) {
        for (let i = 0; i < 4; i++) put(d.x - d.side * cw * 0.3 + Math.sin(age * 40 + i * 1.7) * cw * 1.2, d.y + Math.cos(age * 33 + i * 2.1) * ch * 1.1, "*", `rgba(255,235,160,${(1 - age / 0.6).toFixed(2)})`, true);
      }
    }
    flush();
  }

  /** Divers drawn as little people: head, orange suit, silver tank, and kicking blue fins. */
  private drawDivers(world: World) {
    const { cw } = this;
    const { put, flush } = this.painter();
    for (const f of world.fish) {
      if (!f.diver || !f.alive || f.riding) continue;
      const sp = Math.hypot(f.vx, f.vy);
      const ang = sp > 1 ? Math.atan2(f.vy, f.vx) : Math.PI / 2;
      const dx = -Math.cos(ang);
      const dy = -Math.sin(ang);
      const px = -dy;
      const py = dx;
      const out = (f.stunUntil ?? 0) > world.time;
      const kick = out ? 0 : Math.sin(f.phase * 2) * cw * 0.55;
      const at = (back: number, side = 0) => [f.x + dx * cw * back + px * side, f.y + dy * cw * back + py * side] as const;
      const kind = f.dkind ?? "scuba";
      const suit = `rgb(${DIVER_SUIT[kind]})`;
      const fin = kind === "snorkel" ? "rgb(240,210,90)" : "rgb(70,120,210)";
      const finTip = kind === "snorkel" ? "rgb(250,225,120)" : "rgb(90,150,235)";
      put(f.x, f.y, out ? "x" : "O", "rgb(255,236,205)", true);
      if (out) {
        // Crackling sparks round a diver that has been zapped.
        for (let i = 0; i < 3; i++) {
          const a = world.time * 18 + i * 2.1;
          put(f.x + Math.cos(a) * cw * 1.4, f.y + Math.sin(a * 1.3) * cw * 1.2, i % 2 ? "*" : "+", "rgb(255,245,140)", true);
        }
      }
      for (const back of [0.9, 1.8]) put(...at(back), "#", suit, true);
      put(...at(1.1, cw * 0.95), ":", suit, true);
      put(...at(1.1, -cw * 0.95), ":", suit, true);
      if (kind === "scuba") put(...at(1.4), "o", "rgb(205,212,222)", true);
      else if (kind === "treasure") put(...at(1.6, -cw * 1.1), "$", "rgb(255,215,80)", true);
      else if (kind === "snorkel") put(...at(0.2, cw * 0.9), "/", "rgb(250,225,120)", true);
      else if (kind === "scooter") { put(...at(-1.1), "=", "rgb(190,198,210)", true); put(...at(-2), ">", "rgb(255,236,120)", true); }
      else if (kind === "bomber") {
        // A pack of explosives on his back; once the fuse is lit a red ! flashes over his head.
        // The pack pulses hot orange to yellow, and a ring of sparks swells out and back, so a bomber stands out from every other diver.
        const pulse = (Math.sin(world.time * 5 + f.x * 0.01) + 1) / 2;
        put(...at(1.5), "@", `rgb(255,${Math.round(90 + 150 * pulse)},${Math.round(30 + 60 * pulse)})`, true);
        const ringR = cw * (2.6 + 1.6 * pulse);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + world.time * 0.8;
          put(f.x + Math.cos(a) * ringR, f.y + Math.sin(a) * ringR * 0.7, pulse > 0.5 ? "*" : ".", `rgb(255,${Math.round(110 + 100 * pulse)},60)`, true);
        }
        put(...at(1.7, cw * 0.9), "*", f.fuseAt !== undefined && Math.sin(world.time * 25) > 0 ? "rgb(255,240,150)" : "rgb(190,90,40)", true);
        if (f.fuseAt !== undefined) {
          const red = Math.sin(world.time * 18) > -0.2;
          put(f.x, f.y - cw * 2.4, "!", red ? "rgb(255,50,50)" : "rgb(255,200,60)", true);
          put(f.x, f.y - cw * 3.4, "!", red ? "rgb(255,50,50)" : "rgb(255,200,60)", true);
        }
      }
      else if (kind === "tech") {
        put(...at(1.5), "o", "rgb(205,212,222)", true);
        if (f.salvage) put(...at(-0.4, cw * 1.2), "?", "rgb(120,255,170)", true);
        else if (world.time < (f.equipUntil ?? 0)) {
          // Sparks fly while he welds the blaster together.
          for (let i = 0; i < 4; i++) {
            const a = world.time * 14 + i * 1.7;
            put(f.x + Math.cos(a) * cw * 1.6, f.y + Math.sin(a * 1.3) * cw * 1.3, i % 2 ? "*" : "+", "rgb(255,240,150)", true);
          }
        } else {
          // The blaster: a barrel out ahead of him that glows when it fires.
          const flash = world.time - (f.flashAt ?? -9) < 0.2;
          put(...at(-0.9, cw * 1.1), "=", "rgb(215,222,232)", true);
          put(...at(-1.9, cw * 1.1), flash ? "*" : "-", flash ? "rgb(255,120,110)" : "rgb(150,160,175)", true);
        }
      }
      else {
        put(...at(0.3, cw * 1.1), "[", "rgb(235,240,245)", true);
        const age = world.time - (f.flashAt ?? -9);
        if (age < 0.35) {
          const fade = (1 - age / 0.35).toFixed(2);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            put(f.x + Math.cos(a) * cw * (1.5 + age * 9), f.y + Math.sin(a) * cw * (1.5 + age * 9), i % 2 ? "+" : "*", `rgba(255,255,225,${fade})`, true);
          }
        }
      }
      put(...at(2.7, kick), "=", fin, true);
      put(...at(3.5, -kick), "=", fin, true);
      put(...at(4.3, kick * 1.3), "~", finTip, true);
    }
    flush();
  }

  /** One event bar: the title in the event's colour, a progress bar, and a short counter to the right of the bar. */
  private drawEventBar(world: World, title: string, rgb: string, progress: number, counter: string, slot: number, fade = 1) {
    if (slot >= 3) return;
    // Bars are drawn after everything else (see drawHud), so the yeat void, the vignette and the night tint never dim them.
    this.hud.push(() => {
    const { cw, ch } = this;
    const t = world.time;
    const cx = (this.cols * cw) / 2;
    const y = ch * (3.2 + slot * 4.2);
    const width = 26;
    const filled = Math.round(Math.max(0, Math.min(1, progress)) * width);
    const { put, flush } = this.painter();
    const dark = this.yeat > 0.05;
    for (let i = 0; i < title.length; i++) put(cx + (i - title.length / 2) * cw, y, title[i], `rgba(${rgb},${((t % 1 < 0.5 ? 1 : 0.8) * Math.max(0.3, fade)).toFixed(2)})`, true);
    for (let i = 0; i < width; i++) put(cx + (i - width / 2) * cw, y + ch * 1.4, i < filled ? "#" : "-", i < filled ? `rgb(${rgb})` : dark ? "rgb(135,135,155)" : "rgb(80,80,90)", true);
    for (let i = 0; i < counter.length; i++) put(cx + (width / 2 + 2 + i) * cw, y + ch * 1.4, counter[i], "rgb(235,235,240)", true);
    // In yeat mode the bar glows in its own colour against the black, breathing a little; at night it gets a soft halo.
    flush(Math.max(this.yeat * (12 + 6 * Math.sin(t * 2.4)), this.night * 5));
    });
  }

  /** The HUD layer: event bars, drawn on top of every wash and tint. */
  private drawHud() {
    for (const draw of this.hud) draw();
    this.hud.length = 0;
  }

  /** The alien invasion bar, with a slow alarm pulse round the screen edges while it lasts. */
  private drawInvasion(world: World, slot: number) {
    const inv = world.invasion;
    if (!inv) return;
    const { ctx, cw, ch } = this;
    const t = world.time;
    const w = this.cols * cw;
    const h = this.rows * ch;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(${Math.round(60 + 120 * pulse)},${Math.round(160 - 90 * pulse)},60,${(0.1 + 0.07 * pulse).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const done = inv.killed + inv.escaped;
    this.drawEventBar(world, "ALIEN INVASION", "150,255,170", done / inv.total, `${done} of ${inv.total}`, slot);
  }

  /** The bar for the other big events (blood moon, titans clash, meteor shower, ...), plus the blood moon's red wash. */
  private drawSagaBanner(world: World, sg: World["sagas"][number], slot: number) {
    const { ctx, cw, ch } = this;
    const t = world.time;
    const w = this.cols * cw;
    const h = this.rows * ch;
    const fade = Math.max(0, Math.min(1, (t - sg.born) / 3, Number.isFinite(sg.until) ? (sg.until - t) / 3 : 1));
    if (sg.kind === "moon") {
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(120,0,10,${(0.1 * fade).toFixed(3)})`);
      g.addColorStop(1, `rgba(150,10,20,${((0.22 + 0.06 * pulse) * fade).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const k = world.kraken;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const left = Math.max(0, Math.ceil(sg.until - t));
    const progress = sg.kind === "clash" ? (k && k.state === "wrap" ? clamp01((t - k.stateAt) / Math.max(1, k.wrapFor)) : 0)
      : sg.kind === "migration" ? clamp01(sg.count / Math.max(1, sg.total))
      : sg.kind === "bloom" ? clamp01(sg.count / Math.max(1, sg.peak))
      : clamp01((t - sg.born) / (sg.until - sg.born));
    const counter = sg.kind === "migration" ? `${sg.count} of ${sg.total}`
      : sg.kind === "bloom" ? `${sg.count} of ${Math.max(sg.peak, sg.count)}`
      : sg.kind === "clash" ? ""
      : `${left}s`;
    this.drawEventBar(world, sg.title, sg.rgb, progress, counter, slot, fade);
  }

  /** Meteors: a white-hot head with a long orange tail streaking down through the water. */
  private drawMeteors(world: World) {
    if (!world.meteors.length) return;
    const { cw } = this;
    const { put, flush } = this.painter();
    for (const m of world.meteors) {
      const sp = Math.hypot(m.vx, m.vy) || 1;
      const bx = -m.vx / sp;
      const by = -m.vy / sp;
      for (let i = 0; i < 18; i++) {
        const f = 1 - i / 18;
        const g = i < 3 ? "@" : i < 8 ? "*" : i < 13 ? "+" : ".";
        const rgb = i < 3 ? "255,245,220" : i < 8 ? "255,170,70" : "220,80,40";
        put(m.x + bx * i * cw * 1.1, m.y + by * i * cw * 1.1, g, `rgba(${rgb},${(0.2 + 0.8 * f).toFixed(2)})`, true);
      }
    }
    flush();
  }

  /** Bomber explosions: a fireball that swells from yellow through orange to red, and a shockwave ring racing outward. */
  private drawBombs(world: World) {
    if (!world.bombs.length) return;
    const { cw } = this;
    const { put, flush } = this.painter();
    for (const b of world.bombs) {
      const age = world.time - b.born;
      if (age < 0 || age > 1.3) continue;
      const fire = Math.min(1, age / 0.3);
      const fade = Math.max(0, 1 - age / 1.3);
      const coreR = b.r * 0.55 * fire;
      const rings = 9;
      for (let i = 1; i <= rings; i++) {
        const f = i / rings;
        const rad = coreR * f;
        const count = Math.max(6, Math.min(70, Math.round((2 * Math.PI * rad) / (cw * 0.8))));
        const rgb = b.green ? (f < 0.4 ? "225,255,170" : f < 0.75 ? "110,235,90" : "30,150,60") : f < 0.4 ? "255,240,130" : f < 0.75 ? "255,160,40" : "230,60,30";
        const glyphs = f < 0.4 ? "@%#" : f < 0.75 ? "%#*" : "*o:";
        for (let j = 0; j < count; j++) {
          const a = (j / count) * Math.PI * 2 + i * 0.7;
          put(b.x + Math.cos(a) * rad, b.y + Math.sin(a) * rad * 0.85, glyphs[(i + j) % glyphs.length], `rgba(${rgb},${(fade * (1.1 - f * 0.4)).toFixed(2)})`, true);
        }
      }
      // The shockwave: a thin ring of foam that outruns the fire.
      const wave = b.r * Math.min(1, age / 0.9);
      const wc = Math.max(10, Math.min(120, Math.round((2 * Math.PI * wave) / (cw * 0.9))));
      for (let j = 0; j < wc; j++) {
        const a = (j / wc) * Math.PI * 2;
        put(b.x + Math.cos(a) * wave, b.y + Math.sin(a) * wave * 0.85, j % 2 ? "o" : ".", `rgba(255,255,255,${(fade * 0.9).toFixed(2)})`, true);
      }
    }
    flush();
  }

  /** Blaster bolts: a red streak that leaps from the barrel to its target and fades. */
  private drawBolts(world: World) {
    if (!world.bolts.length) return;
    const { cw } = this;
    const { put, flush } = this.painter();
    for (const b of world.bolts) {
      const age = world.time - b.born;
      const reach = Math.min(1, age / 0.1);
      const fade = Math.max(0, 1 - age / 0.45);
      const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) || 1;
      const steps = Math.max(2, Math.round((len * reach) / (cw * 0.6)));
      for (let i = 0; i <= steps; i++) {
        const u = (i / steps) * reach;
        const head = i > steps - 3 && age < 0.1;
        put(b.x0 + (b.x1 - b.x0) * u, b.y0 + (b.y1 - b.y0) * u, head ? "*" : "=", head ? `rgba(255,235,220,${fade.toFixed(2)})` : `rgba(255,70,70,${(fade * 0.9).toFixed(2)})`, true);
      }
    }
    flush();
  }

  /** A whirlpool: three spiral arms of foam turning around the centre. */
  /** A quiet living-light ribbon, behind the animals and without physical force. */
  private drawCurrent(world: World) {
    if (world.currentUntil <= world.time) return;
    const left = world.currentUntil - world.time;
    const fade = Math.min(1, (45 - left) / 4, left / 6);
    const { put, flush } = this.painter();
    for (let lane = 0; lane < 3; lane++) {
      for (let i = 0; i < 100; i++) {
        const u = i / 99;
        const x = u * world.width;
        const y = world.height * (0.36 + lane * 0.09 + 0.12 * Math.sin(u * 6 + world.time * 0.09 + lane * 0.4));
        const twinkle = 0.5 + 0.5 * Math.sin(i * 2.4 + world.time * 0.8 + lane);
        put(x, y, twinkle > 0.85 ? "+" : ".", `rgba(${lane === 1 ? "125,155,225" : "80,205,190"},${(fade * (0.1 + twinkle * 0.28)).toFixed(3)})`);
      }
    }
    flush();
  }

  private drawWhirl(world: World) {
    if (world.whirl) this.drawOneWhirl(world, world.whirl);
    for (const v of world.vortices) this.drawOneWhirl(world, v);
  }

  private drawOneWhirl(world: World, wp: NonNullable<World["whirl"]>) {
    const { put, flush } = this.painter();
    const fade = Math.max(0, Math.min(1, (world.time - wp.born) / 2, (wp.until - world.time) / 2));
    for (let arm = 0; arm < 3; arm++) {
      for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        const rad = wp.r * 2.3 * t;
        const ang = wp.dir * (t * 11 + world.time * 1.1) + (arm * Math.PI * 2) / 3;
        put(wp.x + Math.cos(ang) * rad, wp.y + Math.sin(ang) * rad * 0.8, t < 0.1 ? "." : "~", `rgba(110,220,235,${(0.8 * fade * (1 - t * 0.7)).toFixed(2)})`, true);
      }
    }
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
    // Draw each splash as a soft swell: a leading crest with a fading tail behind it, a gently wobbling
    // edge, and a colour that eases from light to deep as it spreads.
    for (const rp of world.ripples) {
      const fade = 1 - rp.r / rp.max;
      const thick = rp.song ? 1 : rp.strength > 1.5 ? 2 : rp.strength >= 1.2 || (rp.weight ?? 1) >= 2 ? 1 : 0;
      const soft = rp.strength >= 0.55;
      const phase = rp.x * 0.013 + rp.y * 0.007;
      // [radial offset in cells, weight]: the crest, then fainter swells trailing behind it.
      const passes = rp.song ? [[0, 1], [-9, 0.45]] : soft ? [[0, 1], [-2.4, 0.55], [-4.8, 0.28]] : [[0, 1]];
      for (let p = 0; p < passes.length; p++) {
        const r0 = rp.r + passes[p][0] * this.cw;
        if (r0 < 3) continue;
        const weight = passes[p][1];
        const steps = Math.max(12, Math.ceil((Math.PI * 2 * r0) / this.cw));
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2;
          const amp = rp.amp[Math.floor((k / steps) * rp.amp.length)];
          if (amp < 0.05) continue;
          // The edge is never a perfect circle.
          const wob = 1 + 0.035 * Math.sin(3 * a + rp.r * 0.012 + phase) + 0.025 * Math.sin(5 * a - rp.r * 0.017 + phase * 2);
          const x = rp.x + Math.cos(a - Math.PI) * r0 * wob;
          const y = rp.y + Math.sin(a - Math.PI) * r0 * wob;
          const amount = rp.song ? 0.5 * fade : thick === 0 ? (soft ? 0.9 : 0.8) * fade : Math.min(0.5, 0.2 * fade * rp.strength);
          this.stamp(this.energy, x, y, soft ? Math.max(1, thick) : thick, 0.6 * amount * amp * weight / Math.sqrt(Math.max(1, world.ripples.length / 5)));
          const ci = this.cellIndex(x, y);
          if (ci >= 0) this.tint[ci] = Math.max(this.tint[ci], Math.max(0.01, 1 - fade + 0.01 - p * 0.1) + (rp.hue ? 10 : 0));
        }
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

    const mf = this.megaFin;
    if (mf) {
      // Crescent tail fin in the blade's own frame: x along the axis from its base, y across it.
      const dx = px - mf.bx;
      const dy = py - mf.by;
      const fx = dx * mf.c + dy * mf.s;
      const fy = Math.abs(-dx * mf.s + dy * mf.c);
      const reach = L * 0.13;
      if (
        inTriangle(fx, fy, -L * 0.02, 0, L * 0.1, 0, L * 0.18, reach) &&
        !inTriangle(fx, fy, L * 0.1, 0, L * 0.1 + L * 0.08 * 0.33, reach * 0.55, L * 0.18, reach)
      ) {
        this.hitFlag = FLAG_FIN;
        this.hitShade = 0.34 + 0.16 * (1 - clamp(fy / reach, 0, 1));
        return true;
      }
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
      (shape.caudal > 0 && !mf && inTriangle(u, a, L * 0.86, 0, L * 0.95, 0, L, L * shape.caudal))
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
        const off = bodyWave(sh, s);
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

      this.megaFin = sh.mega ? megaFinFrame(sh, spine, N) : null;

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
          const xray = sh.mega && this.yeat > 0.5;
          this.sharkXray[i] = xray ? (centerHit && coverage >= 0.6 ? 1 : 2) : 0;
          this.sharkRage[i] = sh.mega ? Math.round(255 * clamp((sh.rageLevel ?? 0) * (0.9 + 0.1 * Math.sin(t * 5)), 0, 1)) : 0;

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

  /**
   * Yeat mode: random things swell with a white glow for a few seconds, then fade. Each shark, diver,
   * jelly, the kraken, ufo and whale gets its own slow clock, so who is glowing keeps changing, and a
   * few flares pop up at random spots in the fog.
   */
  private drawYeatGlows(world: World, t: number) {
    const yeat = this.yeat;
    if (yeat <= 0) return;
    const { ctx } = this;
    const hash = (n: number) => {
      const x = Math.sin(n * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    const glowAt = (x: number, y: number, r: number, seed: number, chance = 0.45, period = 7) => {
      const clock = t / period + seed * 0.37;
      const slot = Math.floor(clock);
      if (hash(seed * 13.7 + slot * 3.1) > chance) return;
      const env = Math.pow(Math.sin(Math.PI * (clock - slot)), 0.7) * yeat;
      if (env < 0.02) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${(0.34 * env).toFixed(3)})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const sh of world.sharks) glowAt(sh.nodes[16], sh.nodes[17], sh.length * (sh.mega ? 0.3 : 0.45), sh.id, sh.mega ? 0.8 : 0.4);
    world.fish.forEach((f, i) => { if (f.diver && f.alive && !f.riding) glowAt(f.x, f.y, 60, i + 31, 0.5, 5); });
    world.jellies.forEach((j, i) => glowAt(j.x, j.y, j.size * 7, i + 71, 0.6, 6));
    const k = world.kraken;
    if (k) glowAt(k.x, k.y, k.size * 0.55, 211, 0.7, 6);
    world.ufos.forEach((u, i) => glowAt(u.x, u.y, 130, 223 + i * 17, 0.8, 4));
    const wh = world.whale;
    if (wh) glowAt(wh.x - Math.cos(wh.heading) * wh.length * 0.4, wh.y - Math.sin(wh.heading) * wh.length * 0.4, wh.length * 0.35, 239, 0.6, 9);
    // Stray flares drifting in the fog.
    const w = this.cols * this.cw;
    const h = this.rows * this.ch;
    for (let i = 0; i < 4; i++) {
      const slot = Math.floor(t / 4 + i * 0.7);
      glowAt(hash(i * 5.3 + slot * 1.7) * w, hash(i * 9.1 + slot * 2.3) * h, 90 + hash(slot + i) * 90, i + 500, 0.85, 4);
    }
    ctx.restore();
  }

  /**
   * Yeat mode is an x-ray: the megalodon keeps its (dimmed, grayscale) skin so the shape reads, with its skeleton showing through: a vertebral column,
   * ribs, a toothed skull with empty sockets, fin bones and a fan of tail rays.
   */
  private drawMegaSkeleton(world: World) {
    const alpha = clamp((this.yeat - 0.4) / 0.4, 0, 1);
    if (alpha <= 0) return;
    const { cw } = this;
    const { put, flush } = this.painter();
    const bone = (a: number) => `rgba(240,240,234,${(a * alpha).toFixed(2)})`;
    for (const sh of world.sharks) {
      if (!sh.mega) continue;
      const L = sh.length;
      const N = SHARK_NODES;
      const n = sh.nodes;
      const sp = this.skeletonSpine;
      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const off = bodyWave(sh, s);
        sp[k * 2] = n[k * 2] - ty * off;
        sp[k * 2 + 1] = n[k * 2 + 1] + tx * off;
      }
      // Position along the body (0 snout, 1 tail), the unit tangent toward the tail and its normal.
      const at = (s: number) => {
        const f = clamp(s, 0, 1) * (N - 1);
        const i0 = Math.min(N - 2, Math.floor(f));
        const w = f - i0;
        const x = sp[i0 * 2] * (1 - w) + sp[i0 * 2 + 2] * w;
        const y = sp[i0 * 2 + 1] * (1 - w) + sp[i0 * 2 + 3] * w;
        const dx = sp[i0 * 2 + 2] - sp[i0 * 2];
        const dy = sp[i0 * 2 + 3] - sp[i0 * 2 + 1];
        const dl = Math.hypot(dx, dy) || 1;
        return { x, y, tx: dx / dl, ty: dy / dl, nx: -dy / dl, ny: dx / dl };
      };
      const half = (s: number) => L * 0.08 * Math.sin(Math.PI * Math.pow(clamp(s, 0, 1), 0.75));
      const line = (x0: number, y0: number, x1: number, y1: number, glyph: string, a: number) => {
        const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (cw * 0.7)));
        for (let i = 0; i <= steps; i++) put(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, glyph, bone(a), true);
      };
      const ds = (cw * 0.8) / L;
      // Spine.
      let v = 0;
      for (let s = 0; s < 0.98; s += ds * 0.9, v++) {
        const p = at(s);
        put(p.x, p.y, v % 2 ? "o" : "0", bone(1), true);
      }
      // Ribs, curving back toward the tail.
      for (let r = 0; r < 11; r++) {
        const s = 0.2 + r * 0.04;
        const p = at(s);
        const len = half(s) * 0.92;
        for (const side of [-1, 1]) {
          let px = p.x;
          let py = p.y;
          for (let j = 1; j <= 7; j++) {
            const u = j / 7;
            const lat = side * len * u;
            const back = len * 0.4 * u * u;
            const qx = p.x + p.nx * lat + p.tx * back;
            const qy = p.y + p.ny * lat + p.ty * back;
            line(px, py, qx, qy, "=", 0.85);
            px = qx;
            py = qy;
          }
        }
      }
      // Skull: a cranium ring, empty eye sockets and two rows of teeth.
      const head = at(0.07);
      const hr = half(0.2) * 0.9;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const along = Math.cos(a) * L * 0.06;
        const across = Math.sin(a) * hr * 0.75;
        put(head.x + head.tx * along + head.nx * across, head.y + head.ty * along + head.ny * across, "@", bone(1), true);
      }
      for (const side of [-1, 1]) {
        const eye = at(0.045);
        put(eye.x + eye.nx * hr * 0.4 * side, eye.y + eye.ny * hr * 0.4 * side, "O", bone(1), true);
        for (let j = 0; j < 8; j++) {
          const p = at(0.005 + j * 0.011);
          const lat = side * hr * (0.18 + 0.05 * j);
          put(p.x + p.nx * lat, p.y + p.ny * lat, j % 2 ? "v" : "^", bone(1), true);
        }
      }
      // Pectoral fin bones: rays fanning out and back from each shoulder.
      const sh0 = at(0.27);
      for (const side of [-1, 1]) {
        for (let r = 0; r < 5; r++) {
          const ang = 0.5 + r * 0.22;
          const dirx = sh0.nx * side * Math.cos(ang) + sh0.tx * Math.sin(ang);
          const diry = sh0.ny * side * Math.cos(ang) + sh0.ty * Math.sin(ang);
          const len = L * (0.17 - r * 0.012);
          line(sh0.x + sh0.nx * side * half(0.27) * 0.6, sh0.y + sh0.ny * side * half(0.27) * 0.6, sh0.x + dirx * len + sh0.nx * side * half(0.27) * 0.6, sh0.y + diry * len + sh0.ny * side * half(0.27) * 0.6, "-", 0.8);
        }
      }
      // Tail: rays fanning out through the same pitching crescent the skin is drawn with.
      const fin = megaFinFrame(sh, sp, N);
      const finAt = (fx: number, fy: number): [number, number] => [fin.bx + fx * fin.c - fy * fin.s, fin.by + fx * fin.s + fy * fin.c];
      const [rx0, ry0] = finAt(L * 0.03, 0);
      for (let r = -3; r <= 3; r++) {
        const t = r / 3;
        const [rx1, ry1] = finAt(L * (0.1 + 0.08 * Math.abs(t)), t * L * 0.13);
        line(rx0, ry0, rx1, ry1, "/", 0.85);
      }
    }
    flush();
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
      const xr = this.sharkXray[i];
      // In x-ray the skin sinks back so the bones show through, but its outline stays bright so the shark still reads.
      const dim = (0.7 + 0.3 * sharkDepth[i]) * (xr === 1 ? 0.55 : xr === 2 ? 1.5 : 1);
      let [tr, tg, tb] = SHAPES[KINDS[sharkKind[i]]].tint;
      // An enraged megalodon's hide deepens: darker, and the cool grey tint swings to a deep crimson.
      const rg = this.sharkRage[i] / 255;
      let deep = 1;
      if (rg > 0) {
        tr = tr + (1.15 - tr) * rg;
        tg = tg * (1 - 0.82 * rg);
        tb = tb * (1 - 0.85 * rg);
        deep = 1 - 0.3 * rg;
      }

      // Colours re-roll on a staggered clock so the hide shimmers.
      const tick = Math.floor(t * 2.4 + (key % 997) / 97);
      const roll = hash3(key, tick, 7);

      if (flag === FLAG_EDGE) {
        // Soft, anti-aliased silhouette: no block, just a light glyph.
        const set = shade >= 0.5 || xr === 2 ? EDGE_HEAVY : EDGE_LIGHT;
        const g = (70 + shade * 80) * dim * deep;
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
      level *= dim * deep;
      // Tinted per species; the classic tint is a cool blue-grey, like a back seen through deep water.
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(level * tr))},${Math.min(255, Math.round(level * tg))},${Math.min(255, Math.round(level * tb + 4))})`;
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

      let color: string;
      if (flag === FLAG_EYE) color = rg > 0.15 ? "#ffcc33" : "#9aa0ad";
      else if (flag === FLAG_MARK) color = `rgb(${Math.round(70 * tr)},${Math.round(70 * tg)},${Math.round(70 * tb)})`;
      else if (rg > 0.15 && roll < 0.11) color = "#ffc53a";
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
        if (!f.alive || f.diver || (f.depth > 0.78 ? 0 : 1) !== pass) continue;
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
        const color = tv >= 10 ? ORANGE_BASE + Math.min(RIPPLE_STEPS - 1, Math.floor((tv - 10.01) * RIPPLE_STEPS)) : tv > 0 ? RIPPLE_BASE + Math.min(RIPPLE_STEPS - 1, Math.floor((tv - 0.01) * RIPPLE_STEPS)) : WAKE;
        bucket = color * ALPHA_LEVELS + level;
      } else {
        const col = i % cols;
        const row = (i / cols) | 0;
        // Dots stay bright and crisp; the twinkle is a gentle breathe, not a fade.
        const twinkle = 0.5 + 0.5 * Math.sin(t * dotFreq[i] + dotPhase[i]);
        const caustic = 0.85 + 0.15 * Math.sin(col * 0.11 + t * 0.35) * Math.sin(row * 0.17 - t * 0.27);
        let v = clamp((0.55 + 0.45 * twinkle) * caustic + e * 2, 0, 1) * (1 - 0.4 * this.night) * (1 - 0.75 * this.yeat);
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
