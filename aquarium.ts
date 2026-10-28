import { parseAquariumCommand } from './src/commands';
import { OceanEngine } from './src';
import { dramatic, flavor, isBoss, isGhost, isClash, oneLine } from './src/lines';

const engine = new OceanEngine(document.querySelector('canvas')!, [
  { kind: 'hammerhead', size: 0.8 }, { kind: 'sawshark', size: 0.95 }, { kind: 'nurse', size: 0.7 }, { kind: 'mako', size: 0.6 },
]);
type Source = { active: number; stale: number; lastFinished: number; seen: boolean; attention: number; planAt: number; subagentAt?: number };
type State = { claude: Source; codex: Source };
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
    // A plan was just presented: the whale glides through.
    const plan = Math.max(state.claude.planAt, state.codex.planAt);
    if (initialized && plan > lastPlan && Date.now() - plan < 15000 && engine.trigger('whale') === 'started') showToast('a plan is ready!');
    lastPlan = plan;
    // Anything waiting on you rings from its dot until you answer.
    engine.setAttention(state.claude.attention > 0, state.codex.attention > 0);
    for (const name of ['claude', 'codex'] as const) {
      const source = state[name], last = lastSignals[name];
      const child = source.subagentAt || 0;
      if (initialized) {
        if (source.attention > 0 && !last.attention) engine.activityPulse(name, 'question');
        if (child > last.subagent && Date.now() - child < 15000) engine.activityPulse(name, 'subagent');
        if (source.lastFinished > last.finished && Date.now() - source.lastFinished < 15000) engine.activityPulse(name, 'done');
      }
      last.attention = source.attention > 0; last.subagent = child; last.finished = source.lastFinished;
    }
    // Both assistants working at once: a bait ball frenzy, once per overlap.
    if (state.claude.active > 0 && state.codex.active > 0) {
      bothSince ||= Date.now();
      if (!bothFired && Date.now() - bothSince > 4000) { bothFired = true; if (engine.trigger('bait') === 'started') showToast('two at once!'); }
    } else { bothSince = 0; bothFired = false; }
    initialized = true;
    lastFinished = finished;
    engine.setWorking(active > 0);
    engine.setWorkers(state.claude.active > 0, state.codex.active > 0);
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

