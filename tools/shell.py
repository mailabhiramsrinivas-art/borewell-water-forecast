"""Stamp the shared header, sub-navigation and footer onto every page.

Each page marks where the shell goes:
  <!--SHELL:HEADER-->...<!--/SHELL:HEADER-->   and   <!--SHELL:FOOTER-->...<!--/SHELL:FOOTER-->
and declares itself with  <body data-page="forecast">. Run from the repository root:
  python3 tools/shell.py
"""
import os
import re

DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")

NAV = [("overview", "", "Overview"), ("forecast", "forecast/", "Try a forecast"), ("accuracy", "accuracy/", "How accurate"),
       ("drivers", "drivers/", "What moves the water"), ("network", "network/", "Wells affect each other"),
       ("five-year", "five-year/", "ML‑Forecaster"),
       ("physics-sensors", "physics-sensors/", "Stage 2"),
       ("journey", "journey/", "Our journey"), ("next", "next/", "What's next")]
# earlier-stage tools live under "Our journey"
JOURNEY_TOOLS = [("prototype", "prototype/", "Step 1 · First prototype (vendor export)"),
                 ("comparison", "comparison/", "Step 2 · Scenario explorer"),
                 ("validation", "validation/", "Step 2 · Hidden-truth test"),
                 ("models", "models/", "Step 2 · Three models compared")]
SECTION = {k: "journey" for k, _, _ in JOURNEY_TOOLS}
SECTION["five-year-results"] = "five-year"
# Stage 2 (physics + sensors) pages, with their own sub-navigation
STAGE6 = [("physics-sensors", "physics-sensors/", "The model"), ("physics-sensors-results", "physics-sensors/results/", "Results"),
          ("physics-sensors-sensors", "physics-sensors/sensors/", "Sensor faults"),
          ("physics-sensors-terrain", "physics-sensors/terrain/", "Terrain and maps"),
          ("physics-sensors-map", "physics-sensors/map/", "City map"),
          ("physics-sensors-bengaluru", "physics-sensors/bengaluru/", "Bengaluru map"),
          ("physics-sensors-explorer", "physics-sensors/explorer/", "Explore a well")]
SECTION.update({k: "physics-sensors" for k, _, _ in STAGE6[1:]})
REVIEW = "reviewers/"
BANNERS = {   # dated notices on pages that show an earlier iteration (review feedback, 1 October 2026)
    "overview": "The headline numbers on this page are from <strong>iteration 1</strong> (a one-year digital twin, September 2026). They are kept as a record and have been superseded.",
    "forecast": "<strong>Iteration 1</strong>: one-year digital twin, September 2026. Kept as a record.",
    "accuracy": "<strong>Iteration 1</strong>: one-year digital twin, September 2026, eight test dates. Kept as a record.",
    "drivers": "<strong>Iteration 1</strong>: one-year digital twin, September 2026. The value of rain depends on how a twin's recharge is built; later twins differ.",
    "network": "A <strong>separate synthetic exploration</strong> on two simulated cities. It is not part of the forecasters under review. Real use needs well locations and one pumping test.",
    "five-year": "<strong>Iteration 1</strong> of the five-year twin: one well population, recharge later found too generous. The later typed and typed + paved iterations are reported in the team's response.",
    "five-year-results": "<strong>Iteration 1</strong> of the five-year twin: one well population, recharge later found too generous. The later typed and typed + paved iterations are reported in the team's response.",
    "prototype": "<strong>Iteration 1, step 1</strong> (July 2026), kept as a record.",
    "comparison": "<strong>Iteration 1, step 2</strong> (September 2026), kept as a record.",
    "validation": "<strong>Iteration 1, step 2</strong> (September 2026), kept as a record.",
    "models": "<strong>Iteration 1, step 2</strong> (September 2026), kept as a record.",
}
ANCHOR = {"five-year": ("#response", "Typed + paved results, as reported in the response →"),
          "five-year-results": ("#response", "Typed + paved results, as reported in the response →"),
          "drivers": ("#rain", "Why the value of rain differs between iterations →"),
          "network": ("#neighbours", "Which forecaster uses neighbours, and how →")}


def banner(page, p):
    if page not in BANNERS:
        return ""
    anchor, link = ANCHOR.get(page, ("", "Which numbers are current, and from which simulated world →"))
    return (f'\n<div class="iteration-banner" role="note" style="background:#fff8ea;border-bottom:1px solid #f0dcae;font-size:.92rem">'
            f'<div class="wrap" style="padding-top:9px;padding-bottom:9px">{BANNERS[page]} '
            f'<a href="{p}{REVIEW}{anchor}">{link}</a></div></div>')


DROP = ('<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C11 11 7 16 7 21.5a9 9 0 0 0 18 0C25 16 21 11 16 3Z" fill="#5fc4d8"/>'
        '<path d="M11.5 22c2.8 1.8 6.2 1.8 9 0" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>')


