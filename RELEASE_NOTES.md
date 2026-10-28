## v1.4 - immersive oceans!

the kraken fights are rebuilt, the sharks have personalities, and submarines share the deep with a luminous ghost leviathan.

Latest source: [v1.4.5](https://github.com/mokutekii/ascii-aquarium/tree/v1.4.5) - [Download ZIP](https://github.com/mokutekii/ascii-aquarium/archive/refs/tags/v1.4.5.zip).

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

**v1.4.2 — submarines and the deep**
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
- Attackers keep individual firing rhythms, ranges and approach angles. Bounded random squads make some encounters quieter and others more crowded.
- Hijacked UFOs fight alien UFOs, drones and motherships. Distinct laser colors identify each side and weapon.
- Motherships cruise between less frequent jumps and can sweep attackers away. Drones stay behind on a teleport, then navigate back while remaining vulnerable.
- Throw divers and craft, crash hulls, set off chain reactions, or provoke nearby titans. Sharks attack drones; hammerheads have their own bash.
- Titans make physical contact with the mothership through rams, tail strikes, captures and returned drones. Ghost passages give titans a gentle wake without forcing endless turns.
- UFOs blend the classic silhouette with a shaded underside, gentle ebb and smooth banking. Wider target-fitting beams glow more at night, finish captures, and can be broken by escape or rescue fire. Abducted bombers keep their unpredictable outcomes.
- UFOs, submarines and motherships each leave at least three fragment shapes. Shark detail is sharper at the same size; meteor shockwaves vary between impacts.
- Invasions use **I**; **U** no longer starts one automatically. **Tab** shows 15 major toasts, while **/** opens the command line. **Status: one / more** controls event-bar stacking.
- Natural populations return gradually after ocean-wide disruptions. Rendering reuses detail buffers and avoids unnecessary sampling; smooth/saver remain 30/15 fps.
- README shortened to setup, core controls, options and privacy. Discoveries stay in the ocean.
- **solid bodies:** sharks anticipate crossing paths and separate their full bodies, including perfectly stacked spines. Dragged and thrown UFOs remain solid against other UFOs; pilots move with their hulls. Alien and hijacked UFOs share submarine contact rules for hammerhead rams and sawshark cuts.
- **physical rim blasts:** the mothership's defensive sweep and final departure carry sharks, craft, whales and titans outward with fading momentum. Heavy creatures resist more, loose debris flies clear, and each pressure front hits a body once. Small fish are still vaporized.
- **titan scale:** Kraken and Megalodon grow with the expanded tank rather than stopping at the old size limits. The Ghost Leviathan keeps its existing size and remains the largest creature.
- **finished encounter details:** the Kraken reaches from its own tentacle roots, grips and swings captured drones before release. The maul progress bar waits for jaw contact. Agitation drives rage and focus together; drones react to shots, blasts and Blood Moon. Individual LCL mergers make a brief white pop that scales with the creature.
- **one entrance per trigger:** manually started events use their existing world announcement, preventing duplicate living-light, submarine and major-event messages. A pending unrelated message is never consumed by another event.
- **controls and maintenance:** [KEYBINDS.md](KEYBINDS.md) lists shortcuts, events and interactions without expanding the homepage. Local handoffs, profiles and release ZIPs are ignored. Generated files and private settings stay outside version control.
- **safer arrivals:** UFOs and submarines choose clear entry lanes and reserve space for incoming craft. Crowded arrivals wait farther offshore instead of spawning inside another hull.
- **mothership escalation:** at 50% health, three reserve drones launch in a staggered wave. At 33%, jumps and rim defenses accelerate; at 10%, three-turn sweeps recur more frequently. Phase changes announce once, the eight-drone cap remains, and attacks retain their wind-up.
- **in-app keys:** the gear menu includes a collapsible shortcut list styled like the event checklist. Each row shows its key and can be clicked to perform the action; the list scrolls within small windows.

**v1.4.5 follow-up - titan movement and alien defenses**
- Lighter left-click splashes; water drag trails removed. Dragging picks up divers and ordinary craft; the mothership cannot be grabbed.
- Options, events and key lists fit the window with bounded scrolling. Removed the extra hold-and-drag note.
- Megalodon has a stiffer forebody, broad interior patrols and closer diver opportunities. Titan provocation no longer adds a competing body turn.
- Kraken hull wraps reuse normal arm roots, reaching and coiling. Up to eight arms engulf the hull, with at least four maintained as other arms respond to incoming drone threats; drone targeting no longer automatically drops the hull. The mothership can dispatch escorts or jump free.
- Slow and swept diver impacts kill on the hull unless a shield absorbs them. Ordinary divers deal one hull damage; bombers hit harder.
- Mothership spins fire radial laser volleys. Rim blasts provoke titan retaliation; bomb, bomber, core and meteor pressure fronts push nearby bodies once and frighten sharks.
- Hull fragments vary between rising, drifting and sinking. Alien armor gives divers a faint cyan halo and one saved hit or lethal event, with a short break flash.
- Above half health, ten undamaged seconds starts gradual hull regeneration at 0.8% maximum health per second. Damage interrupts it and restarts the delay. Longer encounters expand defender squads by up to four and gradually increase defender firing cadence, preserving population limits and normal departure.
- Manual submarine spawning bypasses the automatic three-sub cap.

**v1.4.5 follow-up - engulfing wraps, pursuit and craft durability**
- Kraken visibly coils before striking and engulfing the mothership. Arms shift one at a time between hull constriction and defense against shooting drones; at least four maintain the grip. Enraged whale wraps can spare more arms, while Megalodon wraps only rarely release two briefly.
- Drone snatches use distinct free arms. Drones can veer away during the reach, with a 38% calm escape chance reduced to 8% against an enraged Kraken.
- Megalodon retaliation is owned by its normal swimming controller. Mothership and escort shots focus it on the mothership. Blast recoil is capped and fades; shark escape turns are gradual, and offscreen pressure no longer clamps a titan back across the map.
- Manual UFO and submarine spawning has no population limit. Crowded manual arrivals wait only as far offshore as their own lane requires, rather than scaling distance by the combined fleet count.
- UFOs and submarines share four hull points. Megalodon's full body, including its flank and tail, deals two craft damage with a contact cooldown; escort drones are smashed. Thrown craft provoke pursuit, and the Kraken can catch them with throw momentum canceled. UFO grips track the specific captured craft in a fleet.
- Surviving UFOs flash red after damage. The charged radial laser spin remains: two or three complete turns, more frequent defenses below 33%, and guaranteed three-turn spins at 10% health.
- Added focused checks for real-shot pursuit, bounded head movement, offshore blast recoil, ten manual spawns of each craft, adaptive arm allocation, dodges, catches and full-body craft impacts.

- **titan clash follow-through:** close Kraken approaches line up arms-first instead of maintaining a sideways orbit. A missed lunge disengages rather than becoming a distant wrap. Jaw-contact mauls, thrashing, escape chases and harpoon recovery remain; focused regressions check actual jaw contact, missed strikes, chase reattachment and whole-spine harpoon movement.
- **matched craft hulls:** UFOs and submarines each start with four hull points. A Megalodon body hit deals two damage to either, so a fresh craft survives one impact; repeated contacts use a cooldown. Kraken contact catches the craft instead.

**Clash steering correction:** attached Kraken/Megalodon struggles keep a steady travel course, with thrashing in the body animation instead of steering at an attachment point. Free pursuit uses one turn controller; ordinary sharks neither divert nor displace Megalodon. Smaller sharks may overlap briefly as they ease aside. Boundary steering runs after targeting. Resizing a tank with no ordinary fish preserves active titans instead of reseeding them.
