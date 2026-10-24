'use strict';

// edit_schedule finds a job by its own name when the name has punctuation
// (the spoken ref loses it in norm), and asks which job when none is named.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const handlers = new Map();
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) }, Notification: class { show() {} static isSupported() { return false; } } }
};

const { registerRealtimeActionIpc } = loadTs('src/main/realtimeActions.ts');

test('a schedule whose name has punctuation is found by that name', async () => {
  const labels = ["Owner's weekly report", 'Inbox: morning sweep', 'Invoices, overdue', 'Hourly ops standup'];
  let missions = labels.map((label, i) => ({ id: `m_${i}`, label, intervalMs: 3_600_000, to: 'god', body: '', enabled: true, createdBy: 'owner' }));
  registerRealtimeActionIpc({
    hiveEnabled: () => true,
    hiveSend: () => ({ id: 'x' }),
    hiveTasks: () => ({ tasks: [] }),
    hiveRegistry: () => ({ godId: 'god', agents: { god: { name: 'Michael', isGod: true } } }),
    hiveLog() {},
    listMissions: () => missions,
    saveMissions: (m) => { missions = m; }
  });
  const act = (p) => handlers.get('realtime:action')(null, p);
  const confirm = () => handlers.get('realtime:action:confirm')(null, { phrase: 'confirm' });

  for (const label of labels) {
    const r = await act({ verb: 'edit_schedule', missionId: label, action: 'disable' });
    assert.equal(r.ok, true, r.spoken);
    assert.match(r.spoken, new RegExp(`^You want to disable the "${label}" schedule\\.`));
    assert.equal((await confirm()).spoken, `Disabled the "${label}" schedule.`);
    assert.equal(missions.find((m) => m.label === label).enabled, false);
  }

  // No name: ask, and nothing is staged.
  const r = await act({ verb: 'edit_schedule', missionId: '  ', action: 'delete' });
  assert.deepEqual([r.ok, r.spoken, r.needsConfirm], [false, 'Which schedule should I edit?', undefined]);
  assert.equal((await confirm()).spoken, 'There\'s nothing waiting to confirm.');
  assert.equal(missions.length, 4);
});
