# Studio lab

The real office studio, on a fictional team (Harbor & Pine), with a button for
every animation the app plays: messages, conversations, tool use, mail in and
out, scheduled jobs, Michael pointing and asking you, your messages, a task
reaching Done, idle chatter, a new hire, the office opening and closing, and
the time of day. Each button fires the same event the app listens to, so what
you see is what the app does (branding/DESIGN.md 8.12).

Use it for demos, screenshots and demo videos.

## Build

```
npm run lab
```

writes `docs/demo/studio-lab.html`: one self-contained file (script, styles,
fonts and images inlined). Open it in any browser, offline, by double-click.
It is built from the app's own studio components, so rebuild it after a
design change to show the office as the app now draws it.

## Recording

- Press **H** to hide the controls.
- **Autoplay** loops the everyday animations every 2.6 s.
- URL options for scripted shots:
  - `#dark`: dark theme
  - `?hour=22`: time of day (8 morning, 12 day, 17 evening, 22 night)
  - `?play=Closing time, lights out`: fire one button after load, by its label
  - `?autoplay`: start autoplay on load
  - `?clean`: start with the controls hidden

For example: `studio-lab.html?hour=22&clean&autoplay#dark`.

## Files

- `lab.tsx`: the page, the fictional office and the buttons.
- `mock.ts`: a stand in for the app's preload bridge.
- `build.mjs`: bundles everything into the single HTML file.
