"""Rebuild every asset in the Don't Be Michael brand kit (design system v2, Studio).

    python3 branding/source/build.py

Needs Python 3.9+, Pillow and fontTools (`pip install pillow fonttools`), plus
Google Chrome for the PNG lockups, social card, palette sheet and PDF guide. Set
CHROME to the Chrome binary if it is not at the default macOS path. `iconutil`
(macOS only) builds the .icns; elsewhere that one file is skipped.

Everything is derived from two sources so nothing can drift:
  - the Struck M cell grid below (DESIGN.md section 1.4)
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
# Logo colors (DESIGN.md 1.4, 3.6). Fixed: the mark does not follow the theme.
INK, CORAL = "#1A1320", "#FF6B6B"          # M on light, the slash
MARK_DARK = "#ECEAF4"                      # M on dark
CREAM = "#FFFDF5"                          # app icon tile and favicon ground (1.6)
GROUND_LIGHT, GROUND_DARK = "#F7F7FB", "#14131C"

NEUTRALS = [  # token, light, dark. DESIGN.md 3.1
    ("bg", "#F7F7FB", "#14131C"), ("floor", "#E9E7F7", "#26223B"),
    ("card", "#FFFFFF", "#1F1E2B"), ("card-2", "#FAFAFD", "#24233A"),
    ("rail", "#F8F7FC", "#181722"), ("chrome", "#F1F0F8", "#1B1A26"),
    ("ink", "#1E1B2E", "#ECEAF4"), ("ink-2", "#4A4660", "#CFCCDD"),
    ("ink-3", "#6C6884", "#A5A2B8"), ("ink-4", "#B4B1C6", "#8C89A0"),
    ("line", "#E8E6F2", "rgba(255,255,255,.09)"), ("line-2", "#DAD7EA", "rgba(255,255,255,.14)"),
    ("line-input", "#8F8AA6", "#76728C"), ("neutral-soft", "#F0EFF5", "#2A2938"),
]
# hue: meaning, (base, soft, text) light, (base, soft, text) dark. DESIGN.md 3.2
ACCENTS = {
    "coral":  ("Needs you. Only the owner's to-dos", ("#FF5A5F", "#FFECEC", "#C8303A"), ("#FF5A5F", "rgba(255,90,95,.16)", "#FF8C90")),
    "green":  ("Done, on, live, good",               ("#1FB872", "#E3F7EC", "#157D4D"), ("#34CD8A", "rgba(52,205,138,.14)", "#34CD8A")),
    "blue":   ("Working",                            ("#4C6FFF", "#E8EDFF", "#3553E8"), ("#8FA3FF", "rgba(124,147,255,.16)", "#8FA3FF")),
    "violet": ("Thinking, a question",               ("#8B5CF6", "#F0EAFE", "#7043E6"), ("#B69CFF", "rgba(167,139,250,.17)", "#B69CFF")),
    "amber":  ("Sticky notes, proposals, loops",     ("#F2A93B", "#FFF4DF", "#8F5C07"), ("#F2B45A", "rgba(242,180,90,.15)", "#F2B45A")),
    "indigo": ("Michael, links, focus, requests",    ("#6C5CE7", "#EEEBFD", "#4338CA"), ("#9D90FF", "rgba(157,144,255,.16)", "#A99FFF")),
}
EXTRA = [  # token, light, dark. DESIGN.md 3.2, 3.3
    ("coral-strong", "#D4363D", "#FF5A5F"), ("on-coral", "#FFFFFF", "#14131C"),
    ("act-request", "#5B55C9", "#8F89F2"),
]
# department: roles, l, m, d, acc (light). DESIGN.md 3.4. Dark values are derived.
DEPTS = {
    "front-desk": ("Executive Admin", "#FFE4EC", "#F7C3D2", "#EBA6BA", "#E25A83"),
    "support":    ("Customer Support", "#DDEEFF", "#B4D5F8", "#93BEEE", "#3D8BE6"),
    "sales":      ("Sales Director", "#FFF3CC", "#F8DF95", "#EDCB6E", "#D29B0B"),
    "finance":    ("Finance", "#D8F5E8", "#AEE6CD", "#8DD5B5", "#1FA872"),
    "marketing":  ("Marketing", "#FFE6D8", "#F9C8AE", "#EEB090", "#E57B45"),
    "people":     ("HR Manager", "#EFE6FC", "#D6C5F4", "#C1AAEA", "#8A63E0"),
    "it":         ("IT Engineer, IT Security", "#E0E6F7", "#BAC5E8", "#9DABDA", "#5468C4"),
    "operations": ("Supply Chain, Inventory & Shipping, Quality Control", "#D5F3F4", "#A9E3E5", "#86D2D5", "#169BA3"),
    "team":       ("A new job from the hire wizard", "#EDEBF6", "#D8D5EA", "#C4C0DE", "#6C6884"),
}
SHADOWS = {  # DESIGN.md 3.7
    "shadow-sm": ("0 1px 2px rgba(30,27,46,.05)", "0 1px 2px rgba(0,0,0,.35)"),
    "shadow-md": ("0 1px 2px rgba(30,27,46,.05), 0 6px 18px rgba(62,52,140,.08)", "0 1px 2px rgba(0,0,0,.35), 0 8px 22px rgba(0,0,0,.32)"),
    "shadow-lg": ("0 1px 2px rgba(30,27,46,.05), 0 10px 30px rgba(62,52,140,.10)", "0 1px 2px rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.40)"),
    "shadow-hub": ("0 1px 2px rgba(30,27,46,.05), 0 10px 26px rgba(92,76,220,.14)", "0 1px 2px rgba(0,0,0,.35), 0 10px 26px rgba(0,0,0,.45)"),
    "shadow-coral": ("0 4px 14px rgba(212,54,61,.30)", "0 4px 14px rgba(255,90,95,.25)"),
}
RADII = {"r-xs": 3, "r-sm": 6, "r-md": 9, "r-lg": 12, "r-xl": 14, "r-2xl": 16, "r-pill": 999}  # DESIGN.md 6.2


def dark_dept(m, acc):
    """DESIGN.md 3.4: dark pastel families derived from m and acc in HLS."""
    import colorsys

    def hl(hexc, L, S):
        r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
        h, _, _ = colorsys.rgb_to_hls(r, g, b)
        r, g, b = colorsys.hls_to_rgb(h, L, S)
        return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))
    return hl(m, .36, .34), hl(m, .28, .30), hl(m, .22, .28), hl(acc, .70, .80)


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
SORA = os.path.join(KIT, "fonts", "sora", "Sora-Variable.ttf")
WORDMARK = "Don\u2019t Be Michael"
WEIGHT = 600      # DESIGN.md section 1.5
TRACK = -0.02     # letter-spacing, em
_SORA = None


def sora():
    """Sora pinned to the wordmark weight (the variable font's default is 400)."""
    global _SORA
    if _SORA is None:
        from fontTools.varLib.instancer import instantiateVariableFont
        _SORA = instantiateVariableFont(TTFont(SORA), {"wght": WEIGHT})
    return _SORA


def kerning(f):
    """Pair kerning from GPOS PairPos lookups (format 1 and 2), in font units."""
    pairs = {}
    if "GPOS" not in f:
        return lambda a, b: 0
    gpos = f["GPOS"].table
    idx = {i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == "kern" for i in fr.Feature.LookupListIndex}
    classes = []
    for i in idx:
        lk = gpos.LookupList.Lookup[i]
        for st in lk.SubTable:
            if lk.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, "LookupType", 2) != 2 and lk.LookupType not in (2, 9):
                continue
            if st.Format == 1:
                for first, ps in zip(st.Coverage.glyphs, st.PairSet):
                    for pv in ps.PairValueRecord:
                        v = getattr(pv.Value1, "XAdvance", 0) or 0
                        pairs.setdefault((first, pv.SecondGlyph), v)
            elif st.Format == 2:
                classes.append(st)

    def get(a, b):
        if (a, b) in pairs:
            return pairs[(a, b)]
        for st in classes:
            if a not in st.Coverage.glyphs:
                continue
            c1 = st.ClassDef1.classDefs.get(a, 0)
            c2 = st.ClassDef2.classDefs.get(b, 0)
            v = getattr(st.Class1Record[c1].Class2Record[c2].Value1, "XAdvance", 0) or 0
            if v:
                return v
        return 0
    return get


