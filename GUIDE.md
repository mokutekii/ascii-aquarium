# Player guide

Controls, event shortcuts and a few starting points. For detailed mechanics, see the [Aquarium wiki](WIKI.md). For installation, see the [README](README.md#install).

Open **Settings → keys → show** for the in-app list; click an entry to use it. Keys work in either case while the water has focus. Hold **H**, **D**, **U** or **X** to keep adding sharks, diver groups, UFOs or submarines (up to four spawn batches per second). Events, bosses and toggles require separate presses. Most events also happen on their own. Turn individual events on or off in the gear menu; disabled events ignore their shortcut. Event pace **off** stops random arrivals while leaving enabled shortcuts available.

| Key | Creature or event |
| --- | --- |
| H | Another random shark, including occasional ghost sharks |
| D | A group of divers: swimmers, photographers, armed defenders, technicians and bombers |
| X | A research submarine |
| U | One UFO; manual spawns bypass the automatic three-UFO cap and never start an invasion |
| I | An alien invasion, with waves of UFOs and a progress bar |
| Z | The mothership encounter, with escorts, lasers, teleports and a defensive rim sweep |
| K | The Kraken |
| M | The Megalodon; calling it while the Kraken is out can start a fight |
| C | Titans Clash: the Kraken and Megalodon encounter |
| T | The Ghost Leviathan, the ocean's largest creature |
| W | A whale swimming in from offscreen; up to two at once |
| J | A group of jellyfish |
| L | Living light drifting through the deep |
| R | A shark chasing fast fish |
| B | A bait ball with circling sharks |
| V | A drifting whirlpool |
| F | A duel between two sharks |
| O | Blood Moon: hungry sharks, armed divers and agitated creatures |
| A | Manual lightning strike, with a smite quip; works without a storm |
| Q | Thunderstorm: lightning chains, jellyfish conduits and EMP outages; no rain |
| E | Meteor Shower: falling rocks, impacts and salvage |
| S | The Maelstrom: several powerful whirlpools |
| G | Jellyfish Bloom: a large luminous swarm |
| P | Great Migration: whales and a school crossing the tank |
| N | Nightfall; choose **auto** lighting to let the cycle continue |
| Y | Yeat mode for five minutes; press again to end it |

| Control | Action |
| --- | --- |
| Click water | Make a splash |
| Drag through empty water | No trail; drag a free actor to carry it |
| Click a diver | Pop it |
| Hold and drag a diver, submarine, UFO or drone | Carry it; release while moving to throw it |
| Tab | Show or hide the latest 15 major event messages |
| / | Open the command prompt |
| Enter | Run the typed command |
| Esc | Close the prompt, history or settings |
| Click mothership | Launch one escort drone, up to 16 active drones |
| Gear | Event checklist, event pace, lighting, speed, motion, quality and status bars |

Ongoing encounters finish when their event is disabled. Manual sharks, divers, UFOs and submarines stack with every press. Whales are capped at two. Each event, including whirlpools and weather, has one active instance. Kraken, Megalodon, mothership and Ghost Leviathan each stay capped at one; night and Yeat remain world lighting modes. Activity-crewed submarines follow assistant activity independently of random submarine arrivals.

## Command prompt

Press **/**, type an event name, then press **Enter**. **Esc** closes the prompt. Commands also work as `spawn kraken` or `event meteor`, with or without a leading slash. Event names ignore capitalization.

Available names: `invasion`, `mothership`, `kraken`, `megalodon`, `clash`, `ghost`, `submarine`, `ufo`, `diver`, `whale`, `jellyfish`, `light`, `chase`, `bait`, `fight`, `whirlpool`, `night`, `yeat`, `moon`, `meteor`, `maelstrom`, `bloom`, `migration`, `storm` / `thunderstorm` / `lightning`, `smite` / `strike` / `zap`.

Commands respect the event checklist and use the same queue and toggle behavior as shortcuts. In particular, `yeat` toggles the mode. **Tab** toggles event history. Unknown commands leave the prompt open; they do not run shell commands.

## A few things to try

- Hammerheads ram smaller craft and drones; sawsharks cut them. Small sharks cannot damage the mothership hull; Megalodon can. Dragging alien or hijacked UFOs into sharks has the same contact rules as dragging submarines into them.
- UFOs avoid each other, but forced contact can damage both craft. Hijacked UFOs join the defenders and trade fire with alien UFOs, escorts and the mothership.
- The mothership escalates as it takes damage: reserve drones at 50%, faster jumps and rim defenses at 33%, and frequent three-turn sweeps at 10%. Its charged rim blast pushes wildlife, craft and debris outward; exposed divers and small fish are vaporized, craft take two damage per wave, and heavy creatures resist more.
- The Ghost drifts peacefully until attacked. Its passage gives other titans a gentle wake; it remains larger than the Kraken and Megalodon.
- Shots hit the first body in their path. Explosions can trigger nearby wreckage; drone shielding prevents collateral chain deaths, and defenders can salvage alien armor.

[Complete mechanics reference](WIKI.md) | [Setup and privacy](README.md) | [Release notes](RELEASE_NOTES.md)
