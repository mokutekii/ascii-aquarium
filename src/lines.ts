/**
 * Toast wording. The world announces each moment with one fixed line (which also keys the "×n" repeat counter); here every
 * line can be swapped for a different telling of the same moment, so a run of events never reads like a script.
 */
/**
 * The bosses speak differently from everything else: short, ominous and a little cruel, the way a boss is announced in Terraria
 * (a warning first, then "has awoken", then how it ended). Every telling here is used in turn, the original wording is never
 * kept, and the toast takes the red "boss" style.
 */
const BOSS: Record<string, string[]> = {
  "the mothership has eclipsed the surface...": ["the mothership has eclipsed the surface...", "the sky has lowered its crown...", "the deep is beneath their gaze...", "something vast commands the lights..."],
  "the mothership has fallen...": ["the mothership has fallen...", "the crown of the invaders lies broken...", "the divers have broken the siege..."],
  // The warning, before anything shows itself (the K, M and C keys).
  "you feel like you're being watched...": ["you feel like you're being watched...", "something is watching from below...", "the water has gone cold...", "you are not alone down here..."],
  "something stirs from below...": ["something stirs from below...", "a great shadow rises from the deep...", "something stirs beneath the seabed...", "the sand begins to shake..."],
  "the deep has awoken...": ["the deep has awoken...", "ancient horrors stir in the dark...", "something old and terrible answers the call...", "you feel an evil presence watching you..."],
  // The arrival.
  "the kraken has awoken!": ["the kraken has awoken!", "an ancient terror has awoken!", "the kraken has come for you!", "the kraken uncoils from the trench!", "the kraken has found you...", "the trench opens its arms...", "the kraken rises from the abyss!", "the deep belongs to the kraken..."],
  "the megalodon has awoken!": ["the megalodon has awoken!", "the apex of the sea has arrived!", "a vast shadow eclipses the reef...", "the megalodon is hunting!", "the megalodon has caught your scent...", "the water parts for the megalodon...", "the megalodon has come to feed!", "an ancient hunger has found you..."],
  "the blood moon drives the kraken wild...": ["the blood moon is rising...", "the kraken has gone feral...", "the red moon wakes the kraken..."],
  "the blood moon drives the kraken wild... and something huge is coming for it": ["the blood moon is rising...", "the red moon wakes the horrors below..."],
  // How it went.
  "the kraken scared the megalodon off... for now!": ["the megalodon slinks back into the dark...", "the kraken holds the deep, for now...", "the megalodon retreats, but it will return..."],
  "the sharks drove the kraken off!": ["the kraken has been driven back...", "the kraken retreats into the dark...", "the kraken will return..."],
  "the megalodon tore free!": ["the megalodon has torn itself free!", "the megalodon will not be held!", "the arms tear away..."],
  "the kraken tore the megalodon apart... the sharks move in on the scraps!": ["the megalodon has been slain...", "the apex has fallen...", "the kraken tore the megalodon apart..."],
  "the megalodon ate the kraken... what a feast!": ["the kraken has been devoured...", "the kraken has been vanquished...", "the kraken is no more..."],
  "the chase is over... the kraken never stood a chance.": ["the kraken never stood a chance...", "the kraken has been run down...", "there was nowhere left to run..."],
  "the titans have parted... the water settles...": ["the titans have withdrawn...", "the deep goes quiet...", "the silence offers no comfort..."],
  // Moves.
  "the megalodon has the kraken by the head": ["the megalodon has the kraken by the head!", "jaws close on the kraken's eye!", "the megalodon tears into the kraken!"],
  "the kraken's arm lashes out": ["the kraken's arm lashes out!", "the kraken will not let it leave!", "an arm reaches out of the dark!"],
  "the megalodon is going for the kraken": ["the megalodon is going for the kraken!", "the megalodon has picked its prey...", "a long shadow lines up on the kraken..."],
  "the kraken has the megalodon wrapped": ["the kraken has the megalodon wrapped!", "the arms close round the megalodon!", "the kraken coils round the megalodon!"],
  "the megalodon is closing in": ["the megalodon is closing in...", "the megalodon smells a wounded kraken...", "the megalodon is gaining..."],
  "the kraken vanishes into the ink": ["the kraken vanishes into the ink...", "the megalodon swims blind through the ink...", "the ink swallows the kraken..."],
  "the kraken tore itself free": ["the kraken has torn itself free!", "the kraken wrenches its head free!", "the kraken turns on the megalodon!"],
};


/** A titans clash, whichever way it starts (K then M, M then K, or C): one line, in the purple of a Terraria event. */
const CLASH: string[] = ["the titans have awoken!", "the titans clash...", "ancient rivals have awoken...", "the sea is no longer yours...", "the deep trembles beneath their wrath...", "ancient hungers have met..."];
const CLASH_KEYS = ["the kraken rises... and something vast comes for it!!!", "the kraken and the megalodon meet!!! the whole sea holds its breath..."];

