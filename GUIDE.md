# Aquarium field guide

A longer reference for curious players. The sea mixes independent creatures, encounters and reactions, so the same setup can end differently each time.

For a quick control reference, see [Keybinds](KEYBINDS.md), or open **Settings → keys → show** in the aquarium. Those entries are clickable too.

## Starting points

| Try this | What to watch for |
| --- | --- |
| Call a submarine with X, then add sharks with H | Hull avoidance, defensive torpedoes, and species-specific shark attacks |
| Add divers with D and a UFO with U | Photography, boarding attempts, tractor captures and rescue fire |
| Call the mothership with Z | Defenders choosing their own positions and firing rhythms; the ship's changing defenses |
| Call the Kraken with K, then Megalodon with M | An approach, actual contact, a wrap or maul, and possible escapes |
| Call the Ghost with T | Its peaceful passage, the response of smaller wildlife, and the scale of all three titans |
| Try J and L at night | Jellyfish halos and living light moving around silhouettes |
| Throw a craft into another craft | A physical collision, hull damage, recoil and sometimes wreckage |
| Trigger a meteor shower with E | Uneven impact fronts, nearby reactions and eventual salvage |

These are starting points rather than guaranteed scripts. Position, timing, available defenders and chance affect the outcome.

## Making room and controlling the sea

Left-click water for a light splash. Dragging only picks up actors. Clicking a diver pops it. Hold a diver or a craft to carry it, then release while moving to throw it. Submarines, UFOs and attack drones can be handled when they are free; an encounter's grip or departure can temporarily prevent a grab.

The tank contains more simulated water than the window dimensions. Creatures keep swimming when you are not interacting. UFOs and submarines choose separate entry lanes; incoming UFOs also reserve their hover destinations. Crowded entries approach from farther offshore.

Settings control event pace, lighting, simulation speed, drawing quality and motion. **Pace: off** stops random events while leaving enabled manual shortcuts available. The event checklist also disables that event's shortcut and queued arrivals. Existing encounters finish normally. **Status: one** shows one event bar and a count of the others; **more** shows all active bars.

