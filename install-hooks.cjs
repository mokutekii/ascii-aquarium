// Adds the aquarium's activity hooks to your Claude Code and Codex user configuration.
// Existing hooks are preserved, a backup of each file goes to backups/, and re-running is safe.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = __dirname;
const hookScript = path.join(root, 'activity-hook.cjs').replaceAll('\\', '/');
const backupDir = path.join(root, 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

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
  const events = ['UserPromptSubmit', 'PreToolUse', 'Stop', 'SessionEnd', ...(source === 'codex' ? ['Interrupt'] : ['StopFailure'])];
  for (const event of events) {
    config.hooks[event] ||= [];
    if (config.hooks[event].some((group) => group.hooks?.some((h) => h.command?.includes(hookScript)))) continue;
    const command = `"${process.execPath.replaceAll('\\', '/')}" "${hookScript}" ${source} ${event}`;
    config.hooks[event].push({ hooks: [{ type: 'command', command, timeout: 3 }] });
  }
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  console.log(`Installed ${source} activity hooks; existing configuration preserved.`);
}