const VARIANTS: Record<string, string[]> = {
  "a chase! run, little fish, run!": ["a chase! scatter!", "someone is very hungry... run!", "fins everywhere... a chase!"],
  "a bait ball forms... dinner is served!": ["the school balls up... dinner bell!", "a bait ball spins tight... the sharks have noticed", "a silver sphere of panic... dinner is served!"],
  "a whale is coming... listen closely...": ["a low song rolls in... a whale", "the water hums... a whale approaches", "something gentle and enormous drifts in..."],
  "a whirlpool opens... hold on!": ["the water starts to spiral... hold on!", "a whirlpool yawns open below...", "down, down, down... a whirlpool!"],
  "a fight breaks out! teeth out!": ["two sharks, one fish, no manners... fight!", "teeth out! somebody wants that spot", "a scuffle! the water clouds..."],
  "the sky darkens...": ["the moon turns the colour of trouble...", "a red glow spreads over the water...", "the sea feels wrong tonight..."],
  "the sea begins to turn...": ["the current has a mind of its own...", "everything is leaning one way... the maelstrom", "the water starts to wheel..."],
  "something burns across the sky!": ["streaks of fire over the surface!", "the sky is falling in pieces!", "make a wish... then duck!"],
  "something hovers above... we are not alone...": ["a light hums over the water... visitors", "lights in the sky... they came back", "something silent is hovering up there..."],
  // Moments.
  "the titans have parted... the water settles...": ["the titans drift apart... the sea exhales", "the dust settles... the water goes quiet", "it is over, for now..."],
  "the kraken scared the megalodon off... for now!": ["the megalodon backs away, tail low... for now", "the kraken holds its ground... the megalodon blinks first", "the beast retreats... it will be back"],
  "the megalodon tore free!": ["the megalodon ripped itself loose!", "arms snap... the megalodon is free!", "a thrash, a tear... free!"],
  "the sharks drove the kraken off!": ["the pack swarms in... the kraken lets go!", "teeth from every side... the kraken bolts!", "the little ones came through!"],
  "the sharks rally to the megalodon!": ["the pack circles in... for the megalodon!", "every shark in the tank turns toward the fight...", "they are coming to help... all of them!"],
  "the ufo abducted a shark and bolted!": ["a shark vanishes up a beam of light...", "the saucer snatches a shark and runs!", "abducted! one shark, gone skyward"],
  "the shark broke free!": ["the shark wrenched itself loose!", "free! the shark tumbles away", "the beam lets go... the shark escapes!"],
  "the aliens are invading!": ["saucers on the horizon... hold the line!", "the invasion begins!!!", "they are all coming at once... brace!"],
  "the invasion is repelled... for now": ["the last saucer limps off... we held!", "the sky is quiet again... for now", "invasion repelled! the sea cheers"],
  "a diver cut a shark free of the kraken!": ["a diver sawed a shark loose... brave!", "snip... a shark is free of the arms!", "a diver went in with a knife... and won!"],
  "a shark slipped the kraken's grip!": ["a shark twisted out of the arm!", "slippery... a shark escaped the kraken", "the arm lost its prize!"],
  "a shark wriggled free! phew!": ["wriggle, wriggle... free!", "the shark got away! phew", "somebody is going to remember that"],
  "the kraken ate a shark... gulp!": ["the kraken drags its prey into darkness...", "a shark disappears into the arms...", "nothing returns from the kraken's grasp..."],
  "the megalodon ate a shark... ouch!": ["the water closes over the megalodon's prey...", "the megalodon leaves only silence...", "the megalodon's jaws close..."],
  "the megalodon attacked the whale!": ["the megalodon goes for the whale!", "jaws wide... the whale is in trouble!", "the whale sees it coming..."],
  "the megalodon ate the whale... the sea goes quiet...": ["the whale song stops...", "the megalodon swallows the whale... silence", "a last note of song... then nothing"],
  "the kraken tore the megalodon apart... the sharks move in on the scraps!": ["the kraken tore the megalodon apart... the scavengers gather!", "a titan is gone... the sharks eye the scraps", "it took the kraken everything... and the megalodon is scrap"],
  "the megalodon ate the kraken... what a feast!": ["the kraken is lost to the deep...", "jaws close... the kraken is gone", "the megalodon takes its trophy..."],
  "the sky clears... 0 meteors fell!": ["the sky clears... the sea is untouched"],
  "the blood moon sets... the sea breathes again...": ["the red moon sinks... the water calms", "the moon turns pale again... safe, for now"],
  "the ufo grabbed its catch and bolted!": ["the saucer snatches its catch and shoots away!", "gone in a flash of light..."],
  "that bomber had a backpack full of bombs!": ["that was a very full backpack...", "who gave him that many bombs?!"],
  "the bomb was a dud... the bomber would like a word.": ["a dud... the bomber is not amused", "click... nothing. awkward."],
  "a diver is hijacking the ufo!": ["a diver climbs aboard the saucer!", "there is a diver at the helm... of the ufo?"],
  "the diver is at the controls... uh oh!": ["the diver found the throttle... uh oh!", "someone is flying this thing... badly"],
};

