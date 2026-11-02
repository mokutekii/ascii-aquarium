# ascii aquarium

A small living ocean of ASCII sharks, schooling fish and unexpected visitors. Leave it running, or make a splash yourself.

Runs locally. No account, API key or prompt storage. Version 1.5.0, released November 5, 2026, adds distinct session crews, continuous titan swimming, physical arm reaches, visible moving whirlpools and evasive equipment, with clearer lighting and quieter event messages.

## Install

Requires [Node.js 18 or newer](https://nodejs.org) and Chrome, Chromium or Brave for the app window. The first setup needs an internet connection to install build dependencies.

1. [Download the v1.5.0 ZIP](https://github.com/mokutekii/ascii-aquarium/releases/download/v1.5.0/ascii-aquarium-v1.5.0.zip) and extract it somewhere permanent.
2. On Windows, double-click **Install.cmd**. On macOS or Linux, run `sh install.sh` in that folder.
3. On Windows, use the **ASCII Aquarium** Desktop or Start Menu shortcut next time. On other systems, run `npm start`.

The installer builds the app and creates Desktop and Start Menu shortcuts on Windows. Use a compatible default Chrome, Chromium or Brave browser. The app opens in its own window; it does not use Edge or fall back to a regular browser tab.

## Play

- Click open water for a light splash.
- Hold **H / D / U / X** to keep adding sharks, divers, UFOs or submarines. Other events require individual presses.
- Press **A** or type `/smite` for one manual lightning strike and a divine wisecrack.
- Press **T** for a thunderstorm: no rain, jagged chain lightning, charged jellyfish, a purple event bar and sputtering engines. Stormy nights tint the water edges purple.
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

**Auto** balances detail with measured load. **High** keeps the fullest detail; **saver** reduces drawing cost. Motion stays at **30 fps** for smooth or **15 fps** for saver. Playback pauses when minimized. Daylight keeps silhouettes clear; night strengthens localized light, and Yeat adds creature pulses across all quality tiers. Boss announcements use lowercase text, colored halos and finite fades.

## Optional assistant activity

If you use Claude Code or Codex, the aquarium can react while they work and when they finish. Each active parent session gets its own crewed submarine. Child agents stay with their parent crew. Skip this setup for a standalone aquarium.

Run `node install.cjs --hooks` only if you want to connect assistant activity. This edits `~/.claude/settings.json` and `~/.codex/hooks.json` to add aquarium commands that run on assistant events. It backs up both files in `backups/` and preserves other hooks. You can skip this step if you do not use those tools.

- Claude Code: start a fresh session afterward.
- Codex: run `/hooks`, review and trust the aquarium commands, then start a fresh chat.

Hooks store only a source name, working and attention flags, timestamps, and a hashed session identifier. Session hashes are used locally to keep parent crews distinct. Prompts, replies, transcripts, tool input and file paths are not stored or sent. The helper listens only on `127.0.0.1`; the aquarium does not expose its activity server to the network.

## Update or remove

- **Update:** download the latest ZIP, or switch to `main`, run `git pull --ff-only`, then run `node install.cjs` again. Save any local edits before switching branches or pulling.
- **Check:** `npm run check` reports setup status.
- **Stop:** `npm run stop`. The helper also exits ten minutes after the window closes.
- **Remove:** run `node install.cjs --uninstall` to remove hooks and shortcuts and stop the helper. Then delete the folder.

### Sync an older v1.5 checkout

The November 5 release replaces the earlier v1.5 commit and refreshes the existing v1.5.0 tag. Save local edits first. These commands preserve your old main branch before aligning it with the complete release.

```sh
git fetch origin
git switch main
git branch codex/before-v1.5-refresh
git reset --keep origin/main
git fetch origin +refs/tags/v1.5.0:refs/tags/v1.5.0
node install.cjs
```

Use a fresh backup branch name if that name already exists. The reset stops if it would overwrite local changes. Reload the aquarium after rebuilding. Future updates can use the usual fast-forward pull.

If the window does not open, run `npm start` in the folder and include its message in a [GitHub issue](https://github.com/mokutekii/ascii-aquarium/issues).

Development: `npm test`, `npm run typecheck` and `npm run build` (rebuild after editing `src/`, then reload the window).

## Credits

The shark and fish engine in `src/` comes from the ascii-sharks project. No license file was published with it; this is shared as a hobby project. Its author is welcome to request changes through an issue.

The cat icon is by Chanut-is-Industries, from [Flaticon](https://www.flaticon.com/free-icons/black-cat).
