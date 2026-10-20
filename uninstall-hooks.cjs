// Removes only this folder's aquarium hooks from Claude Code and Codex; everything else is kept.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const hookScript = path.join(__dirname, 'activity-hook.cjs').replaceAll('\\', '/');
// Codex entries may use the Windows short path form, so match that too.
function shortPath(p) {
  if (process.platform !== 'win32' || !/\s/.test(p)) return p;
  const script = '(New-Object -ComObject Scripting.FileSystemObject).GetFile($env:AQ_PATH).ShortPath';
  const out = spawnSync('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, AQ_PATH: p.replaceAll('/', '\\') }, encoding: 'utf8' });
  const short = (out.stdout || '').trim().replaceAll('\\', '/');
  return out.status === 0 && short ? short : p;
}
const scriptShort = shortPath(hookScript);
const isOurs = (command) => !!command && (command.includes(hookScript) || command.includes(scriptShort));

for (const source of ['claude', 'codex']) {
  const file = path.join(os.homedir(), `.${source}`, source === 'claude' ? 'settings.json' : 'hooks.json');
  if (!fs.existsSync(file)) continue;
  const config = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  if (!config.hooks) continue;
  fs.mkdirSync(path.join(__dirname, 'backups'), { recursive: true });
  fs.copyFileSync(file, path.join(__dirname, 'backups', `before-uninstall-${source}-${Date.now()}.json`));
  for (const event of Object.keys(config.hooks)) {
    config.hooks[event] = config.hooks[event].map((group) => ({ ...group,
      hooks: group.hooks.filter((h) => !isOurs(h.command)),
    })).filter((group) => group.hooks.length);
    if (!config.hooks[event].length) delete config.hooks[event];
  }
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  console.log(`Removed ${source} aquarium hooks only.`);
}
