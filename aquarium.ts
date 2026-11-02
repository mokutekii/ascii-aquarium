import { expireToast } from "./src/toast-life";
import { SpawnKeyRepeater } from "./src/spawn-keys";
import { parseAquariumCommand } from './src/commands';
import { OceanEngine } from './src';
import { dramatic, flavor, pickLine, bossPresence, isBoss, isGhost, isClash, oneLine, toastText } from './src/lines';
const engine = new OceanEngine(document.querySelector('canvas')!, [
  { kind: 'hammerhead', size: 0.8 }, { kind: 'sawshark', size: 0.95 }, { kind: 'nurse', size: 0.7 }, { kind: 'mako', size: 0.6 },
]);
type Source = {
  active: number;
  stale: number;
  lastFinished: number;
  seen: boolean;
  attention: number;
  planAt: number;
  subagentAt?: number;
};
type State = {
  claude: Source;
  codex: Source;
  sessions: { source: "claude" | "codex"; id: string }[];
};
const message = document.querySelector('#message')!;
let initialized = false;
let lastFinished = 0;
let lastPlan = 0;
const lastSignals = { claude: { subagent: 0, attention: false, finished: 0 }, codex: { subagent: 0, attention: false, finished: 0 } };
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
  if (cat.complete)
    g.drawImage(cat, 0, 0, 64, 64);
  const dots: [
    number,
    number,
    string
  ][] = [];
  if (badges.claude)
    dots.push([48, 48, '224,123,60']);
  if (badges.codex)
    dots.push([badges.claude ? 16 : 48, 48, '180,139,230']);
  for (const [x, y, rgb] of dots) {
    const glow = g.createRadialGradient(x, y, 4, x, y, 20);
    glow.addColorStop(0, `rgba(${rgb},${0.55 + 0.3 * pulse})`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = glow;
    g.fillRect(x - 20, y - 20, 40, 40);
    g.fillStyle = '#071216';
    g.beginPath();
    g.arc(x, y, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = `rgb(${rgb})`;
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.fill();
  }
  iconLink.href = iconCanvas.toDataURL('image/png');
}
cat.onload = drawIcon;
function setBadges(claude: boolean, codex: boolean) {
  if (claude === badges.claude && codex === badges.codex)
    return;
  badges = { claude, codex };
  clearInterval(pulseTimer);
  pulse = 0;
  if (claude || codex)
    pulseTimer = setInterval(() => { pulse = 1 - pulse; drawIcon(); }, 900);
  drawIcon();
  try {
    void ((navigator as any).setAppBadge?.call(navigator) ?? null);
    if (!claude && !codex)
      void (navigator as any).clearAppBadge?.();
  }
  catch { }
}
async function refresh() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok)
      throw new Error('Offline');
    const state: State = await response.json();
    const active = state.claude.active + state.codex.active;
    const stale = state.claude.stale + state.codex.stale;
    const finished = Math.max(state.claude.lastFinished, state.codex.lastFinished);
    if (initialized && finished > lastFinished && Date.now() - finished < 15000) {
      celebrationUntil = Date.now() + 4500;
      engine.celebrate();
    }
    // A plan was just presented: the whale glides through.
    const plan = Math.max(state.claude.planAt, state.codex.planAt);
    if (initialized && plan > lastPlan && Date.now() - plan < 15000 && engine.trigger('whale') === 'started')
      showToast('a plan is ready!');
    lastPlan = plan;
    // Anything waiting on you rings from its dot until you answer.
    engine.setAttention(state.claude.attention > 0, state.codex.attention > 0);
    for (const name of ['claude', 'codex'] as const) {
      const source = state[name], last = lastSignals[name];
      const child = source.subagentAt || 0;
      if (initialized) {
        if (source.attention > 0 && !last.attention)
          engine.activityPulse(name, 'question');
        if (child > last.subagent && Date.now() - child < 15000)
          engine.activityPulse(name, 'subagent');
        if (source.lastFinished > last.finished && Date.now() - source.lastFinished < 15000)
          engine.activityPulse(name, 'done');
      }
      last.attention = source.attention > 0;
      last.subagent = child;
      last.finished = source.lastFinished;
    }
    // Both assistants working at once: a bait ball frenzy, once per overlap.
    if (state.claude.active > 0 && state.codex.active > 0) {
      bothSince ||= Date.now();
      if (!bothFired && Date.now() - bothSince > 4000) {
        bothFired = true;
        if (engine.trigger('bait') === 'started')
          showToast('two at once!');
      }
    }
    else {
      bothSince = 0;
      bothFired = false;
    }
    initialized = true;
    lastFinished = finished;
    engine.setWorking(active > 0);
    engine.setWorkers(state.sessions ?? []);
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
  }
  catch {
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
// Keys (any casing, all optional: every event also runs on its own): H a random shark swims in, / command line, Tab the last 15 events, I alien invasion, S maelstrom, O jellyfish bloom, P great migration, B blood moon, E meteor shower, K kraken, M megalodon, C kraken + megalodon, R chase, Q bait ball, J jellyfish, W whale, V whirlpool, F fight, U ufo, D diver, Y yeat mode (again to end), N nightfall, G ghost leviathan, T thunderstorm, X submarine.
const keyEvents: Record<string, [
  Parameters<typeof engine.trigger>[0],
  string
]> = {
  i: ['invasion', 'the aliens are invading!'],
  z: ['mothership', 'the mothership has eclipsed the surface...'],
  l: ['current', 'living light drifts through the deep...'],
  k: ['kraken', "you feel like you're being watched..."], m: ['mega', 'something stirs from below...'], c: ['saga', 'the deep has awoken...'],
  r: ['chase', 'a chase! run, little fish, run!'], q: ['bait', 'a bait ball forms... dinner is served!'], j: ['jelly', 'jellyfish drifting in... glowing softly~'],
  a: ['smite', 'smite happens.'],
  t: ['storm', 'thunder rolls over the sea...'],
  w: ['whale', 'a whale is coming... listen closely...'], v: ['whirl', 'a whirlpool opens... hold on!'], n: ['night', 'night falls... sweet dreams~'],
  f: ['fight', 'a fight breaks out! teeth out!'], b: ['moon', 'the sky darkens...'], s: ['maelstrom', 'the sea begins to turn...'], o: ['bloom', 'a faint glow rises from below...'], p: ['migration', 'the whole sea starts to move...'], e: ['meteor', 'something burns across the sky!'], u: ['ufo', 'something hovers above... we are not alone...'], d: ['diver', 'a diver slips in... what could go wrong?'], y: ['yeat', ''],
  g: ['leviathan', 'something vast stirs below...'], x: ['sub', 'a submarine dips in...'],
};
// Pressing D again and again gets a different line every time, and the lines get more resigned the longer it goes on.
const DIVER_LINES = ['a diver arrives with a very small fish for the very large predator...','he tells the shark to calm down. it is not calm...','a diver jumps in without looking. the sea looks back...','he brought a ruler to measure the megalodon...','a diver whistles for the kraken like it is a dog...','he checks his oxygen. he checks his courage. one is lower...','a diver waves goodbye to the surface early...','he heard there was treasure down here. there is. it is him...','a diver tries to make friends with the nearest shark. bold...','he tips the boat captain. the boat captain looks sorry...','a diver swims in a perfect straight line. toward the teeth...','he says the water is lovely. the water is listening...','a diver arrives with a snorkel. the wrong sea for that...','he tells everyone it is just a little shark. it is not...','a diver takes a selfie with the abyss behind him...','he reads the signs. the signs say do not enter. he enters...','a diver sprints in slow motion. it does not help...','he left the stove on. he will not be going home to it...',
  'a diver slips in... what could go wrong?', 'another diver. brave. or lost.', 'splash! a diver arrives.', 'he says he knows what he is doing...',
  'a diver jumps in, camera first.', 'fresh from the boat, still dry behind the ears.', 'someone should really warn him.', 'he waves at the sharks. oh no.',
  'a diver descends with great confidence.', 'a wild diver appears!', 'he brought snacks. for the sharks, apparently.', 'this one has a plan. it is not a good plan.',
  'he is here for the photos. the sharks are here for him.', 'a diver arrives, humming. oblivious.', 'he checked the forecast. not the food chain.', 'a diver sinks in, tank gleaming.',
  'he whispers: "they look friendly."', 'brave little diver, big wide ocean.', 'he practised for this. mostly in a pool.', 'a diver arrives. the water goes quiet.',
  'the diver doubles his tip to the boat captain. a good sign?', 'he pats a shark. the shark allows it. for now.', 'a diver in a very bright suit. subtle.', 'he forgot something on the boat. his sense, probably.',
  'a diver rolls in backwards, as is tradition.', 'he is "just popping down for a minute."', 'the diver gives a thumbs up. to the megalodon.', 'one more for the logbook... if he returns.',
  'a diver drifts in, eyes shut, vibes high.', 'he brought a tiny flag to plant on the seabed.', 'a diver arrives and immediately loses a flipper.', 'he is here to find himself. at the bottom.', 'a diver waves at the camera. there is no camera.', 'he read half the safety manual. the fun half.', 'he came for the coral. the coral is not the issue.',
  'he tapped the glass. wrong side...', 'a diver descends, whistling. the sharks recognise the tune...', 'he has a spare tank. he does not have a spare plan...', 'a diver arrives with a selfie stick. bold...',
  'he is certain the big one is a dolphin...', 'a diver takes the long way down. the long way is toward the megalodon...', 'he gives the kraken a friendly wave. it waves back. that is the problem...', 'a diver hums the jaws theme. unprompted...',
  'he promised his mother he would be careful...', 'a diver checks his watch. the sharks check him...', 'he brought a sandwich. the sharks have noticed...', 'a diver glides in like he owns the place. the sharks disagree...',
  'he left a note on the boat. it says "back soon"...', 'a diver counts the sharks. he runs out of fingers...', 'he is here for the vibes. the vibes are hungry...', 'a diver pets a jellyfish. a lesson, delivered...',
  'his flippers are on the wrong feet. he has not noticed...', 'a diver takes a bow for no one...', 'he saw a documentary once. that is the whole résumé...', 'a diver dives in to "check on something"...',
  'he is humming. the whale is humming back. this is fine...', 'a diver arrives and the fish quietly leave...', 'he whispers a goodbye to the surface...', 'a diver cannonballs in. subtle...',
];
const DIVER_SPAM = ['the sea is running out of room for divers.','the boat has stopped counting.','they keep coming. the sharks keep eating.','a conga line of divers into the deep.','the megalodon is going to need a bigger appetite.','at this rate the reef is a restaurant.','the lifeguard has quit.','more divers...?', 'the boat is just throwing them in now.', 'is anyone counting these?', 'the sharks have started taking numbers.', 'at this point it is a buffet.', 'the horror of man!', 'please. stop. they have families.'];
const DIVER_FULL = ['the boat is out of divers... and the sea is out of room.','no vacancies in the water.','the divers have filled the tank to the brim.','no more divers... :(', 'the water is full of divers!', 'there is no room left to drown in...', 'the divers are going to need a bigger tank.'];
let lastDiverLine = '';
let diverStreak = 0;
let lastDiverAt = 0;
function diverToast(result: string) {
  const now = Date.now();
  diverStreak = now - lastDiverAt < 6000 ? diverStreak + 1 : 0;
  lastDiverAt = now;
  const pool = result === 'full' ? DIVER_FULL : diverStreak >= 4 && Math.random() < 0.6 ? DIVER_SPAM : DIVER_LINES;
  const lines = pool.filter((l) => l !== lastDiverLine);
  lastDiverLine = lines[Math.floor(Math.random() * lines.length)];
  return lastDiverLine;
}
// Each toast gets a tone, a small glyph and its own entrance, so a quick run of them does not read as one grey line.
const TONES: [
  RegExp,
  string,
  string
][]= [
    [/^claude /i, 'claude', '>>> '],
    [/^codex /i, 'codex', '>>> '],
    [/lightning|thunder|skeleton|reactor|supercharged|jellyfish.*volt|see-through|sky.*equipment|odds|electric chemistry|glow.*welcome|charged.*visit/i, 'event', '*** '],
    [/meteor|fire|burn|falling|streaks|make a wish|bomb|boom|kaboom|blast|dud|blew up|fumbled/i, 'fire', '*** '],
    [/^(?!.*diver).*(shark|hammerhead|mako|thresher|nurse|zebra|tiger|pack)/i, 'shark', '>< '],
    [/eaten|crushed|swallowed|lost|horror|ow. just|gone. just|boom|squeezed|ate /i, 'danger', '(!) '],
    [/really...|wow|oh come on|well. that|bold of him|nobody saw|did he really|he was warned|he lit it|counting|buffet|taking numbers|brave|warn him|plan is not/i, 'quip', '(?) '],
    [/invad|aliens|ufo|saucer|mothership|diver/i, 'alien', '<o> '],
    [/whale|song/i, 'whale', '~o~ '],
    [/repelled|safe|saved|crossed|made it|freed|rally/i, 'good', '(+) '],
    [/light|glow|jelly|ribbon|luminous|shimmer|reef/i, 'glow', '*~ '],
    [/maelstrom|whirl|storm|moon|meteor|titans|clash|kraken|megalodon|bloom|migration|herd|leviathan|torpedo|roar|submarine|sonar|individual lives return/i, 'event', '>>> '],
  ];
const SPECIAL: Record<string, string> = {};
// Diver quips keep their punchlines: everything else is cut to one sentence.
const QUIP = new RegExp(TONES.find(([, tone]) => tone === 'quip')![0].source + '|lightning|skeleton|reactor|core.*critical|sky.*equipment|odds|thunder.*applaud|jellyfish.*volt|electric chemistry|glow.*welcome|charged.*visit', 'i');
// Important outcomes take priority; repeated commands share a counted row.
const log = document.createElement('div');
log.id = 'toasts';
document.body.append(log);
const LOG_MAX = 4;
const lives = new WeakMap<HTMLElement, Animation>();
// The last 15 major moments, kept for the Tab history (diver quips and plain chatter stay out of it).
const HISTORY_MAX = 15;
const history: {
  text: string;
  tone: string;
  at: number;
}[] = [];
const commandPrompt = document.createElement('input');
commandPrompt.id = 'command-prompt';
commandPrompt.type = 'text';
commandPrompt.autocomplete = 'off';
commandPrompt.spellcheck = false;
commandPrompt.placeholder = '';
commandPrompt.addEventListener('input', () => { commandPrompt.style.width = `${Math.max(1, Math.min(32, commandPrompt.value.length + 1))}ch`; });
commandPrompt.setAttribute('aria-label', 'Entry');
document.body.append(commandPrompt);
function runAquariumCommand(text: string) {
  const kind = parseAquariumCommand(text);
  if (!kind)
    return 'unknown';
  return engine.trigger(kind);
}
Object.defineProperty(window, 'aquarium', { value: Object.freeze({ command: runAquariumCommand }), configurable: true });
commandPrompt.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape' || (e.key === '/' && !commandPrompt.value)) {
    e.preventDefault();
    commandPrompt.classList.remove('open');
    historyPanel.classList.remove('open');
    commandPrompt.blur();
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    commandPrompt.classList.remove('open');
    commandPrompt.blur();
    historyPanel.classList.toggle('open');
    renderHistory();
    return;
  }
  if (e.key !== 'Enter')
    return;
  const result = runAquariumCommand(commandPrompt.value);
  commandPrompt.value = '';
  commandPrompt.style.width = '1ch';
  if (result === 'unknown' || result === 'off')
    return;
  commandPrompt.classList.remove('open');
  historyPanel.classList.remove('open');
  commandPrompt.blur();
});
const historyPanel = document.createElement('div');
historyPanel.id = 'history';
document.body.append(historyPanel);
function recordHistory(text: string, tone: string) {
  const last = history[history.length - 1];
  if (last && last.text === text && Date.now() - last.at < 4000)
    return;
  history.push({ text, tone, at: Date.now() });
  if (history.length > HISTORY_MAX)
    history.shift();
  if (historyPanel.classList.contains('open'))
    renderHistory();
}
function renderHistory() {
  // The same lines, in the same spot and size as the live toasts, just held in place with no fade, header or ages.
  historyPanel.replaceChildren();
  for (const h of history) {
    const row = document.createElement('div');
    row.className = 'toast t-' + h.tone;
    row.textContent = toastText(h.text,h.tone);
    historyPanel.append(row);
  }
}
// Toasts flood in through a queue: each fresh line gets its own row and the next one follows a beat later. A "×n" only
// appears when the queue backs up past its cap, so identical keys merge instead of piling up.
const QUEUE_CAP = 8;
const pending: { text: string; forced?: string; key: string; whole: boolean; count: number; at: number }[] = [];
function showToast(text: string, forced?: string, key = text, whole = false) {
  const queued = pending.length >= QUEUE_CAP ? pending.find((p) => p.key === key) : undefined;
  if (queued) { queued.count++; return; }
  if (pending.length >= QUEUE_CAP * 2) pending.shift();
  pending.push({ text, forced, key, whole, count: 1, at: performance.now() });
}
function onScreen(text: string) {
  return [...log.children].some((c) => (c as HTMLElement).dataset.text === text) || pending.some((p) => p.text === text);
}
/** Pick a wording that is not already on screen or waiting, so a run of one event never shows the same sentence twice. */
function freshLine(make: () => string) {
  let line = make();
  for (let i = 0; i < 6 && onScreen(line); i++) line = make();
  return line;
}
function presentToast(item: { text: string; forced?: string; key: string; whole: boolean; count: number }) {
  let { text } = item;
  const { forced, key, whole, count } = item;
  if (!whole && !QUIP.test(text))
    text = oneLine(text);
  // An identical sentence already on screen is refreshed with a count rather than shown twice.
  const same = [...log.children].find((c) => (c as HTMLElement).dataset.text === text) as HTMLElement | undefined;
  if (same) {
    const n = Number(same.dataset.count ?? 1) + count;
    same.dataset.count = String(n);
    let badge = same.querySelector('b');
    if (!badge) {
      badge = document.createElement('b');
      same.append(badge);
    }
    badge.textContent = ' ×' + n;
    try {
      lives.get(same)?.cancel();
      expireToast(same,lives);
      same.animate([{ transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    }
    catch { /* the line simply stays */ }

    log.append(same);
    return true;
  }
  const [, tone] = (text === 'Disgusting...' || text === 'Congratulations...') ? [0, 'eoe', ''] : forced ? [0, forced, SPECIAL[forced] ?? ''] : isGhost(text) ? [0, 'ghost', ''] : isClash(text) ? [0, 'clash', '!!! '] : isBoss(text) ? [0, 'boss', '!!! '] : TONES.find(([re]) => re.test(text)) ?? [0, 'plain', ''];
  const priority = ['boss', 'clash', 'ghost', 'eoe'].includes(tone) ? 3 : /destroy|lost|death|rescue|free|breach|crush|core/i.test(text) ? 2 : 1;
  if (log.children.length >= LOG_MAX && [...log.children].every(c => Number((c as HTMLElement).dataset.priority ?? 0) > priority)) return false;
  const capMilestone = forced === 'rainbow' || forced === 'insist';
  const diverChatter = whole || [...DIVER_LINES, ...DIVER_SPAM, ...DIVER_FULL].some(line => line === text || oneLine(line) === text);
  if (capMilestone || (!diverChatter && tone !== 'quip' && tone !== 'plain' && !forced))
    recordHistory(text, tone);
  const el = document.createElement('div');
  el.className = 'toast t-' + tone;
  // Preserve classification while presenting the quiet lowercase boss voice.
  el.textContent = toastText(text,tone);
  el.dataset.key = key;
  el.dataset.text = text;
  el.dataset.count = String(count);
  el.dataset.priority = String(priority);
  if (count > 1) { const badge = document.createElement('b'); badge.textContent = ' ×' + count; el.append(badge); }
  log.append(el);
  while (log.children.length > LOG_MAX) {
    const lowest = [...log.children].reduce((a, b) => Number((a as HTMLElement).dataset.priority ?? 0) <= Number((b as HTMLElement).dataset.priority ?? 0) ? a : b);
    lives.get(lowest as HTMLElement)?.cancel();
    lowest.remove();
  }
  try {
    // Danger shakes, quips drop in, everything else slides up; then a long hold and a slow fade.
    const enter = tone === 'danger'
      ? [{ transform: 'translateX(-6px)', opacity: 0 }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none', opacity: 1 }]
      : tone === 'quip' ? [{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'none', opacity: 1 }]
        : [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }];
    el.animate(enter, { duration: tone === 'danger' ? 340 : 260, easing: 'ease-out' });
    expireToast(el,lives);
  }
  catch { expireToast(el,lives); }
  return true;
}
// One queued toast every beat; a full, higher-priority log makes the next one wait (and give up after a few seconds).
setInterval(() => {
  const item = pending[0];
  if (!item) return;
  if (presentToast(item) || performance.now() - item.at > 6000) pending.shift();
}, 420);

setInterval(() => {
  for (let n = engine.takeNotice(); n; n = engine.takeNotice()) {
    const line = freshLine(() => { const l = flavor(n); return dramatic(l, QUIP.test(l)); });
    showToast(line, undefined, n);
  }
}, 400);
// The window is a fixed little tank: no browser zoom and no find bar. F11 and the window buttons are untouched.
const spawnKeys = new SpawnKeyRepeater();
addEventListener('keyup', e => spawnKeys.release(e.key));
addEventListener('blur', () => spawnKeys.clear());
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (['+', '-', '=', '_', '0', 'f', 'F'].includes(e.key) || e.code === 'NumpadAdd' || e.code === 'NumpadSubtract' || e.code === 'Numpad0'))
    e.preventDefault();
}, { capture: true });
addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey)
    e.preventDefault();
}, { passive: false });
for (const g of ['gesturestart', 'gesturechange', 'gestureend'])
  addEventListener(g, e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLElement && e.target.closest('input,select,textarea'))) {
    e.preventDefault();
    historyPanel.classList.remove('open');
    commandPrompt.classList.add('open');
    commandPrompt.focus();
  }
  else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.repeat && !document.querySelector('#panel.open') && !(e.target instanceof HTMLElement && e.target.closest('input,select,textarea'))) {
    e.preventDefault();
    historyPanel.classList.toggle('open');
    commandPrompt.classList.remove('open');
    renderHistory();
  }
  else if (e.key === 'Escape') {
    historyPanel.classList.remove('open');
    commandPrompt.classList.remove('open');
  }
  else if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLElement && e.target.closest('button,input,select,textarea'))) {
    if (!spawnKeys.accept('h', e.repeat, performance.now())) return;
    if (engine.spawnShark() === 'full')
      showToast('the tank is wall to wall with sharks...', 'shark');
  }
});
const WHALE_LIMIT_LINES = ["two whales are already passing through...", "the whale duet is already complete...", "two sets of flukes. give them a little water...", "the whales have filled both seats in the choir..."];
const YEAT_OFF_LINES = ["the bass fades into the deep...", "the sea remembers its colors...", "the reactor settles. the ocean exhales...", "the last pulse slips beneath the water..."];
const manualPresses = new Map<string, { count: number; at: number; line: number }>();
const REPEAT_LINES: Partial<Record<Parameters<typeof engine.trigger>[0], string[]>> = {
  chase: ['another chase! swim, little fish!', 'more fish make a run for it...', 'the chase has company.', 'the sharks are working overtime.'],
  current: ['more living light drifts through...', 'the glowing tide lingers a little longer.', 'another ribbon of light joins the current.', 'the deep keeps its lights on.'],
  night: ['night settles over the sea again...', 'a little more darkness. a little more glow.', 'the deep takes another midnight breath.', 'the night shift is still here.'],
  invasion: ['more alien reinforcements arrive...', 'the invasion has another wave.', 'someone called for more saucers.', 'the sky gets a little busier.'],
  storm: ['more thunder... the sky is showing off.', 'another electrical problem rolls in.', 'the ocean has become a very bad place for a metal tank.', 'the lightning has a connecting flight.'],
  whirl: ['another whirlpool opens... the sea has a drain problem.', 'more spinning water. fewer escape routes.', 'the whirlpools are taking over.', 'hold on... that current has company.'],
  whale: ['another whale swims in... make a little room.', 'the whale choir has another voice~', 'more flukes on the horizon~', 'a whale heard the others singing~'],
  ufo: ['another saucer... apparently word got out.', 'the sky has a parking problem.', 'more visitors. nobody brought an invitation.', 'the aliens keep sending reinforcements.'],
  sub: ['another submarine dives in...', 'the deep is getting rush-hour traffic.', 'more periscopes. less personal space.', 'someone sent another research team.'],
  jelly: ['more jellyfish... watch where you swim.', 'the glow has reinforcements~', 'another little fleet of stings.', 'the sea has become a lava lamp.'],
  bait: ['another bait ball gathers... dinner has options.', 'the fish form another emergency meeting.', 'more fish, more circling teeth.', 'the buffet has opened another table.'],
  fight: ['another pair squares off... teeth out.', 'more sharks have a disagreement.', 'the undercard has started.', 'another circle of very bad intentions.'],
  meteor: ['more meteors... the sky is not finished.', 'another shower. none of it is rain.', 'keep looking up. actually, swim.', 'the sky has more rocks to throw.'],
  maelstrom: ['another storm rolls in... brace yourself.', 'the ocean has started arguing with itself.', 'more funnels. nowhere dry to stand.', 'the current has reinforcements.'],
  migration: ['another herd swims in... a busy crossing.', 'the migration has another wave.', 'more travelers. the sharks noticed.', 'the whole sea seems to be going somewhere.'],
  bloom: ['another glowing tide rises...', 'the jellyfish bloom gets company.', 'more lights. mind the stings.', 'the deep has ordered extra glow.'],
};
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && e.target.closest('button,input,select,textarea')))
    return;
  const entry = keyEvents[e.key.toLowerCase()];
  if (!entry)
    return;
  if (!spawnKeys.accept(e.key, e.repeat, performance.now())) return;
  const result = engine.trigger(entry[0]);
  if (result === 'already' && entry[0] === 'whale') { showToast(pickLine(WHALE_LIMIT_LINES), undefined, "limit:whale"); return; }
  if (result === 'already' && ['kraken','mega','mothership','leviathan','saga'].includes(entry[0])) {
    showToast(bossPresence(entry[0]), undefined, `limit:${entry[0]}`);return;
  }
  const previous = manualPresses.get(entry[0]);
  const press = previous && performance.now() - previous.at < 20000 ? previous : { count: 0, at: 0, line: 0 };
  press.count++; press.at = performance.now(); manualPresses.set(entry[0], press);
  const repeats = REPEAT_LINES[entry[0]];
  if (result === 'started' && press.count > 1 && repeats) {
    showToast(repeats[press.line++ % repeats.length], undefined, `command:${entry[0]}:started`);
    return;
  }
  // The world owns any entrance it announces; the key supplies a fallback only.
  if (result === 'started' && engine.triggerAnnounced)
    return;
  if (entry[0] === 'diver' && (result === 'started' || result === 'full')) {
    showToast(diverToast(result), undefined, `command:diver:${result}`, true);
    return;
  }
  if (result === 'cake') {
    showToast('let them have their cake!', 'rainbow');
    return;
  }
  if (result === 'insist') {
    showToast('fine...if you insist...', 'insist');
    return;
  }
  showToast(result === 'ended' ? pickLine(YEAT_OFF_LINES) : result === 'queued' ? 'queued up...' : result === 'full' ? (entry[0] === 'sub' ? 'the sea has enough submarines...' : 'no more divers... :(') : result === 'started' ? oneLine(flavor(entry[1])) : result === 'already' ? `${entry[0] === 'saga' ? 'the titan clash' : entry[0]} is already here... one is plenty.` : result === 'off' ? 'turned off in opts...' : 'not enough room right now...', undefined, `command:${entry[0]}:${result}`);
});
// Options panel: a few cycling toggles, plus an events list where each event can be ticked on or off. Remembered between runs.
type EventKind = Parameters<typeof engine.trigger>[0];
const eventCatalog: [
  EventKind,
  string
][] = [
    ['current', 'living light'], ['whale', 'whales'], ['jelly', 'jellyfish'], ['bloom', 'jellyfish bloom'], ['migration', 'great migration'],
    ['smite', 'manual lightning'], ['storm', 'thunderstorm'], ['whirl', 'whirlpool'], ['maelstrom', 'maelstrom'], ['meteor', 'meteor shower'], ['moon', 'blood moon'], ['kraken', 'kraken'],
    ['mega', 'megalodon'], ['saga', 'titans clash'], ['ufo', 'flying saucers'], ['diver', 'divers'], ['chase', 'chases'],
    ['leviathan', 'ghost leviathan'], ['sub', 'submarines'], ['mothership', 'mothership'], ['invasion', 'alien invasion'],
    ['bait', 'bait balls'], ['fight', 'shark duels'], ['night', 'nightfall events'], ['yeat', 'yeat mode'],
  ];
