"""Rebuild orbio-web from a fresh swiss-main drop, re-applying every ORBIO customisation."""
import json, csv, shutil, pathlib, re, sys, base64, math, urllib.parse

SRC = pathlib.Path(sys.argv[1])            # .../swiss-main
OUT = pathlib.Path(sys.argv[2])            # .../orbio-web
PREV = pathlib.Path(sys.argv[3])           # previous orbio-web (for index.html + assets)

EXP = OUT/"experiment"
if OUT.exists(): shutil.rmtree(OUT)
(EXP).mkdir(parents=True)

# ---------- 1. Flask template -> static page ----------
meta = json.load(open(SRC/"data/run_metadata.json"))
def omics():
    srcs=[("neural","flight_ug","outputs/omics/flight_v2/gravity_contrast.csv",SRC/"data/outputs/omics/flight_v2/gravity_contrast.csv","flight_ug vs ground_1g","Paired biological units (n=4 pairs); combined transcriptome score."),
          ("crc_tumor_organoid","sim_ug_clinostat","outputs/omics/crc/gravity_contrast.csv",SRC/"data/outputs/omics/crc/gravity_contrast.csv","sim_ug_clinostat vs ground_1g","Clinostat organoid contrast (n=4 per arm); combined score.")]
    out={}
    for tissue,grav,sf,p,contrast,detail in srcs:
        progs={}
        for row in csv.DictReader(open(p,encoding="utf-8-sig")):
            if row.get("layer")!="combined": continue
            progs[row["program"]]={"delta":float(row["delta"]),"sd":float(row["sd"]),"n":int(row.get("n_pairs") or row.get("n_ug") or 0)}
        if progs: out.setdefault(tissue,{})[grav]={"programs":progs,"sourceFile":sf,"contrast":contrast,"detail":detail}
    return out
t=(SRC/"templates/virtual_experiment.html").read_text()
t=t.replace("{{ url_for('static', filename='css/orbio.css') }}","./css/orbio.css")
t=t.replace("{{ url_for('static', filename='js/app.js') }}","./js/app.js")
t=t.replace("{{ omics_data | tojson }}",json.dumps(omics()))
t=t.replace("{{ run_metadata | tojson }}",json.dumps(meta))
t=t.replace('href="/" aria-label','href="../#technology" target="_top" aria-label')
assert "{{" not in t and "{%" not in t, re.findall(r"{[{%][^}]*[}%]}",t)
for sub in ("css","js"): shutil.copytree(SRC/"static"/sub, EXP/sub)

# Keep the always-visible controls when refreshing an older drawer-based drop.
previous_page = (PREV/"experiment/index.html").read_text()
design = re.search(r'      <section class="experiment-design".*?</section>', previous_page, re.S)
assert design, "experiment design section not found"
t, drawer_count = re.subn(r'    <aside class="experiment-drawer".*?</aside>\s*', '', t, count=1, flags=re.S)
assert drawer_count == 1, "experiment drawer not found"
t = t.replace('<main id="main">', '<main id="main">\n' + design.group(0) + '\n', 1)
ui_path = EXP/"js/ui.js"
ui = ui_path.read_text()
for line in [
    '  const drawer = document.querySelector("#experiment-drawer");\n',
    '  const drawerToggle = document.querySelector("#drawer-toggle");\n',
    '  const drawerPanel = drawer.querySelector(".drawer-panel");\n',
]:
    ui = ui.replace(line, '')
drawer_start = ui.index('  drawerToggle.addEventListener("click"')
drawer_end = ui.index('  drawerPanel.inert = true;', drawer_start) + len('  drawerPanel.inert = true;\n')
ui_path.write_text(ui[:drawer_start] + ui[drawer_end:])

# ---------- 2. palette ----------
css=(EXP/"css/orbio.css").read_text()
previous_css = (PREV/"experiment/css/orbio.css").read_text()
design_css = previous_css[previous_css.index('/* Experiment design */'):previous_css.index('\n.site-footer {')]
drawer_start = css.index('/* Experiment drawer */')
drawer_end = css.index('\n.site-footer {', drawer_start)
css = css[:drawer_start] + design_css + css[drawer_end:]
css = re.sub(r'  \.(?:experiment-drawer|drawer-panel) \{[^}]*\}\n', '', css)
css = css.replace('.control-group select { border-radius: 10px; }', '.control-group select { border-radius: 4px; }')
m=re.search(r':root \{\n  color-scheme: light;(.*?)\n  --header-h', css, re.S)
assert m, "token block not found"
css=css.replace(m.group(0), """:root {
  color-scheme: dark;
  --paper: #0A1322;
  --paper-strong: #16233A;
  --panel: #1D2E49;
  --ink: #DCE3EB;
  --muted: #A3B2C4;
  --line: rgba(220, 227, 235, 0.20);
  --line-strong: rgba(220, 227, 235, 0.40);
  --cobalt: #7FC9F2;
  --cyan: #C3D6E4;
  --teal: #7D90A6;
  --amber: #C9A97E;
  --coral: #C98A8F;
  --ash: #4A5668;
  --snow: #C3D6E4;
  --display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
  --header-h""")
