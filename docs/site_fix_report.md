# Site fixes and model comparison — review report

Branch: `site-fixes-and-model-comparison`. **Do not merge automatically.** Only pushes to main publish the live site.

## Changes against the brief

| Item | Completed change |
|---|---|
| A1 | Learn each rain kernel delay from raw rain on observed days 121–150; fit final days 1–150. Shared feature specification and browser core; 50 Python/JS feature probes. Removed forward-only daily-change decay. |
| A2 | Constrain pumping ≥0, rain ≤0, AR in [0,0.98], supply-shortfall and demand ≥0. All forecast days checked through 3 months, 1 year and 5 years. |
| A3 | Null/undefined guard, no-reading message, labelled datalist, clear stale result and tool state. |
| A4 | No forecasts when no reading passed screening; actual latest timestamp used everywhere. |
| A5 | Plot observed dates by elapsed days, preserving BW046's forecast and correcting its first label to 14d ago. |
| A6 | Wrap labels and controls together; all four pages checked at five widths. |
| B1 | 80th-percentile width multiplier learned on inner window only. Report untouched holdout undercoverage; shared forward band and explicit √horizon extension. 95% is a nominal z-rescaling, not independently calibrated. |
| B2 | Full 365-day synthetic seasonal calendar, preserving Jan–Jun and adding seeded monsoon assumptions; lookup by forecast date, retaining prior rain for lag convolution. |
| B3 | Explain actual future pumping, rain, supply and demand are supplied in the conditional test. |
| B4 | Regenerate DOCX/PDF, add §§25–28, fix §20 paths, §5.6 clock encoding and §10.4 R². Render structured display equations and visually verify all pages. |
| C | New Page 4: three model cards, common holdout chart, bands, checkpoint errors, six-month future chart, all requested error comparisons, static ablation, baselines, sensor toggle, comparison matrix, data contract, restored real panel, and WebMCP tool. |

## Before and after

### A1 — median 180-day replay change (m bgs)

Replays use actual in-history drivers and final fitted coefficients; they are diagnostics, not independent validation.

| Scenario | Truth | Old Page 2 | Corrected replay |
|---|---:|---:|---:|
| recharge dominated | -4.949 | 1.31 | -5.042 |
| stable control | 0.198 | 1.25 | 0.518 |
| structural change | 1.001 | 3.49 | 1.604 |
| mixed response | 5.447 | 6.33 | 5.695 |

All 7 non-drift scenarios have the correct sign and median difference ≤1.5 m. See `tools/build_report.json` for the full table.

### A2 — scenario order

Before: 40 negative pumping and 33 positive rain coefficients (73 violations). After: **0 wrong-sign coefficients; 0 forecast ordering violations** across 450 wells, 3 horizons, 8,100 scenario paths, checking every day. Equality is permitted at zero coefficient or construction/display bounds.

### B1 — intervals

Before: 94.4% coverage overall / 99.9% excluding drift; about 1.32 m mean half-width. After: inner coverage **80.0%**, multiplier **0.228571897**; final coverage **63.007% overall / 66.714% excluding drift**, mean half-width **0.327 m**. The nominal range undercovers the later rainy period. No final-test tuning was used; the page and handoff report this explicitly. >30-day √horizon growth is unvalidated extrapolation.

## Final Page 4 metrics

All are the same 30-day hidden static-level target. Bias is prediction minus truth. Main rows use 13,500 well-days. Baselines carry no claimed interval.

| Method | MAE all | MAE no drift | RMSE all | Bias all | 80% coverage all | Half-width all |
|---|---:|---:|---:|---:|---:|---:|
| M1 | 4.471 m | 4.214 m | 7.691 m | +4.427 m | 98.526% | 26.126 m |
| M2 | 3.905 m | 3.678 m | 7.066 m | +3.403 m | 98.704% | 26.107 m |
| M3 | 0.501 m | 0.280 m | 1.083 m | +0.329 m | 63.007% | 0.327 m |
| M1_static | 0.692 m | 0.497 m | 1.196 m | +0.503 m | 100.000% | 25.993 m |
| persistence | 0.921 m | 0.783 m | 1.307 m | +0.034 m | — | — |
| linear60 | 0.583 m | 0.352 m | 1.160 m | +0.542 m | — | — |

M1/M2 and baselines match the prototype reference values. Corrected M3 is 0.501/0.280 m versus the old supplied-effective-rain 0.446/0.221 m: it now learns a coarse rain kernel and enforces signs instead of receiving the hidden generator transform. This stricter information contract is the reason for the difference, not a change in the final target or split. The data-improvement story holds overall: static input reduces no-drift M1 error 4.214 → 0.497 m, then drivers reduce it to 0.280 m. Some scenarios still favour simpler baselines. Drift remains unresolved (M3 MAE 4.259 m, 0% coverage).

## Verification

- `node tools/verify.js`: all four scripts initialize without console errors; all four WebMCP tools execute. Also exercised all four tools in the browser.
- BW028: no readings; BW163: no reading passed screening; BW005: rejected date 19 Jul; BW046: 74.9 ±32.0 m at 30d, first chart label 14d ago.
- Python/JS features: 5 wells ×10 days; maximum difference 2.22e-15 (limit 1e-6).
- Shared M3 arrays make Page 3 and Page 4 results identical. Browser metric function recalculation of both populations and all six methods matches stored metrics exactly at delivered rounding.
- 20 browser layouts: all pages at 375, 768, 1024, 1280, 1440 px. No page horizontal overflow, no detached labels, correct active nav. Charts/tables have internal scroll.
- Real panel displays 8.953/7.088, 33.997/29.691, 8.134227→8.131628 (0.03%) exactly, with target-comparison warning and M3 readiness restriction.
- Comparison gzip below 1.5 MB. No raw real CSVs added to the repository or dist. Static vanilla JS, no external scripts or framework.
- Final DOCX and PDF rendered and visually reviewed page by page; display equations are rendered images with source accessibility descriptions; canonical Markdown retains fully readable equations for machine handoff.

## Screenshots

![Page 4 desktop, 1440 px](screenshots/page4-1440.png)

![Page 4 phone, 375 px](screenshots/page4-375.png)

## Remaining scientific limitations

All requested implementation work is complete. Final interval undercoverage and sensor drift are reported rather than concealed. No real-world M3 validation or long-horizon accuracy claim is possible with the available inputs. Synthetic future weather is an explicit calendar assumption, not a weather forecast. The PR is not merged.
