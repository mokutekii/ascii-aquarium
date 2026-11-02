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
  "kraken remains": ["The Kraken still holds these waters.", "The Kraken has not been defeated.", "The Kraken is still watching...", "The Kraken has not finished with you...", "The deep already has a master.", "The Kraken will not be summoned twice."],
  "mega remains": ["The Megalodon is already hunting.", "The Megalodon has not been satisfied...", "One shadow is enough to empty the sea.", "The Megalodon still circles below...", "There is no room for a second apex.", "The apex yields to nothing."],
  "mothership remains": ["The Mothership still commands the sky.", "The Mothership has not been defeated.", "The siege has already begun...", "Their gaze remains upon the water...", "The crown above has not been broken."],
  "saga remains": ["The Titans have already answered.", "The Titans have not finished...", "Two hungers still contest the sea...", "The clash has yet to choose a victor...", "The deep has room for no other throne."],
  "the mothership has eclipsed the surface...": ["The Mothership has eclipsed the surface!", "The Mothership has arrived!", "The sky has lowered its crown...", "The deep is beneath their gaze...", "Something vast commands the lights...", "The Mothership is approaching!"],
  "the mothership has fallen...": ["The Mothership has been defeated!", "The Mothership has fallen!", "The crown of the invaders lies broken...", "The divers have broken the siege!", "The siege has been lifted..."],
  "you feel like you're being watched...": ["You feel an evil presence watching you...", "The water is getting colder around you...", "Something is watching from below...", "This is going to be a terrible night...", "You are not alone down here...", "The sea has gone silent around you..."],
  "something stirs from below...": ["Something stirs from below...", "The sand begins to shake...", "You feel vibrations from deep below...", "A great shadow rises from the deep...", "The seabed is breaking open..."],
  "the deep has awoken...": ["The deep has awoken...", "Ancient horrors stir in the dark...", "Something old and terrible answers the call...", "You feel an evil presence watching you...", "The abyss is no longer asleep..."],
  "the kraken has awoken!": ["The Kraken has awoken!", "The Kraken has risen from the trench!", "The Kraken has come for you!", "The Kraken uncoils from the abyss!", "The Kraken has found you!", "The trench opens its arms...", "The Kraken has surfaced!", "The Kraken is here!", "The deep belongs to the Kraken...", "The Kraken stirs, and the sea answers!"],
  "the megalodon has awoken!": ["The Megalodon has awoken!", "The Megalodon is hunting!", "The Megalodon has caught your scent!", "The Megalodon has arrived!", "The Megalodon has come to feed!", "The apex of the sea has awoken!", "A vast shadow eclipses the reef...", "The Megalodon is closing in!", "The water parts for the Megalodon...", "The Megalodon has found you!"],
  "the blood moon drives the kraken wild...": ["The Blood Moon is rising...", "The Kraken has gone feral...", "The red moon wakes the Kraken...", "The Blood Moon drives the Kraken wild!"],
  "the blood moon drives the kraken wild... and something huge is coming for it": ["The Blood Moon is rising...", "The red moon wakes the horrors below...", "The Blood Moon has stirred the deep!"],
  "the kraken scared the megalodon off... for now!": ["The Megalodon has retreated.", "The Megalodon slinks back into the dark...", "The Kraken holds the deep, for now.", "The Megalodon will return..."],
  "the sharks drove the kraken off!": ["The Kraken has been driven back.", "The Kraken retreats into the dark.", "The Kraken will return..."],
  "the megalodon tore free!": ["The Megalodon has torn itself free!", "The Megalodon will not be held!", "The arms tear away!"],
  "the kraken tore the megalodon apart... the sharks move in on the scraps!": ["The Megalodon has been defeated!", "The apex has fallen!", "The Kraken has torn the Megalodon apart!", "The Megalodon is no more..."],
  "the megalodon ate the kraken... what a feast!": ["The Kraken has been defeated!", "The Kraken has been devoured!", "The Kraken is no more...", "The Megalodon has claimed the deep!"],
  "the chase is over... the kraken never stood a chance.": ["The Kraken never stood a chance.", "The Kraken has been run down!", "There was nowhere left to run...", "The Kraken has been defeated!"],
  "the titans have parted... the water settles...": ["The Titans have withdrawn.", "The deep goes quiet...", "The silence offers no comfort...", "The Titans have parted..."],
  "the megalodon has the kraken by the head": ["The Megalodon has the Kraken by the head!", "Jaws close on the Kraken's eye!", "The Megalodon tears into the Kraken!", "The Megalodon has clamped on!"],
  "the kraken's arm lashes out": ["The Kraken's arm lashes out!", "The Kraken will not let it leave!", "An arm reaches out of the dark!", "The Kraken has seized its prey!"],
  "the megalodon is going for the kraken": ["The Megalodon is going for the Kraken!", "The Megalodon has picked its prey...", "A long shadow lines up on the Kraken...", "The Megalodon is charging!"],
  "the kraken has the megalodon wrapped": ["The Kraken has the Megalodon wrapped!", "The arms close round the Megalodon!", "The Kraken coils round the Megalodon!", "The Megalodon is being crushed!"],
  "the megalodon is closing in": ["The Megalodon is closing in!", "The Megalodon smells a wounded Kraken...", "The Megalodon is gaining!"],
  "the kraken vanishes into the ink": ["The Kraken vanishes into the ink...", "The Megalodon swims blind through the ink...", "The ink swallows the Kraken..."],
  "the kraken tore itself free": ["The Kraken has torn itself free!", "The Kraken wrenches its head free!", "The Kraken turns on the Megalodon!"],
  "the mothership dispatches drones to drive the kraken off!": ["The Mothership has dispatched its drones!", "Drones pour from the Mothership at the Kraken!", "The Mothership answers the Kraken with a swarm!"],
  "the mothership tears free of the kraken and jumps away!": ["The Mothership has torn free of the Kraken!", "The Mothership jumps clear of the arms!", "A flash, and the Mothership is gone from the Kraken's grip!"],
  "the mothership's rim charges for its final departure...": ["The Mothership is charging its rim to depart...", "The Mothership is leaving...", "The rim glows. The Mothership is preparing to go..."],
  "the kraken goes for the mothership...": ["The Kraken is going for the Mothership!", "The Kraken has set its sights on the Mothership...", "Arms reach for the Mothership..."],
  "the megalodon turns back for a rematch!": ["The Megalodon turns back for a rematch!", "The Megalodon is not finished...", "A long shadow returns..."],
  "the kraken turns back for a rematch!": ["The Kraken turns back for a rematch!", "The Kraken is not finished...", "The arms return..."],
  "the megalodon caught the kraken in its jaws!": ["The Megalodon has caught the Kraken in its jaws!", "Jaws close on the Kraken!", "The Megalodon has the Kraken!"],
  "the kraken slips the megalodon's jaws...": ["The Kraken has slipped the Megalodon's jaws!", "The Kraken twists out of the bite...", "The jaws close on ink..."],
  "the megalodon is hunting": ["The Megalodon is hunting!", "The Megalodon has caught a scent!", "The Megalodon is charging!", "The water trembles ahead of the Megalodon!"],
  "the megalodon has clamped on": ["The Megalodon has clamped on!", "Jaws close and the Megalodon shakes its head!", "The Megalodon will not let go!"],
  "the megalodon is enraged": ["The Megalodon is enraged!", "The Megalodon has gone berserk!", "The Megalodon is out for blood!"],
  "the kraken is enraged": ["The Kraken is enraged!", "The Kraken has gone berserk!", "The arms of the Kraken will not be denied!"],
  "the megalodon has clamped on the commander": ["The Commander has been clamped!", "The Megalodon has the Commander in its jaws!", "The Commander is caught in the jaws..."],
  "the kraken has seized the commander": ["The Kraken has seized the Commander!", "The Commander is in the Kraken's grip!", "The arms close round the Commander!"],
  "the megalodon has flung the commander": ["The Commander has been flung!", "The Megalodon has thrown the Commander!", "The Commander is hurled across the tank!"],
  "the kraken has hurled the commander": ["The Commander has been hurled!", "The Kraken has thrown the Commander!", "The Commander flies from the Kraken's arms!"],
  "the megalodon's tail struck the mothership...": ["The Mothership has been struck!", "The Megalodon's tail has struck the Mothership!", "The Mothership is knocked off the field!"],
};


