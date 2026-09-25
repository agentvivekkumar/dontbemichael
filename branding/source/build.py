"""Rebuild every asset in the Don't Be Michael brand kit.

    python3 branding/source/build.py

Needs Python 3.9+, Pillow and fontTools (`pip install pillow fonttools`), plus
Google Chrome for the PNG lockups, social card, palette sheet and PDF guide. Set
CHROME to the Chrome binary if it is not at the default macOS path. `iconutil`
(macOS only) builds the .icns; elsewhere that one file is skipped.

Everything is derived from two sources so nothing can drift:
  - the Struck M cell grid below (DESIGN.md section 1.3)
  - the token tables below (DESIGN.md section 3)
"""
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw

KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

# ---------------------------------------------------------------- tokens
INK, CREAM, CORAL = "#1A1320", "#FFFDF5", "#FF6B6B"

NEUTRALS = [  # token, light, app dark
    ("cream-50", "#FFFDF5", "#17171B"), ("cream-100", "#FFF8E7", "#1D1D22"),
    ("cream-200", "#F4E9C7", "#26262C"), ("cream-300", "#E8D9A0", "#313139"),
    ("paper-100", "#FCFAF0", "#1A1A1F"), ("paper-200", "#F0EAD2", "#222229"),
    ("ink-900", "#1A1320", "#DEDBD6"), ("ink-700", "#3D2E4A", "#B3B0AC"),
    ("ink-500", "#6B5878", "#96919F"), ("ink-300", "#A899B5", "#787684"),
    ("ink-100", "#D9CFE0", "#3E3D46"),
]
# hue: meaning, (app light, app light -light), (app dark, app dark -light), (web, web -light)
ACCENTS = {
    "coral": ("Stop, needs you, Michael", ("#D96A62", "#F3D3CD"), ("#E08C82", "#3B2724"), ("#FF6B6B", "#FFB4B4")),
    "mint":  ("Done, good, go",            ("#5CA97A", "#D2E7DA"), ("#74C096", "#1E3227"), ("#6BCF7F", "#B4E5BD")),
    "sky":   ("Thinking, info",            ("#4F9FAF", "#CFE5E9"), ("#6FB3C4", "#1F3238"), ("#4ECDC4", "#A8E6E0")),
    "lemon": ("Working, highlight",        ("#DCAB3C", "#F3E4BC"), ("#CFAA57", "#332C1D"), ("#FFD93D", "#FFEC99")),
    "lilac": ("Web, MCP, compacting",      ("#9482D3", "#E0DAF2"), ("#A896E3", "#2B2740"), ("#B197FC", "#D6C5FF")),
    "peach": ("Warm highlight, tabs",      ("#D99168", "#F3DACA"), ("#DFA57F", "#352822"), ("#FFA07A", "#FFD0B5")),
}

# ---------------------------------------------------------------- the mark
N = 16


def mark_cells(ink=INK, slash=CORAL):
    """The Struck M on its 16 x 16 grid. DESIGN.md section 1.3."""
    c = {}
    for y in range(3, 14):
        for x in (2, 3, 12, 13):
            c[(x, y)] = ink
    for x, y in [(4, 3), (4, 4), (5, 4), (5, 5), (6, 5), (6, 6), (7, 6), (7, 7)]:
        c[(x, y)] = ink
        c[(15 - x, y)] = ink
    for x in range(1, 15):
        for y in range(N):
            if x + y in (15, 16):
                c[(x, y)] = slash
    return c


def mark_svg(ink=INK, ground=None):
    back = f'<rect width="16" height="16" fill="{ground}"/>' if ground else ""
    rects = "".join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{f}"/>'
                    for (x, y), f in sorted(mark_cells(ink).items()))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" '
            f'shape-rendering="crispEdges">{back}{rects}</svg>\n')


def mark_png(px, ink=INK, ground=None):
    """Integer-scaled mark. px must be a multiple of 16."""
    s = px // N
    img = Image.new("RGBA", (px, px), ground or (0, 0, 0, 0))
    for (x, y), f in mark_cells(ink).items():
        img.paste(f, (x * s, y * s, (x + 1) * s, (y + 1) * s))
    return img


# ---------------------------------------------------------------- wordmark
VT323 = os.path.join(KIT, "fonts", "vt323", "VT323-Regular.ttf")
TRACK = 0.06  # letter-spacing, em. DESIGN.md section 1.4


def text_paths(text, size, x0, baseline, font=VT323):
    """Outline text into SVG path data. Returns (path d, advance width)."""
    f = TTFont(font)
    upm = f["head"].unitsPerEm
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    k = size / upm
    x, parts = x0, []
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            continue
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (k, 0, 0, -k, x, baseline)))
        parts.append(pen.getCommands())
        x += hmtx[name][0] * k + TRACK * size
    return " ".join(p for p in parts if p), x - x0 - TRACK * size


