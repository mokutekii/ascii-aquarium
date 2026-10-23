// Starts the local server if it is not already running, then opens the aquarium in its own
// app-style window (Edge or Chrome), or in your default browser if neither is installed.
// Cross-platform: `npm start`, the Windows shortcut and Run.cmd all end up here.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const root = __dirname;
const PORT = Number(process.env.AQUARIUM_PORT || 43827);
const URL_ROOT = `http://127.0.0.1:${PORT}`;

function healthy() {
  return new Promise((resolve) => {
    const req = http.get(`${URL_ROOT}/health`, { timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(body).app === 'ascii-aquarium'); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function findBrowser() {
  const env = process.env;
  const candidates = {
    win32: [
      path.join(env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    ],
    darwin: [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ],
    linux: ['microsoft-edge', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  }[process.platform] || [];
  for (const candidate of candidates) {
    if (process.platform === 'linux') {
      if (spawnSync('which', [candidate], { stdio: 'ignore' }).status === 0) return candidate;
    } else if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function openDefault() {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', URL_ROOT]]
    : process.platform === 'darwin' ? ['open', [URL_ROOT]] : ['xdg-open', [URL_ROOT]];
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

(async () => {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    console.error('Not built yet. Run: npm run setup   (or: npm install && npm run build)');
    process.exit(1);
  }
  if (!(await healthy())) {
    spawn(process.execPath, [path.join(root, 'server.cjs')], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true }).unref();
    for (let i = 0; i < 30 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 200));
    if (!(await healthy())) {
      console.error(`The aquarium server did not start on ${URL_ROOT}. Is port ${PORT} in use? Set AQUARIUM_PORT to change it.`);
      process.exit(1);
    }
  }
  const browser = findBrowser();
  if (!browser) { openDefault(); return; }
  const profile = path.join(root, 'browser-profile');
  spawn(browser, [`--app=${URL_ROOT}`, `--user-data-dir=${profile}`, '--window-size=560,380', '--no-first-run', '--no-default-browser-check', '--disable-background-mode', '--disable-pinch'],
    { detached: true, stdio: 'ignore' }).unref();
})();
