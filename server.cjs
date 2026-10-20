const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const PORT = Number(process.env.AQUARIUM_PORT || 43827);
const STATE_DIR = process.env.AQUARIUM_STATE_DIR || path.join(__dirname, 'state');
const STALE_MS = 6 * 60 * 60 * 1000;
function getState(dir = STATE_DIR, now = Date.now()) {
  const blank = () => ({ active: 0, stale: 0, lastFinished: 0, seen: false, attention: 0, planAt: 0 });
  const result = { claude: blank(), codex: blank() };
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /^(claude|codex)-[a-f0-9]{24}\.json$/.test(f)); } catch {}
  for (const name of files) {
    try {
      const record = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (!Object.hasOwn(result, record.source) || !Number.isFinite(record.updatedAt)) continue;
      if (now - record.updatedAt > 24 * 60 * 60 * 1000) { fs.unlinkSync(path.join(dir, name)); continue; }
      const source = result[record.source];
      source.seen = true;
      if (record.working) source[now - record.updatedAt < STALE_MS ? 'active' : 'stale']++;
      source.lastFinished = Math.max(source.lastFinished, Number(record.lastFinished) || 0);
      if (record.attention && now - record.updatedAt < 20 * 60 * 1000) source.attention++;
      source.planAt = Math.max(source.planAt, Number(record.planAt) || 0);
    } catch {}
  }
  return result;
}
let lastSeen = Date.now();
function createServer() {
  return http.createServer((req, res) => {
    lastSeen = Date.now();
    const allowedHosts = [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
    if (!allowedHosts.includes(req.headers.host) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(403); return res.end();
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/api/state' || url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(url.pathname === '/health' ? { app: 'ascii-aquarium', version: 1 } : getState()));
    }
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (filename !== 'index.html' && filename !== 'favicon.png' && !/^assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(filename)) {
      res.writeHead(404); return res.end();
    }
    fs.readFile(path.join(__dirname, 'dist', filename), (error, data) => {
      if (error) { res.writeHead(404); return res.end(); }
      res.setHeader('Content-Type', filename.endsWith('.png') ? 'image/png' : filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
}
if (require.main === module) {
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exit(1); });
  // Quit once the window has been closed for ten minutes; Launch.ps1 starts it again on demand.
  setInterval(() => { if (Date.now() - lastSeen > 10 * 60 * 1000) process.exit(0); }, 30000);
  server.listen(PORT, '127.0.0.1', () => fs.writeFileSync(path.join(__dirname, 'server.pid'), String(process.pid)));
}
module.exports = { getState, createServer };