def lockup_svg(layout, ink=INK):
    """Mark plus outlined wordmark. layout: 'horizontal' or 'stacked'."""
    f = TTFont(VT323)
    upm, cap = f["head"].unitsPerEm, f["OS/2"].sCapHeight
    size = 280                     # wordmark font size in SVG units
    capk = cap / upm * size
    m = size * 30 / 28             # mark size and gap follow the web nav: 28px text, 30px mark, 10px gap
    gap = size * 10 / 28
    pad = m * 2 / 16               # clear space: 2 cells
    if layout == "horizontal":
        base = pad + m / 2 + capk / 2
        a, wa = text_paths("DON'T BE ", size, pad + m + gap, base)
        b, wb = text_paths("MICHAEL", size, pad + m + gap + wa + TRACK * size, base)
        w, h = pad + m + gap + wa + TRACK * size + wb + pad, m + 2 * pad
        mark_at = (pad, pad)
    else:
        m, pad = m * 2.5, m * 2.5 * 2 / 16   # stacked: the mark anchors the lockup
        _, wa = text_paths("DON'T BE ", size, 0, 0)
        _, wb = text_paths("MICHAEL", size, 0, 0)
        tw = wa + TRACK * size + wb
        w = max(tw, m) + 2 * pad
        base = pad + m + gap + capk
        a, _ = text_paths("DON'T BE ", size, (w - tw) / 2, base)
        b, _ = text_paths("MICHAEL", size, (w - tw) / 2 + wa + TRACK * size, base)
        h = base + pad
        mark_at = ((w - m) / 2, pad)
    s = m / 16
    cells = "".join(
        f'<rect x="{mark_at[0] + x * s:.2f}" y="{mark_at[1] + y * s:.2f}" width="{s:.2f}" height="{s:.2f}" fill="{c}"/>'
        for (x, y), c in sorted(mark_cells(ink).items()))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">'
            f'<g shape-rendering="crispEdges">{cells}</g>'
            f'<path d="{a}" fill="{ink}"/><path d="{b}" fill="{CORAL}"/></svg>\n'), w, h