css=css.replace('font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,\n    "Segoe UI", sans-serif;','font-family: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;')
for a,b in [("rgba(247, 244, 238, 0.96)","rgba(10, 19, 34, 0.92)"),("rgba(247, 244, 238, 0.92)","rgba(10, 19, 34, 0.90)"),
            ("rgba(247, 244, 238, 0.18)","rgba(195, 214, 228, 0.18)"),("rgba(251, 250, 246, 0.94)","rgba(29, 46, 73, 0.94)"),
            ("rgba(251, 250, 246, 0.9)","rgba(29, 46, 73, 0.90)"),("rgba(251, 250, 246, 0.88)","rgba(29, 46, 73, 0.88)"),
            ("rgba(251, 250, 246, 0.8)","rgba(29, 46, 73, 0.80)"),("rgba(251, 250, 246, 0.62)","rgba(29, 46, 73, 0.62)"),
            ("rgba(251, 250, 246, 0.15)","rgba(195, 214, 228, 0.12)"),
            ("rgba(16, 34, 53, 0.035)","rgba(220, 227, 235, 0.04)"),("rgba(16, 34, 53, 0.06)","rgba(220, 227, 235, 0.06)"),
            ("rgba(16, 34, 53, 0.08)","rgba(220, 227, 235, 0.08)"),("rgba(16, 34, 53, 0.16)","rgba(220, 227, 235, 0.18)"),
            ("rgba(16, 34, 53, 0.18)","rgba(220, 227, 235, 0.18)"),("rgba(16, 34, 53, 0.28)","rgba(220, 227, 235, 0.26)"),
            ("rgba(16, 34, 53, 0.34)","rgba(220, 227, 235, 0.32)"),("rgba(16, 34, 53, 0.4)","rgba(220, 227, 235, 0.38)"),
            ("rgba(16, 34, 53, 0.45)","rgba(4, 9, 16, 0.55)"),("rgba(16, 34, 53, 0.48)","rgba(4, 9, 16, 0.58)"),
            ("rgba(16, 34, 53, 0.2)","rgba(4, 9, 16, 0.45)"),("rgba(16, 34, 53, 0.1)","rgba(4, 9, 16, 0.45)"),
            ("rgba(15, 121, 200, 0.7)","rgba(127, 201, 242, 0.75)"),("rgba(15, 121, 200, 0.5)","rgba(127, 201, 242, 0.55)"),
            ("rgba(128, 212, 208, 0.55)","rgba(127, 201, 242, 0.35)"),("rgba(128, 212, 208, 0.16)","rgba(127, 201, 242, 0.16)"),
            ("rgba(25, 162, 139, 0.64)","rgba(125, 144, 166, 0.64)"),
            ("background: var(--ink); color: white;","background: var(--cobalt); color: #0A1322;"),
            ("color: white; background: var(--ink);","color: #0A1322; background: var(--cobalt);")]:
    css=css.replace(a,b)
# charts: fit the column, no inner scrollbar; labels sized not to collide
css=re.sub(r'\.chart-scroll \{[^}]*\}', '.chart-scroll { width: 100%; overflow: visible; }', css)
css=re.sub(r'\.chart-scroll > svg \{[^}]*\}', '.chart-scroll > svg { display: block; width: 100%; min-width: 0; height: auto; }', css)
css=re.sub(r'svg text \{ font-size: \d+px;', 'svg text { font-size: 20px;', css, count=1)
css=re.sub(r'\.viewer-field-toggles button\[aria-pressed="true"\] \{[^}]*\}', '.viewer-field-toggles button[aria-pressed="true"] { border-color: var(--cobalt); background: var(--cobalt); color: #0A1322; }', css)
css=css.replace('body { background: linear-gradient(180deg, #fbf9f4 0%, #f3efe6 100%) fixed; color: var(--ink); line-height: 1.55; }',
                'body { background: linear-gradient(180deg, #0A1322 0%, #111D30 100%) fixed; color: var(--ink); line-height: 1.55; }')
css=css.replace('.site-header { backdrop-filter: blur(12px); background: rgba(251, 249, 244, 0.86); box-shadow: 0 1px 0 var(--line); }',
                '.site-header { backdrop-filter: blur(12px); background: rgba(10, 19, 34, 0.92); box-shadow: 0 1px 0 var(--line); }')
css=css.replace('background: rgba(255, 255, 255, 0.82); box-shadow: var(--shadow-card); pointer-events: none; z-index: 2;',
                'background: rgba(10, 19, 34, 0.86); color: var(--ink); box-shadow: var(--shadow-card); pointer-events: none; z-index: 2;')
