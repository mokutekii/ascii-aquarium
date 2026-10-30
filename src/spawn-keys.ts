const HOLD_KEYS = new Set(["h", "d", "u", "x"]);
/** OS repeat drives held spawns, capped to four batches per second. Other keys never repeat. */
export class SpawnKeyRepeater {
 private last = new Map<string, number>();
 accept(key: string, repeat: boolean, now: number) {
  key=key.toLowerCase();
  if(repeat && (!HOLD_KEYS.has(key) || now-(this.last.get(key)??-Infinity)<250))return false;
  this.last.set(key,now);return true;
 }
 release(key: string) { this.last.delete(key.toLowerCase()); }
 clear() { this.last.clear(); }
}
