# Offline reproduction

Only `dist/` is published. These tools operate locally and do not upload private data.

## Model and comparison

Requirements: Python 3 and NumPy; Node 18+ for the verification script. Clone the repository with history so `eb6021e` is available for the recovered rainfall aggregate.

```
python3 tools/build_model_comparison.py --data-folder '/path/to/Work on the water project '
node tools/verify.js
```

The folder contains the named synthetic XLSX and two companion CSVs. Metadata must cover the same 450 IDs. This builder deliberately never reads the private real Type A/B CSVs; the existing public well summary is unchanged. Reports are in `build_report.json`, `verification_report.json`, and `layout_report.json`.

## Handoff

Requirements: python-docx, MathJax (`mathjax-full`) and Sharp; LibreOffice and Poppler for PDF/PNG render verification. Use the Codex bundled document runtime when available.

```
node tools/render_equations.js docs/Bengaluru_Borewell_Model_Mathematical_Handoff.md /tmp/borewell-equations
BOREWELL_EQUATION_DIR=/tmp/borewell-equations python3 tools/build_handoff.py
```

Then render the Word output through the document runtime's `render_docx.py --emit_pdf`, inspect every page, and copy the verified PDF into docs. Equation PNGs are temporary inputs, embedded in the Word file; the Markdown is the accessible mathematical source. Display equations are not native editable Word equations.

## Release boundary

Review `docs/site_fix_report.md`. Do not merge or push to main without a deployment instruction. The supplied brief requests a PR on `site-fixes-and-model-comparison` only.
