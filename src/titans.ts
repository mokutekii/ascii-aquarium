import { angleDiff, clamp, rand, randInt, TAU } from "./math";
import { KRAKEN_ARC, KRAKEN_EAT_CHANCE, STRIKE_TIME } from "./types";
import { DIVER_MASS, SHARK_NODES } from "./types";
import type { Fish, Kraken, Shark, Whale } from "./types";
import type { World } from "./world";

export interface TitanMethods {
  megaRage(this: World, sh: Shark): number;
  krakenRage(this: World): number;
  spawnKraken(this: World, solo?: boolean, megaHere?: boolean): void;
  stepKrakenQueue(this: World): void;
  stepKraken(this: World, dt: number): void;
  stepTitanContacts(this: World): void;
  rallyPoint(this: World): { x: number; y: number } | null;
  endWhaleFight(this: World): void;
  stepWhaleFight(this: World, dt: number): void;
  stepInk(this: World, dt: number): void;
  krakenTurnIn(this: World, gap: number, size: number): number;
  whaleBitePoint(this: World, wh: Whale, u: number): { x: number; y: number };
  whalePoint(this: World, wh: Whale, u: number): { x: number; y: number };
  nearestWhale(this: World, x: number, y: number): Whale | null;
  whaleContact(this: World, wh: Whale, x: number, y: number): { u: number; x: number; y: number; d: number };
  whaleMid(this: World, wh: Whale): { x: number; y: number };
  attackWhale(this: World, fromX: number, fromY: number, text: string, notice: string, wh?: Whale | null): void;
  dropCaught(this: World, k: Kraken): void;
  krakenFeed(this: World, k: Kraken): void;
}

