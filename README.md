# ascii aquarium

A little window of ASCII sharks and schooling fish that swim on your screen. Click for a splash, drag for a ripple trail, and once in a while something happens.

It runs only on your own computer. No account, no sign-in, no API key, and nothing is sent anywhere.

## v1.4

One release with the updates collected below; the full notes are in [RELEASE_NOTES.md](RELEASE_NOTES.md).

- **v1.4.0 — kraken overhaul:** ordered attacks and wraps, megalodon fights, whale encounters, and shark species with moods and stamina.
- **v1.4.1 — encounters and polish:** harpoon escapes, swimming mauls, faster wraps, event history, ghost sharks, and clearer toasts.
- **v1.4.2 — submarines and the deep:** research and activity-crewed submarines, a majestic Ghost Leviathan in ordinary water, translucent blue skin, visible ribs and orange markings, and a stronger glow in Yeat mode. A wider tank gives the titans more space. The Ghost drifts peacefully until provoked, then warns and charges humans or submarines. Its entrance toast glows blue.

## Events

Everything here happens on its own: leave the window alone and the sea keeps putting on shows, with no input needed. The keys are just there if you want to call one up yourself.

| Key | Event |
| --- | --- |
| L | living light: a quiet bioluminescent current drifts behind the animals |
| K | a kraken rises, grabs sharks and divers, and squeezes (it can even grab a ufo) |
| M | a megalodon crosses the tank and every shark bolts (with a kraken out, it comes for the kraken: press it when you want the fight) |
| C | TITANS CLASH, the full story with its own bar: the kraken grabs sharks, then the megalodon comes for it and they fight |
| O | BLOOD MOON: the sea turns red, the sharks are always hungry and armed divers keep arriving (sometimes the megalodon or the kraken too: a kraken or megalodon under the blood moon is enraged: its dark green hide turns a dark yellow-green with glowing yellow suckers and eye, it swims a little faster, and the kraken holds up to five divers and reaching further and far more often for sharks, divers and saucers; if the megalodon turns up as well, the moon stages a full titans clash) |
| E | METEOR SHOWER: burning rocks slam into the water (a rock that meets a saucer, diver or shark on the way down hits it on the spot), and a tech diver salvages the scrap |
| S | THE MAELSTROM: two or three whirlpools tear across the tank, sling sharks about and swallow anything that reaches the middle; the bar counts down and keeps score of who was lost |
| G | JELLYFISH BLOOM: a huge glowing swarm drifts up and zaps divers while the sharks pile in; the bar shows how many divers are still safe |
| P | GREAT MIGRATION: two whales and a giant school cross the tank together with sharks tailing them, and sometimes the megalodon; the bar shows how many fish make it across |
| R | a fast fish is chased by a shark |
| B | a bait ball: fish spin into a tight ball while sharks circle in |
| J | jellyfish drift up through the tank |
| W | a whale glides through, fish parting around it (up to two at once, and fine to call while one titan is out) |
| V | a whirlpool sweeps fish into a spiral, then flings them out |
| F | two sharks square off, circle and lunge at each other |
| H | another shark swims in from an edge, of a random kind (one in five is a ghost shark: pale cyan, slow, creeps up on divers and lunges in one hard burst). Capped a little above the usual shark count |
| / | holds the last 15 major events in the toast spot, same style and size, until you press it again (or Esc) |
| U | a flying saucer hovers above and beams up fish, jellyfish and divers (up to three at once; the first, second and third each get their own toast, and a fourth press says the sky is full) |
| D | divers slip in from any edge, and the sharks go after them (spam it, up to 25 at once; they also arrive by themselves in groups) |
| (click) | tapping a diver pops it, and a shark swims over to clean up; press and hold one to carry it around with the mouse, and fling it by letting go mid-swing (it has opinions) |
| Y | yeat mode, 5 minutes of black void, white fog and glowing grayscale (press again to end it; it very rarely shows up on its own, about 1% of the time or less) |
| N | nightfall: a clear fade into indigo water, brighter living light and jellyfish halos. Fish slow and school more closely while sharks prowl faster. The tank also slowly turns to night and back by itself |
| T | the GHOST LEVIATHAN: an immense, translucent blue titan with a broad, gently swaying hammerhead, a full ribbed body, orange markings and a shimmering membrane. It drifts peacefully until shots, blasts or a submarine striking its head provoke it; then it warns and charges divers or subs. Yeat mode intensifies its glow |
| X | a SUBMARINE with a conning tower and periscope, a nose lamp that throws the searchlight, and a pitch as it dives and climbs; it pings, steers clear of everything, and only fires in self-defence |