Use **Tab** for the last 15 major messages. Ordinary diver chatter stays out of that history. **/** opens the separate command prompt; **Esc** closes the prompt, history or Settings.

## Sharks

H adds a random shark. Sharks have different preferences and rhythms, as well as hunger, stamina and changing moods. A stalking shark, a sprinter, a scavenger and a tired shark do not approach prey in the same way.

| Kind | A useful clue |
| --- | --- |
| Classic | The baseline hunter |
| Mako | Quick bursts and tight turns, but less stamina |
| Hammerhead / great hammerhead | Strong interest in divers and a distinct hull ram |
| Thresher | A lively tail and short bursts |
| Tiger / nurse | More willing to scavenge near trouble; the nurse cruises slowly |
| Zebra | A steadier, more patient swimmer |
| Ghost shark | Pale, slow stalking followed by a hard lunge; separate from the Ghost Leviathan |
| Sawshark | A cutting snout that can slice craft and sometimes free it from a grip |

Sharks steer before crossing paths, and overlapping full bodies separate. A deliberate duel with F is an exception: the two participants need to come close. Hunger, bait balls, scraps and nearby threats can still bring a pack toward the same area.

Dragging a submarine, alien UFO or hijacked UFO into a shark counts as contact. An ordinary bump can damage a hull; a hammerhead's head strike is stronger, and a sawshark's head strike can cut through a fresh UFO. Contacts have cooldowns rather than causing damage on every frame. A provoked shark can focus on the craft that hit it.

## Divers and submarines

D brings in groups with varied roles. Some swim, some carry weapons, some take photographs, and others work with wreckage or explosives. Watch the equipment and small labels: photographers have visible cameras and a SNAP flash; bombers have conspicuous pulsing packs.

Divers can defend the sea, try to board UFOs, be caught in a tractor beam, help free captives, or salvage alien equipment. Camera flashes startle nearby life and can stun attack drones. A bomber can turn a capture into a very different encounter.

X calls a research submarine. Automatic arrivals keep at most three ordinary subs, with separate activity-crewed subs when assistant hooks are enabled. Manual X presses bypass that limit. Subs patrol, ping, avoid bodies, flee danger and fire torpedoes in self-defense. They have limited hull strength: repeated strikes, explosions or a heavy collision can sink one.

The Kraken can seize a sub. A heavy hull slows its captor and takes gradual strain; torpedoes and technician divers can help free it. A free submarine is also throwable.

Optional Claude Code and Codex activity gives each working assistant its own crewed submarine. When work finishes, the crew surfaces and leaves some treasure. This feature needs the optional hooks described in the [README](README.md#optional-assistant-activity).

## UFOs and changing sides

U adds one UFO, up to three. It does not start an invasion. I starts the invasion separately, bringing waves with a progress bar. Additional arrivals during an invasion expand its total; an individual UFO is counted only once when destroyed or gone.

Alien UFOs seek captures. Their beam tracks the chosen target's depth instead of blindly extending to the floor. A successful capture brings the target all the way into the intake before the craft carries it away. Obstacles, escape or rescue fire can interrupt a capture; a failed attempt may be abandoned.

A diver boarding a UFO is visible during the takeover. Once piloted, its hull and labels identify the change, and it joins the defenders. Hijacked UFOs can fight alien UFOs, drones and the mothership; alien forces can fire back. Pending targeted attacks are canceled when a change of allegiance makes the intended victim an ally.

UFOs bank with their motion and settle level when they stop. They avoid other hulls, but being dragged or thrown into another craft can force a damaging crash. A pilot follows its craft when a collision displaces the hull.

<details>
<summary>More unusual UFO encounters</summary>

A captured bomber is not a guaranteed victory for the UFO. Its explosives may become ammunition or go off aboard the craft. Stored bombs can lead to carpet bombing, duds, careless drops, friendly fire or an onboard accident. Some hijacked saucers try to steal a shark and leave with it.

</details>

## The mothership

Z calls a separate boss encounter. A late invasion can also escalate into one. The mothership cruises between jumps, uses warning cues before attacks, and has escort drones. Defenders keep individual firing timers, ranges and approach angles; encounters can attract different-sized groups.

| Remaining health | Response |
| --- | --- |
| Above 50% | Normal cruise, jumps, volleys and defensive sweeps |
| 50% | Three reserve drones launch with a short gap between them; normal launches and volleys accelerate |
| 33% | Jumps recur sooner and rim defenses become more frequent |
| 10% | Frequent three-turn rim sweeps and a more urgent attack rhythm |

Each phase change announces once. A large hit can skip directly to the more urgent phase. Escorts remain capped at eight, and a jump and a new rim sweep cannot start together. The rim retains a charging period, giving nearby creatures time to react.

The rim's pressure front carries bodies outward with fading momentum. Sharks and small craft travel farther than whales or titans; small fish are vaporized. Loose wreckage also flies clear. A body is hit once per wave, rather than repeatedly while inside the circle.

Hull contact matters. A mothership can strike a sub, and a fast thrown collision is more damaging. Megalodon can ram or land a tail strike. The Kraken can seize the hull and crush it over time, while its long arms can reach, grip, swing and throw an escort drone back at the ship. Drones fly back after a jump instead of teleporting with it, remaining vulnerable along the route.

Destroying the ship starts a collapse, a core release, pressure fronts and persistent wreckage. An encounter that runs out of time can instead end with a jet departure or flashing warp, leaving a final rim blast. Its visit is bounded to less than three minutes before departure begins.

## Drones, shots and chain reactions

Mothership attack drones are separate from ordinary UFOs and cannot be hijacked. Sharks can attack them; a free drone can also be grabbed and thrown. Drone weight resists currents more than a light object. Blood Moon, shots and nearby explosions can agitate them and focus them on the cause.

A drone striking a body can detonate. Nearby explosions can set off other drones and prime unstable cores, so a battle can cascade. A destroyed drone can also leave a capacitor with a short fuse; a diver may salvage it before discharge.

Visible shots check the first body along the ray. An intervening whale, shark, fish or hull can absorb a shot intended for something beyond it. A craft dragged into an ally's active laser can take friendly fire, even though combatants normally choose opponents. Hostile aim warnings lock before firing, so moving after the warning can avoid a hit.

Destroyed UFOs, subs and motherships leave different fragment shapes. Fragments have varied buoyancy: some rise, some drift and some sink. Some wrecks explode again after a delay. Salvaged alien armor adds a faint cyan halo and absorbs one damaging hit or lethal event, including lasers, bites, blasts and hull impacts. The shield breaks with a short flash; the next event can kill the diver.

## Kraken and Megalodon

K calls the Kraken, M calls Megalodon, and C calls the larger Titans Clash story. Calling one titan while the other is present can bring them into conflict. The Kraken and Megalodon scale with the larger tank; the Ghost Leviathan remains larger than either.

The Kraken turns and approaches before reaching with its arms. A wrap is not established merely because a target is nearby: the arms must arrive and close. Megalodon can close its jaws on the Kraken, and a maul's progress waits for that contact. Watch **closing in** before the grip begins.

Escapes, ink, chases and occasional harpoon-like arm retrievals can change a fight. Whales can be poked, held or squeezed before the titan decides what to do. Sharks and divers can struggle in an arm's grip, and a sawshark may cut itself loose.

Blasts and weapons can agitate a titan, making it rage and focus on the offender. Blood Moon sustains agitation. Ongoing wraps and mauls retain their action instead of switching instantly to a new target. A bomber caught in the Kraken's arms can break its grip and change the entire encounter.

## Ghost Leviathan

T calls the enormous translucent blue Ghost. It drifts and sings peacefully, with ordinary wildlife avoiding its body and broad moving head. Its size and shape stay the same in Yeat mode, while its glow intensifies.

Shots, blasts and a fast sub striking its head can provoke it. It warns, charges the attacker and recovers, eventually calming down. The jaws need to reach the victim to cause damage; merely sharing the Ghost's translucent body is not an attack.

The Ghost does not deliberately fight the other titans. Its passage gives them a small wake without taking over their heading. That allows the creatures to share a scene without endlessly circling each other.

## The wider ocean

| Event | Why it changes the scene |
| --- | --- |
| Living light / nightfall | Moving luminous patches, brighter halos and different swimming rhythms |
| Bait ball / chase | Concentrated prey draws hunters; a fast runner stretches out a pursuit |
| Jellyfish / Jellyfish Bloom | A luminous swarm can sting divers; nearby bodies knock and squash jellyfish |
| Whale / Great Migration | Whales and schools cross the tank, attracting predators and changing traffic |
| Whirlpool / Maelstrom | Currents bend movement and loose objects; heavier creatures resist more |
| Meteor Shower | Falling rocks can hit bodies before the water; impacts have varied pressure fronts and salvage |
| Blood Moon | Persistent agitation, hungry sharks and more dangerous encounters |
| Yeat mode | A temporary dark, glowing visual transformation with its own rare arrival |

Major events can overlap, and already-active events may queue another run when requested. Random repeats have cooldowns. Some titan encounter sequences temporarily hold back other random arrivals; manual controls and the event checklist let you shape the scene.

<details>
<summary>An ocean-wide secret (spoilers)</summary>

Open the **/** prompt and enter `SHINJISUX` exactly, then press Enter. This starts the hidden LCL sequence. It is case-sensitive and can run only once in a session.

