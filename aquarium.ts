import { OceanEngine } from './src';

const engine = new OceanEngine(document.querySelector('canvas')!, [
  { kind: 'hammerhead', size: 0.8 }, { kind: 'sawshark', size: 0.95 }, { kind: 'nurse', size: 0.7 }, { kind: 'mako', size: 0.6 },
]);
type Source = { active: number; stale: number; lastFinished: number; seen: boolean; attention: number; planAt: number };
type State = { claude: Source; codex: Source };
const message = document.querySelector('#message')!;
let initialized = false;
let lastFinished = 0;
let lastPlan = 0;
let bothSince = 0;
let bothFired = false;
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
    const notice = engine.takeNotice();
    if (notice) showToast(notice);
    // A plan was just presented: the whale glides through.
    const plan = Math.max(state.claude.planAt, state.codex.planAt);
    if (initialized && plan > lastPlan && Date.now() - plan < 15000 && engine.trigger('whale') === 'started') showToast('a plan is ready!');
    lastPlan = plan;
    // Anything waiting on you rings from its dot until you answer.
    engine.setAttention(state.claude.attention > 0, state.codex.attention > 0);
    // Both assistants working at once: a bait ball frenzy, once per overlap.
    if (state.claude.active > 0 && state.codex.active > 0) {
      bothSince ||= Date.now();
      if (!bothFired && Date.now() - bothSince > 4000) { bothFired = true; if (engine.trigger('bait') === 'started') showToast('two at once!'); }
    } else { bothSince = 0; bothFired = false; }
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

// Keys (any casing, all optional: every event also runs on its own): S maelstrom, G jellyfish bloom, P great migration, O blood moon, E meteor shower, K kraken, M megalodon, C kraken + megalodon, R chase, B bait ball, J jellyfish, W whale, V whirlpool, F fight, U ufo, D diver, Y yeat mode (again to end), N nightfall.
const keyEvents: Record<string, [Parameters<typeof engine.trigger>[0], string]> = {
  l: ['current', 'living light drifts through the deep...'],
  k: ['kraken', 'the kraken rises from the deep...'], m: ['mega', 'a megalodon approaches... brace yourselves!'], c: ['saga', 'something stirs below... something HUGE!'],
  r: ['chase', 'a chase! run, little fish, run!'], b: ['bait', 'a bait ball forms... dinner is served!'], j: ['jelly', 'jellyfish drifting in... glowing softly~'],
  w: ['whale', 'a whale is coming... listen closely...'], v: ['whirl', 'a whirlpool opens... hold on!'], n: ['night', 'night falls... sweet dreams~'],
  f: ['fight', 'a fight breaks out! teeth out!'], o: ['moon', 'the sky darkens...'], s: ['maelstrom', 'the sea begins to turn...'], g: ['bloom', 'a faint glow rises from below...'], p: ['migration', 'the whole sea starts to move...'], e: ['meteor', 'something burns across the sky!'], u: ['ufo', 'something hovers above... we are not alone...'], d: ['diver', 'a diver slips in... what could go wrong?'], y: ['yeat', ''],
};
const toast = document.querySelector('#toast')!;
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(text: string) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || (e.target instanceof HTMLElement && e.target.closest('button,input,select,textarea'))) return;
  const entry = keyEvents[e.key.toLowerCase()];
  if (!entry) return;
  const result = engine.trigger(entry[0]);
  // Yeat mode announces itself with one of its ad-libs (queued by the world, so random starts get one too).
  if (entry[0] === 'yeat' && result === 'started') { showToast(engine.takeNotice() ?? 'luh twïzzy...'); return; }
  showToast(result === 'ended' ? 'yeat mode off...' : result === 'queued' ? 'queued up... it comes next!' : result === 'cake' ? 'let them have their cake!' : result === 'insist' ? 'fine...if you insist...' : result === 'full' ? 'no more divers... :(' : result === 'started' ? entry[1] : result === 'already' ? 'already happening!' : result === 'off' ? 'turned off in opts...' : 'this event needs more room right now...');
});

