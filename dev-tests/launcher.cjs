const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../start.cjs'), 'utf8').split('(async () =>')[0];
for (const [id, chrome, expected] of [['ChromeHTML', true, 'chrome.exe'], ['FirefoxURL', true, 'chrome.exe'], ['FirefoxURL', false, null], ['MSEdgeHTM', true, 'chrome.exe'], ['MSEdgeHTM', false, null], [null, true, 'chrome.exe'], [null, false, null]]) {
  const launched = [];
  const processMock = { platform: 'win32', env: { ProgramFiles: 'C:/Programs' } };
  const context = vm.createContext({ __dirname, process: processMock, console: { error() {} }, require(name) {
    if (name === 'node:fs') return { existsSync: () => chrome };
    if (name === 'node:child_process') return {
      spawn: (command, args, options) => { launched.push({ command, args, options }); return { unref() {} }; },
      spawnSync: (command, args) => ({ status: id ? 0 : 1, stdout: args.includes('ProgId') ? `ProgId    REG_SZ    ${id}` : '(Default) REG_SZ "C:/Preferred/chrome.exe" "%1"' }),
    };
    return require(name);
  }});
  vm.runInContext(source + '\nopenApp();', context);
  if (expected) {
    assert.ok(launched[0]?.command.endsWith(expected), `${id}: ${JSON.stringify(launched)}`);
    assert.ok(!/edge/i.test(launched[0].command));
    assert.ok(launched[0].args.includes('--app=http://127.0.0.1:43827'));
    assert.ok(launched[0].args.some((arg) => arg.startsWith('--user-data-dir=')));
    assert.equal(launched[0].options.windowsHide, false, 'the interactive app must be visible on its first launch');
    if (id === 'ChromeHTML') assert.equal(launched[0].command, 'C:/Preferred/chrome.exe');
  }
  else { assert.equal(launched.length, 0); assert.equal(processMock.exitCode, 1); }
}
console.log('PASS: compatible default, isolated app window, Chrome fallback, no Edge or normal-tab fallback');