### When things meet

- The Ghost Leviathan appears in normal mode as well as Yeat mode. Its broad, glassy blue body reveals inner muscle ribbons, curved ribs and orange nerve lights; long fins trail behind its gently swaying hammerhead as a soft blue halo and a slow shimmer travel over its skin. It drifts in wide, unhurried arcs and sings quietly. The same creature keeps its shape, scale and temperament when Yeat mode begins or ends; its light intensifies. It stays 75 to 110 seconds before swimming away.
- Ordinary wildlife flees the Ghost's whole body and hammerhead. Divers startle, submarines flee, and whales and other titans give it room. The Ghost never hunts fish, sharks, whales or titans. Torpedoes, blaster shots, nearby explosions or a fast submarine colliding with its head can agitate it for about 22 seconds. It gives a 2.5-second warning before a charge, targets humans and submarines, and only hurts them when its jaws reach them. A charge can kill a diver or take one of a sub's three hull points; it then recovers before trying again and returns to drifting when calm. Only its entrance toast, "a blue shadow approaches...", gets the special blue glow; warnings and outcomes stay ordinary one-line messages. On its own it never arrives during a kraken or megalodon encounter, but a key press can run them together.
- Things avoid each other, so collisions are rare. When one does happen, whatever got hit is agitated: a shark that bumps or is hit by a torpedo either goes after the sub (it takes three bites to sink one) or bolts, and the sub runs and, if it is being attacked, fires back.
- A sparse seabed of kelp and coral sways along the floor.
- Small floating text drifts up from things now and then (a shark's "hm.", a jellyfish's "bloop", a sub's "ping!", the ghost's quiet song), alongside the big bold callouts, which are still kept for outcomes and turning points.
- Jellyfish are squishy: when something shoves a bell it squashes against the push and wobbles back, the tentacles trail behind the way it is carried and flare when squeezed, and bubbles stream off the top.
- Sharks fear the kraken: they steer well clear of it (wider and harder while it is enraged), bolt when it comes close, and are shoved out if they stray into its body, so none swim through it. An enraged kraken is far deadlier: it reaches for sharks nearly every time and from further off, takes them sooner, eats up to three, and thrashes harder, in the tug of war too.
- A whale that breaks free of the kraken or escapes the megalodon kicks off hard and swims out briskly (about three times its cruising pace, turning faster), instead of scooting away from a standstill.
- In the kraken and megalodon tug of war, if only one of the two is enraged, its fury tips the bar its way ("THE RAGE TURNS THE TIDE"); if both are enraged they cancel out.
- The kraken's arms always grow from its body: an arm taking hold sweeps from its waving pose onto the grip instead of jumping there, and all ten limbs take hold of a wrapped megalodon, drawn over it. Charging a megalodon or a whale, the arms spread wide and snap together with each jet stroke to drive it forward. Its turns ease in and out.
- Saucers fire at things: a red laser provokes the kraken or the megalodon, and a green bomb (a bomber diver it beamed aboard, or now and then one it arrived with) is dropped on fish, divers, sharks, whales or a titan, shoving sharks, killing fish and killing divers near the blast. Now and then a drop goes odd: a carpet-bombing run, a dud, a wild drop, friendly fire on another ufo, a fumble onto itself, or a bomber that wakes up inside and sets off stray bombs; a bomber caught can carry spares.
- The window is a fixed tank: browser zoom and find are switched off (F11 still goes fullscreen).
- Kraken fights run in order: it turns, thrusts in arms first, lands, and is only "wrapped" once the arms have closed.
- The megalodon can start a fight: it charges (a "dun dun" beat quickens as it closes), bites the kraken's head and whips it about. A fleeing kraken is sometimes chased: its ink loses the megalodon, or it is run down. A megalodon getting away can be hooked by an arm and dragged back ("GET OVER HERE!").
- A kraken that reaches a whale pokes or squeezes it, then chooses: let go, crush or eat. Nothing dies on contact.
- Sharks have species roles, moods and stamina, rally to a kill and frenzy around blood. They give each other more room now, steering clear of whole bodies, not just noses.
- Shark toasts are coral, fire and bomb toasts orange, and glowing things lavender. Every toast trails off in an ellipsis, and the long ones are cut to one short line.
- Big bold callouts are only for outcomes and turning points, with no box (a dark outline instead); everything else is a toast.
- The megalodon swims in (1.5x its pace) to maul the kraken and the bite lands when the jaws arrive, instead of the kraken snapping to its head. A kraken being mauled has no arms wrapped round the megalodon. Wraps take hold in about 1.4s.
- When the megalodon tears away or runs, the kraken decides once per escape: usually it lets go, sometimes it harpoons it with one of its own arms and drags it back.
- Boss toasts are one short line: red for the kraken or megalodon, purple for a clash. Other toasts lose their symbols and use color instead (amber for danger, green for good, a trailing ~ for whales), and most have several wordings.
- A key press starts any event whatever else is running, apart from one kraken, one megalodon, two whales and the diver cap. Random events still follow the usual rules.
- The code is split into world, titans, sharks, types and lines.
- A megalodon smashes any ufo it swims into, with any part of its body, and eats every diver it can catch. Anything that bumps into it is bitten or eaten. A normal shark eats one diver, then ignores the rest for a while.
- A sawshark sometimes charges a ufo and cuts it in half. Otherwise it now and then slices through the fish ahead of it.
- A diver can take over a ufo, peering out of its window. Some hijacked saucers go after sharks, which break free; others keep grabbing fish.
- A ufo will steal a diver a shark is chasing. Sharks steer clear of the saucer and its beam.
- A small red ! appears over the one shark chasing a diver. Some divers pass unnoticed, and other sharks leave a claimed diver alone. Click a diver to pop it, and the nearest shark swims over to clean up.
- A whirlpool sweeps divers and jellyfish round and drags sharks a little. A diver showing up breaks off a shark fight.
- At night the water and grid darken, fish become quieter and school more closely, and sharks prowl a little faster. Cyan plankton and living-light ribbons become visible, jellyfish develop bright halos, and the Ghost's blue glow stands out. L calls a denser current of living light in either daylight or darkness. Jellyfish glow at night, and now and then one zaps a diver that drifts too close. A zapped diver goes limp, which makes it easy for a shark to grab, the kraken to throw, or a ufo to snatch.
- The kraken lashes a tentacle out at any diver in reach, swings it slowly and heavily (a heavier diver swings slower, from 0.65 rad/s for a snorkeler down to 0.45 for the treasure hunter, and a saucer is the slowest of all), its arm trailing and whipping behind the swing, and crushes it. It chooses its targets at random and only sometimes bothers: one long tentacle whips out (smoothly, like a whip) with thinner arms running alongside, one arm for a diver, two or three for a shark or a saucer, any number at once around its 270 degree arc, up to its ten limbs. Arms take hold one at a time, so the coils you see match the arms holding on, and a bigger shark takes more of them (one for a small shark, up to three for the biggest). Held arms are slimmer, and the arm to a swung diver flows with the same slow wave as an idle one. It is far stronger than what it holds: a victim is kept close and hauled back in if it strains away, though a shark can sometimes wrench free, and a sawshark is held by the body, never the saw, and can saw its way out (leaving scraps of squid). Fast scooter divers race in to cut sharks free, and the kraken tries to grab them first.
- When the megalodon meets the kraken they really fight: the kraken wraps it, the megalodon thrashes it around, and either one can win. A tiring megalodon gets help from the other sharks, a megalodon beaten by the kraken drives off with long, heavy strokes, and a kraken the megalodon eats leaves scraps for the sharks to clean up. The kraken very rarely eats a shark. Floating labels and a tug of war bar say who is winning.
- The kraken swims head first and swings its arms round to face whatever it is after. Alone, it reaches wide and holds up to five divers at once. A kraken swims across the tank to a whale (the whale is never dragged in), then pokes it with jabbing arms or squeezes it until it bolts, and it stays two to three minutes. A megalodon attacking a whale surges after it, lunges at its bite spot and clamps its jaws on the flank, with teeth and blood.
- Sharks give the megalodon room, with a smaller background population so each encounter has room.
- A whale already in the water when the kraken or megalodon turns up gets attacked and bolts, so those two get the tank to themselves. No new whale shows up during their fight. Whales (never more than two) and saucers never pass through a titan unless it is attacking them, and after any titan leaves, neither returns on its own for a few minutes.
- Some sharks grab a diver in their jaws and carry it around before eating it (or letting go). Divers come in five kinds: scuba, photographer (flashes at fights), treasure hunter, snorkeler and scooter.
- When a ufo goes down, a purple tech diver swims in, salvages the scrap into a laser blaster and starts shooting fish and ufos. His shots can cut a kraken's grab short (and anger it, so it lashes back if he is in reach), free whatever it is holding, or provoke the megalodon into coming for him, and they lean the kraken and megalodon tug of war. He often blasts himself free when something grabs him.
- Yellow bomber divers swim at a ufo, a titan or a shark, light a fuse (a red ! shows over their head) and blow up: the shockwave shoves sharks away, kills fish, stuns divers (and now and then pops one right next to the blast), frees what the kraken holds, destroys ufos (a wrecked saucer can blow a second time and take its neighbours) and can swing the titan fight. There is no cap on bombers and their blasts are barely spaced out, so a crowd of them chains blast after blast. A bomber that goes off in the kraken's arms blows the kraken apart: it is thrown off its line with its arms flailing, whatever it held is flung clear, and some of those divers and sharks do not survive. It then either bolts or comes back furious for half a minute: red, reaching further and grabbing far more. A saucer that flies into a diver runs it over.
- The big announced events (blood moon, meteor shower, titans clash and the alien invasion) each get a bar (a coloured title, a progress bar and an "X of X" counter; the bars glow in yeat mode) that reports how it is going, and they stack one under another (three at most, the rest fold into "+N more"), with the notes going to a toast log at the bottom left (five at a time, fading slowly, same line never twice), as many as you like when you start them by hand (the sandbox has no caps). On their own, each kind of event rests on its own cooldown after it fires, so repeats are spaced out while different events overlap at random intervals. The two titans together (C, or M and K) are the exception: while they are clashing, nothing else begins. Ask for an announced event that is already running and it queues up and starts when that one ends.
- When a third ufo arrives, the aliens are invading: a green bar appears, and anywhere from three to fifteen saucers come in waves (never more than three at once, and never on top of each other). The sea's own defenders (tech divers, bombers, the megalodon) take them down on their own, and if enough fall the invasion is repelled. The invasion never begins during a titans clash.
- The kraken and megalodon tug of war is wild: white fills the bar as the kraken wins, blue as the megalodon does, and it lurches around while they thrash.
- A hijacked ufo flashes red with a beacon, and sometimes grabs a shark and bolts. After a catch it will often just run for it.
- The tank is simulated three times as wide and tall as the window and drawn scaled down. The Ghost is the largest creature; smaller sharks, divers and submarines show its scale while the titans have more open water to turn. The number of sharks wanders up and down instead of staying fixed.