/** Everything the two titans do (kraken, megalodon rage, whale fights, ink); mixed into World's prototype. */
export const titanMethods: TitanMethods = {
  /** 0 calm → 1 furious: the blood moon keeps it at 1, and a blast in its arms leaves it angry for a while. */
  /** The same for a megalodon: the blood moon keeps it furious, and a laser (or anything else that provokes it) angers it for a while. */
  megaRage(this: World, sh: Shark): number {
    if (!sh.mega) return 0;
    if (this.sagas.some((s) => s.kind === "moon")) return 1;
    return clamp(((sh.rageUntil ?? 0) - this.time) / 4, 0, 1);
  },

  krakenRage(this: World): number {
    const k = this.kraken;
    if (!k) return 0;
    if (this.sagas.some((s) => s.kind === "moon")) return 1;
    return clamp(((k.rageUntil ?? 0) - this.time) / 4, 0, 1);
  },

  /** A kraken swims in, seizes sharks (and may eat one), and fights the megalodon that comes for it. */
  spawnKraken(this: World, solo = false, megaHere = false): void {
    // Only ever one kraken, whatever asked for it.
    if (!this.isEventEnabled("kraken") || this.kraken) return;
    const { width: W, height: H, time } = this;
    const size = clamp(Math.min(W, H) * rand(0.58, 0.75), 280, 850);
    const { side, y } = this.entryPoint();
    const ax = W * (side === 0 ? rand(0.25, 0.5) : rand(0.5, 0.75));
    this.kraken = {
      x: side === 0 ? -size * 0.7 : W + size * 0.7, y, heading: side === 0 ? 0 : Math.PI, size, phase: 0,
      born: time, state: "enter", stateAt: time, ax, ay: y, side, grabbed: [], megaSent: solo || megaHere, inkAt: 0, bend: 0, solo,
      grabCount: randInt(2, 6), megaDelay: rand(4, 12), holdFor: rand(120, 180),
      caught: [], strike: null, rally: false, whaleUntil: 0, ufoStrike: null, ufoHeld: false, ufoUntil: 0, jet: 0, wave: 0, nextCatch: 0, wrapping: null, wrapFor: 0, tilt: 0, winner: "mega", nextShake: 0, shakeUntil: 0, meals: 0, regrabs: 0, nextGrab: 0, rounds: 0, wounded: false,
    };
    this.titanEntry = { born: time };
    if (!this.sharks.some((sh) => sh.mega) && !this.quietSpawn) this.notices.push("the kraken has awoken!");
  },

  /** Releases a queued kraken once the whale fight is over; if the megalodon has left meanwhile it arrives as a normal kraken. */
  stepKrakenQueue(this: World): void {
    if (!this.krakenQueued || this.whaleFight || this.kraken) return;
    this.krakenQueued = false;
    // If the megalodon is still here the kraken doesn't need to send one.
    this.spawnKraken(false, this.sharks.some((sh) => sh.mega));
  },

  stepKraken(this: World, dt: number): void {
    const k = this.kraken;
    if (!k) return;
    const { time, width: W, height: H } = this;
    k.phase += dt * 0.9;
    k.stroke = undefined;
    // Enraged (blown about by a bomber, or the sea is under a blood moon): it holds more, reaches further and strikes far
    // more often, and takes sharks back almost as soon as it lets go of one.
    const fury = this.krakenRage() > 0;
    // It stays while furious, and only turns to leave a few seconds after it has calmed down.
    if (fury) k.calmUntil = time + rand(7, 12);
    const settled = time >= (k.calmUntil ?? 0);
    const cap = fury ? 5 : 3;
    if (fury) {
      k.grabCount = Math.max(k.grabCount, 6);
      if (k.nextGrab > time + 1.5) k.nextGrab = time + 1.5;
    }
    k.wave += dt * (0.75 + 1.0 * k.jet) * (fury ? 1.2 : 1);
    const mega = this.sharks.find((sh) => sh.mega);
    // A clash always gets its megalodon, however the kraken has been spending its time.
    if (!k.megaSent && !mega && !k.solo && k.state !== "flee" && time - k.born > k.megaDelay + 14) {
      k.megaSent = true;
      this.spawnMegalodon(k.side === 0 ? 1 : 0);
    }
    // Every move is along the body's own axis: `reverse` swims backward (arms leading), never sideways.
    const move = (speed: number, heading: number, pulse = true, turnRate = 1.6, reverse = false, ease = 6) => {
      speed *= 1 + 0.06 * this.krakenRage();
      // Everything it does turns as a slow, wide, fluid curve: a heavy body that bends round, never a quick rotation.
      turnRate *= 0.7;
      // The turn rate eases in and out (a smoothed angular velocity chasing the angle left to cover), so a new target or a
      // change of mind swings the body round in one smooth arc instead of snapping to full speed and stopping dead.
      const want = clamp(angleDiff(k.heading, heading) * 1.2, -turnRate, turnRate);
      k.angVel = (k.angVel ?? 0) + (want - (k.angVel ?? 0)) * Math.min(1, dt * ease);
      const turn = k.angVel * dt;
      const oldH = k.heading;
      k.heading += turn;
      // Turning pivots about the middle of the mantle, not the eye: the leading end carries on along its path and the arms swing
      // out behind, so a turn is a swimming curve and not the whole animal spinning round its eye.
      // Moving, it turns about its leading end; hovering, about the middle of its body, so turning on the spot never swings the eye round in a wide arc.
      const piv = k.size * (0.08 + 0.32 * clamp(speed / 220, 0, 1));
      k.x += piv * (Math.cos(oldH) - Math.cos(k.heading));
      k.y += piv * (Math.sin(oldH) - Math.sin(k.heading));
      k.bend += (turn / dt - k.bend) * Math.min(1, dt * 2);
      // Jet propulsion: it surges forward in pulses and glides between them.
      const surge = pulse ? 0.55 + 0.9 * Math.max(0, Math.sin(k.phase * 1.1)) : 1;
      k.jet += (clamp((speed * surge) / 180, 0, 1) - k.jet) * Math.min(1, dt * 2.5);
      const travel = k.heading + (reverse ? Math.PI : 0);
      k.x += Math.cos(travel) * speed * surge * dt;
      k.y += Math.sin(travel) * speed * surge * dt;
      // Each jet stroke shoves a heavy wake out behind it.
      k.wakeD = (k.wakeD ?? 0) + speed * surge * dt;
      if (k.wakeD > k.size * 0.2) {
        k.wakeD = 0;
        this.splash(k.x + Math.cos(k.heading + Math.PI) * k.size * 0.35, k.y + Math.sin(k.heading + Math.PI) * k.size * 0.35, 1.15, undefined, { dir: k.heading, weight: 3, max: k.size * 0.9, quiet: true });
      }
    };
    const letGo = () => {
      k.sharkStrikes = [];
      k.hunt = undefined;
      this.dropCaught(k);
      for (const sh of k.grabbed) { sh.grabbed = false; sh.devourAt = undefined; }
      k.grabbed = [];
    };
    const endRally = () => {
      k.rally = false;
      for (const s of this.sharks) s.rallying = false;
    };
    // Travelling to a target is thrust and glide: the arms draw out wide while it lines its nose up (wind-up), sweep back in one big
    // thrust that hurls it forward, then tuck in streamlined as it coasts, slowing with the water's drag. It pushes again only
    // once the glide has nearly died. The body only ever travels along its own axis, so it curves in, slows while it is not
    // pointing at the target, and as it closes bends away to sweep past with its arms trailing toward it.
    const ss = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
    // Enraged, every part of it is faster: a shorter wind-up, a harder thrust and a quicker glide, so it recovers and is on to the
    // next target almost at once.
    const charge = (tx: number, ty: number, turnIn: number, turnRate: number, maxV = 1300, windup = 0.6) => {
      const rg = Math.min(1, this.krakenRage());
      windup *= 1 - 0.3 * rg;
      maxV *= 1 + 0.25 * rg;
      turnRate *= 1 + 0.3 * rg;
      // A long, slow coast: one push carries it most of the way, so it rarely has to push again.
      const tau = 2.1 - 0.35 * rg;
      const dist = Math.hypot(tx - k.x, ty - k.y);
      // A slow, heavy thrust: the push builds over most of a second and the long glide shows off its weight.
      const th = windup + 0.8 - 0.2 * rg;
      const toward = Math.atan2(ty - k.y, tx - k.x);
      const diff = angleDiff(k.heading, toward);
      // Having glided past (the target now behind it and close), it just thrusts again rather than waiting out the coast.
      const overshot = k.pushAt !== undefined && time - k.pushAt > th + 0.3 && Math.cos(diff) < -0.2 && dist < k.size * 2.2;
      if (k.pushAt === undefined || overshot || (time - k.pushAt > th + 0.6 - 0.35 * rg && Math.exp(-(time - k.pushAt - th) / tau) < 0.15 + 0.2 * rg)) {
        k.pushAt = time;
        k.pushV = clamp((dist / tau) * (1.05 + 0.1 * rg), 160, maxV);
        k.pushP = clamp(k.pushV / maxV, 0.3, 1);
      }
      const pt = time - k.pushAt;
      const env = pt < windup ? 0 : pt < th ? ss((pt - windup) / (th - windup)) : Math.exp(-(pt - th) / tau);
      // The arms open only as wide as the push needs (a bigger push draws them out further, kept modest so it never looks like
      // wings), then snap together in the thrust into a streamlined point and slowly loosen again as it glides.
      const open = 0.55 * (k.pushP ?? 0.6);
      k.stroke = pt < windup ? open * ss(pt / windup) : pt < th ? open - (open + 0.55) * ss((pt - windup) / (th - windup)) : -0.55 * Math.exp(-(pt - th) / 1.5);
      const aim = toward - (Math.sign(diff) || 1) * (Math.PI / 2) * (pt < windup ? 0 : turnIn);
      const align = Math.max(0, Math.cos(diff));
      const v = (k.pushV ?? 400) * env * (0.3 + 0.7 * align) * (1 - 0.3 * turnIn);
      k.lastV = v;
      // A big heavy body: it comes round slowly and gently, easing in and out of every turn.
      move(v, aim, false, (pt < windup ? turnRate * 1.3 : turnRate) * 0.7, false, 2);
      k.jet = Math.max(k.jet, 0.9 * env);
    };
    const runAway = (wounded: boolean) => {
      k.whaleUntil = 0;
      endRally();
      k.doom = false;
      k.maul = false;
      k.inkEscape = Math.random() < 0.5;
      k.inkShown = false;
      if (mega) mega.chaseUntil = time + (k.inkEscape ? 5 : 14);
      letGo();
      k.wrapping = null;
      k.lunging = false;
      k.wounded = wounded;
      k.state = "flee";
      k.stateAt = time;
    };
    // A megalodon that reaches the kraken, even while it is still swimming in, either scares it off or gets wrapped.
    const meetMega = () => {
      const close = mega && !mega.retreat ? Math.hypot(mega.nodes[0] - k.x, mega.nodes[1] - k.y) < k.size * 0.75 : false;
      if (!close || !mega) return false;
      // The megalodon arrives: sometimes the kraken bolts at once, otherwise it wraps the beast and they fight.
      const pounced = (mega.pounceUntil ?? 0) > time;
      if (!pounced && Math.random() < 0.15) { this.callout(k.x, k.y - k.size * 0.3, "KRAKEN RUNS", "230,230,235"); runAway(false); }
      else {
        letGo();
        k.state = "wrap";
        k.stateAt = time;
        k.lunging = true;
        this.splash(k.x, k.y, 1.8);
        k.wrapping = mega;
        k.wrapFor = rand(9, 14);
        k.coiled = false;
        k.pushAt = undefined;
        k.maul = false;
        if (!pounced) this.callout(k.x, k.y - k.size * 0.3, ["KRAKEN SETS ITS ARMS", "KRAKEN TURNS ON THE MEGALODON", "KRAKEN COILS TO STRIKE"][randInt(0, 2)], "230,230,235");
        // Decided up front so the fight reads: a winning kraken tightens its grip as the beast tires,
        // a winning megalodon shakes harder and harder until the arms give.
        k.winner = k.rounds < 1 && Math.random() < (pounced ? 0.2 : 0.4) ? "kraken" : "mega";
        k.nextShake = time + rand(1.5, 3);
        k.shakeUntil = 0;
        if (pounced) {
          // The megalodon came in at speed: it does not get wrapped, it bites the kraken across the eye and shakes it like a dog with a toy.
          k.ambush = true;
          k.fatal = false;
          k.maul = true;
          k.lunging = false;
          k.coiled = true;
          k.landAt = time;
          k.wrapFor = rand(5.5, 8);
          k.nextShake = time + 99;
          mega.pounceUntil = 0;
          this.notices.push("the megalodon has the kraken by the head");
          mega.pounceUntil = 0;
          this.callout(k.x, k.y - k.size * 0.3, "MEGALODON BITES THE KRAKEN", "130,175,235");
        } else { k.ambush = false; k.fatal = false; k.doom = false; }
      }
      return true;
    };
    // A megalodon getting away is sometimes not allowed to: an arm shoots out, hooks it and hauls it back into the fight.
    if (k.harpoon) {
      const m = k.harpoon.target;
      if (!this.sharks.includes(m) || k.state !== "grab") k.harpoon = undefined;
      else {
        const hx = m.nodes[0];
        const hy = m.nodes[1];
        const d = Math.hypot(hx - k.x, hy - k.y);
        const t = time - k.harpoon.at;
        if (t > 0.6 && d > k.size * 0.5) {
          // Hooked: the whole body is hauled in along the line of the arm.
          const step = Math.min(d, (380 + 260 * Math.min(1, t / 2)) * dt);
          const dx = ((k.x - hx) / d) * step;
          const dy = ((k.y - hy) / d) * step;
          for (let n = 0; n < m.nodes.length; n += 2) { m.nodes[n] += dx; m.nodes[n + 1] += dy; }
          if (time - k.inkAt > 0.25) { k.inkAt = time; this.events.push({ kind: "splash", x: hx, y: hy, strength: 1 }); }
        } else if (t > 0.6) {
          letGo();
          m.retreat = false;
          m.leaveCalm = false;
          m.calmUntil = time + 8;
          k.harpoon = undefined;
          k.state = "wrap";
          k.stateAt = time;
          k.wrapping = m;
          k.wrapFor = k.doom ? rand(10, 13) : rand(7, 10);
          k.winner = k.doom ? "kraken" : "mega";
          k.lunging = true;
          k.coiled = false;
          k.pushAt = undefined;
          k.ambush = true;
          k.fatal = false;
          k.shakeUntil = 0;
          this.splash(k.x, k.y, 2.4);
          this.callout(k.x, k.y - k.size * 0.3, "DRAGGED BACK INTO THE FIGHT", "255,200,90");
        } else if (t > 5) k.harpoon = undefined;
      }
    } else if (k.state === "grab" && mega && mega.retreat && !mega.leaving && time >= (k.harpoonAt ?? 0)) {
      k.harpoonAt = time + rand(9, 15);
      if (Math.hypot(mega.nodes[0] - k.x, mega.nodes[1] - k.y) < k.size * 3 && Math.random() < 0.4) {
        k.harpoon = { target: mega, at: time };
        k.doom = Math.random() < 0.2;
        mega.chaseUntil = 0;
        this.callout(k.x, k.y - k.size * 0.3, "GET OVER HERE!", "255,200,90");
        this.notices.push("the kraken's arm lashes out");
        this.splash(k.x, k.y, 1.8);
      }
    }
    // A tentacle lashes out at a diver on the arm side, and the grab lands when it arrives (so a quick
    // rescuer can still slip past, and nothing is seized from beyond what the arm visibly reaches).
    if (k.state === "enter" || k.state === "grab") {
      const back = k.heading + Math.PI;
      const rx = k.x + Math.cos(back) * k.size * 0.085;
      const ry = k.y + Math.sin(back) * k.size * 0.085;
      if (k.strike) {
        const f = k.strike.f;
        if (!f.alive || f.seized || f.riding || f.dragger || Math.hypot(f.x - rx, f.y - ry) > k.size * 1.5) k.strike = null;
        else if (time - k.strike.at > STRIKE_TIME) {
          f.seized = true;
          f.crushAt = time + rand(4, 7);
          k.caught.push(f);
          k.strike = null;
          k.nextCatch = time + rand(2.5, 4.5);
        }
      } else if (this.fish.some((f) => f.diver && f.alive && !f.seized && !f.riding && !f.dragger && Math.hypot(f.x - k.x, f.y - k.y) < k.size * 0.3)) {
        // A diver that blunders into the kraken itself is never ignored: a tentacle is set on it at once, or it is crushed outright if its arms are full.
        const f = this.fish.find((d) => d.diver && d.alive && !d.seized && !d.riding && !d.dragger && Math.hypot(d.x - k.x, d.y - k.y) < k.size * 0.3)!;
        if (k.caught.length < cap) k.strike = { f, at: time };
        else { this.callout(f.x, f.y - 30, "DIVER CRUSHED", "255,110,100"); this.popDiver(f); }
      } else if (k.caught.length < cap && time >= k.nextCatch && (k.whaleUntil === 0 || fury)) {
        const options: Fish[] = [];
        for (const f of this.fish) {
          if (!f.diver || !f.alive || f.riding || f.dragger || f.seized) continue;
          const d = Math.hypot(f.x - rx, f.y - ry);
          if (d > k.size * ((f.stunUntil ?? 0) > time ? 1.3 : 1.1) * (fury ? 1.2 : 1) || Math.abs(angleDiff(back, Math.atan2(f.y - k.y, f.x - k.x))) > KRAKEN_ARC) continue;
          options.push(f);
        }
        // It picks one at random, and only sometimes bothers: the arms do not snap onto whatever comes near.
        if (options.length) {
          if (Math.random() < (fury ? 0.92 : 0.5)) k.strike = { f: options[randInt(0, options.length - 1)], at: time };
          else k.nextCatch = time + rand(1.2, 3.5) * (fury ? 0.35 : 1);
        }
      }
    }
    // Saucers are fair game too: a tentacle lashes out, then it is flung about and crushed (or breaks free).
    const sauc = this.ufo;
    if ((k.state === "enter" || k.state === "grab") && sauc && !sauc.held && sauc.y > 20 && time >= k.nextCatch && (k.whaleUntil === 0 || fury)) {
      const back = k.heading + Math.PI;
      // Once it has set an arm on the saucer it keeps at it a good while longer, and follows it, so a saucer that drifts off
      // is chased down rather than the grab just fizzling out.
      const reaching = k.ufoStrike !== null;
      const near = Math.hypot(sauc.x - k.x, sauc.y - k.y) < k.size * (reaching ? 1.7 : 1.2) * (fury ? 1.2 : 1) && Math.abs(angleDiff(back, Math.atan2(sauc.y - k.y, sauc.x - k.x))) < KRAKEN_ARC + (reaching ? 0.3 : 0);
      if (reaching && k.state === "grab") {
        const gd = Math.hypot(sauc.x - k.x, sauc.y - k.y);
        const sp = clamp((gd - k.size * 0.9) * 0.9, 0, 130);
        k.x += ((sauc.x - k.x) / (gd || 1)) * sp * dt;
        k.y += ((sauc.y - k.y) / (gd || 1)) * sp * dt;
      }
      if (k.ufoStrike === null && near) {
        if (Math.random() < (fury ? 0.92 : 0.5)) k.ufoStrike = time;
        else k.nextCatch = time + rand(1.5, 4) * (fury ? 0.35 : 1);
      } else if (k.ufoStrike !== null && !near) k.ufoStrike = null;
      else if (k.ufoStrike !== null && time - k.ufoStrike > STRIKE_TIME) {
        k.ufoStrike = null;
        if (Math.random() < 0.25) k.nextCatch = time + rand(3, 6);
        else {
          k.ufoHeld = true;
          k.ufoUntil = time + rand(5, 8);
          sauc.held = true;
          this.callout(sauc.x, sauc.y - 40, "UFO CAUGHT", "255,255,255");
        }
      }
    } else if (k.ufoStrike !== null) k.ufoStrike = null;
    if (k.ufoHeld) {
      const u = this.ufo;
      if (!u || !u.held) k.ufoHeld = false;
      else {
        // Held out on long arms and swayed more slowly than anything else it flings about: a saucer is the heaviest catch.
        const a = k.heading + Math.PI + Math.sin(time * 0.3) * 0.55;
        const r = Math.min(k.size * (0.9 + 0.08 * Math.sin(time * 0.45)), Math.min(W, H) * 0.45);
        const pull = Math.min(1, dt * 1.6);
        u.x += (k.x + Math.cos(a) * r - u.x) * pull;
        u.y += (k.y + Math.sin(a) * r - u.y) * pull;
        if (time > k.ufoUntil) {
          k.ufoHeld = false;
          u.held = false;
          if (Math.random() < 0.7) { this.callout(u.x, u.y - 40, "UFO CRUSHED", "255,110,100"); this.destroyUfo("crushed"); }
          else { this.callout(u.x, u.y - 40, "UFO ESCAPES", "150,255,190"); u.fast = true; u.state = "leave"; k.nextCatch = time + 3; }
        }
      }
    }
    // A whale in reach is wrapped for a few seconds, then tears free and bolts.
    const whale = k.whaleUntil > 0 ? k.whaleTarget : k.hunt ?? this.nearestWhale(k.x, k.y);
    if (k.state === "grab" && time - k.stateAt > 3 && whale && !whale.fleeing && k.whaleUntil === 0) {
      const wm = this.whaleContact(whale, k.x, k.y);
      if (wm.d < k.size * 2.2) {
        k.whaleU = wm.u;
        k.whaleLanded = undefined;
        k.pushAt = undefined;
        k.whaleTarget = whale;
        k.hunt = undefined;
        k.whaleStart = time;
        k.whaleMode = Math.random() < 0.5 ? "poke" : "squeeze";
        // The hold timer only starts once it has actually landed on the whale; until then it is a lunge.
        k.whaleDur = k.whaleMode === "poke" ? rand(3.5, 5) : rand(5, 7);
        k.whaleUntil = time + 8;
        k.nextJab = Infinity;
      }
    }
    if (k.whaleUntil > 0) {
      if (!whale || !this.whales.includes(whale) || whale.fleeing) { k.whaleUntil = 0; k.whaleTarget = undefined; }
      else {
        const poke = k.whaleMode === "poke";
        // It keeps swimming on while clamped: the kraken hangs on and is dragged along, rather than the whale stalling.
        whale.speed += (22 - whale.speed) * Math.min(1, dt * 1.5);
        whale.phase += dt * (poke ? 2 : 3.5);
        // A squeezed whale writhes in the grip.
        if (!poke) whale.heading += Math.sin(time * 7) * 0.03 * dt;
        // The kraken closes in on the whale and clamps on, not the other way round.
        const wm2 = this.whaleContact(whale, k.x, k.y);
        k.whaleU = (k.whaleU ?? wm2.u) + (wm2.u - (k.whaleU ?? wm2.u)) * Math.min(1, dt * 3);
        const dd = wm2.d;
        const stop = k.whaleLanded === undefined ? k.size * 0.5 : k.size * 0.9;
        // It lunges at the whale like the megalodon does: head first in a hard surge that builds, then it swings round so
        // the arms take hold as it lands.
        const toward2 = Math.atan2(wm2.y - k.y, wm2.x - k.x);
        if (dd > stop) {
          charge(wm2.x, wm2.y, this.krakenTurnIn(dd, k.size), 1.8, 470, 1.1);
        } else {
          k.stroke = undefined;
          // Clamped on, it is carried along with the whale and eases in against it while the body settles arms-first.
          const carry = whale.speed;
          k.x += Math.cos(whale.heading) * carry * dt + ((wm2.x - k.x) / (dd || 1)) * Math.max(0, dd - stop * 0.5) * 2 * dt;
          k.y += Math.sin(whale.heading) * carry * dt + ((wm2.y - k.y) / (dd || 1)) * Math.max(0, dd - stop * 0.5) * 2 * dt;
          move(0, toward2 + Math.PI, false, 1.2);
          if (k.whaleLanded === undefined) {
            // Lands: all the arms take hold now, and the hold clock starts here.
            k.whaleLanded = time;
            k.whaleStart = time;
            k.whaleUntil = time + (k.whaleDur ?? 5);
            k.nextJab = time + 0.4;
            this.splash(wm2.x, wm2.y, 2.2);
            this.callout(wm2.x, wm2.y - 60, poke ? "KRAKEN POKES WHALE" : "KRAKEN SQUEEZES WHALE", "255,255,255");
          }
        }
        // Poking: the arms jab at the hide again and again.
        if (poke && time >= (k.nextJab ?? 0)) {
          k.nextJab = time + rand(0.9, 1.5);
          k.jabAt = time;
          k.jabU = rand(0.2, 0.7);
          const jp = this.whaleBitePoint(whale, k.jabU);
          this.splash(jp.x, jp.y, 0.9);
          whale.phase += 0.7;
        }
        if (time > k.whaleUntil) {
          k.whaleUntil = 0;
          k.nextHunt = time + rand(14, 28) * (this.krakenRage() > 0 ? 0.3 : 1);
          // A whale it never reached is simply missed: nothing tears free of a kraken that is nowhere near it.
          const held = k.whaleLanded !== undefined && dd < k.size * 1.2;
          // A squeezed whale always bolts; a poked one only sometimes, otherwise the kraken just lets go.
          // Holding it, the kraken chooses what to do: crush it, drag it under and eat it, or let it go (a squeeze is far more
          // likely to end in a kill than a poke, and either way it is the exception).
          const fate = Math.random();
          const eat = held && !poke && fate < 0.12;
          const crush = held && !eat && fate < (poke ? 0.06 : 0.3);
          if (eat || crush) this.devourWhale(whale, "kraken", wm2.x, wm2.y, eat ? "eat" : "crush");
          else if (!held) { k.nextHunt = time + rand(3, 6); }
          else if (!poke || Math.random() < 0.4) this.attackWhale(k.x, k.y, "WHALE BREAKS FREE", "the whale tore free of the kraken", whale);
          else if (held) this.splash(wm2.x, wm2.y, 1.2);
          if (held && !eat && !crush) {
            // The whale gets away and the kraken lunges off almost in annoyance, away from where it was.
            k.huffDir = Math.atan2(k.y - wm2.y, k.x - wm2.x) + rand(-0.4, 0.4);
            k.huffUntil = time + 4;
            k.pushAt = undefined;
          }
          k.whaleTarget = undefined;
          k.whaleMode = undefined;
        }
      }
    }
    k.caught = k.caught.filter((f, i) => {
      if (!f.alive) { delete f.seized; return false; }
      if (time > (f.crushAt ?? 0) && this.blasterEscape(f, 0.65, k.x, k.y)) { delete f.seized; k.nextCatch = time + rand(2.5, 4.5); return false; }
      if (time > (f.crushAt ?? 0) && (f.stunUntil ?? 0) > time && Math.random() < 0.5) {
        // A limp diver is sometimes just hurled away.
        delete f.seized;
        const a = Math.atan2(f.y - k.y, f.x - k.x);
        f.vx = Math.cos(a) * 240;
        f.vy = Math.sin(a) * 240;
        k.nextCatch = time + rand(1.5, 3);
        return false;
      }
      if (time > (f.crushAt ?? 0)) {
        delete f.seized;
        this.callout(f.x, f.y - 30, "DIVER CRUSHED", "255,110,100");
        this.popDiver(f);
        return false;
      }
      // Held out at the end of long arms, swung about, rather than clutched against the body.
      // Held out at the far end of long arms and swayed slowly: heavy and menacing, not flailing.
      // A caught diver is swung at 0.45 rad/s when heavy up to 0.65 when light (a held ufo is slower still).
      const swingRate = 0.65 - 0.2 * DIVER_MASS[f.dkind ?? "scuba"];
      const a = k.heading + Math.PI + Math.sin(time * swingRate + i * 2.1) * 0.95;
      const r = Math.min(k.size * (1.0 + 0.14 * Math.sin(time * swingRate * 1.4 + i)), Math.min(W, H) * 0.5);
      // Hauled out to its swinging spot along the arm rather than snapped there, so a fresh catch never jumps.
      // It travels round the kraken (angle and distance eased separately), so it can never be dragged through the body.
      const pull = Math.min(1, dt * 3);
      const r0 = Math.hypot(f.x - k.x, f.y - k.y);
      const a0 = Math.atan2(f.y - k.y, f.x - k.x);
      const rNow = Math.max(k.size * 0.16, r0 + (r - r0) * pull);
      const aNow = a0 + angleDiff(a0, a) * pull;
      f.x = k.x + Math.cos(aNow) * rNow;
      f.y = k.y + Math.sin(aNow) * rNow;
      f.vx = Math.cos(a + 1.57) * 30;
      f.vy = Math.sin(a + 1.57) * 30;
      f.phase += dt * 6;
      return true;
    });
    if (k.state === "enter") {
      if (meetMega()) return;
      const d = Math.hypot(k.ax - k.x, k.ay - k.y);
      move(Math.min(60, d * 0.5 + 10), Math.atan2(k.ay - k.y, k.ax - k.x));
      // It has to be able to arrive: a body this big on a slow turn can circle a tiny arrival radius for ever, so it settles once close
      // or once it has been trying a while.
      if (d < Math.max(14, k.size * 0.1) || time - k.stateAt > 22) {
        k.state = "grab";
        k.stateAt = time;
        // Arms close on one shark at a time, as each comes into reach, up to grabCount.
        k.nextGrab = time + rand(1, 2.5);
        k.grabbed = [];
      }
    } else if (k.state === "grab") {
      // It stays put and reaches: it only turns when what it wants is outside its 270 degree arm arc, and then slowly and heavily.
      const behind = k.heading + Math.PI;
      let goal: { x: number; y: number } | null = null;
      if (k.grabbed.length) {
        goal = {
          x: k.grabbed.reduce((sum, sh) => sum + sh.nodes[0], 0) / k.grabbed.length,
          y: k.grabbed.reduce((sum, sh) => sum + sh.nodes[1], 0) / k.grabbed.length,
        };
      }
      // A whale it has hold of keeps its arms turned toward it.
      if (!goal && k.whaleUntil > 0 && k.whaleTarget) goal = this.whaleMid(k.whaleTarget);
      if (!goal && k.ufoStrike !== null && this.ufo) goal = { x: this.ufo.x, y: this.ufo.y };
      // Now and then it picks a whale and swims across the tank to it.
      if (k.hunt && (!this.whales.includes(k.hunt) || k.hunt.fleeing || k.whaleUntil > 0 || time - (k.huntAt ?? 0) > 30)) k.hunt = undefined;
      k.nextHunt ??= time + rand(3, 8);
      if (!k.hunt && k.whaleUntil === 0 && time >= k.nextHunt && !k.grabbed.length && !k.caught.length && !k.strike && !k.sharkStrikes?.length && !k.ufoHeld) {
        k.nextHunt = time + rand(10, 20);
        const target = this.nearestWhale(k.x, k.y);
        if (target && Math.random() < 0.9) { k.hunt = target; k.huntAt = time; }
      }
      // On its own (or with nothing in its arms) it watches for divers, and the whale if that is all there is.
      if (!goal && k.grabbed.length < k.grabCount) {
        let sd = k.size * 3;
        for (const sh of this.sharks) {
          if (sh.mega || sh.grabbed || sh.leaving || sh.lifted || (sh.cleaning && !sh.carrion)) continue;
          const d = Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y);
          if (d < sd) { sd = d; goal = { x: sh.nodes[0], y: sh.nodes[1] }; }
        }
      }
      if (!goal && k.caught.length < cap) {
        let pd = k.size * 3;
        for (const f of this.fish) {
          if (!f.diver || !f.alive || f.riding || f.dragger || f.seized || !this.onScreen(f)) continue;
          const d = Math.hypot(f.x - k.x, f.y - k.y);
          if (d < pd) { pd = d; goal = f; }
        }
        const nearbyWhale = this.nearestWhale(k.x, k.y);
        if (!goal && nearbyWhale) {
          const wm = this.whaleMid(nearbyWhale);
          if (Math.hypot(wm.x - k.x, wm.y - k.y) < k.size * 3.2) goal = wm;
        }
        if (goal && !k.hunt) {
          // Drifts in only until the target is within its long reach.
          const gd = Math.hypot(goal.x - k.x, goal.y - k.y);
          const sp = clamp((gd - k.size * 1.2) * 0.3, 0, 45);
          const toward = Math.atan2(goal.y - k.y, goal.x - k.x);
          k.x += Math.cos(toward) * sp * dt;
          k.y += Math.sin(toward) * sp * dt;
        }
      }
      let want = k.heading;
      // Strike plan: its arms reach all round except a narrow cone dead ahead of the mantle. A target there is never turned
      // round for (that is the carousel): it launches itself FORWARD past the target, so it ends up behind it, inside the arms'
      // reach, with no turn at all. The plan is held until it has gone past, and only then is anything else looked at.
      if (k.passTo && (time > (k.faceUntil ?? 0) || Math.hypot(k.passTo.x - k.x, k.passTo.y - k.y) < k.size * 0.3 || Math.cos(angleDiff(k.heading, Math.atan2(k.passTo.y - k.y, k.passTo.x - k.x))) < 0.2)) {
        k.passTo = undefined;
        k.faceMin = time + 2;
      }
      if (!k.passTo && goal && time >= (k.faceMin ?? 0) && Math.abs(angleDiff(behind, Math.atan2(goal.y - k.y, goal.x - k.x))) > KRAKEN_ARC - 0.15) {
        const gdir = Math.atan2(goal.y - k.y, goal.x - k.x);
        const gd2 = Math.hypot(goal.x - k.x, goal.y - k.y);
        const m3 = k.size * 0.5;
        const reach = gd2 + k.size * 0.7;
        const px2 = k.x + Math.cos(gdir) * reach;
        const py2 = k.y + Math.sin(gdir) * reach;
        // Only when there is room to run on past it; otherwise it just carries on drifting and the target comes to it.
        if (px2 > m3 && px2 < W - m3 && py2 > m3 && py2 < H - m3) {
          k.passTo = { x: px2, y: py2 };
          k.faceUntil = time + 7;
          k.pushAt = undefined;
        } else k.faceMin = time + 2;
      }
      if (!mega) k.megaSeenAt = undefined;
      if (k.hunt) {
        // Head first across the tank, then it swings round so the arms face the whale as it closes in.
        const wm = this.whaleMid(k.hunt);
        const gap = Math.hypot(wm.x - k.x, wm.y - k.y);
        const toward = Math.atan2(wm.y - k.y, wm.x - k.x);
        const turnIn = this.krakenTurnIn(gap, k.size);
        charge(wm.x, wm.y, turnIn, 1.4, 320, 0.9);
      } else if (mega && !mega.retreat && k.whaleUntil === 0 && !k.caught.length && (k.megaSeenAt ??= time) !== undefined && time - k.megaSeenAt > 1.5) {
        // A titan in the tank is a rival it goes for willingly: it swims straight at the megalodon, thrust and glide, curving in
        // so its arms face it, and wraps it the moment it is in reach.
        const mgap = Math.hypot(mega.nodes[0] - k.x, mega.nodes[1] - k.y);
        charge(mega.nodes[0], mega.nodes[1], this.krakenTurnIn(mgap, k.size), 1.8, 600, 0.5);
      } else if (k.whaleUntil === 0) {
        // Lurking: it never just sits and pivots. It floats on, a slow surging drift that wanders gently, and any turn (to face
        // something it has found) is a wide curve made while still drifting, not a swing on the spot.
        if (k.huffUntil !== undefined && time < k.huffUntil) {
          const hd = k.huffDir ?? k.heading;
          const m2 = k.size * 0.6;
          charge(clamp(k.x + Math.cos(hd) * 700, m2, W - m2), clamp(k.y + Math.sin(hd) * 700, m2, H - m2), 0, 1.6, 640, 0.35);
        } else if (k.wanderAt === undefined || time > k.wanderAt) {
          // It roams the whole tank: each new leg heads for a fresh spot in the middle of it, so it never circles in one corner.
          k.wanderAt = time + rand(7, 13);
          k.wanderTo = Math.atan2(rand(H * 0.2, H * 0.8) - k.y, rand(W * 0.2, W * 0.8) - k.x);
        }
        let aim = want !== k.heading ? want : k.wanderTo ?? k.heading;
        const edge = k.size * 0.45;
        if (k.x < edge || k.x > W - edge || k.y < edge || k.y > H - edge) aim = Math.atan2(H / 2 - k.y, W / 2 - k.x);
        const bendBy = Math.abs(angleDiff(k.heading, aim));
        if (k.passTo) {
          // Launching itself forward past what it is after, to end up in the right spot for its arms.
          charge(k.passTo.x, k.passTo.y, 0, 1.2, 520, 0.7);
        } else if (bendBy > 0.6) {
          // Pointing well away from where it is going: it launches into the new line rather than curling round in place.
          charge(k.x + Math.cos(aim) * 520, k.y + Math.sin(aim) * 520, 0, 1.2, 380, 0.8);
        } else move(16 + 36 * Math.min(1, bendBy), aim, true, 0.55);
      }
      this.krakenFeed(k);
      if (!k.megaSent && !mega && time - k.stateAt > k.megaDelay) {
        k.megaSent = true;
        this.spawnMegalodon(k.side === 0 ? 1 : 0);
      }
      if (mega && mega.pounceAt === undefined) mega.pounceAt = time + rand(14, 26);
      if (mega && !mega.retreat && k.state === "grab" && time >= (mega.pounceAt ?? 0) && (mega.pounceUntil ?? 0) <= time && Math.hypot(mega.nodes[0] - k.x, mega.nodes[1] - k.y) < Math.min(W, H) * 1.1) {
        mega.pounceAt = time + rand(30, 55);
        if (Math.random() < 0.4) { mega.pounceUntil = time + 9; this.callout(mega.nodes[0], mega.nodes[1] - 40, "MEGALODON CHARGES", "130,175,235"); this.notices.push("the megalodon is going for the kraken"); }
      }
      if (!meetMega() && settled && ((time - k.stateAt > k.holdFor && (!k.caught.length || time - k.stateAt > k.holdFor + 8)) || (k.solo && time - k.born > k.holdFor + 25))) {
        runAway(false);
      }
    } else if (k.state === "wrap") {
      const m = k.wrapping;
      if (!m || !this.sharks.includes(m)) {
        runAway(true);
      } else if (k.lunging && time - k.stateAt < 7 && (k.pushAt === undefined || (time - k.pushAt < 2.2 && Math.hypot(m.nodes[12] - k.x, m.nodes[13] - k.y) > k.size * 0.2))) {
        // Three beats, one after the other: (1) it turns to face the megalodon with its arms drawing out, (2) it thrusts straight at it,
        // the arms snapping shut behind, (3) it lands and the arms close (the branch below). It never starts the next beat early.
        const tx = m.nodes[12];
        const ty = m.nodes[13];
        const gap = Math.hypot(tx - k.x, ty - k.y);
        const toward = Math.atan2(ty - k.y, tx - k.x);
        // It goes in arms first (the heading points away from the megalodon, the arms lead), which is how it will sit once it has landed, so
        // there is no swing round after the landing.
        const facing = toward + Math.PI;
        const t0 = time - k.stateAt;
        if (k.pushAt === undefined) {
          k.stroke = 0.55 * ss(t0 / 1.1);
          k.lastV = 0;
          move(0, facing, false, 1.7, false, 3);
          k.jet = Math.max(k.jet * 0.92, 0.15);
          if ((Math.abs(angleDiff(k.heading, facing)) < 0.28 && t0 > 0.9) || t0 > 2.6) {
            k.pushAt = time;
            k.pushV = clamp(gap * 2.6, 520, 1100);
          }
        } else {
          const tt = time - k.pushAt;
          k.stroke = tt < 0.3 ? 0.55 - 1.1 * ss(tt / 0.3) : -0.55 * Math.exp(-(tt - 0.3) / 1.2);
          const v = (k.pushV ?? 600) * (0.35 + 0.65 * ss(tt / 0.25)) * Math.exp(-tt / 1.1);
          k.lastV = v;
          move(v, facing, false, 1.0, true, 2);
          k.jet = 1;
        }
      } else {
        if (k.lunging) {
          // Lands: the fight clock starts here. It lands while still gliding, and the arms start reaching as it does.
          k.lunging = false;
          k.landAt = time;
          k.landV = k.lastV ?? 0;
          k.pushAt = undefined;
          k.stateAt = time;
          k.nextShake = time + rand(3, 4.2);
          this.callout(k.x, k.y - k.size * 0.3, ["KRAKEN LATCHES ON", "KRAKEN LANDS ON THE MEGALODON", "ARMS REACH FOR THE MEGALODON"][randInt(0, 2)], "230,230,235");
          this.splash(m.nodes[0], m.nodes[1], 2.4);
          this.events.push({ kind: "eat", x: (k.x + m.nodes[0]) / 2, y: (k.y + m.nodes[1]) / 2 });
        }
        // Only once the arms have actually closed round it is it wrapped: that is when the fight (and its bar) begins.
        if (!k.coiled && time - k.stateAt > 2.4) {
          k.coiled = true;
          this.callout(k.x, k.y - k.size * 0.3, "KRAKEN WRAPS MEGALODON", "230,230,235");
          this.notices.push("the kraken has the megalodon wrapped");
        }
        // Clamped round the megalodon's head and flank, thrashing while it bites.
        const progress = clamp((time - k.stateAt) / k.wrapFor, 0, 1);
        // The divers can swing it: enough of a lean one way and the other titan takes over.
        k.tilt *= 1 - dt * 0.04;
        // If only one of the two is enraged, its fury tips the tug of war its way: a tie never holds.
        const edge = this.krakenRage() - this.megaRage(m);
        k.tilt = clamp(k.tilt + edge * dt * 0.25, -1, 1);
        const turned = Math.abs(edge) > 0.3 ? "THE RAGE TURNS THE TIDE" : "THE DIVERS TURN THE TIDE";
        if (k.tilt > 0.4 && k.winner === "mega") { k.winner = "kraken"; k.tilt = 0.1; this.callout(k.x, k.y - k.size * 0.3, turned, "255,255,255"); }
        else if (k.tilt < -0.4 && k.winner === "kraken") { k.winner = "mega"; k.tilt = -0.1; this.callout(k.x, k.y - k.size * 0.3, turned, "130,175,235"); }
        // Every few seconds the megalodon whips its head and flings the kraken around it.
        if (time >= k.nextShake && time >= k.shakeUntil) {
          k.shakeUntil = time + 1.3;
          k.nextShake = time + rand(2.5, 4) * (k.winner === "mega" ? 1 - 0.4 * progress : 1 + 0.6 * progress) * (1 - 0.35 * this.krakenRage());
          this.splash(m.nodes[0], m.nodes[1], 1.6);
        }
        // As the megalodon tires, the other sharks come to its rescue; if two reach the kraken, it lets go.
        if (k.winner === "kraken" && !k.doom && !k.maul && !k.rally && progress > 0.25) {
          k.rally = true;
          k.wrapFor += 3;
          for (const s of this.sharks) s.rallying = false;
          const helpers = this.sharks
            .filter((s) => !s.mega && !s.grabbed && !s.lifted && !s.ufoCharge && !s.leaving && !s.cleaning && !s.dragging && !(this.fight && (s === this.fight.a || s === this.fight.b)))
            .sort((x, y) => Math.hypot(x.nodes[0] - k.x, x.nodes[1] - k.y) - Math.hypot(y.nodes[0] - k.x, y.nodes[1] - k.y))
            .slice(0, 4);
          for (const s of helpers) { s.rallying = true; s.target = null; }
          if (helpers.length) {
            this.notices.push("the sharks rally to the megalodon... all together now!");
          }
        }
        if (k.rally && this.sharks.filter((s) => s.rallying && Math.hypot(s.nodes[0] - k.x, s.nodes[1] - k.y) < k.size * 0.6).length >= 2) {
          this.callout(k.x, k.y - k.size * 0.3, "SHARKS SAVE THE MEGALODON", "150,255,190");
          this.notices.push("the sharks drove the kraken off!");
          this.splash(k.x, k.y, 2);
          m.chaseUntil = time + 6;
          runAway(true);
          return;
        }
        const shaking = time < k.shakeUntil || !!k.maul;
        const fling = (shaking ? k.size * 0.09 : k.size * 0.025) * (1 + 0.5 * this.krakenRage());
        // Right after landing it keeps the glide it arrived with and is only drawn onto the megalodon gradually, so the
        // lunge runs straight into the clamp: the pull and the turn both ease in over the first second.
        const sl = clamp((time - (k.landAt ?? -9)) / 1.0, 0, 1);
        const ease = sl * sl * (3 - 2 * sl);
        if (sl < 1) {
          const carry = (k.landV ?? 0) * (1 - ease) * 0.6;
          k.x += Math.cos(k.heading) * carry * dt;
          k.y += Math.sin(k.heading) * carry * dt;
        }
        if (k.maul) {
          // Its head is in the jaws: the kraken is carried at the snout and whipped from side to side, mantle and arms flying.
          const t = time - k.stateAt;
          const grip = Math.min(1, dt * (3 + 14 * Math.min(1, t / 0.45)));
          const swing = Math.sin(t * 7.2) * (0.7 + 0.5 * Math.sin(t * 2.1));
          const hd = Math.atan2(m.nodes[1] - m.nodes[3], m.nodes[0] - m.nodes[2]);
          const gx = m.nodes[0] + Math.cos(hd) * k.size * 0.03 - Math.sin(hd) * swing * k.size * 0.2;
          const gy = m.nodes[1] + Math.sin(hd) * k.size * 0.03 + Math.cos(hd) * swing * k.size * 0.2;
          k.x += (gx - k.x) * grip;
          k.y += (gy - k.y) * grip;
          // Face the jaws, flung round by each swing; the mantle trails away from the megalodon.
          k.heading += angleDiff(k.heading, hd + Math.PI + swing * 1.1) * Math.min(1, dt * 9);
          k.angVel = 0;
          k.jet = 1;
          k.wave += dt * 6;
          if (time - k.inkAt > 0.35) {
            k.inkAt = time;
            this.events.push({ kind: "eat", x: k.x, y: k.y });
            this.splash(k.x, k.y, 1.3);
            if (Math.random() < 0.4 && this.inks.length < 40) this.inks.push({ x: k.x, y: k.y, vx: rand(-40, 40), vy: rand(-40, 40), r0: k.size * 0.12, r1: k.size * rand(0.3, 0.45), born: time, life: rand(7, 10), seed: Math.random() * 100 });
          }
        } else {
        const pull = Math.min(1, dt * (0.6 + 4.4 * ease));
        let px = (m.nodes[8] + Math.sin(time * 3.6) * fling - k.x) * pull;
        let py = (m.nodes[9] + Math.cos(time * 3.2) * fling - k.y) * pull;
        const stepMax = 650 * dt;
        const stepLen = Math.hypot(px, py);
        if (stepLen > stepMax) { px *= stepMax / stepLen; py *= stepMax / stepLen; }
        k.x += px;
        k.y += py;
        move(0, Math.atan2(m.nodes[25] - k.y, m.nodes[24] - k.x) + Math.PI, false, 1.2 + 2.3 * ease);
        }
        if (!k.maul && time - k.inkAt > 0.8) {
          k.inkAt = time;
          this.events.push({ kind: "splash", x: k.x, y: k.y, strength: 1.2 });
          if (Math.random() < 0.5) this.events.push({ kind: "eat", x: (k.x + m.nodes[0]) / 2, y: (k.y + m.nodes[1]) / 2 });
        }
        if (k.maul && time - k.stateAt > k.wrapFor && k.winner === "kraken") {
          // The odd one: it wrenches its head free and the arms come round the megalodon after all.
          k.maul = false;
          k.lunging = true;
          k.coiled = false;
          k.pushAt = undefined;
          k.stateAt = time;
          k.wrapFor = rand(8, 11);
          this.callout(k.x, k.y - k.size * 0.3, "THE KRAKEN TEARS LOOSE", "255,220,120");
          this.notices.push("the kraken tore itself free");
          return;
        }
        if (time - k.stateAt > k.wrapFor) {
          endRally();
          const r = k.fatal ? 0 : Math.random();
          if (k.winner === "kraken" && k.doom) {
            // Rarest of all: the arms do not give, and the megalodon is torn apart.
            k.doom = false;
            k.rounds++;
            const bits: [string, string][] = [["8", "150,175,215"], ["@", "120,150,200"], ["o", "200,215,235"], ["%", "100,125,170"], ["~", "90,110,150"], [":", "70,90,130"]];
            for (let i = 0; i < 160; i++) {
              const n = randInt(0, SHARK_NODES - 1);
              const a = rand(0, TAU);
              const sp = rand(15, 80);
              const [glyph, rgb] = bits[i % bits.length];
              this.mess.push({ x: m.nodes[n * 2] + Math.cos(a) * rand(0, 30), y: m.nodes[n * 2 + 1] + Math.sin(a) * rand(0, 30), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
            }
            this.events.push({ kind: "eat", x: m.nodes[0], y: m.nodes[1] });
            this.splash(m.nodes[0], m.nodes[1], 2.8);
            this.sharks = this.sharks.filter((s) => s !== m);
            this.sharks
              .filter((sh) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.leaving && !sh.dragging && !(this.fight && (sh === this.fight.a || sh === this.fight.b)))
              .sort((a, b) => Math.hypot(a.nodes[0] - k.x, a.nodes[1] - k.y) - Math.hypot(b.nodes[0] - k.x, b.nodes[1] - k.y))
              .slice(0, 7)
              .forEach((sh) => { sh.cleaning = true; sh.target = null; sh.alertUntil = time + 1.2; });
            k.wrapping = null;
            k.state = "grab";
            k.stateAt = time;
            k.megaSent = false;
            k.megaDelay = rand(30, 45);
            k.nextGrab = time + 2;
            k.meals = 0;
            k.regrabs = 0;
            this.notices.push("the kraken tore the megalodon apart... the sharks move in on the scraps!");
            this.callout(k.x, k.y - k.size * 0.3, "KRAKEN KILLS THE MEGALODON", "255,220,120");
          } else if (k.winner === "kraken") {
            // The grip holds: the megalodon backs off and the kraken goes back to hunting.
            k.rounds++;
            m.retreat = true;
            m.megaHeading = Math.atan2(m.nodes[1] - k.y, m.nodes[0] - k.x);
            k.wrapping = null;
            k.state = "grab";
            k.stateAt = time;
            k.megaSent = false;
            k.megaDelay = rand(12, 20);
            k.nextGrab = time + 2;
            k.meals = 0;
            k.regrabs = 0;
            this.notices.push("the kraken scared the megalodon off... for now!");
            this.callout(k.x, k.y - k.size * 0.3, "KRAKEN WINS - MEGALODON FLEES", "255,220,120");
          } else if (r < 0.6) {
            this.events.push({ kind: "eat", x: k.x, y: k.y });
            this.splash(k.x, k.y, 2.6);
            this.dropCaught(k);
            // Torn arms and mantle drift out as scraps for the sharks to clean up.
            const bits: [string, string][] = [["8", "232,228,215"], ["@", "245,240,230"], ["o", "250,248,240"], ["%", "200,195,215"], ["~", "170,150,200"], [":", "120,100,150"]];
            // A kraken is enormous, so there is a lot of it: a wide cloud of torn arm and mantle drifting out from where it died.
            for (let i = 0; i < 120; i++) {
              const a = rand(0, TAU);
              const sp = rand(15, 90);
              const [glyph, rgb] = bits[i % bits.length];
              this.mess.push({ x: k.x + Math.cos(a) * k.size * rand(0, 0.7), y: k.y + Math.sin(a) * k.size * rand(0, 0.7), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
            }
            this.sharks
              .filter((sh) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.leaving && !sh.dragging && !(this.fight && (sh === this.fight.a || sh === this.fight.b)))
              .sort((a, b) => Math.hypot(a.nodes[0] - k.x, a.nodes[1] - k.y) - Math.hypot(b.nodes[0] - k.x, b.nodes[1] - k.y))
              .slice(0, 7)
              .forEach((sh) => { sh.cleaning = true; sh.target = null; sh.alertUntil = time + 1.2; });
            this.notices.push(k.fatal ? "the chase is over... the kraken never stood a chance." : "the megalodon ate the kraken... what a feast!");
            this.callout(k.x, k.y - k.size * 0.3, k.fatal ? "CHOMP. ...SILENCE." : "MEGALODON WINS - KRAKEN EATEN", k.fatal ? "190,200,225" : "255,120,110");
            this.kraken = null;
          } else {
            this.events.push({ kind: "eat", x: k.x, y: k.y });
            this.splash(k.x, k.y, 2);
            this.notices.push("the megalodon tore free!");
            this.callout(k.x, k.y - k.size * 0.3, "MEGALODON WINS - KRAKEN FLEES", "255,120,110");
            runAway(true);
          }
        }
      }
    } else {
      // It picks one way out when the flight starts: the edge it can reach with the least turning, not through the
      // megalodon, then curves round onto that line at a steady swim, so it never U-turns or is dragged off.
      if (k.exitAt !== k.stateAt) {
        k.exitAt = k.stateAt;
        const edges: [number, number, number][] = [[k.x, -1, 0], [W - k.x, 1, 0], [k.y, 0, -1], [H - k.y, 0, 1]];
        const cost = (e: [number, number, number]) => {
          const a = Math.atan2(e[2], e[1]);
          let c = e[0] + Math.abs(angleDiff(k.heading, a)) * k.size * 0.45;
          if (mega) c += Math.max(0, Math.cos(a - Math.atan2(mega.nodes[1] - k.y, mega.nodes[0] - k.x))) * k.size * 1.5;
          return c;
        };
        const [, ex, ey] = edges.sort((a, b) => cost(a) - cost(b))[0];
        k.exitHeading = Math.atan2(ey, ex);
      }
      if (mega && !mega.retreat) {
        if (k.inkEscape) {
          // Enough ink in the water and the megalodon loses it.
          if (!k.inkShown && time - k.stateAt > 1.2 && this.inks.length) {
            k.inkShown = true;
            mega.chaseUntil = Math.min(mega.chaseUntil ?? 0, time + 0.5);
            this.callout(k.x, k.y - k.size * 0.3, "INK CLOUD - MEGALODON LOSES IT", "200,170,255");
            this.notices.push("the kraken vanishes into the ink");
          }
        } else if (time - k.stateAt > 0.5) {
          // It is not shaken: the megalodon surges after it, and if it catches up it clamps on for the kill.
          mega.chaseUntil = time + 3;
          mega.pounceUntil = time + 1;
          if (!k.inkShown) { k.inkShown = true; this.callout(mega.nodes[0], mega.nodes[1] - 40, "MEGALODON GIVES CHASE", "130,175,235"); this.notices.push("the megalodon is closing in"); }
          if (Math.hypot(mega.nodes[0] - k.x, mega.nodes[1] - k.y) < k.size * 0.75) {
            k.state = "wrap";
            k.stateAt = time;
            k.wrapping = mega;
            k.wrapFor = rand(6, 9);
            k.winner = "mega";
            // Run down, it is bitten across the head and shaken to death.
            k.maul = true;
            k.lunging = false;
            k.coiled = true;
            k.landAt = time;
            k.wrapFor = rand(6, 8);
            k.nextShake = time + 99;
            k.ambush = true;
            k.fatal = true;
            k.shakeUntil = 0;
            k.wounded = true;
            k.pushAt = undefined;
            mega.pounceUntil = 0;
            this.splash(k.x, k.y, 2.4);
            this.callout(k.x, k.y - k.size * 0.3, "DUN DUN DUN DUN DUN DUN", "190,200,225");
            return;
          }
        }
      }
      const cruise = k.wounded ? 150 : 95;
      move(Math.min(cruise, 25 + (time - k.stateAt) * (k.wounded ? 40 : 18)), k.exitHeading ?? k.heading, true, 0.7);
      if (time - k.inkAt > 0.35 && time - k.stateAt < (k.wounded ? 6 : 3)) {
        k.inkAt = time;
        this.events.push({ kind: "splash", x: k.x, y: k.y, strength: 1.2 });
        if (this.inks.length < 40) {
          const back = k.heading + Math.PI;
          this.inks.push({ x: k.x + Math.cos(back) * k.size * 0.25, y: k.y + Math.sin(back) * k.size * 0.25, vx: Math.cos(back) * 10, vy: Math.sin(back) * 10, r0: k.size * 0.18, r1: k.size * rand(0.4, 0.55), born: time, life: rand(9, 13), seed: Math.random() * 100 });
        }
      }
      const gone = Math.max(-k.x, k.x - W, -k.y, k.y - H) > k.size * 0.9;
      if ((gone && time - k.stateAt > 3) || time - k.stateAt > 70) { this.dropCaught(k); this.kraken = null; }
    }
  },

  /**
   * Nothing shoulders past a titan unharmed. A shark or diver that runs into the megalodon's body is bitten or eaten,
   * and a shark that blunders into the kraken is seized.
   */
  stepTitanContacts(this: World): void {
    const { time } = this;
    const mega = this.sharks.find((sh) => sh.mega);
    if (mega) {
      const bodyTouch = (x: number, y: number, pad: number) => {
        for (let n = 0; n < SHARK_NODES; n += 2) {
          if (Math.hypot(mega.nodes[n * 2] - x, mega.nodes[n * 2 + 1] - y) < mega.length * 0.06 + pad) return true;
        }
        return false;
      };
      const bt = mega.biteTarget;
      const tx = bt ? (bt.shark ? bt.shark.nodes[0] : bt.fish!.x) : 0;
      const ty = bt ? (bt.shark ? bt.shark.nodes[1] : bt.fish!.y) : 0;
      const gone = !bt || time > bt.until || (bt.shark ? !this.sharks.includes(bt.shark) : !bt.fish!.alive);
      if (gone) mega.biteTarget = undefined;
      else if (time >= (mega.nextBite ?? 0) && Math.hypot(mega.nodes[0] - tx, mega.nodes[1] - ty) < mega.length * 0.07 + (bt!.shark ? bt!.shark.length * 0.05 : 14)) {
        // Its mouth has reached what it turned on: now it bites.
        mega.biteTarget = undefined;
        mega.nextBite = time + 2.5;
        this.events.push({ kind: "eat", x: tx, y: ty });
        if (bt!.shark) {
          const victim = bt!.shark;
          this.splash(tx, ty, 1.8);
          if (Math.random() < 0.4) {
            this.sharks = this.sharks.filter((sh) => sh !== victim);
            if (this.fight && (this.fight.a === victim || this.fight.b === victim)) this.fight = null;
            this.callout(tx, ty - 40, "SHARK EATEN", "255,120,110");
            this.notices.push("the megalodon ate a shark... ouch!");
          } else {
            // Snapped at and sent flying: it bolts away from the megalodon.
            victim.heading = Math.atan2(ty - mega.nodes[1], tx - mega.nodes[0]);
            victim.speed = 150;
            victim.target = null;
            victim.alertUntil = time + 2;
            this.callout(tx, ty - 40, "SHARK BITTEN", "255,170,120");
          }
        } else {
          const d = bt!.fish!;
          if (this.blasterEscape(d, 0.4, mega.nodes[0], mega.nodes[1])) return;
          d.alive = false;
          d.respawnAt = time + rand(3, 8);
          this.callout(tx, ty - 30, "DIVER EATEN", "255,120,110");
          this.diverQuip("eaten");
        }
      } else if (!mega.biteTarget) {
        // Brushing its body isn't fatal: it just notices whatever touched it and swings round to deal with it.
        const shark = this.sharks.find((sh) => !sh.mega && !sh.leaving && !sh.grabbed && !sh.lifted && !sh.ufoCharge && bodyTouch(sh.nodes[0], sh.nodes[1], sh.length * 0.05));
        const diver = shark ? undefined : this.fish.find((f) => f.diver && f.alive && !f.seized && !f.riding && !f.dragger && bodyTouch(f.x, f.y, 6));
        if (shark || diver) mega.biteTarget = { shark, fish: diver, until: time + 4 };
      }
    }
    const k = this.kraken;
    if (k && (k.state === "enter" || k.state === "grab") && k.grabbed.length < 4 && (k.whaleUntil === 0 || this.krakenRage() > 0)) {
      const prey = this.sharks.find((sh) => !sh.mega && !sh.leaving && !sh.grabbed && !sh.lifted && !sh.ufoCharge && Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y) < k.size * 0.25 && Math.abs(angleDiff(k.heading + Math.PI, Math.atan2(sh.nodes[1] - k.y, sh.nodes[0] - k.x))) < 1.2);
      if (prey) {
        prey.grabbed = true;
        prey.grabbedAt = this.time;
        prey.target = null;
        prey.devourAt = this.time + rand(8, 16);
        k.grabbed.push(prey);
        this.callout(prey.nodes[0], prey.nodes[1] - 40, "SHARK SEIZED", "255,170,120");
      }
    }
  },

  /** Where rescuing sharks head: the kraken while it holds something, or the whale while it is being mauled. */
  rallyPoint(this: World): { x: number; y: number } | null {
    return this.kraken?.rally ? this.kraken : null;
  },

  endWhaleFight(this: World): void {
    this.whaleFight = null;
  },

  /** The megalodon chases the whale down and savages it: usually the whale is eaten, sometimes it gets away. */
  stepWhaleFight(this: World, dt: number): void {
    const wf = this.whaleFight;
    if (!wf) return;
    const { time } = this;
    const wh = wf.whale;
    if (!this.whales.includes(wh) || wh.fleeing || !this.sharks.includes(wf.mega)) { this.endWhaleFight(); return; }
    const mega = wf.mega;
    const m = this.whaleMid(wh);
    // The whale tries to lumber away, thrashing, while the megalodon runs it down.
    const away = Math.atan2(m.y - mega.nodes[1], m.x - mega.nodes[0]);
    wh.speed += (48 - wh.speed) * Math.min(1, dt * 1.2);
    // The whale is one long rigid body swinging about its head, so it turns slowly: a quick turn would whip its tail round.
    wh.heading += clamp(angleDiff(wh.heading, away), -0.15 * dt, 0.15 * dt);
    wh.phase += dt * 1.8;
    // A megalodon that can't get a grip within a few seconds gives up, and the whale carries on unharmed.
    if (!wf.locked && time - wf.start > 9) { mega.whaleAttack = false; this.endWhaleFight(); return; }
    if (wf.locked && time >= wf.nextHit) {
      wf.nextHit = time + rand(0.7, 1.1);
      const bx = mega.nodes[0];
      const by = mega.nodes[1];
      this.events.push({ kind: "eat", x: bx, y: by });
      this.events.push({ kind: "eat", x: (bx + m.x) / 2, y: (by + m.y) / 2 });
      this.splash(bx, by, 1.7);
    }
    if (time < wf.until) return;
    this.endWhaleFight();
    if (wf.doomed) {
      for (let u = 0.1; u < 1; u += 0.2) this.events.push({ kind: "eat", x: wh.x - Math.cos(wh.heading) * wh.length * u, y: wh.y - Math.sin(wh.heading) * wh.length * u });
      this.splash(m.x, m.y, 2.8);
      this.callout(m.x, m.y - 60, "MEGALODON WINS - WHALE EATEN", "255,120,110");
      this.notices.push("the megalodon ate the whale... the sea goes quiet...");
      // What is left of the whale drifts down as scraps for the sharks to clean up.
      const wx = Math.cos(wh.heading);
      const wy = Math.sin(wh.heading);
      const bits: [string, string][] = [["#", "205,220,240"], ["%", "170,190,225"], ["@", "235,240,250"], ["*", "200,70,80"], [":", "190,60,70"], ["o", "245,245,240"]];
      for (let i = 0; i < 40; i++) {
        const u = rand(0.05, 0.95);
        const a = rand(0, TAU);
        const sp = rand(10, 60);
        const [glyph, rgb] = bits[i % bits.length];
        this.mess.push({ x: wh.x - wx * wh.length * u, y: wh.y - wy * wh.length * u, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: time, glyph, rgb });
      }
      this.sharks
        .filter((sh) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.leaving && !sh.dragging && !(this.fight && (sh === this.fight.a || sh === this.fight.b)))
        .sort((a, b) => Math.hypot(a.nodes[0] - m.x, a.nodes[1] - m.y) - Math.hypot(b.nodes[0] - m.x, b.nodes[1] - m.y))
        .slice(0, 4)
        .forEach((sh) => { sh.cleaning = true; sh.carrion = true; sh.target = null; sh.alertUntil = time + 1.2; });
      this.whales = this.whales.filter(w => w !== wh);
    } else {
      this.attackWhale(mega.nodes[0], mega.nodes[1], "WHALE ESCAPES", "the whale escaped the megalodon", wh);
    }
  },

  /** Ink clouds drift and thin out; fish swim out of them. */
  stepInk(this: World, dt: number): void {
    if (!this.inks.length) return;
    const { time } = this;
    this.inks = this.inks.filter((c) => time - c.born < c.life);
    for (const c of this.inks) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= Math.pow(0.8, dt);
      c.vy *= Math.pow(0.8, dt);
      const R = c.r0 + (c.r1 - c.r0) * Math.min(1, (time - c.born) / 3);
      for (const f of this.fish) {
        if (!f.alive || f.seized || f.riding) continue;
        const dx = f.x - c.x;
        const dy = f.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d >= R || d < 1e-3) continue;
        const w = (1 - d / R) * 320 * dt;
        f.vx += (dx / d) * w;
        f.vy += (dy / d) * w;
      }
    }
  },

  /** 0 while a kraken is far from its target (swim head first), rising smoothly to 1 as it closes in (arms toward the target). */
  krakenTurnIn(this: World, gap: number, size: number): number {
    const t = clamp((size * 2.2 - gap) / (size * 1.5), 0, 1);
    return t * t * (3 - 2 * t);
  },

  /** A spot on the whale's body (u: 0 head → 1 tail) where a megalodon can clamp on. */
  whaleBitePoint(this: World, wh: Whale, u: number): { x: number; y: number } {
    return this.whalePoint(wh, u);
  },

  /**
   * The point u (0 head → 1 tail) along the whale's body, which is what is drawn and what titans grip. The body is a
   * follow-the-leader chain from the head with a hard limit on how sharply each joint can bend, so however the head is
   * shoved or turned the whale only ever curves smoothly: it can never fold into a Z or snap its back.
   */
  whalePoint(this: World, wh: Whale, u: number): { x: number; y: number } {
    const N = 18;
    const seg = wh.length / N;
    let sp = wh.spine;
    if (!sp) {
      sp = wh.spine = [];
      for (let i = 0; i <= N; i++) sp.push({ x: wh.x - Math.cos(wh.heading) * seg * i, y: wh.y - Math.sin(wh.heading) * seg * i });
      wh.spineAt = this.time;
    }
    if (wh.spineAt !== this.time) {
      wh.spineAt = this.time;
      sp[0].x = wh.x;
      sp[0].y = wh.y;
      // The neck can only bend so far from the head's heading, and each joint so far from the one before it.
      let prev = wh.heading + Math.PI;
      for (let i = 1; i <= N; i++) {
        const p = sp[i];
        const q = sp[i - 1];
        let ang = Math.atan2(p.y - q.y, p.x - q.x);
        ang = prev + clamp(angleDiff(prev, ang), -0.13, 0.13);
        p.x = q.x + Math.cos(ang) * seg;
        p.y = q.y + Math.sin(ang) * seg;
        prev = ang;
      }
    }
    const f = clamp(u, 0, 1) * N;
    const i = Math.min(N - 1, Math.floor(f));
    const t = f - i;
    return { x: sp[i].x + (sp[i + 1].x - sp[i].x) * t, y: sp[i].y + (sp[i + 1].y - sp[i].y) * t };
  },

  nearestWhale(this: World, x: number, y: number): Whale | null {
    return this.whales.filter(w => !w.fleeing && !(this.kraken && this.kraken.whaleUntil > this.time && this.kraken.whaleTarget === w)).sort((a, b) => {
      const am = this.whaleMid(a), bm = this.whaleMid(b);
      return Math.hypot(am.x - x, am.y - y) - Math.hypot(bm.x - x, bm.y - y);
    })[0] ?? null;
  },

  /** The spot along a whale's body (u: 0 head → 1 tail) nearest to (x, y), that point, and how far off it is. */
  whaleContact(this: World, wh: Whale, x: number, y: number): { u: number; x: number; y: number; d: number } {
    let best = { u: 0, x: wh.x, y: wh.y, d: Infinity };
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const p = this.whalePoint(wh, u);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best.d) best = { u, x: p.x, y: p.y, d };
    }
    return best;
  },

  whaleMid(this: World, wh: Whale): { x: number; y: number } {
    return this.whalePoint(wh, 0.4);
  },

  /** A whale that has been bitten or wrapped bolts away from whatever got it, clearing the board. */
  attackWhale(this: World, fromX: number, fromY: number, text: string, notice: string, wh: Whale | null = this.whale): void {
    if (!wh) return;
    const m = this.whaleMid(wh);
    wh.fleeing = true;
    wh.fleeHeading = Math.atan2(m.y - fromY, m.x - fromX);
    // A hard kick of the flukes as it breaks away, so it never starts from a near standstill.
    wh.speed = Math.max(wh.speed, 42);
    this.events.push({ kind: "eat", x: m.x, y: m.y });
    this.splash(m.x, m.y, 2.4);
    this.callout(m.x, m.y - 60, text, "255,255,255");
    this.notices.push(notice);
  },

  /** Let go of every diver it is holding; they bolt away. */
  dropCaught(this: World, k: Kraken): void {
    for (const f of k.caught) {
      delete f.seized;
      if (f.alive) { f.vx = Math.cos(k.heading + Math.PI) * 50; f.vy = Math.sin(k.heading + Math.PI) * 50; }
    }
    k.caught = [];
    k.strike = null;
    k.ufoStrike = null;
    if (k.ufoHeld && this.ufo) { this.ufo.held = false; this.ufo.fast = true; this.ufo.state = "leave"; }
    k.ufoHeld = false;
  },

  /** While it holds sharks the kraken may eat one, lets another slip away, and snatches a fresh one from nearby. */
  krakenFeed(this: World, k: Kraken): void {
    const { time } = this;
    // Enraged, it is far readier to kill: it eats more, takes sharks sooner and reaches for them far more often.
    const fury = this.krakenRage() > 0;
    for (const sh of [...k.grabbed]) {
      sh.devourAt ??= time + rand(7, 15) * (fury ? 0.5 : 1);
      if (time < sh.devourAt) continue;
      // Wait until the shark has been reeled in to the beak.
      if (Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y) > k.size * 0.4 + sh.length * 0.2 + 40) { sh.devourAt = time + 1; continue; }
      k.grabbed = k.grabbed.filter((o) => o !== sh);
      sh.devourAt = undefined;
      if (k.meals < (fury ? 3 : 1) && this.sharks.filter((o) => !o.mega).length > 2 && Math.random() < (fury ? 0.6 : KRAKEN_EAT_CHANCE)) {
        k.meals++;
        this.sharks = this.sharks.filter((o) => o !== sh);
        this.events.push({ kind: "eat", x: sh.nodes[0], y: sh.nodes[1] });
        this.splash(k.x, k.y, 2.2);
        this.notices.push("the kraken ate a shark... gulp!");
        this.callout(k.x, k.y - k.size * 0.25, "SHARK EATEN", "255,120,110");
        this.nextSharkDrift = Math.min(this.nextSharkDrift, time + rand(10, 18));
        this.growNext = true;
      } else {
        sh.grabbed = false;
        this.splash(sh.nodes[0], sh.nodes[1], 1.6);
        this.notices.push("a shark wriggled free! phew!");
      }
      k.nextGrab = time + rand(3, 6);
    }
    const back = k.heading + Math.PI;
    const free = (sh: Shark) => !sh.mega && !sh.grabbed && !sh.lifted && !sh.ufoCharge && !sh.leaving && (!sh.cleaning || !!sh.carrion) && !sh.dragging
      && !(this.fight && (sh === this.fight.a || sh === this.fight.b));
    const inArc = (sh: Shark) => Math.abs(angleDiff(back, Math.atan2(sh.nodes[1] - k.y, sh.nodes[0] - k.x))) < KRAKEN_ARC - 0.15;
    const strikes = (k.sharkStrikes ??= []);
    for (const st of [...strikes]) {
      // An arm is blooming toward its shark; if the shark swims off, or the arm is not quick enough, it comes to nothing.
      const gone = !this.sharks.includes(st.sh) || !free(st.sh) || !inArc(st.sh) || Math.hypot(st.sh.nodes[0] - k.x, st.sh.nodes[1] - k.y) > k.size * (fury ? 1.7 : 1.2) || k.hunt || (k.whaleUntil > 0 && !fury);
      if (gone) { k.sharkStrikes = k.sharkStrikes!.filter((o) => o !== st); k.nextGrab = Math.min(k.nextGrab, time + rand(1, 2.5)); }
      else if (time - st.at > st.dur) {
        k.sharkStrikes = k.sharkStrikes!.filter((o) => o !== st);
        if (Math.random() < (fury ? 0.05 : 0.2)) k.nextGrab = Math.min(k.nextGrab, time + rand(1.5, 3));
        else {
          st.sh.grabbed = true;
          st.sh.target = null;
          // The arm has already reached it, so the coils close almost at once.
          st.sh.grabbedAt = time - 1.0;
          st.sh.devourAt = time + rand(6, 12) * (fury ? 0.5 : 1);
          k.grabbed.push(st.sh);
          k.regrabs++;
        }
      }
    }
    // Any number of arms can be out at once, all round the 270 degrees it can reach, as long as it has limbs to spare
    // (ten in all: six short arms and four long tentacles) and each goes its own way instead of crossing another.
    const busy = k.grabbed.length + k.sharkStrikes!.length + k.caught.length + (k.strike ? 1 : 0) + (k.ufoHeld || k.ufoStrike !== null ? 1 : 0);
    if (!k.hunt && (k.whaleUntil === 0 || fury) && k.grabbed.length + k.sharkStrikes!.length < k.grabCount && busy < (fury ? 9 : 8) && k.regrabs < (fury ? 60 : 30) && time >= k.nextGrab) {
      k.nextGrab = time + rand(0.8, 3);
      // Sometimes it just watches. When it does reach, it picks one of the sharks in range at random, favouring the closer ones.
      if (Math.random() < (fury ? 0.95 : 0.65)) {
        const dirOf = (sh: Shark) => Math.atan2(sh.nodes[1] - k.y, sh.nodes[0] - k.x);
        const taken = [...k.grabbed, ...k.sharkStrikes!.map((o) => o.sh)];
        const options = this.sharks.filter((sh) => free(sh) && inArc(sh) && !taken.includes(sh) && Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y) < k.size * (fury ? 1.2 : 0.85)
          && taken.every((o) => Math.abs(angleDiff(dirOf(o), dirOf(sh))) > 0.4));
        if (options.length) {
          const weights = options.map((sh) => 1 / (60 + Math.hypot(sh.nodes[0] - k.x, sh.nodes[1] - k.y)));
          let roll = Math.random() * weights.reduce((x, y) => x + y, 0);
          let pick = options[options.length - 1];
          for (let i = 0; i < options.length; i++) { roll -= weights[i]; if (roll <= 0) { pick = options[i]; break; } }
          k.sharkStrikes!.push({ sh: pick, at: time, dur: rand(1.4, 2.6) * (fury ? 0.6 : 1) });
        }
      }
    }
  },
};