def text_paths(text, size, x0, baseline):
    """Outline text into SVG path data with kerning and tracking. Returns (d, width)."""
    f = sora()
    upm = f["head"].unitsPerEm
    gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    kern = kerning(f)
    k = size / upm
    x, parts, prev = x0, [], None
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            continue
        if prev:
            x += kern(prev, name) * k
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (k, 0, 0, -k, x, baseline)))
        parts.append(pen.getCommands())
        x += hmtx[name][0] * k + TRACK * size
        prev = name
    return " ".join(p for p in parts if p), x - x0 - TRACK * size


def lockup_svg(layout, ink=INK, mark_ink=INK):
    """Mark plus outlined Sora wordmark. layout: 'horizontal' or 'stacked'. DESIGN.md 1.5."""
    f = sora()
    upm, cap = f["head"].unitsPerEm, f["OS/2"].sCapHeight
    m = 320.0                                  # mark size in SVG units
    size = 0.58 * m / (cap / upm)              # cap height is 58% of the mark
    capk = cap / upm * size
    gap = m * 10 / 26
    pad = m * 2 / 16                           # clear space: 2 cells
    _, tw = text_paths(WORDMARK, size, 0, 0)
    if layout == "horizontal":
        base = pad + m / 2 + capk / 2
        d, _ = text_paths(WORDMARK, size, pad + m + gap, base)
        w, h = pad + m + gap + tw + pad, m + 2 * pad
        mark_at = (pad, pad)
    else:
        m2 = m * 1.6
        pad = m2 * 2 / 16
        w = max(tw, m2) + 2 * pad
        base = pad + m2 + gap + capk
        d, _ = text_paths(WORDMARK, size, (w - tw) / 2, base)
        h = base + pad
        mark_at, m = ((w - m2) / 2, pad), m2
    s_ = m / 16
    cells = "".join(
        f'<rect x="{mark_at[0] + x * s_:.2f}" y="{mark_at[1] + y * s_:.2f}" width="{s_:.2f}" height="{s_:.2f}" fill="{c}"/>'
        for (x, y), c in sorted(mark_cells(mark_ink).items()))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">'
            f'<g shape-rendering="crispEdges">{cells}</g>'
            f'<path d="{d}" fill="{ink}"/></svg>\n'), w, h


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
    fams = [("Sora", "sora/Sora-Variable.ttf", "100 800"),
            ("IBM Plex Mono", "ibmplexmono/IBMPlexMono-Regular.ttf", "400"),
            ("IBM Plex Mono", "ibmplexmono/IBMPlexMono-Medium.ttf", "500"),
            ("IBM Plex Mono", "ibmplexmono/IBMPlexMono-SemiBold.ttf", "600"),
            ("JetBrains Mono", "jetbrainsmono/JetBrainsMono-Variable.ttf", "100 800")]
    return "".join(f"@font-face{{font-family:'{n}';src:url('{prefix}fonts/{p}');font-weight:{w}}}\n" for n, p, w in fams)