## Options

Click **opts** in the top corner. Each line cycles when you click it, and your choices are remembered.

- **pace:** off, calm (no big events), normal, or busy. Keys still work when pace is off.
- **events:** shows every event by name with a small box. Untick one to stop it appearing (its key and any queued arrival are switched off too), tick it again to bring it back. Remembered between runs.
- **night:** turn the slow night cycle on or off.
- **motion:** smooth (30 frames per second) or saver (15).

## Install on Windows

1. On this page click the green **Code** button, then **Download ZIP**.
2. Open the ZIP and drag the folder somewhere permanent, such as Documents.
3. Open the folder and double-click **Install.cmd**.
   - If it says Node.js is missing, it opens the download page. Install the **LTS** version, then double-click **Install.cmd** again.
4. The aquarium opens. Next time, use the **ASCII Aquarium** icon on your Desktop or in the Start menu.

The first time, Windows may show a blue "Windows protected your PC" box. Click **More info**, then **Run anyway**. Every file is plain text you can read.

## Install on macOS or Linux

1. Install [Node.js](https://nodejs.org) (the LTS version).
2. Download the ZIP as above, or run `git clone https://github.com/mokutekii/ascii-aquarium.git`.
3. Open a terminal in the folder and run:

```sh
sh install.sh
```

Next time, run `npm start` in that folder.

You need Microsoft Edge or Google Chrome for the nicest window. Without them it opens in your normal browser.

## Using it

- **Click** for a big splash. **Hold and drag** for a trail of ripples.
- Resize the window to get more sharks and fish. Zooming the page does not change the tank.
- It is light on your computer: 30 frames per second, slower when you are in another window, and paused when minimized.
- When you close the window, the small background helper quits on its own after ten minutes. To stop it right away, run `npm run stop`.

## Optional: react to Claude Code or Codex

Skip this unless you use them. The fish swim faster and a glowing dot appears in the corner (orange for Claude Code, purple for Codex) while they work, with a splash when they finish. Each assistant that is working also keeps its own crewed submarine down in the tank (an orange tag for Claude Code, purple for Codex), working a slow lap with a wide searchlight; when the work ends the sub surfaces and leaves, scattering a little treasure.

1. Open a terminal in the folder and run:

```sh
node install.cjs --hooks
```

2. Claude Code: start a new session.
3. Codex: type `/hooks`, review and trust the aquarium commands, then start a new chat.

This adds a small command to your Claude Code and Codex settings. Your existing settings are kept, and a backup of each file goes in `backups/`. The command only records that something is working or finished, with a scrambled session id and a timestamp. It never reads or saves your prompts, replies, files or folder names.

## Update, check, remove

- **Update:** download the new ZIP, or `git pull`, then run `node install.cjs` again.
- **Check:** `npm run check` prints what is and is not set up.
- **Remove:** `node install.cjs --uninstall` removes the hooks and shortcuts and stops the helper. Then delete the folder.

## If something goes wrong

- The window says offline or does not open: run `npm start` in the folder and read the message.
- Port 43827 is in use: set `AQUARIUM_PORT` to another number before starting.
- Anything else: open an issue on this repo with the message you see.

## Privacy and safety

- The helper listens on your own computer only (`127.0.0.1`). Nobody on your network or the internet can reach it.
- All code is in this folder, readable and unminified.
- Developers: see [AGENTS.md](AGENTS.md) for the layout and an automated setup recipe.

## Credits

The shark and fish engine in `src/` comes from the ascii-sharks project. No license file was published with it, so this is shared as a hobby project. If you are its author and want something changed, please open an issue. The activity helper, ripples, events and installer were added on top.

The cat icon is by Chanut-is-Industries, from [Flaticon](https://www.flaticon.com/free-icons/black-cat) ("black cat icons").
