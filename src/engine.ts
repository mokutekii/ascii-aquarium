import { AsciiRenderer } from "./renderer";
import { World, type SharkSpec } from "./world";
const STEP = 1 / 60;
const MAX_STEPS = 4;
/** How much bigger the simulated tank is than the window; everything is drawn this much smaller. */
const ZOOM_OUT = 3;
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
  private activitySpeed = 0.85;
  /** The speed actually in use: it eases toward activitySpeed, so an assistant closing never slams the sea to a crawl. */
  private liveSpeed = 0.85;
  private speed = 1;
  private f = 1;
  private quality: "auto" | "high" | "saver" = "auto";
  private qualityTier = 0;
  private loadMs = 0;
  private qualityAt = 0;
  setQuality(mode: "auto" | "high" | "saver") {
    if (mode === this.quality)
      return;
    this.quality = mode;
    this.changeQuality(mode === "saver" ? 2 : 0);
  }
  private changeQuality(tier: number) {
    if (tier === this.qualityTier)
      return;
    this.qualityTier = tier;
    this.renderer.setQuality(tier);
    this.loadMs = 0;
    this.qualityAt = performance.now();
    this.resize();
  }
  setEventEnabled(kind: Parameters<World["triggerEvent"]>[0], enabled: boolean) { this.world.setEventEnabled(kind, enabled); }
  queueEvent(kind: Parameters<World["triggerEvent"]>[0]) { return this.world.queueEvent(kind); }
  cancelQueuedEvent(kind: Parameters<World["triggerEvent"]>[0]) { this.world.cancelQueuedEvent(kind); }
  eventStatus(kind: Parameters<World["triggerEvent"]>[0]) { return this.world.eventStatus(kind); }
  setWorking(working: boolean) {
    this.activitySpeed = working ? 1.55 : 0.85;
  }
  /** Which assistants are working right now: each keeps a crewed submarine down in the tank. */
  setWorkers(claude: boolean, codex: boolean) { this.world.setWorkers(claude, codex); }
  setFps(fps: number) { this.fps = fps; }
  /** Simulation speed multiplier (1, 2 or 4): the world just runs more fixed steps per frame. */
  setSpeed(speed: number) { this.speed = speed; }
  /** How many saucers or whales are out right now. */
  count(kind: "ufo" | "whale") { return kind === "ufo" ? this.world.ufos.length : this.world.whales.length; }
  /** The next one-off message from the simulation, if any. */
  takeNotice() { return this.world.notices.shift() ?? null; }
  setAttention(claude: boolean, codex: boolean) { this.world.attention = { claude, codex }; }
  activityPulse(source: "claude" | "codex", kind: "question" | "subagent" | "done") {
    if (this.reducedMotion.matches)
      return;
    const sub = this.world.subs.find((sb) => sb.crew === source);
    const x = sub?.x ?? this.world.width - (source === "claude" ? 70 : 140);
    const y = sub?.y ?? 60;
    this.world.splash(x, y, 0.9, source === "claude" ? 1 : 0, { quiet: true, max: 230 });
    this.world.callout(x, y - 40, kind === "question" ? "?" : kind === "subagent" ? "CREW RETURNED" : "DONE", source === "claude" ? "255,175,100" : "195,165,255");
  }
  setEventLevel(level: World["settings"]["events"]) { this.world.settings.events = level; }
  setEventBars(mode: "one" | "more") { this.world.settings.eventBars = mode; }
  setNightEnabled(on: boolean) {
    this.world.settings.night = on; if (!on)
      this.world.cancelQueuedEvent("night");
  }
  setLighting(mode: "auto" | "day" | "night") {
    this.world.lighting = mode;
    this.setNightEnabled(mode !== "day");
    if (this.reducedMotion.matches)
      this.drawStill();
  }
  /** Whether the last manual start already queued its own announcement. */
  triggerAnnounced = false;
  /** Demo hook: run a random event on demand. */
  trigger(kind: Parameters<World["triggerEvent"]>[0]) {
    const before = this.world.notices.length;
    const result = this.world.triggerEvent(kind);
    this.triggerAnnounced = result === "started" && this.world.notices.length > before;
    // A compound start (such as a titan joining a saga) has one entrance line.
    if (this.triggerAnnounced && this.world.notices.length > before + 1)
      this.world.notices.splice(before, this.world.notices.length - before - 1);
    return result;
  }
  /** The shark key: one more shark, random kind. */
  spawnShark() { return this.world.spawnRandomShark(); }
  celebrate() {
    if (this.reducedMotion.matches)
      return;
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
    window.addEventListener("pointercancel", this.onPointerLeave);
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);
    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, redraw.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && this.reducedMotion.matches)
        this.drawStill();
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
    window.removeEventListener("pointercancel", this.onPointerLeave);
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
    if (!Number.isFinite(raw) || raw <= 0)
      return 1;
    return steps.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), 1);
  }
  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1)
      return;
    // The tank is simulated in 100%-zoom pixels, so zoom never changes what you see;
    // only the window size does. The header undoes the zoom too (--uz in index.html).
    const f = this.zoom();
    // Simulate a tank ZOOM_OUT times wider and taller than the window and draw it scaled down,
    // so there is room for more sharks, divers and events without crowding.
    this.f = f * ZOOM_OUT;
    document.documentElement.style.setProperty("--uz", String(1 / f));
    const w = rect.width * this.f;
    const h = rect.height * this.f;
    const dpr = Math.min((window.devicePixelRatio || 1) / this.f, 1.5);
    this.renderer.resize(w, h, dpr);
    // Rendering detail must not change flocking distances or the simulation itself.
    const cellWidth = Math.max(8, Math.min(13, Math.round(w / 124)));
    this.world.resize(w, h, cellWidth, Math.round(cellWidth * 1.45));
    if (this.reducedMotion.matches)
      this.drawStill();
  }
  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches)
      return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private lastDraw = 0;
  private fps = 30;
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // Cap the frame rate. An unfocused window only drops to 20 fps (not 15): closing an assistant hands focus away, and a sudden
    // drop to a slideshow looks like the tank froze.
    const targetFps = Math.min(this.fps, [60, 24, 20][this.qualityTier]);
    const interval = 1000 / (document.hasFocus() ? targetFps : Math.min(targetFps, 20));
    if (now - this.lastDraw < interval - 3)
      return;
    this.lastDraw = now;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.liveSpeed += (this.activitySpeed - this.liveSpeed) * Math.min(1, dt * 1.2);
    this.acc += dt * this.liveSpeed * this.speed;
    const workStarted = performance.now();
    let steps = 0;
    const maxSteps = MAX_STEPS * this.speed;
    while (this.acc >= STEP && steps < maxSteps) {
      this.world.step(STEP);
      this.acc -= STEP;
      steps++;
      // Drop overdue time rather than let catch-up work monopolize a slow machine.
      if (performance.now() - workStarted > 10) {
        this.acc = 0;
        break;
      }
    }
    if (steps === maxSteps)
      this.acc = 0;
    this.renderer.render(this.world, dt);
    const workMs = performance.now() - workStarted;
    this.loadMs += (workMs - this.loadMs) * 0.08;
    if (this.quality === "auto" && now - this.qualityAt > 3000) {
      if (this.loadMs > interval * 0.65 && this.qualityTier < 2)
        this.changeQuality(this.qualityTier + 1);
      else if (this.loadMs < interval * 0.22 && this.qualityTier > 0 && now - this.qualityAt > 12000)
        this.changeQuality(this.qualityTier - 1);
    }
  };
  /** Reduced motion: let the ecosystem settle, then show a single frame. */
  private drawStill() {
    if (this.world.time < 4) {
      for (let i = 0; i < 240; i++)
        this.world.step(STEP);
    }
    this.renderer.render(this.world, STEP);
  }
  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.drawStill();
    }
    else {
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
    if (this.world.holdingActor) {
      this.world.dragHeldTo(x, y);
      return;
    }
  };
  private onPointerUp = (_e: PointerEvent) => {
    this.world.releaseHeld();
  };
  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.target instanceof Element && e.target.closest("#status, #panel"))
      return;
    const { x, y, inside } = this.toLocal(e);
    if (inside && !this.reducedMotion.matches) {
      // Pressing on a diver picks it up (a quick tap pops it) instead of splashing.
      if (this.world.holdDiverAt(x, y))
        return;
      this.world.splash(x, y, 1.2, undefined, { weight: 1 });
    }
  };
  private onPointerLeave = () => {
    this.world.releaseHeld();
    this.world.pointer.active = false;
  };
}