# the tuber wordmark
css=re.sub(r'\.wordmark-mark \{[^}]*\}',
 '.wordmark-mark {\n  width: 34px; height: 34px; border: 0; border-radius: 50%;\n  background: #FFFFFF; position: relative;\n}\n'
 '.wordmark-mark::after {\n  content: ""; position: absolute; inset: 8%;\n  background: url("../../assets/mascot.webp") center / contain no-repeat;\n}', css, count=1)
css += """

/* --- ORBIO site alignment --- */
h1, h2, h3, .wordmark { font-family: var(--display); letter-spacing: -0.01em; }
.header-context, .figure-label, .chart-unit, .timeline-label { font-family: var(--mono); }
.header-context { color: var(--cobalt); }
.chart-grid line { stroke: rgba(220,227,235,0.16); }
svg text { fill: var(--muted); }
#omics-chart text { font-size: 17px; }

/* presentation mode: no file paths, no dense per-run statistics */
.source-line, #growth-stats-note, #omics-footnote { display: none; }

.site-footer-mountains {
  position: relative; width: 100%; height: 240px; overflow: hidden; margin-top: 56px; background: transparent;
  --mountain-back: #15223A; --mountain-front: #1C2C44; --mountain-snow: #CEDAE4;
  --mountain-snow-secondary: #A3B3C2; --mountain-fog: #0A1322; --mountain-rock: #2B3A52; --mountain-haze: #223247;
}
.site-footer-mountains canvas { display: block; width: 100%; height: 100%; }
.site-footer-note { padding: 10px clamp(1.2rem, 4vw, 4.5rem) 48px; font-size: 1.1rem; color: var(--muted); }
@media (max-width: 767px) {
  .header-status { display: none; }
  .scenario-caption { display: none; }
}
"""
(EXP/"css/orbio.css").write_text(css)

# ---------- 3. chart / 3D colours ----------
def sub(fn, pairs):
    p=EXP/"js"/fn; s=p.read_text()
    for a,b in pairs: s=s.replace(a,b)
    p.write_text(s)
sub("charts.js",[('"#102235"','"#E3EBF2"'),('"#0f79c8"','"#5CC8F5"'),('"#7b6b62"','"#A98BE0"'),
                 ('"#d59a31"','"#E0A96B"'),('"#19a28b"','"#59C9A8"'),('"#138a76"','"#59C9A8"')])
sub("organoid-viewer.js",[('"#367f9d"','"#7FC9F2"'),('"#6c9291"','"#7D90A6"'),('"#ad7b70"','"#C98A8F"'),
                 ('"#59636b"','"#4A5668"'),('"#f7f4ee"','"#0A1322"'),('"#d36d5d"','"#C98A8F"'),('"#0f79c8"','"#7FC9F2"'),
                 ("0xf7f4ee","0xC3D6E4"),("0x0f79c8","0x7FC9F2"),("0x102235","0xDCE3EB")])
sub("microenvironment.js",[('"#d36d5d"','"#C98A8F"'),('"#0f79c8"','"#7FC9F2"')])

# ---------- 4. page head, embedded mode, mountains, height reporting ----------
head='''<link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
    <style>
      html.embedded .site-header, html.embedded .site-footer-mountains, html.embedded .site-footer-note { display: none; }
      html.embedded body { background: transparent; }
      html.embedded, html.embedded body { overflow: visible; height: auto; }
    </style>
    <script>if (window.self !== window.top) document.documentElement.classList.add("embedded");</script>
    <link rel="stylesheet" href="./css/orbio.css">'''
t=t.replace('<link rel="stylesheet" href="./css/orbio.css">', head, 1)
t=t.replace('<meta name="theme-color" content="#f7f4ee">','<meta name="theme-color" content="#0A1322">')
# panels and footers we do not present
for marker in ['Dataset &amp; calibration provenance']:
    i=t.find(f'<details class="figure-info">\n          <summary>{marker}</summary>')
    if i<0:
        m=re.search(r'[ \t]*<details class="figure-info">\s*<summary>'+re.escape(marker)+r'</summary>', t)
        i=m.start() if m else -1
    if i>=0:
        j=t.index('</details>', i)+len('</details>\n')
        t=t[:i]+t[j:]
m=re.search(r'[ \t]*<details class="run-details">', t)
if m:
    j=t.index('</details>', m.start())+len('</details>\n'); t=t[:m.start()]+t[j:]
m=re.search(r'[ \t]*<footer class="site-footer">', t)
if m:
    j=t.index('</footer>', m.start())+len('</footer>\n'); t=t[:m.start()]+t[j:]
MOUNT=(PREV/"experiment/index.html").read_text()
a=MOUNT.index('    <div class="site-footer-mountains"'); b=MOUNT.index("  </body>")
t=t.replace("  </body>", MOUNT[a:b]+"  </body>", 1)
(EXP/"index.html").write_text(t)

# ---------- 5. site shell and assets ----------
shutil.copytree(PREV/"assets", OUT/"assets")
shutil.copy(PREV/"index.html", OUT/"index.html")
shutil.copy(PREV/"README.md", OUT/"README.md")
print("rebuilt:", sorted(p.name for p in OUT.iterdir()))
