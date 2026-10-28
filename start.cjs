// Starts the local server, then opens a dedicated app window without browser tabs.
// Uses Chrome/Chromium or Brave, preferring a compatible Windows default. Never Edge.
// Cross-platform: `npm start`, the Windows shortcut and Run.cmd all end up here.
const fs = require('node:fs');
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

// Prefer a compatible default browser, then Chrome/Chromium. Never use Edge.
function findAppBrowser() {
  const env = process.env;
  if (process.platform === 'win32') {
    const query = (key, value) => {
      const result = spawnSync('reg', ['query', key, value ? '/v' : '/ve', ...(value ? [value] : [])], { encoding: 'utf8', windowsHide: true });
      return result.status === 0 ? /REG_SZ\s+(.+)/i.exec(result.stdout || '')?.[1]?.trim() : null;
    };
    const id = query('HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice', 'ProgId');
    if (id && !/edge/i.test(id)) {
      const command = query(`HKCR\\${id}\\shell\\open\\command`);
      const executable = command && (/^"([^"]+\.exe)"/i.exec(command)?.[1] || /^(.+?\.exe)(?:\s|$)/i.exec(command)?.[1]);
      if (executable && /^(chrome|chromium|brave)\.exe$/i.test(path.win32.basename(executable)) && fs.existsSync(executable)) return executable;
    }
    return [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean)
      .flatMap((dir) => ['Google/Chrome/Application/chrome.exe', 'BraveSoftware/Brave-Browser/Application/brave.exe', 'Chromium/Application/chrome.exe'].map((browser) => path.join(dir, browser)))
      .find((file) => fs.existsSync(file)) || null;
  }
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser'];
  return candidates.find((file) => process.platform === 'darwin' ? fs.existsSync(file) : spawnSync('which', [file], { stdio: 'ignore' }).status === 0) || null;
}

function openApp() {
  const browser = findAppBrowser();
  if (!browser) {
    console.error('A standalone aquarium window needs Chrome, Chromium or Brave. Install one, then open the aquarium again. Edge is never used.');
    process.exitCode = 1;
    return;
  }
  spawn(browser, [`--app=${URL_ROOT}`, `--user-data-dir=${path.join(root, 'browser-profile')}`, '--window-size=560,380', '--no-first-run', '--no-default-browser-check', '--disable-background-mode', '--disable-pinch'],
    { detached: true, stdio: 'ignore', windowsHide: false }).unref();
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
  openApp();
})();
