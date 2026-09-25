# Only Michael sends desktop notifications

Status: design reviewed (2026-09-25). Built on `feat/per-agent-schedules`.

## Proposal (owner, 2026-09-25)

Team members should not send desktop notifications such as "Pam is waiting for you".
Team members talk to Michael and, at most, wait on Michael. Only Michael's notifications
show up.

## Every notification today (from the code)

| # | Source | Title | Body | Fires for |
|---|---|---|---|---|
| 1 | `src/main/hooks.ts:508` idle hook (`NOTIFY_WAITING`) | agent's name | "Waiting for you." | every agent |
| 2 | `src/main/hooks.ts:293` Stop hook (`NOTIFY_FINISHED`) | agent's name | "Finished and ready for the next thing." | every agent |
| 3 | `src/main/index.ts:1349/1353` `breakerToast` | "Pam constrained" / "Pam stopped by circuit breaker" | reason | every agent |
| 4 | `src/main/index.ts:956` schedule request (this branch) | asking agent | "Pam asked to change a schedule..." | the asking agent |
| 5 | `src/main/index.ts:4827` voice completion | Michael | summary | Michael |
| 6 | `src/main/index.ts:2990/5676` | "Agent running degraded" / "Agents need a restart" | app state | the app |

## Design decisions

### 1A. Team members' Waiting and Finished toasts are dropped (approved 2026-09-25)

`HookServer.notify` fires only when the agent is the god agent (`registry.godId`).
Michael's own "Waiting for you." and "Finished and ready for the next thing." stay. A
team member stopping or going idle is Michael's business; he raises anything the
owner must decide on ASK ME.

### 2A. Circuit breaker: Michael reports a stop; constrain is silent (approved 2026-09-25)

- `stop`: one toast titled with Michael's name (`resolveGodName`), body
  "I stopped {{name}}: {{reason}}". No pronoun for the agent.
- `constrain`: no toast. Michael already gets the breaker message in his inbox.

### 3A. Schedule requests are announced by Michael (approved 2026-09-25)

The toast from source 4 is titled with Michael's name, body
"{{name}} asked to change a schedule. It's waiting for you in ASK ME."

### 4A. The app's own warnings stay as app toasts (approved 2026-09-25)

"Agents need a restart" and "Agent running degraded" report the app's state, not a team
member, so they keep their titles. The rule is: **no team member ever sends a toast.**

### 5A. Settings and onboarding copy name Michael (approved 2026-09-25)

- `settings.general.desktopNotificationsDesc`: "Desktop alerts from {{godName}} when he
  needs you, plus the app's own warnings."
- `onboarding.permissions.notificationsDesc`: "{{godName}} pings you when something needs
  you, even while you're away. Your system may ask permission the first time."
- In en, zh-CN and ar, with `godName` passed by both components (test `i18n-god-name`).

## Passes (focus: decisions only, per D1)

| Pass | Score | Note |
|---|---|---|
| 1 Information architecture | 4 → 9 | one voice: Michael, plus app warnings |
| 2 States | 5 → 9 | each source decided: drop, reword or keep |
| 3 Journey | n/a | no screen |
| 4 AI slop | n/a | no screen |
| 5 Design system | 8 → 9 | copy follows §13 voice, no dashes, godName |
| 6 Responsive / a11y | n/a | OS toasts |
| 7 Unresolved | 0 | |

## Implementation tasks

- [ ] **N1 (P1, human: ~1h / CC: ~10min)**: `HookServer.notify` returns unless `agentId` is the registry's god id (1A).
  - Files: `src/main/hooks.ts`, `test/hooks-notification.test.cjs` (a worker's Stop and idle fire nothing; Michael's still fire)
- [ ] **N2 (P1, human: ~1h / CC: ~10min)**: breaker: stop toasts as Michael with "I stopped {{name}}: {{reason}}"; constrain has no toast (2A).
  - Files: `src/main/index.ts`, a regex test on the breaker branch
- [ ] **N3 (P1, human: ~15m / CC: ~5min)**: schedule request toast titled Michael (3A).
  - Files: `src/main/index.ts`, `test/schedule-requests.test.cjs`
- [ ] **N4 (P2, human: ~1h / CC: ~10min)**: settings and onboarding copy in three locales, `godName` passed (5A).
  - Files: locales, `SettingsModal.tsx`, `OnboardingWizard.tsx`
- [ ] **N5 (P1)**: a test that every `new Notification(` in `src/main` is titled Michael or is one of the two app warnings (the rule, enforced).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | ollama (design outside voice) | Independent 2nd opinion | 1 | skipped | owner skipped; local model busy with the code review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 4/10 → 9/10, 5 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** ollama, design phase, skipped (owner chose to skip).
- **VERDICT:** DESIGN CLEARED. eng review required (small change: five tasks in two main-process files plus copy).

NO UNRESOLVED DECISIONS
