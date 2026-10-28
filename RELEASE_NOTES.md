## v1.4 - immersive oceans!

the kraken fights are rebuilt, the sharks have personalities, and submarines share the deep with a luminous ghost leviathan.

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

**v1.4.3 - performance, living light and encounters**
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
- **mothership boss (Z):** a separate encounter with its own health bar, a fuller saucer silhouette and up to eight small attack drones that cannot be hijacked. A late alien invasion can escalate into the boss fight. Divers and submarines defend the sea; drones also frighten sharks and provoke titans.
- **consistent combat:** shots follow the firing weapon, hostile aim warnings lock before firing so defenders can dodge, and resolved shots stay at their actual firing positions. Piloted UFOs support the defenders, alien craft attack them, and whales can intercept lasers. Titan retaliation focuses on the offender without granting a rage boost; the Ghost still passes peacefully through divers until attacked.
- **submarine spacing and survival:** avoidance and separation use full hulls, tails and towers, with room around other submarines, UFOs and whales. Adaptive drawing quality preserves submarine scale. Explosions damage and shove subs; the kraken can seize them, move more slowly under their weight and gradually crush the hull. Torpedoes or tech divers can free a captured sub. UFOs also weigh more than divers in the kraken's grip.
- **photographers:** a visible camera and SNAP flash distinguish them from armed divers. Flashes startle fish, may attract shark aggression and can stun mothership drones.
- **EOE — Merger Sequence:** a separate rare event with its own title, the exact arrival toast **Disgusting...**, a Lilith/Rei-inspired apparition, branching wings, crosses, converging souls, an LCL-colored wash, a cleared sea and eventual return of life. It is independent of the invasion and does not require a full diver crew. There is no event checkbox or single-key shortcut; the case-sensitive secret `SHINJISUX` works in the slash command field or through `window.aquarium.command("SHINJISUX")` in the developer console.
- **slash history and commands:** `/` shows the last 15 major events and an input field. Ordinary diver chatter stays out; diver-cap milestones remain. Escape closes the panel.
- **Yeat lines:** only `lüh tönka...`, `lüh birky...`, `lüh twïzzy...`, `smooktobër...`, `lüh shmünk...`, `aurghhhhhhh...` and `awöö...` remain.
- **Windows startup:** shortcuts use a hidden script helper, while the browser's app process is explicitly allowed to show its window on the first launch. The local server still starts hidden and is checked for readiness before the app opens.
- **additional checks:** mothership victory and retreat, bounded drone/shot populations, EOE progression and reseeding, full-hull traffic separation, target-depth tractor beams, dodgeable shots, Ghost retaliation, heavy kraken captures, explosion damage and weighted whirlpool effects.
