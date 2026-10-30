# ascii aquarium

A small living ocean of ASCII sharks, schooling fish and unexpected visitors. Leave it running, or make a splash yourself.

Runs locally. No account, API key or prompt storage.

## Install

Requires [Node.js 18 or newer](https://nodejs.org) and Chrome, Chromium or Brave for the app window.

1. [Download the latest ZIP](https://github.com/mokutekii/ascii-aquarium/releases/download/v1.4.5/ascii-aquarium-v1.4.5.zip) and extract it somewhere permanent.
2. On Windows, double-click **Install.cmd**. On macOS or Linux, run `sh install.sh` in that folder.
3. On Windows, use the **ASCII Aquarium** Desktop or Start Menu shortcut next time. On other systems, run `npm start`.

The installer builds the app and creates the Windows shortcuts. Edge is not used.

## Play

- Click open water for a light splash.
- Hold **H / D / U / X** to keep adding sharks, divers, UFOs or submarines. Other events require individual presses.
- Press **A** or type `/smite` for one manual lightning strike and a divine wisecrack.
- Press **Q** for a thunderstorm: no rain, jagged chain lightning, charged jellyfish, a purple event bar and sputtering engines. Stormy nights tint the water edges purple.
- Pick up a free diver, submarine, UFO or drone. Carry it around, then release while moving to throw it. A quick tap pops a diver; collisions can damage craft.
- Click the mothership to launch an escort drone, up to 16 active drones.
- Open the gear to choose events, lighting, speed and drawing quality. The event checklist controls which encounters are allowed; clickable shortcut entries and status-bar choices are there too.

Events stay capped at one active instance, and whales at two. Manual sharks, UFOs, subs and divers can stack. UFOs added during an invasion join its count and its more aggressive assault behavior.

Most of the ocean takes care of itself. There is more to discover.

## Documentation

- [Player guide](GUIDE.md): controls, event shortcuts and things to try.
- [Aquarium wiki](WIKI.md): creatures, combat, weather and complete encounter mechanics.
- [Release notes](RELEASE_NOTES.md): changes by version and validation notes.

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
