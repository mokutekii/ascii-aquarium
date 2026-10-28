const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { getState } = require('./server.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aquarium-test-'));
const env = { ...process.env, AQUARIUM_STATE_DIR: dir };
const send = (source, event, data) => {
  const child = spawnSync(process.execPath, [path.join(__dirname, 'activity-hook.cjs'), source, event],
    { input: typeof data === 'string' ? data : JSON.stringify(data), encoding: 'utf8', env, timeout: 3000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {});
};
try {
  send('claude', 'UserPromptSubmit', { session_id: 'private-session', prompt: 'SENSITIVE_MARKER' });
  send('claude', 'UserPromptSubmit', { session_id: 'second-session' });
  send('codex', 'UserPromptSubmit', { session_id: 'codex-session', turn_id: 'turn-1' });
  assert.equal(getState(dir).claude.active, 2);
  assert.equal(getState(dir).codex.active, 1);
  send('codex', 'SubagentStop', { session_id: 'codex-session', turn_id: 'turn-1', agent_id: 'SENSITIVE_MARKER', last_assistant_message: 'SENSITIVE_MARKER' });
  assert.equal(getState(dir).codex.active, 1, 'subagent completion must not stop its parent');
  assert.ok(getState(dir).codex.subagentAt > 0, 'subagent completion has a timestamp');
  send('codex', 'PreToolUse', { session_id: 'codex-session', turn_id: 'turn-1', tool_name: 'request_user_input_async', tool_input: { prompt: 'SENSITIVE_MARKER' } });
  assert.equal(getState(dir).codex.attention, 1, 'questions ask for attention');
  send('codex', 'PreToolUse', { session_id: 'codex-session', turn_id: 'turn-1', tool_name: 'exec_command' });
  assert.equal(getState(dir).codex.attention, 0, 'resumed tool activity clears attention');
  send('claude', 'Stop', { session_id: 'private-session', last_assistant_message: 'SENSITIVE_MARKER' });
  assert.equal(getState(dir).claude.active, 1);
  assert.ok(getState(dir).claude.lastFinished > 0);
  send('claude', 'Stop', { session_id: 'second-session', agent_id: 'child' });
  assert.equal(getState(dir).claude.active, 1, 'child must not stop parent');
  send('codex', 'UserPromptSubmit', { session_id: 'codex-session', turn_id: 'turn-2' });
  send('codex', 'Stop', { session_id: 'codex-session', turn_id: 'turn-1' });
  assert.equal(getState(dir).codex.active, 1, 'old turn stop must not stop new turn');
  send('codex', 'Interrupt', { session_id: 'codex-session', turn_id: 'turn-2' });
  assert.equal(getState(dir).codex.active, 0);
  send('claude', 'SessionEnd', { session_id: 'second-session' });
  assert.equal(getState(dir).claude.active, 0);
  send('claude', 'Stop', 'invalid JSON');
  send('codex', 'UserPromptSubmit', { session_id: 'stale-session' });
  assert.equal(getState(dir, Date.now() + 7 * 3600000).codex.stale, 1);
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.ok(!text.includes('SENSITIVE_MARKER') && !text.includes('private-session'));
  }
  console.log('PASS: start/stop, concurrent sessions, completion, interrupt, child isolation, old-turn isolation, malformed input, stale signal and privacy checks.');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
