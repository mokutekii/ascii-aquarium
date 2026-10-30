# Aquarium wiki

The complete reference for creatures, combat, weather and encounters. The sea mixes independent creatures, encounters and reactions, so the same setup can end differently each time.

For a quick control reference, see [Player guide](GUIDE.md), or open **Settings → keys → show** in the aquarium. Those entries are clickable too.

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

The tank contains more simulated water than the window dimensions. Creatures keep swimming when you are not interacting. UFOs and submarines arrive from all four edges. Rapid requests share a 0.55-second arrival gap and reserve their destinations, so entries spread out instead of stacking in two columns. Crowded arrivals wait offshore. Once inside, mixed fleets maintain personal space while moving; UFOs also reserve separate abduction approaches. Attackers spread across different angles and distance bands rather than sharing one station.

Settings control event pace, lighting, simulation speed, drawing quality and motion. **Pace: off** stops random events while leaving enabled manual shortcuts available. The event checklist also disables that event's shortcut and queued arrivals. Existing encounters finish normally. **Status: one** shows one event bar and a count of the others; **more** shows all active bars.

Use **Tab** for the last 15 major messages. Ordinary diver chatter stays out of that history. **/** opens the separate command prompt; **Esc** closes the prompt, history or Settings.

Named events can also be entered in the command prompt, such as `mothership`, `spawn kraken`, or `event meteor`. Commands respect enabled events and use the same queue and toggle behavior as shortcuts. See [Player guide and commands](GUIDE.md#command-prompt) for all event names.

Click the mothership to launch a drone, up to 16 active escorts. Free divers and craft in front of it are picked up first.

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

Dragging a submarine, alien UFO or hijacked UFO into a shark counts as contact. Ordinary sharks cannot damage UFO or submarine hulls. Hammerheads and sawsharks chip one hull point per deliberate head strike; their attacks against three-HP drones deal two damage. Megalodon body contact deals two craft damage. Contacts have cooldowns rather than causing damage on every frame. A provoked shark can focus on the craft that hit it.

## Divers and submarines

D brings in groups with varied roles. Some swim, some carry weapons, some take photographs, and others work with wreckage or explosives. Watch the equipment and small labels: photographers have visible cameras and a SNAP flash; bombers have conspicuous pulsing packs.

Divers can defend the sea, try to board UFOs, be caught in a tractor beam, help free captives, or salvage alien equipment. Camera flashes startle nearby life and can stun attack drones. A bomber can turn a capture into a very different encounter.

X calls a research submarine. Automatic arrivals keep at most three ordinary subs, with separate activity-crewed subs when assistant hooks are enabled. Manual X presses bypass that limit. Subs patrol, ping, avoid bodies, flee danger and fire torpedoes in self-defense. They have limited hull strength: repeated strikes, explosions or a heavy collision can sink one.

The Kraken can seize a sub. A heavy hull slows its captor and takes gradual strain; torpedoes and technician divers can help free it. A free submarine is also throwable.

Optional Claude Code and Codex activity gives each working assistant its own crewed submarine. When work finishes, the crew surfaces and leaves some treasure. This feature needs the optional hooks described in the [README](README.md#optional-assistant-activity).

## UFOs and changing sides

U adds one UFO; manual arrivals bypass the automatic three-UFO cap. It does not start an invasion. I starts the invasion separately, bringing waves with a progress bar. Manual arrivals during an invasion expand its total; an individual UFO is counted only once when destroyed or gone.

Alien UFOs seek captures. Their beam tracks the chosen target's depth instead of blindly extending to the floor. A successful capture brings the whole target into the intake before the craft carries it away. The beam owns a lifted shark's motion, and the UFO does not dodge its own catch or switch into combat steering mid-capture. Sharks, fish, divers, bombers and jellyfish finish capture and are removed from the water; the UFO waits until every creature it has started lifting is aboard or has escaped; a loaded bomber may instead detonate aboard or become ammunition. Obstacles, escape or rescue fire can interrupt a capture; a failed attempt may be abandoned.

A diver boarding a UFO is visible during the takeover. Once piloted, its hull and labels identify the change, and it joins the defenders. Hijacked UFOs can fight alien UFOs, drones and the mothership; alien forces can fire back. Pending targeted attacks are canceled when a change of allegiance makes the intended victim an ally.

UFOs bank with their motion and settle level when they stop. They avoid other hulls, but being dragged or thrown into another craft can force a damaging crash. A pilot follows its craft when a collision displaces the hull.

<details>
<summary>More unusual UFO encounters</summary>

A captured bomber is not a guaranteed victory for the UFO. Its explosives may become ammunition or go off aboard the craft. Stored bombs can lead to carpet bombing, duds, careless drops, friendly fire or an onboard accident. Some hijacked saucers try to steal a shark and leave with it.

</details>

## The mothership

Its active visit is sampled from 150-300 seconds when it arrives. Defeat can end the encounter sooner; timer expiry starts a natural departure even during an EMP outage or capture. Departure animation can continue after the active deadline.

Z calls a separate boss encounter. A late invasion can also escalate into one. The mothership cruises between jumps, uses warning cues before attacks, and has escort drones. Defenders keep individual firing timers, ranges and approach angles; encounters can attract different-sized groups.

| Remaining health | Response |
| --- | --- |
| Above 50% | Normal cruise, jumps, volleys and defensive sweeps |
| 50% | Three reserve drones launch with a short gap between them; normal launches and volleys accelerate |
| 33% | Jumps recur sooner and rim defenses become more frequent |
| 10% | Frequent three-turn rim sweeps and a more urgent attack rhythm |

Each phase change announces once. A large hit can skip directly to the more urgent phase. Escorts remain capped at 16, and a jump and a new rim sweep cannot start together. The rim retains a charging period, giving nearby creatures time to react.

The rim's pressure front carries bodies outward with fading momentum. Sharks and small craft travel farther than whales or titans; exposed divers and small fish are vaporized, UFOs and submarines take two damage per wave, and sharks flee. Loose wreckage also flies clear. A body is hit once per wave, rather than repeatedly while inside the circle.

Hull contact matters. A mothership can strike a sub, and a fast thrown collision is more damaging. Small sharks, including hammerheads and sawsharks, cannot damage the mothership hull. Megalodon can ram or land a tail strike. The Kraken can seize the hull and crush it over time, while its long arms can reach, grip, swing and throw an escort drone back at the ship. Drones fly back after a jump instead of teleporting with it, remaining vulnerable along the route.

Destroying the ship starts a collapse, a core release, pressure fronts and persistent wreckage. An encounter that runs out of time can instead end with a jet departure or flashing warp, leaving a final rim blast. Its active lifetime is sampled between 150 and 300 seconds on arrival, then departure begins.

Above half health, five seconds without damage starts hull regeneration at 1.5% of maximum health per second. Damage resets that delay. Regeneration stops at or below half health and during EMP outages.

Defender numbers follow live drones: four base slots plus three defenders per two drones, rounded up, with up to four additional slots over time and the normal diver cap. Dead defenders free squad slots for replacements. Most battle-time diver rolls use an armed pool favoring technicians, scuba divers and scooters. Defenders keep individual firing rhythms and fire more often against the mothership.

An enraged Kraken occasionally stretches its free arms outward. Arms can peel away one at a time to grab nearby drones, either crushing them or swinging and throwing them into the mothership. Hull crushing scales with attached arms: 0.5% of maximum hull health per arm each second (2% with four arms, 4% with eight, 5% with ten). Arms occupied with a drone cannot also crush the hull.

## Drones, shots and chain reactions

Mothership attack drones are separate from ordinary UFOs and cannot be hijacked. Drones have three HP. Ordinary shark contacts and lasers deal one damage; hammerheads and sawsharks deal two, with a contact cooldown. Drones zigzag away from nearby sharks during free flight, but cannot dodge while held or thrown. Incidental bumps do not make them self-destruct. Hammerheads and sawsharks can hunt escorts during the mothership encounter; other small sharks do not deliberately join that battle. A free drone can also be grabbed and thrown. Drone weight resists currents more than a light object. Blood Moon, shots and nearby explosions can agitate them and focus them on the cause.

A thrown or Kraken-launched drone can detonate on impact. Incidental flight bumps do not detonate it, and collateral explosions cannot kill surviving drones. Wrecks and unstable cores can still produce chain reactions. A destroyed drone can also leave a capacitor with a short fuse; a diver may salvage it before discharge.

Explosions deal four hull damage to UFOs and submarines. Drone shielding absorbs collateral blasts: hostile blasts chip one HP but cannot take the last HP; allied blasts spare drones entirely. Direct fire, shark attacks and thrown impacts can still destroy them. Survivors receive outward knockback. A full eight-HP craft survives one blast; four HP or less is lethal. A destroyed craft creates a delayed explosion that can destroy nearby weakened craft, extending the chain. Each explosion damages a craft only once. Rim-wave damage remains separate.

UFOs and submarines each have eight hull points. Megalodon hits have a cooldown, and a fresh hull survives three two-point impacts. Thrown craft can be caught by Kraken, canceling their momentum. Small-craft hulls flash red after damage. Drone snatches have a visible reach, with escape chances of 38% against a calm Kraken and 8% against an enraged one.

Visible shots check the first body along the ray. An intervening whale, shark, fish or hull can absorb a shot intended for something beyond it. Allied UFOs are transparent to mothership lasers, including radial sweeps: the ray continues to the next body. A hijacked UFO has joined the defenders and can still be hit. Other craft dragged into an ally's active laser can take friendly fire, even though combatants normally choose opponents. Hostile aim warnings lock before firing, so moving after the warning can avoid a hit.

Destroyed UFOs, subs and motherships leave different fragment shapes. Fragments vary in shape, angle, spin, size and buoyancy: some rise, some drift and some sink. Small-craft wrecks make fewer, dimmer pieces and short-lived sparks. Nearby wrecks share a fragment budget so chain reactions stay readable. Some wrecks explode again after a delay. Salvaged alien armor adds a faint cyan halo and absorbs one damaging hit or lethal event, including lasers, bites, ordinary blasts and hull impacts. Direct lightning, charged jellyfish stings and the mothership core death blast bypass it. The shield breaks with a short flash; the next event can kill the diver.

## Kraken and Megalodon

Kraken receives a random 150-300 second active lifetime; Megalodon receives 100-180 seconds. Rage and attachments cannot extend these timers. Expiry starts departure, while combat defeats and escapes can end visits sooner.

K calls the Kraken, M calls Megalodon, and C calls the larger Titans Clash story. Calling one titan while the other is present can bring them into conflict. The Kraken and Megalodon scale with the larger tank; the Ghost Leviathan remains larger than either.

The Kraken turns and approaches before reaching with its arms. A wrap is not established merely because a target is nearby: the arms must arrive and close. Megalodon can close its jaws on the Kraken, and a maul's progress waits for that contact. Watch **closing in** before the grip begins.

Escapes, ink, chases and occasional harpoon-like arm retrievals can change a fight. Whales can be poked, held or squeezed before the titan decides what to do. Sharks and divers can struggle in an arm's grip, and a sawshark may cut itself loose.

Blasts and weapons can agitate a titan, making it rage and focus on the offender. Blood Moon sustains agitation. Ongoing wraps and mauls retain their action instead of switching instantly to a new target. A bomber caught in the Kraken's arms can break its grip and change the entire encounter.

After a completed challenge, the winning Kraken or Megalodon can linger for about a minute, within its remaining active lifetime. It prioritizes the mothership, then remaining craft, then nearby creatures or anything provoking it. The loser can leave without immediately restarting the duel. The mothership can detect a Kraken wind-up and make a quick escape jump, with a cooldown that leaves openings to catch it. The escape briefly agitates the Kraken into pursuit. Its rim charge keeps the grip visible until release, then pushes the Kraken away; defensive laser bursts also produce recoil.

Megalodon actively hunts the mothership without needing provocation and turns on nearby divers over a wider range. Aligned hunts can trigger accelerating power dives lasting 2-3.5 seconds, with 10-18 seconds between starts. It still has to reach its bite target. Boundary turns remain aimed toward a pursued hull, and lost prey clears its bite course. Attached titan struggles keep a steady course while the body carries the thrashing motion.

Megalodon keeps its body wave during pursuit, flexes its tail blade and visibly chomps and recoils when biting. Kraken turning is limited, particularly at low speed, so approaches read as swimming arcs. The mothership gains glowing reactor rings in Yeat mode; the Ghost has a stronger halo in daylight and at night.

## Ghost Leviathan

T calls the enormous translucent blue Ghost. It drifts and sings peacefully, with ordinary wildlife avoiding its body and broad moving head. Its size and shape stay the same in Yeat mode, while its glow intensifies.

The body follows the head's traveled path at fixed distances. Speed and body length set a broad turning radius, and forward trunk avoidance helps keep its skull out of its own body. Resizing carries the stored path along with the creature.

Shots, blasts and a fast sub striking its head can provoke it. It warns, charges the attacker and recovers, eventually calming down. The jaws need to reach the victim to cause damage; merely sharing the Ghost's translucent body is not an attack.

The Ghost does not deliberately fight the other titans. Its passage gives them a small wake without taking over their heading. That allows the creatures to share a scene without endlessly circling each other.

## Lightning and jellyfish

**Q** or `/thunderstorm` starts a lightning-only storm. **A** or `/smite` (`/strike`, `/zap`) calls one strike without starting a storm. Flashes last 0.18-1.25 seconds, and storms mix quick bursts with longer pauses. Night adds purple water-edge haze and stronger sparks; Yeat adds electrical glow.

Strikes sample open water and can bend toward nearby conductors, with extra attraction toward jellyfish. Direct lightning deals two damage to UFOs, submarines and drones, or 6% of a mothership's maximum hull. Surviving craft lose engines and weapons for 2.5-6 seconds, sink, then recover altitude at individual speeds. A destroyed craft ends the circuit. Motherships can recoil and evade nearby ion surges.

Jellyfish extend chain reach and stay supercharged for 10-20 seconds. A starting jellyfish with at least three jellies nearby enables up to 16 chain hits. A chain visits each conductor at most once; destroying a craft still breaks it.

While supercharged, a jellyfish pulses an EMP every 2.5 seconds. Its radius scales with its bell, limited to 75-160 simulation pixels. All nearby craft lose engines and weapons for 1-2 seconds. The pulse cancels pending shots, does no hull damage and does not launch another damaging chain. Charge lasts until its timer expires.

Ordinary jellyfish stings stun divers. A charged sting is lethal and bypasses alien armor, as does direct lightning. The EMP aura itself does no diver or hull damage. Blue-white bolts are storm/conductor lightning; yellow bolts are jellyfish stings aimed at divers. Charging clears old sting targets to prevent stretched yellow bolts. Zap bones, diver scrap and pop flashes use live-diver proportions.

Lightning scares ordinary sharks and whales. Kraken and Megalodon briefly flash red and become agitated; Ghost Leviathan ignores it. Unusual electrical deaths have their own quips, while ordinary collision deaths keep smaller labels.

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

[Player guide](GUIDE.md) | [Setup and privacy](README.md) | [Release notes](RELEASE_NOTES.md)
