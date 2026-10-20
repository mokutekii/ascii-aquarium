// Stops the background server (only if the pid file points at this folder's server.cjs).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pidFile = path.join(__dirname, 'server.pid');
if (!fs.existsSync(pidFile)) { console.log('Server is not running.'); process.exit(0); }
const pid = Number(fs.readFileSync(pidFile, 'utf8'));
let commandLine = '';
if (process.platform === 'win32') {
  const out = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf8' });
  commandLine = out.stdout || '';
} else {
  commandLine = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).stdout || '';
}
if (commandLine.includes('server.cjs')) {
  try { process.kill(pid); console.log('Server stopped.'); } catch (error) { console.log(`Could not stop it: ${error.message}`); }
} else {
  console.log('Server is not running.');
}
try { fs.unlinkSync(pidFile); } catch {}