Individual creatures keep moving until the rising flood reaches them. Each merger makes a brief white pop and leaves its own cross. After the sequence clears, fish and sharks gradually return from the edges instead of appearing everywhere at once.

</details>

[Quick keybinds](KEYBINDS.md) · [Release notes](RELEASE_NOTES.md) · [README](README.md)

### Sustained mothership fights

The mothership cannot be picked up by the player. Unshielded divers die on hull contact, including slow impacts; bombers hit harder. Its defensive spin fires sweeping radial lasers as well as a physical rim wave. Rim waves push titans and provoke retaliation; bomb, bomber, core and meteor blasts also send pressure through nearby creatures.

Above 50% health, ten seconds without damage starts slow alien hull regeneration (0.8% of maximum health each second, up to full). Any damage stops it and resets the delay. At or below half health, regeneration is disabled. Every thirty seconds of sustained battle adds room for another defender in the encounter squad, up to four extra; defender weapon timers gradually shorten over two minutes. Existing population limits and the mothership's normal departure still apply. Manually spawned submarines and UFOs bypass their automatic three-craft caps. Their arrival spacing is independent of the combined fleet size.

The Kraken gathers its arms for a visible wind-up, then engulfs the hull with up to eight arms using its normal reach-and-coil animation. It gradually frees more arms for drones shooting at it, keeping at least four crushing the hull. Enraged whale wraps can free up to four defensive arms; Megalodon wraps usually keep all ten committed and only rarely free two briefly. Drones can attack it while it crushes; jumps and rim defenses can break the grip. Megalodon uses a stiffer forebody, broad turns and nearby prey opportunities rather than chasing distant divers.

### Craft impacts and recoil

Submarines and UFOs share four hull points. A Megalodon body impact, including its flank or tail, deals two damage with a two-second contact cooldown. A fresh craft survives the first contact; continued contact can destroy it. Escort drones are smashed by its body. Shots and blasts provoke pursuit through the normal swimming controller; mothership and escort fire focuses Megalodon on the mothership while it remains present.

Thrown submarines and UFOs that contact the Kraken can be caught, with throw momentum canceled. Sub hulls are crushed over time; held UFOs can be crushed or escape. Each UFO grip follows the actual captured craft, including when several are present.

UFO hulls flash red for 0.3 seconds after damage. Drone snatches have a visible reach before capture. Drones can veer away before the arm closes (38% against a calm Kraken, 8% against an enraged one). The Kraken reserves distinct free arms for snatches instead of using one arm for both wrapping and defense.

Explosion pressure and defensive rim recoil accumulate with bounded momentum, then decay smoothly. Sharks turn away through normal swimming instead of instantly changing heading. Pressure never clamps a creature's offscreen position to the tank edge.

### Titan clash contact

Kraken close approaches transition to arms-first swimming, rather than maintaining a sideways orbit around prey. It lines up before committing to a lunge. A missed lunge disengages; its time limit cannot create a distant grip that drags the animals together. A Megalodon maul starts only when its jaws reach the Kraken. Existing thrashing, escape pursuit, ink escapes and whole-body harpoon recovery remain in the fight logic. Automated contact checks cover missed lunges, jaw contact, chase reattachment and gradual harpoon movement; the final movement feel still needs visual playtesting.

**Clash steering correction:** attached Kraken/Megalodon struggles keep a steady travel course, with thrashing in the body animation instead of steering at an attachment point. Free pursuit uses one turn controller; ordinary sharks neither divert nor displace Megalodon. Smaller sharks may overlap briefly as they ease aside. Boundary steering runs after targeting. Resizing a tank with no ordinary fish preserves active titans instead of reseeding them.