/** Quiet atmosphere lines for the long middle of a fight, so a long titans clash does not go mute. */
export const CLASH_AMBIENT = [
  "the deep is holding its breath...",
  "the shoals have vanished...",
  "the sand shakes with every lunge...",
  "the trench shudders beneath them...",
  "the water tastes of ink...",
  "nobody is looking at the surface...",
  "you can feel it in the glass...",
  "whatever wins will not be kind...",
];

/** Blood in the water: one of these when the pack starts to frenzy. */
export const FRENZY_LINES = [
  "blood in the water... the pack is circling",
  "the sharks have smelled it... frenzy!",
  "every fin turns the same way... frenzy",
  "teeth everywhere... the pack has lost its manners",
];

export function flavor(text: string): string {
  if (GHOST_ARRIVE.includes(text)) return pickLine(GHOST_ARRIVE);
  if (CLASH_KEYS.includes(text)) return pickLine(CLASH);
  const boss = BOSS[text];
  if (boss) return pickLine(boss);
  const alts = VARIANTS[text];
  if (!alts || Math.random() < 0.3) return text;
  return alts[Math.floor(Math.random() * alts.length)];
}

/** Whether a toast is the clash announcement (purple). */
export function isClash(text: string) {
  return CLASH.includes(text);
}

/** Whether a toast belongs to a boss (it gets the red style). */
export function isBoss(text: string) {
  return Object.values(BOSS).some((l) => l.includes(text));
}

const lineDecks = new WeakMap<string[], { deck: string[]; last?: string }>();

/** Use every telling before repeating, including across shuffled deck boundaries. */
export function pickLine(lines: string[]) {
  if (!lines.length) return "";
  let state = lineDecks.get(lines);
  if (!state) { state = { deck: [] }; lineDecks.set(lines, state); }
  if (!state.deck.length) {
    state.deck = [...lines];
    for (let i = state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
    }
    const end = state.deck.length - 1;
    if (end > 0 && state.deck[end] === state.last) {
      [state.deck[0], state.deck[end]] = [state.deck[end], state.deck[0]];
    }
  }
  return (state.last = state.deck.pop()!);
}

/** The entrance alone gets the ghost's special glow; later outcomes stay ordinary one-line toasts. */
export const GHOST_ARRIVE = [
  "the ghost leviathan has awoken...",
  "something vast stirs beyond the light...",
  "something ancient passes beneath you...",
  "the deep has a guardian...",
  "a pale light eclipses the reef...",
  "the abyss is watching you...",
  "the ghost leviathan darkens the water...",
  "the trench remembers its oldest name...",
  "the ghost leviathan rises from the void...",
  "even the predators fall silent...",
];
export const GHOST_LINES = {
  provoked: "the guardian is disturbed...", calm: "the deep grows quiet again...",
  subLost: "a submarine is lost to the deep...", subHit: "the submarine's hull buckles...", diver: "a diver strayed too close...",
};
export function isGhost(text: string) {
  return GHOST_ARRIVE.includes(text);
}

/** Yeat mode ad-libs: the one that announces it, and the ones that drift in while it lasts. */
export const YEAT_LINES = [
  "lüh tönka...", "lüh birky...", "lüh twïzzy...", "smooktobër...",
  "lüh shmünk...", "aurghhhhhhh...", "awöö...",
];

/** A toast is one short sentence: anything after the first full stop, ellipsis, "!" or "?" is dropped (a very short opening keeps going to the next). */
export function oneLine(text: string): string {
  const re = /(\.{2,}|[!?]+|\.)(?=\s+\S)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].length;
    if (end >= 14) return text.slice(0, end);
  }
  return text;
}

/** Every toast trails off: a closing full stop becomes "..." and a bare ending gets one; "!" and "?" stay as they are. */
export function dramatic(text: string, whole = false): string {
  const t = whole || isBoss(text) || isClash(text) ? text.trimEnd() : oneLine(text.trimEnd());
  if (/(\.\.\.|[!?])$/.test(t)) return t;
  return t.replace(/[.,;:]+$/, "") + "...";
}

// Every toast is one sentence: stop at the first full stop, ellipsis, "!" or "?", boss and clash lines included.
for (const k of Object.keys(BOSS)) BOSS[k] = BOSS[k].map(oneLine);
for (const k of Object.keys(VARIANTS)) VARIANTS[k] = VARIANTS[k].map(oneLine);
for (const list of [CLASH, CLASH_AMBIENT, FRENZY_LINES]) list.splice(0, list.length, ...list.map(oneLine));
