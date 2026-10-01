# Studio lab

The real office studio, on a fictional team (Harbor & Pine), with a button for
every animation the app plays: messages, conversations, tool use, mail in and
out, scheduled jobs, Michael pointing and asking you, your messages, a task
reaching Done, idle chatter, a new hire, the office opening and closing, and
the time of day. Each button fires the same event the app listens to, so what
you see is what the app does (branding/DESIGN.md 8.12).

Every pod shows only its chip, so the office reads clean on camera. A card
pops up when you hover a pod, or for a moment when a button involves someone
in it (Kelly as she sends, then Oscar as it lands), one card at a time.

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
- **Autoplay the day** starts with the office closed (every light off), plays the
  opening (Michael first, then each pod as its people clock in), then everyday
  events in random order every 2.6 s, never the same one twice running.
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