# ---------------------------------------------------------------- builders
def build_logos():
    print("logo/")
    variants = {"light": (INK, None), "dark": (MARK_DARK, None),
                "on-cream": (INK, CREAM), "on-ink": (MARK_DARK, GROUND_DARK)}
    for name, (ink, ground) in variants.items():
        write(f"logo/mark/struck-m-{name}.svg", mark_svg(ink, ground))
        for px in (16, 32, 64, 128, 256, 512, 1024):
            mark_png(px, ink, ground).save(out(f"logo/mark/png/struck-m-{name}-{px}.png"))
    for layout in ("horizontal", "stacked"):
        for name, ink, dark_mark in (("light", "#1E1B2E", INK), ("dark", MARK_DARK, MARK_DARK)):
            svg, w, h = lockup_svg(layout, ink, dark_mark)
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
    depts = {k: {"roles": r, "light": {"l": l, "m": m, "d": d, "acc": a},
                 "dark": dict(zip(("l", "m", "d", "acc"), dark_dept(m, a)))}
             for k, (r, l, m, d, a) in DEPTS.items()}
    tokens = {"version": "2 (Studio)",
              "neutrals": {t: {"light": l, "dark": d} for t, l, d in NEUTRALS},
              "accents": {h: {"meaning": mn, "light": dict(zip(("base", "soft", "text"), lt)),
                              "dark": dict(zip(("base", "soft", "text"), dk))}
                          for h, (mn, lt, dk) in ACCENTS.items()},
              "extra": {t: {"light": l, "dark": d} for t, l, d in EXTRA},
              "departments": depts,
              "shadows": {t: {"light": l, "dark": d} for t, (l, d) in SHADOWS.items()},
              "radii_px": RADII,
              "fonts": {"ui": "Sora", "mono": "IBM Plex Mono", "terminal": "JetBrains Mono"},
              "logo": {"m_on_light": INK, "m_on_dark": MARK_DARK, "slash": CORAL,
                       "icon_tile": CREAM, "ground_light": GROUND_LIGHT, "ground_dark": GROUND_DARK}}
    write("colors/colors.json", json.dumps(tokens, indent=2) + "\n")

    css = ["/* Don't Be Michael tokens, design system v2 (Studio). Generated by branding/source/build.py.",
           "   DESIGN.md sections 3, 4 and 6. Light in :root, dark under [data-theme='dark']. */", ":root {"]
    css += [f"  --dbm-{t}: {l};" for t, l, _ in NEUTRALS]
    css += [f"  --dbm-{h}: {lt[0]};  --dbm-{h}-soft: {lt[1]};  --dbm-{h}-text: {lt[2]};" for h, (_, lt, _) in ACCENTS.items()]
    css += [f"  --dbm-{t}: {l};" for t, l, _ in EXTRA]
    css += [f"  --dbm-dept-{k}-l: {l};  --dbm-dept-{k}-m: {m};  --dbm-dept-{k}-d: {d};  --dbm-dept-{k}-acc: {a};"
            for k, (_, l, m, d, a) in DEPTS.items()]
    css += [f"  --dbm-{t}: {l};" for t, (l, _) in SHADOWS.items()]
    css += [f"  --dbm-{t}: {v}px;" for t, v in RADII.items()]
    css += ["  --dbm-font-ui: 'Sora', system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', 'SF Arabic', 'Noto Sans Arabic', sans-serif;",
            "  --dbm-font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', monospace;",
            "  --dbm-font-terminal: 'JetBrains Mono', ui-monospace, monospace;"]
    css += ["}", "", "/* dark theme (the app; the website is light only) */", ":root[data-theme='dark'] {"]
    css += [f"  --dbm-{t}: {d};" for t, _, d in NEUTRALS]
    css += [f"  --dbm-{h}: {dk[0]};  --dbm-{h}-soft: {dk[1]};  --dbm-{h}-text: {dk[2]};" for h, (_, _, dk) in ACCENTS.items()]
    css += [f"  --dbm-{t}: {d};" for t, _, d in EXTRA]
    for k, (_, l, m, d, a) in DEPTS.items():
        dl, dm, dd, da = dark_dept(m, a)
        css.append(f"  --dbm-dept-{k}-l: {l};  --dbm-dept-{k}-m: {dm};  --dbm-dept-{k}-d: {dd};  --dbm-dept-{k}-acc: {da};")
    css += [f"  --dbm-{t}: {d};" for t, (_, d) in SHADOWS.items()]
    css += ["}"]
    write("colors/colors.css", "\n".join(css) + "\n")

    # Adobe Swatch Exchange (Illustrator, Photoshop, InDesign, Figma plugins). Solid colors only.
    def swatch(name, hexv):
        r, g, b = (int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5))
        nm = (name + "\0").encode("utf-16-be")
        body = struct.pack(">H", len(name) + 1) + nm + b"RGB " + struct.pack(">fff", r, g, b) + struct.pack(">H", 2)
        return struct.pack(">HI", 0x0001, len(body)) + body
    solid = lambda v: v.startswith("#")
    items = [("logo m", INK), ("logo m dark", MARK_DARK), ("logo slash", CORAL)]
    items += [(t, l) for t, l, _ in NEUTRALS if solid(l)]
    items += [(f"{h} {role}", v) for h, (_, lt, _) in ACCENTS.items() for role, v in zip(("base", "soft", "text"), lt)]
    items += [(t, l) for t, l, _ in EXTRA]
    items += [(f"dept {k} {part}", v) for k, (_, *vals) in DEPTS.items() for part, v in zip(("l", "m", "d", "acc"), vals)]
    blocks = b"".join(swatch(n, v) for n, v in items)
    write("colors/dont-be-michael.ase", b"ASEF" + struct.pack(">HHI", 1, 0, len(items)) + blocks, "wb")

    # swatch sheet
    def chip(hexv, label, sub=""):
        dark = solid(hexv) and sum(int(hexv[i:i + 2], 16) for i in (1, 3, 5)) < 380
        fg = "#FFFFFF" if dark else "#1E1B2E"
        return (f'<div class="c" style="background:{hexv};color:{fg}"><b>{label}</b>'
                f'<span>{hexv}</span><i>{sub}</i></div>')
    rows = ['<h2>Neutrals, light</h2><div class="r">' + "".join(chip(l, t) for t, l, _ in NEUTRALS if solid(l)) + "</div>",
            '<h2>Accents: base, soft, text</h2><div class="r">' + "".join(
                chip(lt[0], h, mn) + chip(lt[1], h + " soft") + chip(lt[2], h + " text") for h, (mn, lt, _) in ACCENTS.items()) + "</div>",
            '<h2>Departments</h2><div class="r">' + "".join(
                chip(m, k, r) for k, (r, l, m, d, a) in DEPTS.items()) + "</div>",
            '<h2>Neutrals, dark</h2><div class="r">' + "".join(chip(d, t) for t, _, d in NEUTRALS if solid(d)) + "</div>"]
    html = (f"<html><head><style>{fonts_css('../')}body{{margin:0;padding:40px;background:{GROUND_LIGHT};font-family:Sora;color:#1E1B2E;width:1520px}}"
            "h1{font-size:34px;font-weight:600;letter-spacing:-.03em;margin:0 0 6px}h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#6C6884;margin:24px 0 10px}"
            ".r{display:flex;gap:10px;flex-wrap:wrap}.c{width:128px;height:96px;padding:10px;box-sizing:border-box;border:1px solid #E8E6F2;border-radius:12px;"
            "display:flex;flex-direction:column;font-size:12px}.c b{font-weight:600}.c span{font-family:'IBM Plex Mono';font-size:11px}"
            ".c i{font-style:normal;font-size:10px;margin-top:auto;opacity:.85;line-height:1.2}</style></head><body>"
            f"<h1>Don\u2019t Be Michael colors</h1>{''.join(rows)}</body></html>")
    p = write("colors/_palette.html", html)
    chrome(f"file://{p}", out("colors/palette.png"), 1600, 1010, transparent=False)
    os.unlink(p)


