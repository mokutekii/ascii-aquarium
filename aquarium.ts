import { OceanEngine } from './src';

const engine = new OceanEngine(document.querySelector('canvas')!, [
  { kind: 'hammerhead', size: 0.8 }, { kind: 'mako', size: 0.6 },
]);
type Source = { active: number; stale: number; lastFinished: number; seen: boolean };
type State = { claude: Source; codex: Source };
const message = document.querySelector('#message')!;
let initialized = false;
let lastFinished = 0;
let celebrationUntil = 0;
let timer: ReturnType<typeof setTimeout>;

// App icon: the cat gets a glowing dot per active assistant (orange Claude, purple Codex),
// like a notification badge. Chromium uses the favicon for the window and taskbar icon.
const cat = new Image();
cat.src = '/favicon.png';
const iconCanvas = document.createElement('canvas');
iconCanvas.width = iconCanvas.height = 64;
const iconLink = document.querySelector<HTMLLinkElement>('link[rel=icon]')!;
let badges = { claude: false, codex: false };
let pulse = 0;
let pulseTimer: ReturnType<typeof setInterval> | undefined;
function drawIcon() {
  const g = iconCanvas.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  if (cat.complete) g.drawImage(cat, 0, 0, 64, 64);
  const dots: [number, number, string][] = [];
  if (badges.claude) dots.push([48, 48, '224,123,60']);
  if (badges.codex) dots.push([badges.claude ? 16 : 48, 48, '180,139,230']);
  for (const [x, y, rgb] of dots) {
    const glow = g.createRadialGradient(x, y, 4, x, y, 20);
    glow.addColorStop(0, `rgba(${rgb},${0.55 + 0.3 * pulse})`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = glow; g.fillRect(x - 20, y - 20, 40, 40);
    g.fillStyle = '#071216'; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgb(${rgb})`; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill();
  }
  iconLink.href = iconCanvas.toDataURL('image/png');
}
cat.onload = drawIcon;
function setBadges(claude: boolean, codex: boolean) {
  if (claude === badges.claude && codex === badges.codex) return;
  badges = { claude, codex };
  clearInterval(pulseTimer);
  pulse = 0;
  if (claude || codex) pulseTimer = setInterval(() => { pulse = 1 - pulse; drawIcon(); }, 900);
  drawIcon();
  try { void ((navigator as any).setAppBadge?.call(navigator) ?? null); if (!claude && !codex) void (navigator as any).clearAppBadge?.(); } catch {}
}
async function refresh() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('Offline');
    const state: State = await response.json();
    const active = state.claude.active + state.codex.active;
    const stale = state.claude.stale + state.codex.stale;
    const finished = Math.max(state.claude.lastFinished, state.codex.lastFinished);
    if (initialized && finished > lastFinished && Date.now() - finished < 15000) {
      celebrationUntil = Date.now() + 4500;
      engine.celebrate();
    }
    initialized = true;
    lastFinished = finished;
    engine.setWorking(active > 0);
    document.body.dataset.mode = active ? 'working' : Date.now() < celebrationUntil ? 'done' : 'idle';
    message.textContent = active ? `${active} ${active === 1 ? 'session' : 'sessions'} at work` :
      Date.now() < celebrationUntil ? 'Work finished · a little splash' : stale ? 'An activity signal is stale' : 'Calm waters';
    for (const name of ['claude', 'codex'] as const) {
      const source = state[name];
      const pill = document.querySelector(`#${name}`)!;
      pill.classList.toggle('active', source.active > 0);
      // Without Claude Code / Codex hooks there is nothing to show, so keep the corner clean.
      (pill as HTMLElement).style.display = source.seen ? '' : 'none';
      pill.setAttribute('title', `${name === 'claude' ? 'Claude' : 'Codex'} · ${source.active ? 'working' : source.stale ? 'signal stale' : source.seen ? 'idle' : 'awaiting hook'}`);
    }
    setBadges(state.claude.active > 0, state.codex.active > 0);
    document.querySelector('#connection')!.textContent = 'LOCAL';
    document.title = `ASCII Aquarium · ${message.textContent}`;
  } catch {
    engine.setWorking(false);
    setBadges(false, false);
    document.body.dataset.mode = 'offline';
    message.textContent = 'Activity connection offline';
    document.querySelector('#connection')!.textContent = 'OFFLINE';
  }
  timer = setTimeout(refresh, document.hidden ? 3000 : 900);
}
document.addEventListener('visibilitychange', () => { clearTimeout(timer); void refresh(); });
void refresh();
document.querySelector('#splash')!.addEventListener('click', () => engine.celebrate());

// Demo keys: K kraken, M megalodon, C kraken + megalodon, R chase, B bait ball, J jellyfish, W whale, A anglerfish, V whirlpool, N nightfall.
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'k') engine.trigger('kraken');
  if (key === 'm') engine.trigger('mega');
  if (key === 'c') engine.trigger('saga');
  if (key === 'r') engine.trigger('chase');
  if (key === 'b') engine.trigger('bait');
  if (key === 'j') engine.trigger('jelly');
  if (key === 'w') engine.trigger('whale');
  if (key === 'a') engine.trigger('angler');
  if (key === 'v') engine.trigger('whirl');
  if (key === 'n') engine.trigger('night');
});