const choices: Record<string, string[]> = { events: ['off', 'calm', 'normal', 'busy'], lighting: ['auto', 'day', 'night'], motion: ['smooth', 'saver'], quality: ['auto', 'high', 'saver'], speed: ['1x', '2x', '4x'], eventBars: ['one', 'more'] };
const chosen: Record<string, string> = { events: 'normal', lighting: 'auto', motion: 'smooth', quality: 'auto', speed: '1x', eventBars: 'one' };
const enabled: Record<string, boolean> = {};
try {
  const saved = JSON.parse(localStorage.getItem('aq-options') || '{}');
  if (!saved.lighting && saved.night)
    saved.lighting = saved.night === 'off' ? 'day' : 'auto';
  for (const key of Object.keys(choices))
    if (choices[key].includes(saved?.[key]))
      chosen[key] = saved[key];
}
catch { /* Invalid preferences fall back to defaults. */ }
try {
  const stored = JSON.parse(localStorage.getItem('aq-events') || '{}');
  for (const [kind] of eventCatalog)
    enabled[kind] = stored?.[kind] !== false;
}
catch { /* Invalid preferences fall back to defaults. */ }
const panel = document.querySelector<HTMLElement>('#panel')!;
const eventList = document.querySelector<HTMLElement>('#event-list')!;
const eventsButton = document.querySelector<HTMLButtonElement>('#event-toggle')!;
for (const [kind, name] of eventCatalog) {
  engine.setEventEnabled(kind, enabled[kind]);
  const row = document.createElement('label');
  row.className = 'event-row';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = enabled[kind];
  const text = document.createElement('span');
  text.textContent = name;
  row.append(box, text);
  eventList.append(row);
  box.addEventListener('change', () => {
    enabled[kind] = box.checked;
    engine.setEventEnabled(kind, box.checked);
    try {
      localStorage.setItem('aq-events', JSON.stringify(enabled));
    }
    catch { }
  });
}
eventsButton.addEventListener('click', () => {
  const open = eventList.classList.toggle('open');
  eventsButton.querySelector('b')!.textContent = open ? 'hide' : 'show';
  eventsButton.setAttribute('aria-expanded', String(open));
  if (open) toggleKeys(false);
});
const keyList = document.querySelector<HTMLElement>('#key-list')!;
const keysButton = document.querySelector<HTMLButtonElement>('#key-toggle')!;
const eventNames = new Map(eventCatalog);
const shortcuts: [string, string][] = [
  ['h', 'another shark'],
  ...Object.entries(keyEvents).map(([key, [kind]]) => [key, eventNames.get(kind) ?? kind] as [string, string]),
  ['Tab', 'event history'], ['/', 'command prompt'], ['Escape', 'close panels'],
];
for (const [key, label] of shortcuts) {
  const row = document.createElement('button');
  row.type = 'button';
  const name = document.createElement('span'); name.textContent = label;
  const badge = document.createElement('kbd'); badge.textContent = key === 'Escape' ? 'Esc' : key.length === 1 ? key.toUpperCase() : key;
  row.append(name, badge);
  row.title = `${label} (${badge.textContent})`;
  row.addEventListener('click', () => {
    panel.classList.remove('open');
    window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
  });
  keyList.append(row);
}

