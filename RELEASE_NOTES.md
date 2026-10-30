## v1.4 - immersive oceans!

the kraken fights are rebuilt, the sharks have personalities, and submarines share the deep with a luminous ghost leviathan.

Latest release: [v1.4.5](https://github.com/mokutekii/ascii-aquarium/releases/tag/v1.4.5) - [Download ZIP](https://github.com/mokutekii/ascii-aquarium/releases/download/v1.4.5/ascii-aquarium-v1.4.5.zip).

**v1.4.0**
- **ordered wrap:** the kraken turns, thrusts in arms first and lands, and is only "wrapped" once the arms have closed.
- **the megalodon fights back:** it can charge the kraken, bite its head and whip it about. a fleeing kraken is sometimes chased: its ink loses the megalodon, or it is run down. a megalodon getting away can be hooked by an arm and dragged back.
- **whales:** the kraken pokes or squeezes, then chooses to let go, crush or eat. nothing dies on contact.
- **tamer enraged kraken** and no more spinning at its arrival spot.
- **sharks:** species roles, moods, stamina, pack rallies and frenzies.
- **toasts:** one short line per boss, red for the kraken or megalodon and purple for a clash. other toasts drop their symbols for color (amber danger, green good, a trailing ~ for whales).
- **manual events:** a key press starts any event whatever else is running, apart from one kraken, one megalodon, two whales and the diver cap.
- **code split** into world, titans, sharks, types and lines.

**v1.4.1**
- **harpoon:** "get over here" shoots one of the kraken's own arms and keeps it hooked while the megalodon is hauled back. it decides once per escape: usually it lets the megalodon go, sometimes it drags it back.
- **maul:** the megalodon swims in at 1.5x its pace and the bite lands when the jaws arrive, instead of the kraken snapping to its head. the kraken swims on naturally while the megalodon runs it down, and nothing thrashes until the jaws actually close (the bar reads "closing in" until then). a megalodon that never comes, or a blast in the arms, sends the kraken off instead of leaving it waiting. the thrash builds up and is slower. a mauled kraken has no arms wrapped round the megalodon.
- **faster wraps:** a wrapped megalodon is gripped in about 1.4s.
- **fewer callouts:** big bold labels are only for outcomes and turning points, with no box (a dark outline instead). the "dun dun" beat and "chomp" are gone.
- **toasts:** one short line each, and every toast trails off in an ellipsis. shark toasts are coral, fire and bombs orange, glowing things lavender.
- **/ history:** press / to hold the last 15 events in the toast spot, no fade. press again or Esc to close.
- **sharks:** press H for a random shark; one in five is a pale ghost shark that stalks divers and lunges. sharks give each other more room, and bodies that overlap are eased apart so they stop clipping.
- **divers:** 24 more arrival quips.
- **jellyfish:** they have a hitbox now: sharks, whales and the kraken knock them aside, and titans toss them far harder.
- **bombers:** the explosive pack pulses orange to yellow with a ring of sparks so they stand out, and popping or crushing one sets the whole pack off.

**v1.4.2  -  submarines and the deep**
- **submarines (X):** research subs patrol with a conning tower, periscope, nose searchlight and sonar pings. They pitch as they dive and climb, flee danger, and fire torpedoes in self-defence against attacking sharks.
- **activity crews:** Claude Code and Codex each keep a crewed submarine in the tank while working. When work finishes, the crew surfaces and leaves a little treasure. The existing local activity listeners remain supported.
- **ghost leviathan (T):** an immense, translucent blue titan now glides through ordinary water. A broad, gently swaying hammerhead, a fuller ribbed body, blue muscle ribbons, orange nerve lights, trailing fins and a slow shimmer give it a majestic silhouette. Its blue glow intensifies in Yeat mode; its shape, scale and temperament stay the same.
- **peaceful until provoked:** the Ghost drifts and sings while wildlife flees its full silhouette. Shots, blasts or a submarine striking its head can agitate it. It warns before charging divers or subs, hurts them only on jaw contact, then recovers and eventually calms down. It never hunts ordinary wildlife or fights other titans. Only its one-line entrance, "a blue shadow approaches...", gets the special blue glow.
- **more open water:** the tank is now simulated at three times the window dimensions. The Ghost remains the largest creature, with smaller sharks, divers and submarines giving it scale and the titans room to turn.
- **the seabed:** kelp and coral sway along the floor.
- **small details:** floating text, squishy jellyfish and one-line toasts.
- **collisions:** creatures steer clear of each other; a shark that is bumped or hit goes after what hit it, or bolts.
- **night and living light:** N now reaches full night. Daylight fades into indigo water, normal creatures dim, jellyfish gain luminous halos, and cyan plankton and living-light ribbons stand out. Fish slow and school more closely while sharks prowl faster.

**v1.4.3 - performance, light and currents**
- **automatic quality:** reduces ASCII detail, glow and frame rate under sustained load, then restores detail after recovery. Saver mode keeps a bounded grid and simpler shark edges for slower computers.
- **bounded catch-up:** overdue simulation work is discarded under heavy load so it cannot keep the window stuck catching up.
- **less repeated work:** shark segment geometry is reused across drawing samples; distant jellyfish contacts avoid unnecessary square roots.
- **clearer Ghost:** slightly brighter membrane, more distinct trailing tendrils and bright sensory pinpricks.
- **living light:** drifting patches replace fixed wave bands; passing creatures leave gaps in the light.
- **titan announcements:** ten ominous Ghost Leviathan entrances, eight each for the kraken and megalodon, and six clash announcements. Shuffled rotations prevent repeats until each pool is used, preserving their blue, red and purple styling.
- **lighting controls:** replaces the misleading night on/off label with auto/day/night. Auto follows the cycle; day and night hold the selected lighting. Existing preferences carry over, and the nightfall event checkbox is labeled separately.
- **browser choice:** a dedicated app window with no tabs or address bar, powered by Chrome, Chromium or Brave. Prefers a compatible Windows default. Edge is never used; no normal-tab fallback.
- **verification:** overlapping-event stress, night/Ghost behavior, launcher fallback, drawing bounds, automatic quality and catch-up checks. CPU benchmarks exclude native canvas/GPU costs; older hardware still requires device testing.
- **night lights and tractor beams:** a straight, constant-width green column ends at the tracked target instead of the floor. Whales and submarines can block it sooner. UFO emitters and beams brighten at night; Saver skips the hull halo.
- **meteor impacts:** wider pressure rings, brief flashes and motion-aware shake; fish scatter, jellyfish tumble and submarines recoil without expanding the lethal core.
- **moving whirlpools:** varied drifting funnels with pulsing foam arms affect fish, divers, jellyfish, scraps, debris, drones, UFOs, submarines, whales and torpedoes. Drones drift strongly, powered craft resist, whales barely shift and torpedoes bend without gaining speed. Maelstroms pull craft harder. Titans and the mothership remain unaffected, and currents leave kraken-held creatures and craft in its grip.
- **busy divers and activity:** more frequent diver groups within the cap, plus distinct question, subagent-completion and work-finished pulses. Subagent signals need consent to update hook registration.
- **Windows startup:** shortcuts use a hidden script helper, while the browser's app process is explicitly allowed to show its window on the first launch. The local server still starts hidden and is checked for readiness before the app opens.

**v1.4.4 - mothership assault and encounters**
- **mothership boss (Z):** a separate encounter with its own health bar, a fuller saucer silhouette and up to eight small attack drones that cannot be hijacked. A late alien invasion can escalate into the boss fight. Divers and submarines defend the sea; drones also frighten sharks and provoke titans.
- **consistent combat:** shots follow the firing weapon, hostile aim warnings lock before firing so defenders can dodge, and resolved shots stay at their actual firing positions. Piloted UFOs support the defenders, alien craft attack them, and whales can intercept lasers. Titan retaliation focuses on the offender without granting a rage boost; the Ghost still passes peacefully through divers until attacked.
- **submarine spacing and survival:** avoidance and separation use full hulls, tails and towers, with room around other submarines, UFOs and whales. Adaptive drawing quality preserves submarine scale. Explosions damage and shove subs; the kraken can seize them, move more slowly under their weight and gradually crush the hull. Torpedoes or tech divers can free a captured sub. UFOs also weigh more than divers in the kraken's grip.
- **photographers:** a visible camera and SNAP flash distinguish them from armed divers. Flashes startle fish, may attract shark aggression and can stun mothership drones.
- **slash history:** `/` holds the last 15 major events in their original toast layout. Ordinary diver chatter stays out; diver-cap milestones remain. Press `/` again or Escape to close.
- **Yeat lines:** only `lüh tönka...`, `lüh birky...`, `lüh twïzzy...`, `smooktobër...`, `lüh shmünk...`, `aurghhhhhhh...` and `awöö...` remain.
- **encounter checks:** mothership victory and retreat, bounded drone/shot populations, full-hull traffic separation, target-depth tractor beams, dodgeable shots, Ghost retaliation, heavy kraken captures, explosion damage and weighted whirlpool effects.
- **attack teleports:** the mothership fades out, marks an arrival zone and rematerializes near divers or submarines. Hull contact knocks divers away and can injure them; materializing through a submarine takes two hull points and can sink it. Fading craft stop blocking traffic until they return.
- **a stronger boss:** paired beam volleys become three-target attacks below half health, while drone launches accelerate. A bright continuous rim and a cleaner disc silhouette make the mothership easier to read. Drones launch below the hull and keep clear even when stunned or after a teleport. Visible firing flashes identify defender laser origins.
- **seismic destruction:** cascading hull ruptures contract into the core before a bright blue release. Three expanding pressure fronts and flat seismic rings accompany flying wreckage, pushing wildlife and craft outward. Heavy creatures resist more, held creatures stay attached, and each front pushes an actor only once. The waves and scraps persist after the ship disappears.
- **alien salvage:** the wreck scatters drifting metal. Once the main pressure fronts pass, divers retrieve it and equip visible alien armor that absorbs one encounter shot or teleport collision hit.
- **unstable drone cores:** destroyed drones drop pulsing capacitors with a four-second fuse. Nearby divers can retrieve them for armor before discharge; abandoned cores release smaller pressure waves. Surviving escorts also shed cores when the mothership collapses.
- **regression checks:** attack teleport timing, diver and submarine impacts, stunned-drone clearance, collapse progression, capacitor salvage versus discharge, one push per pressure front, effect cleanup and fully faded hull rendering. These run with `npm test`; browser inspection also checked the disc silhouette.

**v1.4.5 - an ocean that fights back**

A living ASCII ocean with sharks, titans, submarines and alien encounters. Runs locally with no account, API key or prompt storage.

**[Download v1.4.5 ZIP](https://github.com/mokutekii/ascii-aquarium/releases/download/v1.4.5/ascii-aquarium-v1.4.5.zip)** | [Controls](https://github.com/mokutekii/ascii-aquarium/blob/v1.4.5/GUIDE.md) | [Complete wiki](https://github.com/mokutekii/ascii-aquarium/blob/v1.4.5/WIKI.md)

## Install

Extract the ZIP somewhere permanent. On Windows, double-click **Install.cmd**. Setup builds and opens the aquarium, then creates Desktop and Start Menu shortcuts. On macOS or Linux, run `sh install.sh`, then `npm start`.

Requires Node.js 18+ and Chrome, Chromium or Brave. First setup needs internet. Edge is not supported. Activity hooks are optional and require a separate opt-in.

## Lightning and supercharged jellyfish

- **Q** starts a thunderstorm. **A** or `/smite` calls one strike with a smite quip. Bolts vary in duration, with quick bursts and longer pauses between strikes.
- Lightning chains through conductive craft and favors nearby jellyfish. Dense jelly clusters can sustain up to 16 hits. Destroying a craft breaks the circuit.
- Direct strikes deal two damage to UFOs, submarines and drones, or 6% of a mothership's maximum hull. Surviving craft lose power, sink briefly and recover.
- Supercharged jellyfish pulse a small EMP every 2.5 seconds while charged. Nearby craft lose engines and weapons for 1-2 seconds, without hull damage. This pulse does not create a damaging lightning chain.
- Direct lightning and charged jellyfish stings bypass diver shields. Zap skeletons, diver scrap and pop flashes now match live-diver proportions. Old sting targets no longer produce stretched yellow bolts.

## Titans and ocean life

- Megalodon actively hunts the mothership, pursues Kraken and makes accelerating power dives. Bites require real jaw contact, without moving Kraken into place.
- Kraken reaches from its tentacle roots, coils around prey and allocates arms between crushing the mothership and catching drones. Missed lunges disengage. Ink escapes, chases and harpoon retrievals remain possible.
- Ghost Leviathan's body follows its head's traveled path. Broad turns and forward body avoidance keep its head out of its trunk. It remains peaceful until provoked.
- Mothership and Kraken active visits randomly last 150-300 seconds. Megalodon lasts 100-180 seconds. Defeat or escape can end visits earlier; timer expiry starts a natural departure even during rage or attachment.
- Whales enter and leave fully offscreen, turn broadly and flee nearby titans. Whirlpool size, spin and suction vary. Meteor impacts follow full bodies and hulls.

## Motherships, drones and defenders

- Up to **16 active drones**, with faster replenishment. Allied explosions spare them; hostile collateral blasts can chip their health but cannot kill them. Direct attacks and thrown impacts remain lethal.
- Defender numbers scale with active drones. Casualties free reinforcement slots, arrivals favor armed divers and defenders fire more often.
- The mothership has slightly less starting hull and slower volleys. At 50% health it calls reserves; below 33%, jumps and rim defenses accelerate; at 10%, sweeps make three turns.
- Above half health, five undamaged seconds starts regeneration at 1.5% of maximum hull per second. Damage stops healing. Regeneration is disabled at or below half health and during EMP outages.
- Teleports leave drones to fly back. Defensive sweeps fire radial lasers and push nearby bodies. Defeat triggers collapse, a core blast and wreckage; timed departures use a jet or warp and a final rim blast.

## Fleets and controls

- **I** starts an invasion; **U** calls one UFO. Invasions enroll existing craft, count outcomes once and use faster captures, bombing and independent weapon timers.
- Hold **H / D / U / X** for repeated creature arrivals. Manual sharks, divers, UFOs and submarines stack. Whales are capped at two; each event and named titan has one active instance.
- UFOs finish mixed tractor catches before leaving. Hijacked UFOs fight alongside defenders. Arrivals use separate lanes, while wreckage has bounded debris and varied buoyancy.
- Click water for a light splash. Carry and throw free divers or ordinary craft; the mothership cannot be picked up. Click it to launch an escort.
- **Tab** shows recent events; **/** opens commands. Settings include clickable shortcuts, bounded scrolling and one or multiple event bars. Optional activity crews retain radio messages, sonar and surfacing treasure.

## Validation

Build, typecheck, installer checks and 16 automated suites pass. Two existing checks still fail: combat spin contact and sawshark craft damage. Visual movement and balance remain subject to playtesting.
