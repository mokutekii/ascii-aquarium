## v1.5 - clearer crews, encounters and combat

Version 1.5 combines distinct assistant crews with physical titan encounters, varied currents, evasive equipment and clearer lighting and messages.

Latest release: [v1.5.0](https://github.com/mokutekii/ascii-aquarium/releases/tag/v1.5.0) - [Download ZIP](https://github.com/mokutekii/ascii-aquarium/releases/download/v1.5.0/ascii-aquarium-v1.5.0.zip).

**v1.5.0 — released November 5, 2026**

- **separate commanders:** every active Claude Code or Codex parent chat gets a distinct 16 HP submarine, two engineers and supporting divers. Child agents stay with their parent. Engineers need uninterrupted contact to repair; movement, damage, grabs and EMP interrupt their work.
- **commander rescues and missiles:** titan holds give commanders four seconds before hold damage starts. Rescue fire can force release. Each commander carries one mothership-only deterrent missile, reloads after four minutes and shares a 30-second fleet launch cooldown. The impact interrupts weapons, displaces nearby life and vaporizes nearby drones.
- **deliberate Megalodon movement:** one movement policy coordinates cruising, interception, committed attacks, recovery, pursuit and escape. Moving prey is led, missed passes have a recovery interval, and speed responds to alignment, available water and braking distance. Nearby prey cannot force the head to swivel into a convenient bite.
- **continuous tail strokes:** the rear body coils, strikes and recovers as a continuous bend. The fin follows the physical tail stalk instead of its own oscillator, and the swept tail delivers damage during the strike. A curved fin and connected stalk replace the disconnected blade appearance.
- **physical Kraken reaches** use the existing limb curves for simulation and drawing. All ten roots sit outside the eye. The visible tip must touch before capture, harpoon pull-back or a drone throw. Reach stays within the limb geometry, and missed or released reaches return continuously to rest. Held limbs remain reserved for their target.
- **titan approaches and counterattacks** keep the Kraken swimming through committed passes, forceful flings, chases and holds. Megalodon leads its swimming path, adapts its own approach and recovers after a missed pass. Grips distribute tension between the moving animals. Ink, rescues, harpoon retrievals and rematches remain, including the returning challenger's 25% struggle penalty.
- **tractor obstruction:** the widening beam meets motherships, titans, whales and other craft at their collision outline, including overlap at the emitter. Drawing, target checks and capture use the same obstruction boundary, so captives cannot be pulled through a blocker. Full shark captures still wait for the entire shark to enter.
- **evasive equipment:** damaged UFOs can phase away from impending grabs, shots, impacts and lightning when the drive is ready. Phase destinations and Sandevistan reflexes consider occupied water rather than hopping blindly into another hull. Only a saucer that phased can sometimes drop a drive. A diver's acquired drive lasts until death, with at most two elites; armor and other buffs stack.
- **visible water hazards** have bright ASCII spirals and cores across lighting and quality settings. Small, medium and large funnels vary independently in suction, rotation, drift and spawn region. Ordinary funnels start at 10-24 simulation pixels per second, maelstrom funnels at 15-38. Gentle funnels have a shorter reach.
- **currents and flings:** water accelerates swimmers rather than snapping them onto a prescribed circle. Most captured fish and divers are flung clear before expiry, with persistent momentum and a short recapture respite. Maelstrom core entries can still be lethal. Sharks retain their spin-and-fling interaction, and craft in a funnel lose 1 HP per second.
- **lightning contact and laser penetration:** jagged lightning checks its actual path against craft, meets the first conducting hull and can chain onward from its surface. Destruction breaks the circuit. Lasers can burn through small fish before meeting a solid body; fish behind that body remain protected. Direct lightning, charged jellyfish and EMP behavior remain distinct from ordinary blasts.
- **readable light:** creature, craft, projectile and explosion lights respond to day, night and Yeat. Important emitters are drawn before ambient pulses consume the lighting budget. Yeat creature pulses remain visible in balanced and saver quality, with bounded work per frame.
- **messages:** boss and clash announcements are lowercase in live toasts and history, with restored colored halos and smooth fades. At most four toasts appear; repeats are grouped and cannot keep a notification alive indefinitely. Ordinary chatter and local death labels remain separate from major event history.
- **combat effects:** holding A repeats lightning up to four times per second. Torpedoes produce real explosions, thrown craft can damage other hulls and drone clusters, meteor cores kill while rims throw, and wreckage can extend a chain reaction. Laser and lightning visuals remain ASCII glyphs.
- **controls and compatibility:** G calls the Ghost Leviathan, T the thunderstorm, B the Blood Moon, O the jellyfish bloom and Q the bait ball. The embedded localhost preview handles placeholder browser dimensions without enlarging all controls fourfold.
- **privacy:** assistant activity contains source labels, flags, timestamps and anonymous session hashes. Prompts, replies, transcripts and file paths are not saved or sent.

Megalodon uses the same follow-the-leader spine, immediate bounded head steering and overhead body wave as the smaller sharks, scaled up with a slower cadence. Size-aware joint limits keep the neck gradual and prevent an accumulated crescent; the body settles straight after a turn. The former separate body solver and delayed turn filter are removed; combat strokes are layered over the shared swimming pose, and collision outlines follow that visible pose. Open-water attack speed is about 175-190 simulation pixels per second, with only a small aggression increase. Ink loss first sends it coasting on its existing course; the escape announcement waits until Kraken has opened a real gap. Boss notification halos are softer. Event-bar titles, phase labels and counters remain uppercase; the lowercase styling applies to boss toasts and history. Megalodon may swim beyond the visible edge and return on a broad course; the viewport is not a glass wall. Uncollected alien armor remains for 30 seconds, uncollected Sandevistan drives for 15 seconds, and UFO wreck fragments and loose scrap for 15 seconds. Collected drives still last until the diver dies; unstable capacitors retain their fuses.

Mothership grabs grow out of moving passes and preserve the Kraken's arrival heading. The grip follows the banked hull as tension builds, with brighter near coils and occluded far coils. Craft grips reserve existing limbs, and commander coils grow around the hull. Head-on craft anticipate crossings and change lanes using hull dimensions. Shark reactions steer through normal swimming. Ordinary whirlpool expiry flings only captured swimmers.

Verified with all 32 automated test commands, typecheck, production build and an extracted installer check. Regression coverage includes 15/30/60 Hz titan pursuit, shared arm curves, roots outside the eye, continuous release, contact-gated harpoon pulls and the returning challenger penalty. Desktop visual inspection was unavailable because Windows browser access was blocked.

## v1.4 - immersive oceans!

the kraken fights are rebuilt, the sharks have personalities, and submarines share the deep with a luminous ghost leviathan.

The v1.4 release history follows. Its features are part of the v1.5 ocean.

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

The current v1.5.0 release passes all 32 automated test commands, typecheck, build and installer checks. Visual movement and balance remain subject to playtesting.
