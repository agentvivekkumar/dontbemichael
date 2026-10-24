'use strict';

/**
 * Stand-ins for the engine CLIs (issue #443): no model, no account, no paid
 * call. Each one finds the hook commands the app installed where the real CLI
 * looks for them, runs them the way the CLI runs a command hook on Mac and
 * Linux (`sh -c`, the payload as JSON on stdin, the spawn's environment), and
 * reads the answer in the CLI's own contract.
 *
 * So a test can drive what HiveManager.ensureAgent hands an engine through the
 * same doors the engine uses, end to end into a real HookServer, without the
 * engine. test/hive-protocol-on-spawn.test.cjs pins what the app hands over;
 * these check that it works once handed over.
 *
 * Windows is not modelled yet: there Claude Code runs a hook through Git Bash
 * and the other CLIs through their own shells, and a stand-in that guessed
 * wrong would test itself rather than the app.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** The steps of one turn, by the name each CLI gives its hook event. */
const STEPS = ['start', 'prompt', 'preTool', 'postTool', 'stop'];

/** Claude Code reads its hooks from the `--settings` file on argv. */
function settingsArg(injection) {
  const i = injection.args.indexOf('--settings');
  if (i < 0 || !injection.args[i + 1]) throw new Error('no --settings on argv');
  return JSON.parse(fs.readFileSync(injection.args[i + 1], 'utf8'));
}

/** Codex reads `[[hooks.<Event>]]` tables from `$CODEX_HOME/config.toml`. Only
 *  the shape the app writes is read: a `command` basic string under its table. */
function codexHooks(injection) {
  const home = injection.env.CODEX_HOME;
  if (!home) throw new Error('no CODEX_HOME in the spawn env');
  const hooks = {};
  let event = null;
  for (const line of fs.readFileSync(path.join(home, 'config.toml'), 'utf8').split(/\r?\n/)) {
    const table = /^\[\[hooks\.([A-Za-z]+)\]\]$/.exec(line.trim());
    if (table) { event = table[1]; continue; }
    if (/^\[/.test(line.trim()) && !/^\[\[hooks\./.test(line.trim())) { event = null; continue; }
    const command = /^command\s*=\s*(".*")\s*$/.exec(line.trim());
    if (event && command) (hooks[event] ??= []).push({ hooks: [{ type: 'command', command: JSON.parse(command[1]) }] });
  }
  return hooks;
}

/** Gemini CLI reads hooks from the settings file its env points at. */
function geminiHooks(injection) {
  const file = injection.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
  if (!file) throw new Error('no GEMINI_CLI_SYSTEM_SETTINGS_PATH in the spawn env');
  return JSON.parse(fs.readFileSync(file, 'utf8')).hooks ?? {};
}

/** Claude Code's answer contract, which Codex shares (hive.ts installCodexHooks). */
const claudeAnswer = (out) => ({
  denied: out?.hookSpecificOutput?.permissionDecision === 'deny',
  reason: out?.hookSpecificOutput?.permissionDecisionReason,
  context: out?.hookSpecificOutput?.additionalContext
});

const ENGINES = {
  claude: {
    hooks: (injection) => settingsArg(injection).hooks ?? {},
    events: { start: 'SessionStart', prompt: 'UserPromptSubmit', preTool: 'PreToolUse', postTool: 'PostToolUse', stop: 'Stop' },
    shellTool: 'Bash',
    answer: claudeAnswer
  },
  codex: {
    hooks: codexHooks,
    events: { start: 'SessionStart', prompt: 'UserPromptSubmit', preTool: 'PreToolUse', postTool: 'PostToolUse', stop: 'Stop' },
    // Codex's hook payloads are Claude shaped (hive.ts installCodexHooks).
    shellTool: 'Bash',
    answer: claudeAnswer
  },
  gemini: {
    hooks: geminiHooks,
    events: { start: 'SessionStart', prompt: 'BeforeAgent', preTool: 'BeforeTool', postTool: 'AfterTool', stop: 'AfterAgent' },
    shellTool: 'run_shell_command',
    answer: (out) => ({
      denied: out?.decision === 'deny',
      reason: out?.reason,
      context: out?.hookSpecificOutput?.additionalContext
    })
  }
};

/** Does a hook group's matcher take this tool? No matcher, `*` and a regex
 *  that matches all count, as each CLI reads them. */
function matches(group, tool) {
  if (!group.matcher || group.matcher === '*' || tool === undefined) return true;
  try { return new RegExp(`^(?:${group.matcher})$`).test(tool); } catch { return false; }
}

function run(command, payload, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`hook timed out: ${command}`)); }, 15_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`hook exited ${code}: ${err.trim()}`));
      else resolve(out.trim());
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/**
 * One fake CLI for `engine`, started from what ensureAgent returned. `step`
 * fires every hook the CLI would fire for that step of a turn and returns what
 * the CLI would read back. `env` overrides the spawn env for that one call (a
 * leftover process, a missing secret).
 */
function fakeEngine(engine, injection, { cwd, sessionId = 'fake-session' }) {
  const spec = ENGINES[engine];
  if (!spec) throw new Error(`no fake for ${engine}`);
  const hooks = spec.hooks(injection);
  return {
    hooks,
    shellTool: spec.shellTool,
    eventFor: (step) => spec.events[step],
    async step(step, { tool, input = {}, prompt, env } = {}) {
      const event = spec.events[step];
      const toolName = step === 'preTool' || step === 'postTool' ? (tool ?? spec.shellTool) : undefined;
      const payload = {
        session_id: sessionId,
        cwd,
        hook_event_name: event,
        ...(toolName ? { tool_name: toolName, tool_input: input } : {}),
        ...(prompt ? { prompt } : {})
      };
      const runEnv = { ...process.env, ...injection.env, ...env };
      for (const [k, v] of Object.entries(runEnv)) if (v === undefined) delete runEnv[k];
      const answers = [];
      for (const group of hooks[event] ?? []) {
        if (!matches(group, toolName)) continue;
        for (const hook of group.hooks ?? []) {
          if (hook.type !== 'command') continue;
          const out = await run(hook.command, payload, runEnv, cwd);
          answers.push(spec.answer(out ? JSON.parse(out) : null));
        }
      }
      return answers;
    }
  };
}

module.exports = { fakeEngine, STEPS, FAKE_ENGINES: Object.keys(ENGINES) };
