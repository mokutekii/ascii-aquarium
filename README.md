# ascii aquarium

A small living ocean of ASCII sharks, schooling fish and unexpected visitors. Leave it running, or make a splash yourself.

Runs locally. No account, API key or prompt storage.

## Install

Requires [Node.js 18 or newer](https://nodejs.org) and Chrome, Chromium or Brave for the app window.

1. [Download the latest ZIP](https://github.com/mokutekii/ascii-aquarium/archive/refs/tags/v1.4.5.zip) and extract it somewhere permanent.
2. On Windows, double-click **Install.cmd**. On macOS or Linux, run `sh install.sh` in that folder.
3. On Windows, use the **ASCII Aquarium** Desktop or Start Menu shortcut next time. On other systems, run `npm start`.

The installer builds the app and creates the Windows shortcuts. Edge is not used.

## Play

- Left-click the water for a light splash. Dragging is reserved for picking things up.
- Grab a diver, submarine, UFO or drone and release it to throw. Collisions have consequences.
- **U** calls a UFO. **I** starts an invasion; repeated U presses do not.
- **Tab** toggles the latest 15 major moments. **/** opens the command line; **Esc** closes it.
- Open the gear for event choices, lighting, speed and drawing quality. **Keys: show** lists shortcuts you can also click. **Status: one** shows one event bar with a count of the others; **more** shows all bars.

Most of the ocean takes care of itself. There is more to discover.

[All keybinds and events](KEYBINDS.md) · [Extended field guide](GUIDE.md)

## v1.4.5 encounters

- Spawn as many UFOs (**U**) and submarines (**X**) as you want manually. Each has four hull points; a Megalodon body strike deals two damage.
- Shooting or blasting Megalodon provokes a deliberate swim toward the attacker. Explosions use capped, fading recoil rather than snapping sharks around or clamping them back inside the tank.
- The Kraken gathers its arms before engulfing the mothership. It keeps at least four arms crushing while freeing others for attacking drones, one arm at a time. Enraged whale wraps allow more defense; Megalodon wraps keep almost every arm committed.
- Titan fights keep lunges, bites, thrashing, escapes, chases and harpoon reattachment. Close approaches line up arms-first; missed lunges disengage instead of attaching from a distance.
- Drones can sometimes dodge a reaching arm; an enraged Kraken is much harder to evade. Thrown craft can be caught by the Kraken or battered by Megalodon's full body.
- UFOs flash red when damaged. Alien salvage gives divers a faint cyan shield that absorbs one damaging or lethal event.
- Mothership defenses intensify below 33% health. Charged spins fire lasers through two or three full rotations; at 10%, every spin makes three turns. Above half health, ten undamaged seconds allows slow hull regeneration.

## Quality

**Auto** balances detail with measured load. **High** keeps the fullest detail; **saver** reduces drawing cost. Motion stays at **30 fps** for smooth or **15 fps** for saver. Playback pauses when minimized.

## Optional assistant activity

If you use Claude Code or Codex, the aquarium can react when they work or finish. Skip this for a standalone aquarium.

Run `node install.cjs --hooks` only if you want it to add aquarium commands to your Claude Code and Codex hook settings. It backs up existing settings in `backups/` and preserves other hooks.

- Claude Code: start a fresh session afterward.
- Codex: run `/hooks`, review and trust the aquarium commands, then start a fresh chat.

Hooks store only activity flags, timestamps and hashed session identifiers. They do not store prompts, replies, transcripts or file paths. The helper listens only on `127.0.0.1`.

## Update or remove

- **Update:** download the latest ZIP, or switch to `main`, run `git pull --ff-only`, then run `node install.cjs` again. Save any local edits before switching branches or pulling.
- **Check:** `npm run check` reports setup status.
- **Stop:** `npm run stop`. The helper also exits ten minutes after the window closes.
- **Remove:** run `node install.cjs --uninstall` to remove hooks and shortcuts and stop the helper. Then delete the folder.

If the window does not open, run `npm start` in the folder and include its message in a [GitHub issue](https://github.com/mokutekii/ascii-aquarium/issues).

[Release notes](RELEASE_NOTES.md) · [Development and automated setup](AGENTS.md)

## Credits

The shark and fish engine in `src/` comes from the ascii-sharks project. No license file was published with it; this is shared as a hobby project. Its author is welcome to request changes through an issue.

The cat icon is by Chanut-is-Industries, from [Flaticon](https://www.flaticon.com/free-icons/black-cat).

**Clash steering correction:** attached Kraken/Megalodon struggles keep a steady travel course, with thrashing in the body animation instead of steering at an attachment point. Free pursuit uses one turn controller; ordinary sharks neither divert nor displace Megalodon. Smaller sharks may overlap briefly as they ease aside. Boundary steering runs after targeting. Resizing a tank with no ordinary fish preserves active titans instead of reseeding them.
