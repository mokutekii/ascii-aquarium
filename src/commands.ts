/** Hidden encounter commands shared by the slash prompt and developer console. */
export function parseAquariumCommand(text:string): "eoe" | null {
  return text.trim().replace(/^\//,"").trim() === "SHINJISUX" ? "eoe" : null;
}
