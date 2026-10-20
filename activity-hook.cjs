// Local status only. Never persist stdin, prompts, transcript paths, or responses.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = process.argv[2];
const event = process.argv[3];
const at = Date.now();
const stateDir = process.env.AQUARIUM_STATE_DIR || path.join(__dirname, 'state');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);
let input = '';
let handled = false;
// Some hosts never close stdin, so work from the first complete JSON payload instead of waiting for EOF.
const deadline = setTimeout(() => { handle(); finish(); }, 1200);
function finish() {
  clearTimeout(deadline);
  process.stdout.write('{}\n');
  process.exit(0);
}
function handle() {
  if (handled) return;
  handled = true;
  let lock;
  let lockFd;
  try {
    if (!['claude', 'codex'].includes(source)) return;
    const data = JSON.parse(input || '{}');
    const sessionId = data.session_id || data.sessionId || data.thread_id || data.conversation_id;
    if (!sessionId || data.agent_id) return;
    const key = hash(`${source}:${sessionId}`);
    const turnId = data.turn_id || data.turnId;
    const turn = turnId ? hash(turnId) : null;
    fs.mkdirSync(stateDir, { recursive: true });
    const filename = path.join(stateDir, `${source}-${key}.json`);
    lock = filename + '.lock';
    const waitCell = new Int32Array(new SharedArrayBuffer(4));
    for (let i = 0; i < 40; i++) {
      try { lockFd = fs.openSync(lock, 'wx'); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; Atomics.wait(waitCell, 0, 0, 10); }
    }
    if (lockFd === undefined) return;
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch {}
    if (previous.updatedAt > at) return;
    const starting = event === 'UserPromptSubmit' || event === 'PreToolUse';
    const stopping = ['Stop', 'StopFailure', 'Interrupt', 'SessionEnd'].includes(event);
    // The assistant is waiting on you (a question, a permission prompt, or idle).
    const asking = event === 'Notification' || event === 'PermissionRequest';
    if (!starting && !stopping && !asking) return;
    if (stopping && event !== 'SessionEnd' && turn && previous.turn && turn !== previous.turn) return;
    const record = {
      source, turn: starting ? turn : previous.turn || turn,
      working: asking ? !!previous.working : starting, updatedAt: at,
      lastFinished: event === 'Stop' ? at : previous.lastFinished || 0,
      // Only booleans and timestamps: whether it is waiting on you, and when a plan was last presented.
      attention: asking ? true : starting || stopping ? false : !!previous.attention,
      planAt: event === 'PreToolUse' && data.tool_name === 'ExitPlanMode' ? at : previous.planAt || 0,
    };
    const temp = filename + `.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(record), { mode: 0o600 });
    fs.renameSync(temp, filename);
  } catch {
    // Aquarium errors must never block an assistant or alter its decisions.
  } finally {
    if (lockFd !== undefined) {
      try { fs.closeSync(lockFd); fs.unlinkSync(lock); } catch {}
    }
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 4 * 1024 * 1024) finish();
  try { JSON.parse(input); } catch { return; }
  handle();
  finish();
});
process.stdin.on('end', () => { handle(); finish(); });
process.stdin.on('error', () => { handle(); finish(); });
