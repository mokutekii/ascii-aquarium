import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { getState } = require('../server.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ascii-aquarium-sessions-'));

function hook(source, event, payload) {
  const result = spawnSync(process.execPath, [path.join(root, 'activity-hook.cjs'), source, event], {
    input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, AQUARIUM_STATE_DIR: dir },
  });
  assert.equal(result.status, 0, result.stderr);
}

try {
  hook('claude', 'UserPromptSubmit', { session_id: 'private-session-one', turn_id: 'turn-one' });
  hook('claude', 'PreToolUse', { session_id: 'private-session-one', agent_id: 'child-agent', tool_name: 'Read' });
  hook('claude', 'SubagentStop', { session_id: 'private-session-one', agent_id: 'child-agent' });
  hook('codex', 'UserPromptSubmit', { thread_id: 'private-thread-two', turn_id: 'turn-two' });

  const state = getState(dir);
  assert.equal(state.claude.active, 1);
  assert.equal(state.codex.active, 1);
  assert.equal(state.sessions.length, 2, 'child agents must not create separate active commanders');
  assert.deepEqual(new Set(state.sessions.map(session => session.source)), new Set(['claude', 'codex']));
  for (const session of state.sessions) {
    assert.match(session.id, /^[a-f0-9]{24}$/);
    assert.equal(JSON.stringify(session).includes('private-'), false, 'raw session ids must never leave local state');
  }

  const files = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  assert.equal(files.length, 2, 'subagent activity stays attached to the parent session record');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('Parent session identity regression passed.');