function toggleKeys(open: boolean) {
  keyList.classList.toggle('open', open);
  keysButton.querySelector('b')!.textContent = open ? 'hide' : 'show';
  keysButton.setAttribute('aria-expanded', String(open));
  if (open) {
    eventList.classList.remove('open');
    eventsButton.querySelector('b')!.textContent = 'show';
    eventsButton.setAttribute('aria-expanded', 'false');
  }
}
keysButton.addEventListener('click', () => toggleKeys(!keyList.classList.contains('open')));
function applyOptions() {
  engine.setEventLevel(chosen.events as 'off' | 'calm' | 'normal' | 'busy');
  engine.setLighting(chosen.lighting as 'auto' | 'day' | 'night');
  engine.setFps(chosen.motion === 'saver' ? 15 : 30);
  engine.setSpeed(parseInt(chosen.speed, 10) || 1);
  engine.setQuality(chosen.quality as 'auto' | 'high' | 'saver');
  engine.setEventBars(chosen.eventBars as 'one' | 'more');
  panel.querySelectorAll<HTMLButtonElement>('button[data-opt]').forEach(button => { button.querySelector('b')!.textContent = chosen[button.dataset.opt!]; });
  try {
    localStorage.setItem('aq-options', JSON.stringify(chosen));
  }
  catch { }
}
panel.querySelectorAll<HTMLButtonElement>('button[data-opt]').forEach(button => button.addEventListener('click', () => {
  const list = choices[button.dataset.opt!];
  chosen[button.dataset.opt!] = list[(list.indexOf(chosen[button.dataset.opt!]) + 1) % list.length];
  applyOptions();
}));
document.querySelector('#opts')!.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); });
addEventListener('click', e => {
  if (!panel.contains(e.target as Node))
    panel.classList.remove('open');
});
addEventListener('keydown', e => {
  if (e.key === 'Escape')
    panel.classList.remove('open');
});
applyOptions();