def header(page, p):
    items = []
    for key, href, label in NAV:
        cur = ' aria-current="page"' if key == page else (' class="section-active"' if SECTION.get(page) == key else "")
        items.append(f'<li><a href="{p}{href}"{cur}>{label}</a></li>')
    html = (f'<a class="skip" href="#main">Skip to content</a>\n<header class="site-header"><div class="wrap">'
            f'<a class="brand" href="{p}">{DROP}<span>Borewell Forecast</span><span class="poc">Proof of concept</span></a>'
            f'<button class="menu-toggle" aria-expanded="false" aria-controls="site-nav">Menu</button>'
            f'<nav class="site-nav" id="site-nav" aria-label="Main"><ul>{"".join(items)}</ul></nav></div></header>')
    if SECTION.get(page) == "journey" or page == "journey":
        cur = ' aria-current="page"'
        tools = "".join(f'<a href="{p}{href}"{cur if key == page else ""}>{label}</a>' for key, href, label in JOURNEY_TOOLS)
        html += f'\n<nav class="subnav" aria-label="Earlier-step tools"><div class="wrap"><span>Earlier steps:</span>{tools}</div></nav>'
    if SECTION.get(page) == "physics-sensors" or page == "physics-sensors":
        cur = ' aria-current="page"'
        tools = "".join(f'<a href="{p}{href}"{cur if key == page else ""}>{label}</a>' for key, href, label in STAGE6)
        html += f'\n<nav class="subnav" aria-label="Stage 2 pages"><div class="wrap"><span>Stage 2:</span>{tools}</div></nav>'
    return html + banner(page, p)


def footer(p):
    return (f'<footer class="site-footer"><div class="wrap">'
            f'<div><strong>Borewell Forecast</strong> is a proof of concept for forecasting groundwater levels in Bengaluru borewells. '
            f'Results are labelled by where the data came from: <span class="source real">vendor export</span> (15 days, July 2026, in the vendor\'s real format but with demonstration water-level values), '
            f'<span class="source synthetic">synthetic test system</span> (450 simulated wells with a known answer) or '
            f'<span class="source twin">digital twin</span> (physics-based simulations of the 579 wells: one year in iteration 1, five years in later iterations and in Stage 2). '
            f'No real water-level measurement has been used yet, and nothing here is yet a validated field forecast. '
            f'Built by the FARII consortium.</div>'
            f'<div><strong>Explore</strong><ul>{"".join(f"<li><a href={chr(34)}{p}{h}{chr(34)}>{l}</a></li>" for _, h, l in NAV)}</ul></div>'
            f'<div><strong>More</strong><ul><li><a href="{p}{REVIEW}">For reviewers: current numbers</a></li><li><a href="{p}glossary/">Glossary of terms</a></li>'
            f'{"".join(f"<li><a href={chr(34)}{p}{h}{chr(34)}>{l}</a></li>" for _, h, l in JOURNEY_TOOLS)}'
            f'<li><a href="https://github.com/mailabhiramsrinivas-art/borewell-water-forecast">Source code</a></li></ul></div>'
            f'</div></footer>')


def build_version():
    """Short hash of every script and stylesheet, appended as ?v= so browsers never mix old and new files."""
    import hashlib
    h = hashlib.sha1()
    for root, _, files in sorted(os.walk(DIST)):
        for f in sorted(files):
            if f.endswith((".js", ".css")):
                h.update(open(os.path.join(root, f), "rb").read())
    return h.hexdigest()[:10]


VERSION = None


def stamp(path):
    global VERSION
    VERSION = VERSION or build_version()
    html = open(path, encoding="utf-8").read()
    html = re.sub(r'((?:href|src)="(?!https?:|data:)[^"?]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"', lambda m: f'{m.group(1)}?v={VERSION}"', html)
    m = re.search(r'<body[^>]*data-page="([^"]+)"', html)
    if not m or "<!--SHELL:HEADER-->" not in html:
        open(path, "w", encoding="utf-8").write(html)
        return False
    page = m.group(1)
    depth = os.path.relpath(path, DIST).count(os.sep)
    p = "./" if depth == 0 else "../" * depth
    html = re.sub(r"<!--SHELL:HEADER-->.*?<!--/SHELL:HEADER-->", lambda _: f"<!--SHELL:HEADER-->\n{header(page, p)}\n<!--/SHELL:HEADER-->", html, flags=re.S)
    html = re.sub(r"<!--SHELL:FOOTER-->.*?<!--/SHELL:FOOTER-->", lambda _: f"<!--SHELL:FOOTER-->\n{footer(p)}\n<!--/SHELL:FOOTER-->", html, flags=re.S)
    open(path, "w", encoding="utf-8").write(html)
    return True


if __name__ == "__main__":
    done = []
    for root, _, files in os.walk(DIST):
        for f in files:
            if f == "index.html" and stamp(os.path.join(root, f)):
                done.append(os.path.relpath(os.path.join(root, f), DIST))
    print("stamped:", ", ".join(sorted(done)))
