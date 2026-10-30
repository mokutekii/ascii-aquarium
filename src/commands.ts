import type { EventKind } from "./world";
const commands: Record<string, EventKind> = {
  invasion: "invasion", mothership: "mothership", kraken: "kraken", megalodon: "mega", mega: "mega",
  clash: "saga", saga: "saga", ghost: "leviathan", leviathan: "leviathan", submarine: "sub", sub: "sub",
  ufo: "ufo", diver: "diver", whale: "whale", jellyfish: "jelly", jelly: "jelly", light: "current", current: "current",
  smite: "smite", strike: "smite", zap: "smite", storm: "storm", thunderstorm: "storm", lightning: "storm", thunder: "storm",
  chase: "chase", bait: "bait", fight: "fight", whirlpool: "whirl", whirl: "whirl", night: "night",
  yeat: "yeat", moon: "moon", meteor: "meteor", maelstrom: "maelstrom", bloom: "bloom", migration: "migration",
};
/** Named local events shared by the slash prompt and developer console. */
export function parseAquariumCommand(text: string): EventKind | null {
  const input = text.trim().replace(/^\//, "").trim();
  if (input === "SHINJISUX") return "eoe";
  const name = input.toLowerCase().replace(/^(spawn|event)\s+/, "");
  return Object.hasOwn(commands, name) ? commands[name] : null;
}