def build_social():
    """1200 x 630 link preview. DESIGN.md 9.7: lockup, headline, studio crop."""
    print("social/")
    svg, w, h = lockup_svg("horizontal", "#1E1B2E", INK)
    ref = os.path.join(KIT, "reference", "studio", "home-light.png")
    crop = out("social/_studio.png")
    Image.open(ref).crop((40, 50, 1000, 690)).save(crop)
    html = (f"<html><head><style>{fonts_css('../')}body{{margin:0;width:1200px;height:630px;overflow:hidden;background:{GROUND_LIGHT};"
            f"font-family:Sora;color:#1E1B2E;position:relative}}"
            f".t{{position:absolute;left:72px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center}}"
            f".l{{width:300px}}.l svg{{width:100%;height:auto;display:block}}"
            f"h1{{font-weight:600;font-size:46px;line-height:1.08;letter-spacing:-.035em;margin:34px 0 14px}}"
            f"p{{font-size:20px;line-height:1.45;margin:0;color:#4A4660}}"
            f".u{{font-family:'IBM Plex Mono';font-weight:600;font-size:15px;letter-spacing:.08em;margin-top:28px;color:#6C6884}}"
            f".s{{position:absolute;right:0;top:95px;width:660px;-webkit-mask-image:radial-gradient(420px 330px at 55% 52%,#000 60%,transparent 100%)}}"
            f"</style></head><body><img class='s' src='_studio.png'><div class='t'><div class='l'>{svg}</div>"
            f"<h1>Michael finally learned to delegate.</h1>"
            f"<p>An AI office for your small business. Talk to Michael; the team does the work on your computer.</p>"
            f"<div class='u'>DONTBEMICHAEL.COM</div></div></body></html>")
    p = write("social/_card.html", html)
    chrome(f"file://{p}", out("social/og-card-1200x630.png"), 1200, 630, transparent=False)
    os.unlink(p)
    os.unlink(crop)


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
