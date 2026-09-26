# Offline reproduction

Only `dist/` is published. These tools operate locally and do not upload private data.

## Model and comparison

Requirements: Python 3 and NumPy; Node 18+ for the verification script. Clone the repository with history so `eb6021e` is available for the recovered rainfall aggregate.

```
python3 tools/build_model_comparison.py --data-folder '/path/to/Work on the water project '
node tools/verify.js
```

The folder contains the named synthetic XLSX and two companion CSVs. Metadata must cover the same 450 IDs. This builder deliberately never reads the private real Type A/B CSVs; the existing public well summary is unchanged. Reports are in `build_report.json`, `verification_report.json`, and `layout_report.json`.

## Investor site pages and shared shell

The site has a shared design system in `dist/assets/site.css` and `dist/assets/site.js` (navigation and a small SVG chart kit). Every page carries `<!--SHELL:HEADER-->` / `<!--SHELL:FOOTER-->` markers and a `data-page` attribute on `<body>`.

```
python3 tools/export_site_data.py   # rebuilds dist/data/monitoring.json, monitoring_summary.json, network.json
python3 tools/shell.py              # stamps header/footer on every page and versions script/style links (?v=hash)
```

`export_site_data.py` reads the analysis folders that sit next to this repository in the project folder: `long_history_model/` (one year of digital-twin monitoring, weekly resting-level forecasts) and `well_interaction_model/` (synthetic well-interaction model). Run those analyses first. Re-run `shell.py` after editing any page, script or stylesheet, so the navigation stays identical everywhere and browsers fetch the new files.

Pages: `/` overview · `/forecast/` · `/accuracy/` · `/drivers/` · `/network/` · `/journey/` · `/next/` · `/glossary/`. Earlier-stage tools: `/prototype/` (Stage 1, real 15-day data; formerly the site root), `/comparison/`, `/validation/`, `/models/` (Stage 2). Every result is labelled with its data source: real pump data, synthetic test system, or digital twin.

## Handoff

Requirements: python-docx, MathJax (`mathjax-full`) and Sharp; LibreOffice and Poppler for PDF/PNG render verification. Use the Codex bundled document runtime when available.

```
node tools/render_equations.js docs/Bengaluru_Borewell_Model_Mathematical_Handoff.md /tmp/borewell-equations
BOREWELL_EQUATION_DIR=/tmp/borewell-equations python3 tools/build_handoff.py
```

Then render the Word output through the document runtime's `render_docx.py --emit_pdf`, inspect every page, and copy the verified PDF into docs. Equation PNGs are temporary inputs, embedded in the Word file; the Markdown is the accessible mathematical source. Display equations are not native editable Word equations.

## Release boundary

Review `docs/site_fix_report.md`. Do not merge or push to main without a deployment instruction. The supplied brief requests a PR on `site-fixes-and-model-comparison` only.