// Keys (any casing, all optional: every event also runs on its own): H a random shark swims in, / the last 15 events, S maelstrom, G jellyfish bloom, P great migration, O blood moon, E meteor shower, K kraken, M megalodon, C kraken + megalodon, R chase, B bait ball, J jellyfish, W whale, V whirlpool, F fight, U ufo, D diver, Y yeat mode (again to end), N nightfall, T ghost leviathan, X submarine.
const keyEvents: Record<string, [Parameters<typeof engine.trigger>[0], string]> = {
  z: ['mothership', 'the mothership has eclipsed the surface...'],
  l: ['current', 'living light drifts through the deep...'],
  k: ['kraken', "you feel like you're being watched..."], m: ['mega', 'something stirs from below...'], c: ['saga', 'the deep has awoken...'],
  r: ['chase', 'a chase! run, little fish, run!'], b: ['bait', 'a bait ball forms... dinner is served!'], j: ['jelly', 'jellyfish drifting in... glowing softly~'],
  w: ['whale', 'a whale is coming... listen closely...'], v: ['whirl', 'a whirlpool opens... hold on!'], n: ['night', 'night falls... sweet dreams~'],
  f: ['fight', 'a fight breaks out! teeth out!'], o: ['moon', 'the sky darkens...'], s: ['maelstrom', 'the sea begins to turn...'], g: ['bloom', 'a faint glow rises from below...'], p: ['migration', 'the whole sea starts to move...'], e: ['meteor', 'something burns across the sky!'], u: ['ufo', 'something hovers above... we are not alone...'], d: ['diver', 'a diver slips in... what could go wrong?'], y: ['yeat', ''],
  t: ['leviathan', 'something vast stirs below...'], x: ['sub', 'a submarine dips in...'],
};
// Pressing D again and again gets a different line every time, and the lines get more resigned the longer it goes on.
const DIVER_LINES = [
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
const DIVER_SPAM = ['more divers...?', 'the boat is just throwing them in now.', 'is anyone counting these?', 'the sharks have started taking numbers.', 'at this point it is a buffet.', 'the horror of man!', 'please. stop. they have families.'];
const DIVER_FULL = ['no more divers... :(', 'the water is full of divers!', 'there is no room left to drown in...', 'the divers are going to need a bigger tank.'];
// Saucers and whales get a different line for the first, the second and the cap, and a line never comes round again until its
// whole pool has been used.
const COUNT_LINES: Record<string, string[]> = {
  ufo1: ['something hovers above... we are not alone...', 'a saucer drifts in, humming softly.', 'a light in the sky. it is looking at you.', 'one lonely saucer wanders over.', 'a visitor from above... take me to your fish.'],
  ufo2: ['a second saucer! they brought a friend.', 'two lights now. this is a pattern.', 'the first saucer waves. the second one blinks back.', 'two saucers, one tank. awkward.', 'company arrives... the sky is getting crowded.'],
  ufo3: ['a THIRD saucer... this is an invasion!', 'three saucers! the aliens have a plan.', 'the sky is full of lights... brace yourselves!', 'they came in force. three, and counting.', 'the fleet has arrived!'],
  ufoCap: ['three saucers is the limit... for now.', 'no room left in the sky for another!', 'the saucers are circling. the sky is full.', 'the mothership says: enough, enough.'],
  whale1: ['a whale is coming... listen closely...', 'a low song rolls in from the deep...', 'something huge and gentle glides in.', 'the water hums. a whale approaches.', 'a whale surfaces from the blue...'],
  whale2: ['and here comes a second whale!', 'a duet! two whales now.', 'the first whale calls. the second answers.', 'two whales share the deep.', 'a calf? no, a whole second whale!'],
  whaleCap: ['two whales is the limit...', 'the tank cannot fit a third whale!', 'two whales already. that is plenty.', 'the whales politely decline a third.'],
};
const countDecks: Record<string, string[]> = {};
function countLine(key: string) {
  const deck = countDecks[key] ??= [];
  if (!deck.length) {
    deck.push(...COUNT_LINES[key]);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    // Never the line that closed the previous deck.
    if (deck[deck.length - 1] === lastCountLine[key] && deck.length > 1) deck.unshift(deck.pop()!);
  }
  return (lastCountLine[key] = deck.pop()!);
}
const lastCountLine: Record<string, string> = {};
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
const TONES: [RegExp, string, string][] = [
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
const QUIP = TONES.find(([, tone]) => tone === 'quip')![0];
// Notices stack up bottom-left like a game log: the newest at the bottom, at most five at once, each holding for a while and
// then fading away slowly. The oldest is dropped when a sixth arrives.
const log = document.createElement('div');
log.id = 'toasts';
document.body.append(log);
const LOG_MAX = 5;
const lives = new WeakMap<HTMLElement, Animation>();
// The last 15 major moments, kept for the "/" panel (diver quips and plain chatter stay out of it).
const HISTORY_MAX = 15;
const history: { text: string; tone: string; at: number }[] = [];
const commandPrompt = document.createElement('input');
commandPrompt.id = 'command-prompt'; commandPrompt.type = 'text'; commandPrompt.autocomplete = 'off';
commandPrompt.spellcheck = false; commandPrompt.placeholder = '/ command';
commandPrompt.setAttribute('aria-label', 'Aquarium command');
document.body.append(commandPrompt);
function runAquariumCommand(text: string) {
  const kind = parseAquariumCommand(text);
  if (!kind) return 'unknown';
  return engine.trigger(kind);
}
Object.defineProperty(window, 'aquarium', { value: Object.freeze({ command: runAquariumCommand }), configurable: true });
commandPrompt.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') { commandPrompt.classList.remove('open'); historyPanel.classList.remove('open'); commandPrompt.blur(); return; }
  if (e.key !== 'Enter') return;
  const result = runAquariumCommand(commandPrompt.value);
  commandPrompt.value = '';
  if (result === 'unknown') { showToast('unknown command...'); return; }
  if (result === 'off') { showToast('this event is disabled in settings...'); return; }
  commandPrompt.classList.remove('open'); historyPanel.classList.remove('open'); commandPrompt.blur();
});
const historyPanel = document.createElement('div');
historyPanel.id = 'history';
document.body.append(historyPanel);
function recordHistory(text: string, tone: string) {
  const last = history[history.length - 1];
  if (last && last.text === text && Date.now() - last.at < 4000) return;
  history.push({ text, tone, at: Date.now() });
  if (history.length > HISTORY_MAX) history.shift();
  if (historyPanel.classList.contains('open')) renderHistory();
}
function renderHistory() {
  // The same lines, in the same spot and size as the live toasts, just held in place with no fade, header or ages.
  historyPanel.replaceChildren();
  for (const h of history) {
    const row = document.createElement('div');
    row.className = 'toast t-' + h.tone;
    row.textContent = h.tone === 'boss' || h.tone === 'clash' ? h.text.replace(/!+/g, '').trim() : h.tone === 'whale' ? h.text.replace(/[.!~\s]+$/, '') + '~' : h.text;
    historyPanel.append(row);
  }
}
function showToast(text: string, forced?: string, key = text, whole = false) {
  if (!whole && !QUIP.test(text)) text = oneLine(text);
  // The same line never shows twice: a repeat (say, "already happening!" or a third whale knocking) refreshes the one on
  // screen and bumps its count, so spamming a key adds a "×n" to one line instead of bloating the log.
  const same = [...log.children].find((c) => (c as HTMLElement).dataset.key === key) as HTMLElement | undefined;
  if (same) {
    const n = Number(same.dataset.count ?? 1) + 1;
    same.dataset.count = String(n);
    let badge = same.querySelector('b');
    if (!badge) { badge = document.createElement('b'); same.append(badge); }
    badge.textContent = ' ×' + n;
    try {
      lives.get(same)?.cancel();
      const life = same.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 9000, fill: 'forwards' });
      life.onfinish = () => same.remove();
      lives.set(same, life);
      same.animate([{ transform: 'scale(1.06)' }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
    } catch { /* the line simply stays */ }
    log.append(same);
    return;
  }
  const [, tone] = text === 'Disgusting...' ? [0, 'eoe', ''] : forced ? [0, forced, SPECIAL[forced] ?? ''] : isGhost(text) ? [0, 'ghost', ''] : isClash(text) ? [0, 'clash', '!!! '] : isBoss(text) ? [0, 'boss', '!!! '] : TONES.find(([re]) => re.test(text)) ?? [0, 'plain', ''];
  const capMilestone=forced==='rainbow'||forced==='insist';
  const diverChatter=whole||[...DIVER_LINES,...DIVER_SPAM,...DIVER_FULL].some(line=>line===text||oneLine(line)===text);
  if(capMilestone||(!diverChatter&&tone!=='quip'&&tone!=='plain'&&!forced))recordHistory(text,tone);
  const el = document.createElement('div');
  el.className = 'toast t-' + tone;
  // Boss and clash lines are bare: no leading marks and no exclamation marks (ellipses stay), like an announcement in Terraria.
  el.textContent = tone === 'boss' || tone === 'clash' ? text.replace(/!+/g, '').trim() : tone === 'whale' ? text.replace(/[.!~\s]+$/, '') + '~' : text;
  el.dataset.key = key;
  el.dataset.count = '1';
  log.append(el);
  while (log.children.length > LOG_MAX) log.firstElementChild!.remove();
  try {
    // Danger shakes, quips drop in, everything else slides up; then a long hold and a slow fade.
    const enter = tone === 'danger'
      ? [{ transform: 'translateX(-6px)', opacity: 0 }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none', opacity: 1 }]
      : tone === 'quip' ? [{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'none', opacity: 1 }]
      : [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }];
    el.animate(enter, { duration: tone === 'danger' ? 340 : 260, easing: 'ease-out' });
    const life = el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: 9000, fill: 'forwards' });
    life.onfinish = () => el.remove();
    lives.set(el, life);
  } catch { setTimeout(() => el.remove(), 9000); }
}
setInterval(() => { for (let n = engine.takeNotice(); n; n = engine.takeNotice()) { const line = flavor(n); showToast(dramatic(line, QUIP.test(line)), undefined, n); } }, 400);
// The window is a fixed little tank: no browser zoom and no find bar. F11 and the window buttons are untouched.
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (['+', '-', '=', '_', '0', 'f', 'F'].includes(e.key) || e.code === 'NumpadAdd' || e.code === 'NumpadSubtract' || e.code === 'Numpad0')) e.preventDefault();
}, { capture: true });
addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
for (const g of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(g, e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLElement && e.target.closest('input,select,textarea'))) {
    e.preventDefault();
    const open=historyPanel.classList.toggle('open');
    commandPrompt.classList.toggle('open',open);
    if(open){renderHistory();commandPrompt.focus();}
  } else if (e.key === 'Escape') { historyPanel.classList.remove('open'); commandPrompt.classList.remove('open'); }
  else if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !(e.target instanceof HTMLElement && e.target.closest('button,input,select,textarea'))) {
    if (engine.spawnShark() === 'full') showToast('the tank is wall to wall with sharks...', 'shark');
  }
});
addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || (e.target instanceof HTMLElement && e.target.closest('button,input,select,textarea'))) return;
  const entry = keyEvents[e.key.toLowerCase()];
  if (!entry) return;
  const result = engine.trigger(entry[0]);
  // Yeat mode announces itself with one of its ad-libs (queued by the world, so random starts get one too).
  if (entry[0] === 'yeat' && result === 'started') { showToast(engine.takeNotice() ?? 'lüh twïzzy...'); return; }
  if (entry[0] === 'diver' && (result === 'started' || result === 'full')) { showToast(diverToast(result), undefined, undefined, true); return; }
  if (result === 'cake') { showToast('let them have their cake!', 'rainbow'); return; }
  if (result === 'insist') { showToast('fine...if you insist...', 'insist'); return; }
  if ((entry[0] === 'ufo' || entry[0] === 'whale') && (result === 'started' || result === 'already' || result === 'full')) {
    const n = engine.count(entry[0]);
    const cap = entry[0] === 'ufo' ? 3 : 2;
    // Keyed by the count, so repeat presses at the cap collapse into one line with a count, whichever line it first showed.
    const kind = result === 'started' ? entry[0] + Math.max(1, Math.min(n, cap)) : entry[0] + 'Cap';
    showToast(countLine(kind), undefined, kind);
    return;
  }
  // The kraken, the megalodon and the clash announce themselves from the world, so the key adds no line of its own.
  if (result === 'started' && ['kraken', 'mega', 'saga', 'leviathan', 'mothership', 'eoe'].includes(entry[0])) return;
  showToast(result === 'ended' ? 'yeat mode off...' : result === 'queued' ? 'queued up...' : result === 'full' ? (entry[0] === 'sub' ? 'the sea has enough submarines...' : 'no more divers... :(') : result === 'started' ? oneLine(flavor(entry[1])) : result === 'already' ? 'already happening!' : result === 'off' ? 'turned off in opts...' : 'not enough room right now...');
});

