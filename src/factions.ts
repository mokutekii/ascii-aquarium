import type { World } from "./world";
import type { Combatant } from "./combat";
export type Team = "human" | "alien" | "wild";
export function laserColor(w: World, actor: Combatant) {
  if (actor === w.mothership)
    return "255,90,180";
  if (w.attackDrones.includes(actor as never))
    return "255,170,65";
  if ("maxBeams" in actor)
    return actor.pilot?.alive ? "90,190,255" : "110,255,135";
  if ("dkind" in actor && actor.dkind === "tech")
    return "180,140,255";
  if ("dkind" in actor && actor.dkind === "bomber")
    return "255,115,105";
  return "150,235,255";
}

export function teamOf(w: World, actor: Combatant): Team {
  if (actor === w.mothership || w.attackDrones.includes(actor as never))
    return "alien";
  if ("maxBeams" in actor)
    return actor.pilot?.alive ? "human" : "alien";
  if ("hull" in actor || "diver" in actor && actor.diver)
    return "human";
  return "wild";
}
