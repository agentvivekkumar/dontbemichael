# PR evidence — screenshots

Before/after screenshots for pull request evidence, served to the PR body via
`raw.githubusercontent.com` (the API cannot produce GitHub's drag-and-drop
`user-attachments` URLs, so the raw CDN is the only scriptable path).

- `before-task-id.png` / `after-task-id.png` — the Tasks kanban DOING column
  without and with the task id on each card (#352). Rendered off the real
  `TaskCard` component with the real design tokens and bundled fonts, at one
  window size against one fixed set of cards, so the pair differs only by the
  change itself.
- `before-task-id-detail.png` / `after-task-id-detail.png` — the task DETAIL view
  without and with the id in its fact row (#352). Same approach: the real
  `TaskDetail`, real tokens and fonts, real English strings, one fixed task.
- `before-memory-graph-count.png` / `after-memory-graph-count.png`: the Who talks
  to whom hover card for a pair that swapped one message, reading "1 messages"
  and then "1 message". Rendered off the real `MemoryGraphPanel` with the studio
  lab's Harbor & Pine office, real tokens, fonts and English strings.
