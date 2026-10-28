# Setup guide for automated installs

A local, no-API-key app. Setup is one command; do not improvise extra steps.

The person being helped may not be technical and may not use Claude Code or Codex at all. Explain in plain words and skip the hooks step unless they use those tools.

## Prerequisites
- Node.js 18 or newer (`node --version`). If missing, tell the user to install it from https://nodejs.org; do not install system software yourself.
- Chrome, Chromium or Brave is required for the standalone app window. Prefer a compatible default browser; never use Edge or fall back to a regular browser tab.

## Steps
1. Run from this folder: `node install.cjs`
   - Installs build dependencies, builds `dist/`, and on Windows creates Desktop and Start Menu shortcuts.
   - Makes no changes outside this folder except those shortcuts.
2. Verify: `node install.cjs --check` prints JSON. Success means `nodeOk` and `built` are both `true`.
3. Start: `npm start`. It opens a window; `http://127.0.0.1:43827/health` returns `{"app":"ascii-aquarium"}` when the server is up.

## Hooks need the user's consent
`node install.cjs --hooks` edits the user's `~/.claude/settings.json` and `~/.codex/hooks.json` to add
commands that run on assistant events. **Ask the user before running it** and say what it changes.
It backs up both files to `backups/` and preserves existing hooks. Afterwards tell the user:
- Claude Code: start a fresh session.
- Codex: run `/hooks`, review and trust the aquarium commands, then start a fresh chat. An agent cannot do this step.

## Do not
- Commit `state/`, `backups/`, `browser-profile/` or `*.log` (they are gitignored; `backups/` contains copies of the user's settings).
- Add network calls, API keys, or storage of prompts, replies, transcripts, paths or tool input. The hook script deliberately persists only a source name, a hashed session id, a working flag and timestamps.
- Bind the server to anything other than `127.0.0.1`.

## Other commands
- Stop the server: `npm run stop` (it also exits on its own 10 minutes after the window closes).
- Remove hooks, shortcuts and stop the server: `node install.cjs --uninstall`.
- Tests: `npm test` (hook and state logic). Types: `npm run typecheck`. Rebuild after editing `src/`, `aquarium.ts` or `index.html`: `npm run build`, then reload the window.

## Layout
- `src/world.ts` simulation (fish, sharks, ripples, events), `src/renderer.ts` ASCII drawing, `src/engine.ts` loop and input.
- `aquarium.ts` page wiring (status, icon badge, demo keys); `index.html` page and styles.
- `server.cjs` localhost server; `activity-hook.cjs` the hook; `start.cjs`, `stop.cjs`, `install.cjs` tooling.
