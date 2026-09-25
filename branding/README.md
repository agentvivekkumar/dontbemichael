# Don't Be Michael brand kit

Everything you need to make something with the Don't Be Michael brand, whether or not
you ever touch the code. Share this folder as it is, or as a zip.

**Start here:** open [`brand-guide.pdf`](./brand-guide.pdf), or
[`brand-guide.html`](./brand-guide.html) in any browser. It is nine short pages: the
idea, the logo, logo don'ts, color, type, voice, the app icon, and what's in this folder.

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
| [`colors/`](./colors/) | `colors.css`, `colors.json`, `dont-be-michael.ase` (Adobe swatches), `palette.png` | Design tools and code |
| [`fonts/`](./fonts/) | VT323, Pixelify Sans, Press Start 2P, Inter, JetBrains Mono, each with its `OFL.txt` | Installing the brand type |
| [`source/build.py`](./source/build.py) | Regenerates every asset above | Changing the brand |

## The rules that matter most

1. **The logo is pixels.** Use the SVG, or a PNG at a multiple of 16 px. Never smooth,
   blur, rotate, recolor or outline it. Keep 2 grid cells of clear space around it.
2. **The slash is always coral `#FF6B6B`.** The M is ink `#1A1320` on light grounds and
   cream `#FFFDF5` on dark ones.
3. **Two volumes.** Anything outside the app (web pages, slides, social posts, merch) uses
   the loud palette and pixel headlines. The app uses the calm palette. See brand guide §04.
4. **Voice:** short, human, a little dry. The joke is on Michael, never on the customer.
   No em dashes, no emoji in copy.
5. **No *The Office* material.** No NBC or show logos, title lettering, cast photos or
   likenesses. Michael is an archetype.

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
if it isn't at the default macOS path). `iconutil`, for the `.icns`, is macOS only. The
mark itself comes from a 16 × 16 grid defined once in `build.py`, so every file stays in
sync.
