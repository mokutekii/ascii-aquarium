# ascii aquarium

A little window of ASCII sharks and schooling fish that swim on your screen. Click for a splash, drag for a ripple trail, and once in a while something happens.

It runs only on your own computer. No account, no sign-in, no API key, and nothing is sent anywhere.

## Events

They happen at random, or press a key to trigger one yourself.

| Key | Event |
| --- | --- |
| K | a kraken rises and seizes the nearest sharks |
| M | a megalodon crosses the tank and every shark bolts |
| C | the full story: the kraken grabs sharks, then the megalodon comes to drive it off |
| R | a fast fish is chased by a shark |
| B | a bait ball: fish spin into a tight ball while sharks circle in |
| J | jellyfish drift up through the tank |
| W | a whale glides through, fish parting around it |
| A | an anglerfish lights a lure in the dark and snaps up fish that come close |
| V | a whirlpool sweeps fish into a spiral, then flings them out |
| N | nightfall (the tank also slowly turns to night and back by itself) |

You can also click the **Splash** button in the corner.

## Install on Windows

1. On this page click the green **Code** button, then **Download ZIP**.
2. Open the ZIP and drag the folder somewhere permanent, such as Documents.
3. Open the folder and double-click **Install.cmd**.
   - If it says Node.js is missing, it opens the download page. Install the **LTS** version, then double-click **Install.cmd** again.
4. The aquarium opens. Next time, use the **ASCII Aquarium** icon on your Desktop or in the Start menu.

The first time, Windows may show a blue "Windows protected your PC" box. Click **More info**, then **Run anyway**. Every file is plain text you can read.

## Install on macOS or Linux

1. Install [Node.js](https://nodejs.org) (the LTS version).
2. Download the ZIP as above, or run `git clone https://github.com/mokutekii/ascii-aquarium.git`.
3. Open a terminal in the folder and run:

```sh
sh install.sh
```

Next time, run `npm start` in that folder.

You need Microsoft Edge or Google Chrome for the nicest window. Without them it opens in your normal browser.

## Using it

- **Click** for a big splash. **Hold and drag** for a trail of ripples.
- Resize the window to get more sharks and fish. Zooming the page does not change the tank.
- It is light on your computer: 30 frames per second, slower when you are in another window, and paused when minimized.
- When you close the window, the small background helper quits on its own after ten minutes. To stop it right away, run `npm run stop`.

## Optional: react to Claude Code or Codex

Skip this unless you use them. The fish swim faster and a glowing dot appears in the corner (orange for Claude Code, purple for Codex) while they work, with a splash when they finish.

1. Open a terminal in the folder and run:

```sh
node install.cjs --hooks
```

2. Claude Code: start a new session.
3. Codex: type `/hooks`, review and trust the aquarium commands, then start a new chat.

This adds a small command to your Claude Code and Codex settings. Your existing settings are kept, and a backup of each file goes in `backups/`. The command only records that something is working or finished, with a scrambled session id and a timestamp. It never reads or saves your prompts, replies, files or folder names.

## Update, check, remove

- **Update:** download the new ZIP, or `git pull`, then run `node install.cjs` again.
- **Check:** `npm run check` prints what is and is not set up.
- **Remove:** `node install.cjs --uninstall` removes the hooks and shortcuts and stops the helper. Then delete the folder.

## If something goes wrong

- The window says offline or does not open: run `npm start` in the folder and read the message.
- Port 43827 is in use: set `AQUARIUM_PORT` to another number before starting.
- Anything else: open an issue on this repo with the message you see.

## Privacy and safety

- The helper listens on your own computer only (`127.0.0.1`). Nobody on your network or the internet can reach it.
- All code is in this folder, readable and unminified.
- Developers: see [AGENTS.md](AGENTS.md) for the layout and an automated setup recipe.

## Credits

The shark and fish engine in `src/` comes from the ascii-sharks project. No license file was published with it, so this is shared as a hobby project. If you are its author and want something changed, please open an issue. The activity helper, ripples, events and installer were added on top.
