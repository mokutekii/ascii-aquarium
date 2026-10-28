// Adds the aquarium's activity hooks to your Claude Code and Codex user configuration.
// Existing hooks are preserved, a backup of each file goes to backups/, and re-running is safe
// (it replaces this folder's old entries instead of adding duplicates).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const forward = (p) => p.replaceAll('\\', '/');
const hookScript = forward(path.join(root, 'activity-hook.cjs'));
const backupDir = path.join(root, 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

/** Windows 8.3 short path, so a command needs no quotes (some hosts cannot parse quoted paths). */
function shortPath(p) {
  if (process.platform !== 'win32' || !/\s/.test(p)) return p;
  const script = '(New-Object -ComObject Scripting.FileSystemObject).GetFile($env:AQ_PATH).ShortPath';
  const out = spawnSync('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, AQ_PATH: p.replaceAll('/', '\\') }, encoding: 'utf8' });
  const short = (out.stdout || '').trim();
  return out.status === 0 && short && !/\s/.test(short) ? forward(short) : p;
}

const nodeExe = forward(process.execPath);
const scriptShort = shortPath(hookScript);
const nodeShort = shortPath(nodeExe);
const quoted = (source, event) => `"${nodeExe}" "${hookScript}" ${source} ${event}`;
const plain = (source, event) => `${nodeShort} ${scriptShort} ${source} ${event}`;
const isOurs = (command) => !!command && (command.includes(hookScript) || command.includes(scriptShort));

for (const source of ['claude', 'codex']) {
  const file = path.join(os.homedir(), `.${source}`, source === 'claude' ? 'settings.json' : 'hooks.json');
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (original === null && !fs.existsSync(path.dirname(file))) {
    console.log(`Skipped ${source}: ${path.dirname(file)} does not exist (is it installed?).`);
    continue;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  if (original !== null) fs.writeFileSync(path.join(backupDir, `${source}-${stamp}.json`), original);
  const config = original === null ? {} : JSON.parse(original.replace(/^﻿/, ''));
  config.hooks ||= {};
  const events = ['UserPromptSubmit', 'PreToolUse', 'SubagentStop', 'Stop', 'SessionEnd', ...(source === 'codex' ? ['Interrupt', 'PermissionRequest'] : ['StopFailure', 'Notification'])];
  for (const event of events) {
    // Drop any earlier aquarium entry for this event, keep everything else, then add the current one.
    config.hooks[event] = (config.hooks[event] || [])
      .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !isOurs(h.command)) }))
      .filter((group) => group.hooks.length);
    // Codex on Windows gets a command with no quotes; Claude Code runs commands through a shell that handles quotes.
    const noQuotes = source === 'codex' && !/\s/.test(nodeShort) && !/\s/.test(scriptShort);
    const command = noQuotes ? plain(source, event) : quoted(source, event);
    config.hooks[event].push({ hooks: [{ type: 'command', command, timeout: 3 }] });
  }
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  console.log(`Installed ${source} activity hooks; existing configuration preserved.`);
}
