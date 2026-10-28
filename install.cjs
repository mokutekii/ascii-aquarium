#!/usr/bin/env node
// One-command setup for people and for agents.
//   node install.cjs                 install dependencies, build, create shortcuts (Windows)
//   node install.cjs --hooks         also wire up Claude Code / Codex activity hooks (edits user config)
//   node install.cjs --check         report what is installed, as JSON; changes nothing
//   node install.cjs --uninstall     remove hooks and shortcuts and stop the server
//   flags: --no-shortcut  skip shortcuts   --json  machine-readable output
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const args = new Set(process.argv.slice(2));
const hookScript = path.join(root, 'activity-hook.cjs').replaceAll('\\', '/');
const log = (message) => { if (!args.has('--json')) console.log(message); };

// Run npm through Node itself when its script is next to node (no shell needed); otherwise fall back to the shell.
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
function sh(command, commandArgs) {
  const stdio = args.has('--json') ? 'ignore' : 'inherit';
  if (command === 'npm' && fs.existsSync(npmCli)) return spawnSync(process.execPath, [npmCli, ...commandArgs], { cwd: root, stdio }).status === 0;
  return spawnSync(command, commandArgs, { cwd: root, stdio, shell: process.platform === 'win32' && command === 'npm' }).status === 0;
}

function hooksInstalled(source) {
  const file = path.join(os.homedir(), `.${source}`, source === 'claude' ? 'settings.json' : 'hooks.json');
  try { return fs.readFileSync(file, 'utf8').replaceAll('\\\\', '/').includes(hookScript); } catch { return false; }
}

function shortcutPaths() {
  if (process.platform !== 'win32') return [];
  const appData = process.env.APPDATA || '';
  const oneDrive = process.env.OneDrive;
  const desktop = oneDrive && fs.existsSync(path.join(oneDrive, 'Desktop')) ? path.join(oneDrive, 'Desktop') : path.join(os.homedir(), 'Desktop');
  return [
    path.join(desktop, 'ASCII Aquarium.lnk'),
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'ASCII Aquarium.lnk'),
  ];
}

function createShortcuts() {
  if (process.platform !== 'win32') return [];
  const script = `
    $ws = New-Object -ComObject WScript.Shell
    foreach ($path in ($env:AQ_LINKS -split '\\|')) {
      if (!$path) { continue }
      New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
      $s = $ws.CreateShortcut($path)
      $s.TargetPath = (Join-Path $env:SystemRoot 'System32\\wscript.exe')
      $s.Arguments = '"' + (Join-Path $env:AQ_ROOT 'Launch.vbs') + '"'
      $s.WorkingDirectory = $env:AQ_ROOT
      $s.IconLocation = (Join-Path $env:AQ_ROOT 'aquarium.ico') + ',0'
      $s.Description = 'ASCII Aquarium'
      $s.Save()
    }`;
  const links = shortcutPaths();
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, AQ_ROOT: root, AQ_LINKS: links.join('|') }, stdio: 'ignore' });
  return result.status === 0 ? links : [];
}

function status() {
  return {
    node: process.versions.node,
    nodeOk: Number(process.versions.node.split('.')[0]) >= 18,
    dependenciesInstalled: fs.existsSync(path.join(root, 'node_modules', 'vite')),
    built: fs.existsSync(path.join(root, 'dist', 'index.html')),
    hooks: { claude: hooksInstalled('claude'), codex: hooksInstalled('codex') },
    shortcuts: shortcutPaths().filter((p) => fs.existsSync(p)),
    folder: root,
    start: 'npm start',
  };
}

if (args.has('--check')) {
  const report = status();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.nodeOk && report.built ? 0 : 1);
}

if (args.has('--uninstall')) {
  sh(process.execPath, [path.join(root, 'stop.cjs')]);
  sh(process.execPath, [path.join(root, 'uninstall-hooks.cjs')]);
  for (const link of shortcutPaths()) { try { fs.unlinkSync(link); log(`Removed ${link}`); } catch {} }
  log('Uninstalled. Delete this folder to remove the app itself.');
  process.exit(0);
}

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error(`Node.js 18 or newer is required (found ${process.versions.node}). Install it from https://nodejs.org`);
  process.exit(1);
}

log('1/4  Installing dependencies (build tools only; nothing runs from the internet at runtime)...');
if (!sh('npm', ['install', '--no-audit', '--no-fund'])) { console.error('npm install failed.'); process.exit(1); }
log('2/4  Building...');
if (!sh('npm', ['run', 'build'])) { console.error('Build failed.'); process.exit(1); }

if (args.has('--hooks')) {
  log('3/4  Adding activity hooks to Claude Code and Codex...');
  sh(process.execPath, [path.join(root, 'install-hooks.cjs')]);
} else {
  log('3/4  Skipping hooks (add --hooks to let the fish react to Claude Code / Codex activity).');
}

if (!args.has('--no-shortcut') && process.platform === 'win32') {
  log('4/4  Creating shortcuts...');
  const made = createShortcuts();
  made.forEach((p) => log(`     ${p}`));
} else {
  log('4/4  No shortcuts on this platform; start it with: npm start');
}

if (args.has('--json')) { console.log(JSON.stringify(status(), null, 2)); process.exit(0); }
log('\nDone. Start it with:  npm start   (Windows: the ASCII Aquarium shortcut)');
if (args.has('--hooks')) {
  log('Claude Code: start a fresh session. Codex: run /hooks, review and trust the aquarium commands, then start a fresh chat.');
}
