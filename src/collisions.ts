import { SHARK_NODES, type World } from "./world";
import { isCraftHeld, isCraftDriven, moveCraft } from "./handling";
import { bodyPoints } from "./collision-bodies";
type Circle = {
  x: number;
  y: number;
  r: number;
};
type Body = {
  kind: "ufo" | "sub" | "whale" | "shark" | "carrier";
  ref: object;
  points: Circle[];
  inverseMass: number;
  move: (x: number, y: number) => void;
  velocity: (x: number, y: number) => void;
};
/** Passive traffic gives whole silhouettes room; deliberate bites/grabs stay in their encounter logic. */
export function separateTraffic(w: World, dt: number) {
  const bodies: Body[] = [];
  const add = (body: Body) => {
    const move = body.move;
    body.move = (x, y) => {
      move(x, y); for (const p of body.points) {
        p.x += x;
        p.y += y;
      }
    };
    bodies.push(body);
  };
  const cell = Math.max(8, Math.min(13, Math.round(w.width / 124)));
  for (const u of w.ufos) {
    if (u.held)
      continue;
    add({
      kind: "ufo", ref: u, inverseMass: isCraftHeld(w, u) ? 0 : 1, points: bodyPoints(w, u),
      move: (x, y) => moveCraft(w, u, x, y), velocity: () => { }
    });
  }
  for (const s of w.subs) {
    const angle = Math.max(-.4, Math.min(.4, Math.atan2(s.vy, Math.max(30, Math.abs(s.vx))) * .9)) + Math.sin(w.time * 1.3 + s.bob) * .05;
    const c = Math.cos(angle) * s.face, n = Math.sin(angle);
    add({
      kind: "sub", ref: s, inverseMass: s.seizedByKraken || isCraftHeld(w, s) ? 0 : .5, points: [...[-1, 0, 1].map(v => ({ x: s.x + c * v * cell * 8, y: s.y + n * v * cell * 8, r: cell * 3.6 })), { x: s.x - c * cell * .7 + Math.sin(angle) * s.face * cell * 5.2, y: s.y - n * cell * .7 - Math.cos(angle) * cell * 5.2, r: cell * 2.5 }],
      move: (x, y) => { s.x += x; s.y += y; }, velocity: (x, y) => { s.vx += x; s.vy += y; }
    });
  }
  for (const wh of w.whales) {
    const points: Circle[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, p = w.whalePoint(wh, u);
      // Include the visible body's sideways swimming wave, not just its spine.
      const width = u < .5 ? .105 : Math.max(.025, .105 * (1 - (u - .5) / .5));
      points.push({ ...p, r: wh.length * (width + .016 + .046 * Math.pow(u, 1.4)) + 12 });
    }
    // Pectoral fins and broad tail flukes also need room to pass a hull.
    for (const [u, offset, radius] of [[.3, .14, .085], [.97, .14, .14]]) {
      const p = w.whalePoint(wh, u), q = w.whalePoint(wh, Math.max(0, u - .02));
      const angle = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(angle), ny = Math.cos(angle);
      for (const side of [-1, 1])
        points.push({ x: p.x + nx * wh.length * offset * side, y: p.y + ny * wh.length * offset * side, r: wh.length * radius + 12 });
    }
    add({
      kind: "whale", ref: wh, points, inverseMass: .01, move: (x, y) => {
        wh.x += x; wh.y += y; if (wh.spine)
          for (const p of wh.spine) {
            p.x += x;
            p.y += y;
          }
      }, velocity: () => { }
    });
  }
  for (const sh of w.sharks) {
    if (sh.grabbed || sh.lifted || sh.mega)
      continue;
    const points: Circle[] = [];
    for (let i = 0; i < SHARK_NODES; i += 3) {
      const u = i / (SHARK_NODES - 1);
      points.push({ x: sh.nodes[i * 2], y: sh.nodes[i * 2 + 1], r: sh.length * (.025 + .075 * Math.sin(Math.PI * u)) + 10 });
    }
    add({
      kind: "shark", ref: sh, points, inverseMass: .7, move: (x, y) => {
        for (let i = 0; i < sh.nodes.length; i += 2) {
          sh.nodes[i] += x;
          sh.nodes[i + 1] += y;
        }
      }, velocity: (x, y) => {
        if (Math.abs(x) + Math.abs(y) > 1)
          sh.heading = Math.atan2(y, x);
      }
    });
  }
  if (w.mothership && w.mothership.phase !== "collapse" && (!w.mothership.warp || w.mothership.warp.moved)) {
    const b = w.mothership;
    add({ kind: "carrier", ref: b, inverseMass: 0, points: [-.75, -.35, 0, .35, .75].map(u => ({ x: b.x + u * b.size, y: b.y, r: b.size * .2 })), move: () => { }, velocity: () => { } });
  }
  const allowed = (a: Body, b: Body) => {
    if (a.kind === b.kind)
      return a.kind === "ufo" || a.kind === "sub" || a.kind === "whale";
    return true;
  };
  // Turn early around an approaching hull, before contact needs projection.
  for (const a of bodies)
    for (const b of bodies) {
      if (a === b || !allowed(a, b) || isCraftDriven(w, a.ref) || (a.kind !== "ufo" && a.kind !== "sub"))
        continue;
      const p = a.points[1];
      let dx = 0, dy = 0;
      for (const q of b.points) {
        const x = p.x - q.x, y = p.y - q.y, range = p.r + q.r + 80, d2 = x * x + y * y;
        if (d2 >= range * range || d2 < .001)
          continue;
        const d = Math.sqrt(d2), force = (1 - d / range) * 70 * dt;
        dx += x / d * force;
        dy += y / d * force;
      }
      a.velocity(dx * 2, dy * 2);
      if (a.kind === "ufo") {
        const u = a.ref as typeof w.ufos[number];
        u.hy += dy;
        u.tx += dx;
      }
    }
  // Repeated projection also handles an initially overlapped spawn, not just gentle steering.
  for (let pass = 0; pass < 10; pass++) {
    let contacts = 0;
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (!allowed(a, b))
          continue;
        let overlap = 0, nx = 0, ny = 0;
        for (const p of a.points)
          for (const q of b.points) {
            const dx = p.x - q.x, dy = p.y - q.y, reach = p.r + q.r + 8;
            if (Math.abs(dx) > reach || Math.abs(dy) > reach)
              continue;
            const d2 = dx * dx + dy * dy;
            if (d2 >= reach * reach)
              continue;
            const d = Math.sqrt(d2), penetration = reach - d;
            if (penetration > overlap) {
              overlap = penetration;
              nx = d > 1e-4 ? dx / d : 0;
              ny = d > 1e-4 ? dy / d : (i % 2 ? 1 : -1);
            }
          }
        if (overlap <= .01)
          continue;
        const total = a.inverseMass + b.inverseMass;
        if (!total)
          continue;
        contacts++;
        const shift = overlap + 1;
        a.move(nx * shift * a.inverseMass / total, ny * shift * a.inverseMass / total);
        b.move(-nx * shift * b.inverseMass / total, -ny * shift * b.inverseMass / total);
        if (pass === 0) {
          const kick = Math.min(35, overlap * 2) * Math.min(1, dt * 60);
          a.velocity(nx * kick, ny * kick);
          b.velocity(-nx * kick, -ny * kick);
        }
      }
    if (!contacts)
      break;
  }
}