# ---------------------------------------------------------------- helpers
def out(rel):
    """Absolute path for a kit file, creating its folder."""
    path = os.path.join(KIT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def write(rel, data, mode="w"):
    path = out(rel)
    with open(path, mode) as fh:
        fh.write(data)
    return path


def chrome(url, out, w, h, transparent=True, pdf=False):
    if not os.path.exists(CHROME):
        print(f"  skipped {os.path.relpath(out, KIT)} (no Chrome at {CHROME})")
        return
    args = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--allow-file-access-from-files", "--virtual-time-budget=3000"]
    if pdf:
        args += ["--no-pdf-header-footer", f"--print-to-pdf={out}", url]
    else:
        if transparent:
            args.append("--default-background-color=00000000")
        args += [f"--window-size={w},{h}", f"--screenshot={out}", url]
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def svg_to_png(svg_path, out, width):
    """Rasterize an SVG at an exact pixel width through Chrome."""
    with open(svg_path) as fh:
        svg = fh.read()
    vb = svg.split('viewBox="')[1].split('"')[0].split()
    vw, vh = float(vb[2]), float(vb[3])
    height = round(width * vh / vw)
    tmp = tempfile.NamedTemporaryFile("w", suffix=".html", delete=False)
    tmp.write(f'<html><body style="margin:0;background:transparent">'
              f'<img src="file://{svg_path}" width="{width}" height="{height}" style="display:block"></body></html>')
    tmp.close()
    chrome(f"file://{tmp.name}", out, width, height)
    os.unlink(tmp.name)


def fonts_css(prefix):
    fams = [("VT323", "vt323/VT323-Regular.ttf", "400"),
            ("Pixelify Sans", "pixelifysans/PixelifySans-Variable.ttf", "400 700"),
            ("Press Start 2P", "pressstart2p/PressStart2P-Regular.ttf", "400"),
            ("Inter", "inter/Inter-Variable.ttf", "100 900"),
            ("JetBrains Mono", "jetbrainsmono/JetBrainsMono-Variable.ttf", "100 800")]
    return "".join(f"@font-face{{font-family:'{n}';src:url('{prefix}fonts/{p}');font-weight:{w}}}\n" for n, p, w in fams)


# ---------------------------------------------------------------- builders
def build_logos():
    print("logo/")
    variants = {"light": (INK, None), "dark": (CREAM, None),
                "on-cream": (INK, CREAM), "on-ink": (CREAM, INK)}
    for name, (ink, ground) in variants.items():
        write(f"logo/mark/struck-m-{name}.svg", mark_svg(ink, ground))
        for px in (16, 32, 64, 128, 256, 512, 1024):
            mark_png(px, ink, ground).save(out(f"logo/mark/png/struck-m-{name}-{px}.png"))
    for layout in ("horizontal", "stacked"):
        for name, ink in (("light", INK), ("dark", CREAM)):
            svg, w, h = lockup_svg(layout, ink)
            p = write(f"logo/lockup/dbm-lockup-{layout}-{name}.svg", svg)
            for width in ((600, 1200, 2400) if layout == "horizontal" else (400, 800, 1600)):
                svg_to_png(p, out(f"logo/lockup/png/dbm-lockup-{layout}-{name}-{width}.png"), width)


def app_icon(px):
    """macOS-style tile at any size. DESIGN.md section 1.5."""
    big = 1024
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((100, 100, 923, 923), radius=185, fill=CREAM, outline=(26, 19, 32, 31), width=2)
    img.alpha_composite(mark_png(512), (256, 256))
    return img if px == big else img.resize((px, px), Image.LANCZOS)


def square_icon(px):
    """Square tile, no radius, for Windows, Linux and tiny sizes."""
    if px % N == 0:
        return mark_png(px, INK, CREAM)
    return mark_png(N * (px // N + 1), INK, CREAM).resize((px, px), Image.NEAREST)


def build_app_icon():
    print("app-icon/")
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
           f'<rect x="100" y="100" width="824" height="824" rx="185" fill="{CREAM}" stroke="{INK}" stroke-opacity=".12" stroke-width="2"/>'
           f'<g transform="translate(256 256) scale(32)" shape-rendering="crispEdges">'
           + "".join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{c}"/>' for (x, y), c in sorted(mark_cells().items()))
           + "</g></svg>\n")
    write("app-icon/icon.svg", svg)
    for px in (1024, 512, 256, 128):
        app_icon(px).save(out(f"app-icon/icon-{px}.png"))
    # .icns: small sizes use the square tile so the mark stays legible
    iconset = tempfile.mkdtemp(suffix=".iconset")
    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            im = square_icon(px) if px <= 32 else app_icon(px)
            im.save(os.path.join(iconset, f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"))
    if shutil.which("iconutil"):
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", out("app-icon/icon.icns")], check=True)
    else:
        print("  skipped app-icon/icon.icns (iconutil is macOS only)")
    shutil.rmtree(iconset)
    sizes = [16, 24, 32, 48, 64, 128, 256]
    square_icon(256).save(out("app-icon/icon.ico"), sizes=[(s, s) for s in sizes])


def build_web():
    print("web/")
    write("web/favicon.svg", mark_svg(INK, CREAM))
    mark_png(32, INK, CREAM).save(out("web/favicon-32.png"))
    mark_png(48, INK, CREAM).save(out("web/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    tile = Image.new("RGBA", (180, 180), CREAM)
    tile.alpha_composite(mark_png(144), (18, 18))
    tile.save(out("web/apple-touch-icon.png"))


def build_colors():
    print("colors/")
    tokens = {"neutrals": {t: {"light": l, "app_dark": d} for t, l, d in NEUTRALS},
              "accents": {h: {"meaning": m, "app_light": a[0], "app_light_tint": a[1], "app_dark": ad[0],
                              "app_dark_tint": ad[1], "web": w[0], "web_tint": w[1]}
                          for h, (m, a, ad, w) in ACCENTS.items()},
              "logo": {"ink": INK, "cream": CREAM, "slash": CORAL}}
    write("colors/colors.json", json.dumps(tokens, indent=2) + "\n")

    css = ["/* Don't Be Michael colors. Generated by branding/source/build.py. DESIGN.md section 3. */",
           ":root {", "  /* neutrals (both surfaces, light) */"]
    css += [f"  --dbm-{t}: {l};" for t, l, _ in NEUTRALS]
    css += ["", "  /* web accents (loud) */"]
    css += [f"  --dbm-web-{h}: {w[0]};  --dbm-web-{h}-light: {w[1]};" for h, (_, _, _, w) in ACCENTS.items()]
    css += ["", "  /* app accents, light theme (calm) */"]
    css += [f"  --dbm-app-{h}: {a[0]};  --dbm-app-{h}-light: {a[1]};" for h, (_, a, _, _) in ACCENTS.items()]
    css += ["}", "", "/* app dark theme */", ":root[data-theme='dark'] {"]
    css += [f"  --dbm-{t}: {d};" for t, _, d in NEUTRALS]
    css += [f"  --dbm-app-{h}: {ad[0]};  --dbm-app-{h}-light: {ad[1]};" for h, (_, _, ad, _) in ACCENTS.items()]
    css += ["}"]
    write("colors/colors.css", "\n".join(css) + "\n")

    # Adobe Swatch Exchange (Illustrator, Photoshop, InDesign, Figma plugins)
    def swatch(name, hexv):
        r, g, b = (int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5))
        nm = (name + "\0").encode("utf-16-be")
        body = struct.pack(">H", len(name) + 1) + nm + b"RGB " + struct.pack(">fff", r, g, b) + struct.pack(">H", 2)
        return struct.pack(">HI", 0x0001, len(body)) + body
    items = [(f"logo {k}", v) for k, v in tokens["logo"].items()]
    items += [(t, l) for t, l, _ in NEUTRALS]
    items += [(f"web {h}", w[0]) for h, (_, _, _, w) in ACCENTS.items()]
    items += [(f"app {h}", a[0]) for h, (_, a, _, _) in ACCENTS.items()]
    blocks = b"".join(swatch(n, v) for n, v in items)
    write("colors/dont-be-michael.ase", b"ASEF" + struct.pack(">HHI", 1, 0, len(items)) + blocks, "wb")

    # swatch sheet
    def chip(hexv, label, sub=""):
        dark = sum(int(hexv[i:i + 2], 16) for i in (1, 3, 5)) < 380
        fg = CREAM if dark else INK
        return (f'<div class="c" style="background:{hexv};color:{fg}"><b>{label}</b>'
                f'<span>{hexv}</span><i>{sub}</i></div>')
    rows = ['<h2>Neutrals</h2><div class="r">' + "".join(chip(l, t) for t, l, _ in NEUTRALS) + "</div>",
            '<h2>Web accents (loud)</h2><div class="r">' + "".join(chip(w[0], h, m) for h, (m, _, _, w) in ACCENTS.items()) + "</div>",
            '<h2>App accents, light (calm)</h2><div class="r">' + "".join(chip(a[0], h, m) for h, (m, a, _, _) in ACCENTS.items()) + "</div>",
            '<h2>App dark neutrals</h2><div class="r">' + "".join(chip(d, t) for t, _, d in NEUTRALS) + "</div>"]
    html = (f"<html><head><style>{fonts_css('../')}body{{margin:0;padding:40px;background:{CREAM};font-family:Inter;color:{INK};width:1520px}}"
            "h1{font-family:VT323;font-size:48px;margin:0 0 8px}h2{font-family:VT323;font-size:26px;letter-spacing:.06em;margin:26px 0 10px}"
            ".r{display:flex;gap:10px;flex-wrap:wrap}.c{width:128px;height:104px;padding:10px;box-sizing:border-box;border:2px solid #1A1320;"
            "display:flex;flex-direction:column;font-size:12px}.c b{font-weight:500}.c span{font-family:'JetBrains Mono';font-size:11px}"
            ".c i{font-style:normal;font-size:10px;margin-top:auto;opacity:.85}</style></head><body>"
            f"<h1>DON'T BE MICHAEL · COLORS</h1>{''.join(rows)}</body></html>")
    p = write("colors/_palette.html", html)
    chrome(f"file://{p}", out("colors/palette.png"), 1600, 820, transparent=False)
    os.unlink(p)


def build_social():
    print("social/")
    svg, w, h = lockup_svg("horizontal")
    html = (f"<html><head><style>{fonts_css('../')}body{{margin:0;width:1200px;height:630px;background:{CREAM};"
            f"border:0;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding:0 90px;"
            f"box-shadow:inset 0 0 0 12px {INK};font-family:Inter;color:{INK}}}"
            f".l{{width:760px}}.l svg{{width:100%;height:auto;display:block}}"
            f"h1{{font-family:VT323;font-weight:400;font-size:64px;line-height:1.05;margin:34px 0 10px}}"
            f"p{{font-size:26px;margin:0;color:#3D2E4A}}.u{{font-family:VT323;font-size:30px;letter-spacing:.06em;margin-top:30px;color:{CORAL}}}"
            f"</style></head><body><div class='l'>{svg}</div><h1>We reviewed Michael. He did not pass.</h1>"
            f"<p>A team of AI agents that runs your business, on your own machine.</p>"
            f"<div class='u'>DONTBEMICHAEL.COM</div></body></html>")
    p = write("social/_card.html", html)
    chrome(f"file://{p}", out("social/og-card-1200x630.png"), 1200, 630, transparent=False)
    os.unlink(p)


def build_guide_pdf():
    print("brand-guide.pdf")
    guide = out("brand-guide.html")
    chrome(f"file://{guide}", out("brand-guide.pdf"), 0, 0, pdf=True)


if __name__ == "__main__":
    steps = {"logos": build_logos, "app-icon": build_app_icon, "web": build_web,
             "colors": build_colors, "social": build_social, "guide": build_guide_pdf}
    for name in (sys.argv[1:] or steps):
        steps[name]()
    print("done")