// Options panel: a few cycling toggles, plus an events list where each event can be ticked on or off. Remembered between runs.
type EventKind = Parameters<typeof engine.trigger>[0];
const eventCatalog: [EventKind, string][] = [
  ['current', 'living light'], ['whale', 'whales'], ['jelly', 'jellyfish'], ['bloom', 'jellyfish bloom'], ['migration', 'great migration'],
  ['whirl', 'whirlpool'], ['maelstrom', 'maelstrom'], ['meteor', 'meteor shower'], ['moon', 'blood moon'], ['kraken', 'kraken'],
  ['mega', 'megalodon'], ['saga', 'titans clash'], ['ufo', 'flying saucers'], ['diver', 'divers'], ['chase', 'chases'],
  ['bait', 'bait balls'], ['fight', 'shark duels'], ['night', 'nightfall'], ['yeat', 'yeat mode'],
];
const choices: Record<string, string[]> = { events: ['off', 'calm', 'normal', 'busy'], night: ['on', 'off'], motion: ['smooth', 'saver'] };
const chosen: Record<string, string> = { events: 'normal', night: 'on', motion: 'smooth' };
const enabled: Record<string, boolean> = {};
try {
  const saved = JSON.parse(localStorage.getItem('aq-options') || '{}');
  for (const key of Object.keys(choices)) if (choices[key].includes(saved?.[key])) chosen[key] = saved[key];
} catch { /* Invalid preferences fall back to defaults. */ }
try {
  const stored = JSON.parse(localStorage.getItem('aq-events') || '{}');
  for (const [kind] of eventCatalog) enabled[kind] = stored?.[kind] !== false;
} catch { /* Invalid preferences fall back to defaults. */ }
const panel = document.querySelector<HTMLElement>('#panel')!;
const eventList = document.querySelector<HTMLElement>('#event-list')!;
const eventsButton = document.querySelector<HTMLButtonElement>('#event-toggle')!;
for (const [kind, name] of eventCatalog) {
  engine.setEventEnabled(kind, enabled[kind]);
  const row = document.createElement('label'); row.className = 'event-row';
  const box = document.createElement('input'); box.type = 'checkbox'; box.checked = enabled[kind];
  const text = document.createElement('span'); text.textContent = name;
  row.append(box, text); eventList.append(row);
  box.addEventListener('change', () => {
    enabled[kind] = box.checked; engine.setEventEnabled(kind, box.checked);
    try { localStorage.setItem('aq-events', JSON.stringify(enabled)); } catch {}
  });
}
eventsButton.addEventListener('click', () => {
  const open = eventList.classList.toggle('open');
  eventsButton.querySelector('b')!.textContent = open ? 'hide' : 'show';
});
function applyOptions() {
  engine.setEventLevel(chosen.events as 'off' | 'calm' | 'normal' | 'busy');
  engine.setNightEnabled(chosen.night === 'on');
  engine.setFps(chosen.motion === 'saver' ? 15 : 30);
  panel.querySelectorAll<HTMLButtonElement>('button[data-opt]').forEach(button => { button.querySelector('b')!.textContent = chosen[button.dataset.opt!]; });
  try { localStorage.setItem('aq-options', JSON.stringify(chosen)); } catch {}
}
panel.querySelectorAll<HTMLButtonElement>('button[data-opt]').forEach(button => button.addEventListener('click', () => {
  const list = choices[button.dataset.opt!];
  chosen[button.dataset.opt!] = list[(list.indexOf(chosen[button.dataset.opt!]) + 1) % list.length];
  applyOptions();
}));
document.querySelector('#opts')!.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); });
addEventListener('click', e => { if (!panel.contains(e.target as Node)) panel.classList.remove('open'); });
addEventListener('keydown', e => { if (e.key === 'Escape') panel.classList.remove('open'); });
applyOptions();