/** A titans clash, whichever way it starts (K then M, M then K, or C): one line, in the purple of a Terraria event. */
const CLASH: string[] = ["The Titans have awoken!", "The Titans clash!", "Ancient rivals have awoken!", "The sea is no longer yours...", "The deep trembles beneath their wrath...", "Ancient hungers have met!"];
const CLASH_KEYS = ["the kraken rises... and something vast comes for it!!!", "the kraken and the megalodon meet!!! the whole sea holds its breath..."];

const VARIANTS: Record<string, string[]> = {
  "the megalodon smashed a submarine's hull...": ["the megalodon ploughed through a submarine...", "a submarine met the megalodon head on... scrap", "the megalodon's body flattened a hull..."],
  "the megalodon's body smashed a UFO...": ["the megalodon swam straight through a saucer...", "a saucer met the megalodon's flank... gone", "the megalodon's body smashed a ufo into scrap..."],
  "a bomber blew up in the kraken's arms... it flees": ["a bomber went off in the kraken's arms... it recoils", "boom... the kraken drops everything and flees", "the kraken tasted the bomb... and left"],
  "a bomber blew up in the kraken's arms... now it's furious": ["the bomb only made the kraken angrier...", "smoke clears... the kraken is furious", "the kraken shrugged off the blast... and got mad"],
  "a diver plugged in a sandevistan drive...": ["a diver slotted in a sandevistan drive...", "the drive clicks in... the diver blurs", "a diver is moving faster than the sea can follow..."],
  "a megalodon follows the herd...": ["a long shadow trails the herd...", "something enormous is following the whales...", "the megalodon is shadowing the herd..."],
  "a ribbon of living light drifts through the deep...": ["a ribbon of light unspools through the dark...", "the deep glows with a drifting ribbon...", "living light winds past the reef..."],
  "a sandevistan drive tumbles out of the wreck...": ["a sandevistan drive spills from the wreckage...", "the wreck drops a glowing drive...", "something bright sinks out of the scrap..."],
  "a ufo bombed its own wingman... oops.": ["a ufo bombed its own wingman... oops", "friendly fire from above... the wingman is not amused", "the bomb aimed true... at the wrong saucer"],
  "a whale turns away from the danger and swims for open water...": ["the whale turns from the danger... open water", "a whale slips away before it is noticed", "the whale song fades as it swims off..."],
  "friendly fire... a craft crossed a live laser!": ["friendly fire... someone crossed the beam!", "a craft flew into its own side's laser", "oops... that laser was live"],
  "individual lives return to the sea...": ["the divers surface and the sea exhales...", "every diver returns to the water...", "lives return to the sea..."],
  "the aliens retreat... they'll be back": ["the aliens withdraw... for now", "the saucers fade into the sky... they will return", "the invaders retreat..."],
  "the bomber woke up inside the ufo!": ["the bomber woke up inside the ufo... uh oh", "a bomber on a saucer... surprise", "the bomber opens his eyes: aliens"],
  "the core is collapsing... brace for the shockwave!": ["the core is collapsing... brace!", "the reactor is going... the shockwave is coming", "the mothership's core is failing..."],
  "the departing mothership releases a rim blast...": ["the mothership fires a parting rim blast...", "a rim blast rolls out as it leaves...", "the mothership departs in a ring of fire..."],
  "the divers cut their commander free...": ["the divers cut the commander free!", "snip... the commander is loose!", "the crew has freed the commander..."],
  "the saucer gave up its catch...": ["the saucer lets go of its catch...", "the saucer drops its prize", "the catch slips from the saucer..."],
  "the sawshark sawed itself free!": ["the sawshark saws itself loose!", "zzzip... the sawshark is free", "the sawshark cut its way out!"],
  "the ufo dropped it without looking...": ["the ufo dropped it without a glance...", "the saucer lets go, uncaring", "dropped from above..."],
  "the ufo fumbled a bomb... kaboom": ["the ufo fumbled a bomb... kaboom", "the bomb slipped... kaboom", "butterfingers... kaboom"],
  "the ufo pulled a shark aboard!": ["the ufo pulled a shark aboard!", "a shark vanishes into the saucer", "the beam lifts a shark skyward..."],
  "the ufo stole a diver from a shark... sneaky!": ["the ufo snatched a diver from a shark... sneaky!", "a diver is lifted from the jaws", "the saucer steals the shark's lunch"],
  "the megalodon bit a submarine in half...": ["the megalodon bit a submarine in half...", "jaws closed on a submarine... nothing left", "the megalodon crunched through a hull..."],
  "the megalodon's tail broke a submarine...": ["one tail strike and a submarine is gone...", "the megalodon's tail splintered a hull...", "a submarine did not survive the tail..."],
  "the megalodon's jaws crushed a UFO...": ["the megalodon's jaws crushed a ufo...", "a saucer in the jaws... scrap", "the megalodon bit the saucer in two..."],
  "the megalodon's tail smashed a UFO...": ["the megalodon's tail swatted a ufo into scrap...", "one tail strike and the saucer is gone...", "a saucer met the tail... briefly"],
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

/** Whether a notice has alternative tellings (tests check that every fixed notice does). */
export const hasLines = (text: string) => !!(BOSS[text] || VARIANTS[text] || CLASH_KEYS.includes(text) || GHOST_ARRIVE.includes(text));

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

/** Classification uses original wording; presentation owns case and punctuation. */
export function toastText(text:string,tone:string){
  if(["boss","clash","ghost"].includes(tone))return text.toLowerCase().replace(/!+/g,"").trim();
  return tone==="whale"?text.replace(/[.!~\s]+$/,"")+"~":text;
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
  return GHOST_ARRIVE.includes(text) || GHOST_PRESENCE.includes(text);
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

const GHOST_PRESENCE = ["the guardian needs no second summons...", "the oldest shadow still passes beneath you...", "the ghost leviathan has not yet departed...", "the deep keeps its oldest promise..."];
export function bossPresence(kind: string) { return pickLine(kind === "leviathan" ? GHOST_PRESENCE : BOSS[`${kind} remains`] ?? BOSS["saga remains"]); }
export const SHARK_ARRIVALS: Record<string,string[]> = Object.fromEntries(Object.entries({classic:"shark",ghost:"ghost shark",hammerhead:"hammerhead",greathammer:"great hammerhead",mako:"mako",thresher:"thresher",tiger:"tiger shark",nurse:"nurse shark",zebra:"zebra shark",sawshark:"sawshark"}).map(([kind,name])=>[kind,[`a ${name} slips into the water...`,`another ${name}. the fish have noticed.`,`a ${name} arrives with no dinner reservation.`,`more teeth: a ${name} joins the crowd.`]]));
