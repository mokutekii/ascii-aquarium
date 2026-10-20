import { AsciiRenderer } from "./renderer";
import { World, type SharkSpec } from "./world";

const STEP = 1 / 60;
const MAX_STEPS = 4;

/**
 * Wires World + AsciiRenderer to a canvas: fixed-timestep loop, resize,
 * pointer input, pausing off-screen, and prefers-reduced-motion.
 */
export class OceanEngine {
  private world: World;
  private renderer: AsciiRenderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;
  private activitySpeed = 0.65;
  private trail: { x: number; y: number } | null = null;
  private f = 1;

  setWorking(working: boolean) {
    this.activitySpeed = working ? 1.55 : 0.65;
  }

  setFps(fps: number) { this.fps = fps; }

  setEventLevel(level: World["settings"]["events"]) { this.world.settings.events = level; }

  setNightEnabled(on: boolean) { this.world.settings.night = on; }

  /** Demo hook: run a random event on demand. */
  trigger(kind: Parameters<World["triggerEvent"]>[0]) {
    return this.world.triggerEvent(kind);
  }

  celebrate() {
    if (this.reducedMotion.matches) return;
    const rect = this.canvas.getBoundingClientRect();
    this.world.splash(rect.width * this.f * 0.5, rect.height * this.f * 0.42, 2.5);
  }

  constructor(private canvas: HTMLCanvasElement, sharks?: SharkSpec[]) {
    this.world = new World(sharks);
    this.renderer = new AsciiRenderer(canvas);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, redraw.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && this.reducedMotion.matches) this.drawStill();
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  /**
   * Browser zoom (1 = 100%). The tank is simulated in 100%-zoom pixels, so cells,
   * fish and sharks keep their on-screen size however far the page is zoomed.
   */
  private zoom() {
    const raw = window.outerWidth / window.innerWidth;
    const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return steps.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), 1);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    // The tank is simulated in 100%-zoom pixels, so zoom never changes what you see;
    // only the window size does. The header undoes the zoom too (--uz in index.html).
    const f = this.zoom();
    this.f = f;
    document.documentElement.style.setProperty("--uz", String(1 / f));
    const w = rect.width * f;
    const h = rect.height * f;
    const dpr = Math.min((window.devicePixelRatio || 1) / f, 1.5);
    this.renderer.resize(w, h, dpr);
    this.world.resize(w, h, this.renderer.cellWidth, this.renderer.cellHeight);
    if (this.reducedMotion.matches) this.drawStill();
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private lastDraw = 0;
  private fps = 30;

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Cap the frame rate: 30 fps in focus, 15 fps when another window has focus.
    const interval = 1000 / (document.hasFocus() ? this.fps : Math.min(this.fps, 15));
    if (now - this.lastDraw < interval - 3) return;
    this.lastDraw = now;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt * this.activitySpeed;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.world.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.renderer.render(this.world, dt);
  };

  /** Reduced motion: let the ecosystem settle, then show a single frame. */
  private drawStill() {
    if (this.world.time < 4) {
      for (let i = 0; i < 240; i++) this.world.step(STEP);
    }
    this.renderer.render(this.world, STEP);
  }

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    } else {
      this.schedule();
    }
  };

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * this.f;
    const y = (e.clientY - rect.top) * this.f;
    const inside = x >= 0 && y >= 0 && x <= rect.width * this.f && y <= rect.height * this.f;
    return { x, y, inside };
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y, inside } = this.toLocal(e);
    const p = this.world.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";
    if (!inside || this.reducedMotion.matches || e.buttons === 0) { this.trail = null; return; }
    // Walk every coalesced sample so a fast drag still leaves an unbroken trail.
    const samples = e.getCoalescedEvents?.() ?? [];
    for (const c of samples.length ? samples : [e]) {
      const q = this.toLocal(c);
      this.extendTrail(q.x, q.y);
    }
  };

  /** Lay a ripple every 54 px along the path from the last trail point to (x, y). */
  private extendTrail(x: number, y: number) {
    const spacing = 54;
    if (!this.trail) { this.trail = { x, y }; return; }
    let dx = x - this.trail.x;
    let dy = y - this.trail.y;
    let dist = Math.hypot(dx, dy);
    while (dist >= spacing) {
      this.trail.x += (dx / dist) * spacing;
      this.trail.y += (dy / dist) * spacing;
      this.world.splash(this.trail.x, this.trail.y, 0.55);
      dx = x - this.trail.x;
      dy = y - this.trail.y;
      dist = Math.hypot(dx, dy);
    }
  }

  private onPointerUp = (e: PointerEvent) => {
    if (e.target instanceof Element && e.target.closest("#status, #panel")) { this.trail = null; return; }
    const { x, y, inside } = this.toLocal(e);
    // Finishing a drag lands a heavier ripple where you let go.
    if (this.trail && inside && !this.reducedMotion.matches) this.world.splash(x, y, 1.4);
    this.trail = null;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.target instanceof Element && e.target.closest("#status, #panel")) return;
    const { x, y, inside } = this.toLocal(e);
    if (inside && !this.reducedMotion.matches) { this.trail = { x, y }; this.world.splash(x, y, 2.5); }
  };

  private onPointerLeave = () => {
    this.world.pointer.active = false;
    this.trail = null;
  };
}
