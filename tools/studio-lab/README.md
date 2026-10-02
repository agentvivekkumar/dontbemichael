# Studio lab

The real office studio, on a fictional team (Harbor & Pine), with a button for
every animation the app plays: messages, conversations, tool use, mail in and
out, scheduled jobs, Michael pointing and asking you, your messages, a task
reaching Done, idle chatter and banter (paper planes and mail between two
quiet people), a new hire, the office opening and closing, and
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

## Reference screens

```
npm run shoot
```

re-shoots the brand kit's reference screens (`branding/reference/studio/*.png`,
1440 x 900) from the app's real shell and panels on the same office:
the Office view in light and dark, Kelly's Access, Memory and Work tabs,
Michael's office schedule, a task open, who talks to whom, the Business, Meet
and Team steps of setup, the hire wizard, and Settings at Agents.
`npm run shoot -- home-dark` re-shoots just the ones named. The clock reads
10:42 and the dice are seeded, so a re-shoot changes only what the app changed.
Then rebuild what uses them:

```
python3 branding/source/build.py social guide
```

## Files

- `lab.tsx`: the page, the fictional office and the buttons.
- `reference.tsx`: the app's shell, one reference screen per `?shot=`.
- `mock.ts`: a stand in for the app's preload bridge, and the office itself.
- `clock.ts`: the fixed clock and seeded dice for the reference screens.
- `build.mjs`: bundles a page into one self-contained HTML file.
- `shoot.mjs`: builds `reference.tsx` and captures each screen with headless Chrome.
