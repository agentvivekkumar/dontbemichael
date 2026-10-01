# Don't Be Michael brand kit

Everything you need to make something with the Don't Be Michael brand, whether or not
you ever touch the code. Share this folder as it is, or as a zip.

**Start here:** open [`brand-guide.pdf`](./brand-guide.pdf), or
[`brand-guide.html`](./brand-guide.html) in any browser. It is nine short pages: the
idea, the logo, logo don'ts, color, type, the studio, voice, the app icon, and what's in
this folder.

This is **design system v2, "Studio"** (2026-09-30). The v1 pixel system is kept for
reference in [`archive/`](./archive/).

**Building product?** [`DESIGN.md`](./DESIGN.md) is the full design system for the
desktop app and dontbemichael.com: every token, component and rule. It is the single
source of truth. The brand guide is the summary.

## What's here

| Folder | Contents | Use it for |
|---|---|---|
| [`logo/mark/`](./logo/mark/) | The Struck M: SVG in four versions (light, dark, on cream, on ink), and PNG at 16, 32, 64, 128, 256, 512 and 1024 px | Avatars, stickers, small spaces |
| [`logo/lockup/`](./logo/lockup/) | Mark plus name, horizontal and stacked, light and dark. SVG text is converted to outlines, so no font is needed. PNG at three widths each. | Headers, slides, documents |
| [`app-icon/`](./app-icon/) | App icon: `icon.svg`, PNG 128 to 1024, macOS `icon.icns`, Windows `icon.ico` | App stores, installers, press |
| [`web/`](./web/) | `favicon.svg`, `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png` | Websites |
| [`social/`](./social/) | `og-card-1200x630.png` link preview | Link sharing, social posts |
| [`colors/`](./colors/) | `colors.css` (light and dark `--dbm-*` tokens), `colors.json`, `dont-be-michael.ase` (Adobe swatches), `palette.png` | Design tools and code |
| [`fonts/`](./fonts/) | Sora and IBM Plex Mono (the brand type), JetBrains Mono (the app terminal), each with its `OFL.txt`. The v1 pixel fonts are retired and removed | Installing the brand type |
| [`reference/studio/`](./reference/studio/) | The approved v2 screens of the app, 1440 × 900 | Building the app and the website |
| [`source/build.py`](./source/build.py) | Regenerates every asset above | Changing the brand |

## The rules that matter most

1. **The mark is the only pixel element.** Use the SVG, or a PNG at a multiple of 16 px.
   Never smooth, blur, rotate, recolor or outline it. Keep 2 grid cells of clear space.
   The name is set in Sora SemiBold, never in pixel type.
2. **The slash is always `#FF6B6B`.** The M is `#1A1320` on light grounds and `#ECEAF4`
   on dark ones.
3. **One system, two scales.** The app and everything outside it (web pages, slides,
   social posts) use the same colors, type and studio illustration. The web is bigger,
   not louder.
4. **Coral means "needs you".** Nothing else is coral: no coral buttons, no decorative
   coral.
5. **Voice:** short, plain, a little dry. The joke is on Michael, never on the customer.
   No em dashes, no emoji in copy.
6. **No *The Office* material beyond the character names.** No NBC or show logos, title
   lettering, cast photos or likenesses.

## Using the name and logo

The Don't Be Michael name and the Struck M identify this project. You're welcome to use
them to refer to it: in articles, reviews, talks, integrations and links. Please don't
modify the mark, combine it with your own logo, or use it in a way that suggests the
project endorses or is run by you.

The fonts are free under the SIL Open Font License (see each `OFL.txt`). The project's
source code is MIT licensed (`../LICENSE`).

Questions or requests: **hello@dontbemichael.com**

## Changing the brand

Brand changes go through [`DESIGN.md`](./DESIGN.md) first. Then regenerate the assets:

```bash
pip install pillow fonttools
python3 branding/source/build.py            # everything
python3 branding/source/build.py logos      # or one step: logos, app-icon, web, colors, social, guide
```

Chrome renders the PNG lockups, the social card, the palette and the PDF (set `CHROME`
if it isn't at the default macOS path). The wordmark is outlined from
`fonts/sora/Sora-Variable.ttf` at weight 600 with its kerning, so the lockups need no font. `iconutil`, for the `.icns`, is macOS only. The
mark itself comes from a 16 × 16 grid defined once in `build.py`, so every file stays in
sync.