// Options panel: a few cycling toggles, plus an events list where each event can be ticked on or off. Remembered between runs.
type EventKind = Parameters<typeof engine.trigger>[0];
const eventCatalog: [EventKind, string][] = [
  ['current', 'living light'], ['whale', 'whales'], ['jelly', 'jellyfish'], ['bloom', 'jellyfish bloom'], ['migration', 'great migration'],
  ['whirl', 'whirlpool'], ['maelstrom', 'maelstrom'], ['meteor', 'meteor shower'], ['moon', 'blood moon'], ['kraken', 'kraken'],
  ['mega', 'megalodon'], ['saga', 'titans clash'], ['ufo', 'flying saucers'], ['diver', 'divers'], ['chase', 'chases'],
  ['leviathan', 'ghost leviathan'], ['sub', 'submarines'], ['mothership', 'mothership'],
  ['bait', 'bait balls'], ['fight', 'shark duels'], ['night', 'nightfall events'], ['yeat', 'yeat mode'],
];
const choices: Record<string, string[]> = { events: ['off', 'calm', 'normal', 'busy'], lighting: ['auto', 'day', 'night'], motion: ['smooth', 'saver'], quality: ['auto', 'high', 'saver'], speed: ['1x', '2x', '4x'] };
const chosen: Record<string, string> = { events: 'normal', lighting: 'auto', motion: 'smooth', quality: 'auto', speed: '1x' };
const enabled: Record<string, boolean> = {};
try {
  const saved = JSON.parse(localStorage.getItem('aq-options') || '{}');
  if (!saved.lighting && saved.night) saved.lighting = saved.night === 'off' ? 'day' : 'auto';
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
  engine.setLighting(chosen.lighting as 'auto' | 'day' | 'night');
  engine.setFps(chosen.motion === 'saver' ? 15 : 30);
  engine.setSpeed(parseInt(chosen.speed, 10) || 1);
  engine.setQuality(chosen.quality as 'auto' | 'high' | 'saver');
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
