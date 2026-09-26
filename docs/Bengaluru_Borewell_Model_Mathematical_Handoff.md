# Mathematical and Technical Handoff for the Bengaluru Borewell Forecasting Proof of Concept

**Complete data, model, validation, website, rainfall, and deployment specification**
**Prepared:** 25 September 2026; revised 26 September 2026
**Purpose:** This document is a self-contained handoff. A person or another language model should be able to reconstruct what was supplied, what was calculated, what was validated, what the public website displays, and what remains scientifically unsupported.

## 1. Executive summary

**Revision status:** Sections 1–24 preserve the real-data work. Sections 25–28 add the 450-well system, corrected M3, conditional validation and Page 4. Changes are on the review branch `site-fixes-and-model-comparison`; the pull request is not merged and the live site is unchanged.


The goal is to select a monitored Bengaluru borewell and estimate its future water level, with an error range, for a user-selected horizon. The eventual research ambition includes hundreds or thousands of live wells broadcasting approximately every five minutes. The proof of concept described here uses a much narrower anonymized dataset: 579 paired wells observed for roughly 15 days, from 15 to 29 July 2026.

The supplied data supports two short-horizon transition questions:

1. Given a pumping session, how much deeper or shallower is the measured water level at the session stop than at the session start?
2. Given the end of one session, how much deeper or shallower is the level at the start of the next session after an off period?

Those two questions were modeled with robust regression, well-specific partial pooling, and a well-history component. Their chronological holdout covered 26–29 July 2026. On quality-screened holdout records, the pump-transition mean absolute error was 8.953 m and the recovery-transition mean absolute error was 7.088 m.

The public website also accepts arbitrary horizons, such as six months or five years. That long-horizon curve is a transparent scenario engine derived from recent per-well trend and median cycle behavior. It is not the validated robust transition model, and the supplied 15-day record cannot validate months or years. The website uncertainty therefore communicates caution; it is not a calibrated long-horizon predictive interval.

Public Bengaluru rainfall was tested from NASA POWER. Lagged rainfall added almost no measured holdout improvement: the combined screened MAE changed from 8.134227 m to 8.131628 m, a 0.031955% improvement. The likely reasons are the short observation window, only 12.64 mm of rain during the overlap, lack of well coordinates, and delayed or heterogeneous groundwater response.

The strongest result of this work is a reproducible proof of concept and a clear data contract for the next phase. A scientifically defensible six-month to five-year model requires longer histories, well coordinates, local rainfall, static recovery observations, well construction and pump depth, sensor calibration, geology, nearby pumping, and municipal supply information.

## 2. Deliverables and deployed interfaces

The work produced the following artifacts.

| Artifact | Purpose |
|---|---|
| `outputs/water_level_poc/poc_engine.py` | Canonical offline preprocessing, transition models, validation, stability summaries, and exports |
| `outputs/water_level_poc/rainfall_compare.py` | NASA POWER rainfall download, lagged rainfall features, model comparison, and climatology |
| `outputs/water_level_poc/model_metrics.json` | Baseline validation metrics and audit summaries |
| `outputs/water_level_poc/fitted_models.json` | Serialized baseline fitted models and parameters |
| `outputs/water_level_poc/holdout_pump_predictions.csv` | Pump holdout predictions |
| `outputs/water_level_poc/holdout_recovery_predictions.csv` | Recovery holdout predictions |
| `outputs/water_level_poc/well_stability_summary.csv` | Per-well trend, cycle, evidence, and stability summary |
| `outputs/bengaluru_groundwater_data_request.pdf` | Concise company-owner data request reconstructed from the relevant meeting discussion |
| `outputs/water_forecast_app/dist/` | Static public browser application |
| Root public page | Current-data forecast and scenario controls |
| `/comparison/` page (02) | M3 forward scenarios on 450 synthetic wells |
| `/validation/` page (03) | 30-day hidden-truth test of M3 |
| `/models/` page (04) | M1/M2/M3 comparison; restored real rainfall panel |

Public links:

- Forecast: https://mailabhiramsrinivas-art.github.io/borewell-water-forecast/
- Synthetic forecast: https://mailabhiramsrinivas-art.github.io/borewell-water-forecast/comparison/
- Validation: https://mailabhiramsrinivas-art.github.io/borewell-water-forecast/validation/
- Model comparison (available after PR merge): https://mailabhiramsrinivas-art.github.io/borewell-water-forecast/models/
- Source repository: https://github.com/mailabhiramsrinivas-art/borewell-water-forecast

The public repository contains derived per-well summaries and rainfall comparison JSON. It does not publish the 1,158 source CSV files.

The raw source folder used locally is `/Users/abhi/Documents/Work on the water project /`. Its two data subfolders are `ANON_TypeA_290726` and `ANON_TypeB_290726`. The modeling and website artifacts are under `outputs/` in the project workspace.

An earlier review isolated the groundwater discussion from a mixed meeting transcript and excluded unrelated game-development material. It reconstructed the request structure agreed by Abhiram Srinivas and Charu Gupta for Kiran or other company owners: well identity and location; construction and pump details; the exact meaning of “water level”; pumping, discharge, power, and status; recovery; rainfall, soil, and surface conditions; geology, fractures, and aquifer interpretation; nearby wells; calibration and quality assurance; and historical coverage.

The broader proposal context described a possible live network of approximately 4,000 wells growing toward 10,000. It also discussed live water level, discharge, pump cycles, and power, together with historical aquifer information, ISRO land-use, imperviousness and recharge-potential layers, geology, ENSO and monsoon context, Cauvery conditions, and supply data. Those are project ambitions and contextual layers; they were not columns in the 1,158 supplied CSVs.

## 3. Scope, terminology, and physical sign convention

### 3.1 What “water level” means here

The numeric level is treated as **metres below ground surface**, abbreviated `m bgs`.

Let

$$h > 0$$

denote measured depth below the ground surface. Therefore:

- a larger value means the water surface is deeper and generally less favorable;
- a smaller value means the water surface is shallower and generally more favorable;
- a positive change in depth means the level moved deeper;
- a negative change means it moved shallower or recovered.

The value measured in a borewell may be a hydraulic head expressed as a depth in the well. In fractured hard rock, it need not equal the physical depth of the water-bearing fracture. A fracture at 150 m can create a static water surface at 60 m below ground if the pressure head is sufficient.

### 3.2 Borewell recharge versus aquifer recharge

Strictly, the aquifer or fracture network feeding a borewell recharges. The borewell records the resulting hydraulic response. Rainfall, surface permeability, soil, weathered-zone storage, fracture connectivity, nearby pumping, and engineered recharge all affect that response.

### 3.3 Dynamic versus static level

The working interpretation is that the Type B start and stop values are dynamic session-boundary measurements. This is not confirmed by a vendor data dictionary. A true static water level requires a defined period without pumping and a stable measurement protocol. That distinction matters because a dynamic value combines regional state, recent pumping, pump depth, well losses, and recovery.

### 3.4 Core notation

| Symbol | Meaning |
|---|---|
| $i$ | Well index |
| $k$ | Pumping-session index within a well |
| $t$ | Time |
| $h_{i,k}^{start}$ | Water-level depth at session start, m bgs |
| $h_{i,k}^{stop}$ | Water-level depth at session stop, m bgs |
| $D_{i,k}$ | Session duration, minutes |
| $q(t)$ | Discharge, litres per minute |
| $p(t)$ | Electrical power, kilowatts |
| $V_{i,k}$ | Integrated pumped volume, litres |
| $E_{i,k}$ | Integrated energy, kWh |
| $\Delta h_{i,k}^{pump}$ | Stop depth minus start depth during pumping |
| $G_{i,k}$ | Off gap from session $k$ stop to session $k+1$ start, minutes |
| $\Delta h_{i,k}^{rec}$ | Next start depth minus previous stop depth |
| $\Delta h_{i,k}^{cycle}$ | Next start depth minus previous start depth |
| $x$ | Predictor vector |
| $y$ | Transition target |
| $\hat y$ | Predicted transition |

## 4. Supplied data inventory

### 4.1 Files and pairing

The supplied folder contained 1,158 anonymized CSV files:

- 579 Type A files;
- 579 Type B files;
- one Type A and one Type B file for each anonymized well ID.

The observation period was approximately 15 days, from 15 to 29 July 2026.

The importer skips the first metadata line and reads the second line as the CSV header. Timestamps are parsed with the exact format `DDMMYY HHMMSS`, corresponding to Python format `%d%m%y %H%M%S`.

### 4.2 Type A: high-frequency operating records

Type A has four fields:

| Field | Interpretation used |
|---|---|
| `timestamp` | Observation time |
| `discharge L/min` | Instantaneous discharge rate |
| `power kW` | Instantaneous electrical power |
| `pump_status` | Recorded ON/OFF label |

Audit totals:

- 489,828 Type A rows;
- Type A rows per well: minimum 1, median 591, maximum 3,873;
- median sampling gap 5.133 minutes;
- 95.2% of gaps between 4 and 6 minutes;
- 489,016 rows labeled ON;
- 812 rows labeled OFF.

There were 340 wells with only ON records, 227 with both ON and OFF records, and 12 with only OFF records. The OFF records had zero discharge but nonzero power, with mean power approximately 5.454 kW. This requires an explanation from the data owner: possible standby consumption, label semantics, instrumentation offset, or anonymization effects.

### 4.3 Type B: pumping-session boundary records

Type B provides:

- session start timestamp;
- session stop timestamp;
- a start field labeled actual borewell depth in feet;
- water level at start in metres below surface;
- a stop field labeled actual borewell depth in feet;
- water level at stop in metres below surface;
- duration in minutes.

The feet fields equal the corresponding water-level values in metres multiplied by 3.28084, subject to rounding. They are therefore duplicate units, not confirmed construction depths. They must not be interpreted as drilled depth.

Audit totals:

- 12,355 pumping sessions;
- 11,788 consecutive-session transitions before quality screening;
- 12 wells with zero sessions;
- Type B sessions per well: minimum 0, median 17, maximum 220;
- median 17 sessions per well;
- maximum 220 sessions in one well;
- 502 wells with at least 5 sessions;
- 423 wells with at least 10 sessions.

### 4.4 Exact linkage between the file types

All 489,016 Type A ON rows occurred inside Type B session intervals. The 812 remaining Type A rows occurred outside Type B sessions. Every Type B session had corresponding Type A data, and Type A records occurred exactly at every Type B start and stop timestamp.

The implementation uses Type B intervals as the authoritative session boundaries. It integrates Type A discharge and power inside those intervals. The `pump_status` field is read during import but is not used as a model predictor or session filter. OFF rows outside Type B sessions are excluded from pumping-session integration. Recovery is inferred between Type B sessions; there is no continuous off-period water-level series.

### 4.5 Coverage by well

| Coverage statement | Well count |
|---|---:|
| At least 13 observed days | 376 |
| Fewer than 7 observed days | 80 |
| Fewer than 1 observed day | 36 |
| Zero-day span, effectively a single time point | 10 |
| At least 7 days and at least 10 sessions | 413 |
| At least 13 days and at least 10 sessions | 346 |
| At least 13 days and at least 20 sessions | 217 |

### 4.6 Raw distributions and anomalies

| Quantity | Mean | Median | Minimum | Maximum |
|---|---:|---:|---:|---:|
| Start level, m bgs | 86.552 | 69.700 | 0.910 | 457.120 |
| Stop level, m bgs | 88.157 | 65.740 | 0.880 | 457.180 |
| Duration, minutes | 196.120 | 108.100 | 0.300 | 12,902.500 |
| Stop minus start, m | 1.606 | 1.340 | -434.960 | 432.430 |
| Off gap, minutes | — | 363.720 | 15.030 | 17,117.000 |

Of the 12,355 sessions, 7,087 had a positive stop-minus-start change, 5,223 had a negative change, and 45 were unchanged. A negative pumping-session change can reflect boundary timing, recovery during intermittent pumping, measurement noise, a label issue, or anonymization. It should not automatically be treated as physically impossible.

No missing parse values were found in populated rows, but numerical completeness does not establish validity. Units, sensor calibration, measurement semantics, and whether anonymization altered numeric values remain unconfirmed.

## 5. Session feature construction

### 5.1 Type A points assigned to a Type B session

For a Type B session with start time $t_0$ and stop time $t_1$, the Type A segment is

$$\mathcal{S}_{i,k}=\{(t_j,q_j,p_j): t_0 \le t_j \le t_1\}.$$

Both endpoints are included. A cursor through each well’s time-sorted Type A records makes the matching deterministic.

### 5.2 Pumped volume

For Type A observations at minute offsets $\tau_j=(t_j-t_0)/60$, pumped volume is trapezoidally integrated:

$$V_{i,k}=\sum_{j=1}^{n-1}\frac{q_j+q_{j+1}}{2}(\tau_{j+1}-\tau_j).$$

Because $q$ is litres per minute and $\tau$ is minutes, $V$ is litres. At least two Type A points are required.

### 5.3 Electrical energy

Power is also trapezoidally integrated:

$$E_{i,k}=\frac{1}{60}\sum_{j=1}^{n-1}\frac{p_j+p_{j+1}}{2}(\tau_{j+1}-\tau_j).$$

The division by 60 converts kW-minutes to kWh.

### 5.4 Pumping target

The pumping-session target is

$$\Delta h_{i,k}^{pump}=h_{i,k}^{stop}-h_{i,k}^{start}.$$

Positive means the measured level became deeper during the session. Negative means it became shallower.

An absolute endpoint-change rate is also calculated:

$$r_{i,k}=\frac{|\Delta h_{i,k}^{pump}|}{\max(D_{i,k},0.01)}.$$

### 5.5 Recovery and full-cycle targets

For consecutive sessions $k$ and $k+1$ in the same well:

$$G_{i,k}=t_{i,k+1}^{start}-t_{i,k}^{stop}$$

in minutes, and

$$\Delta h_{i,k}^{rec}=h_{i,k+1}^{start}-h_{i,k}^{stop}.$$

A negative recovery change means the next session starts shallower than the previous session stopped.

The full-cycle change is

$$\Delta h_{i,k}^{cycle}=h_{i,k+1}^{start}-h_{i,k}^{start}.$$

This compares the starts of two consecutive pumping sessions. A nonpositive value is counted as fully recovered for the summary statistic used here.

### 5.6 Transformations

Long-tailed positive quantities are log-transformed:

$$x_D=\log(1+D),\quad x_V=\log(1+\max(V,0)),\quad x_E=\log(1+\max(E,0)),$$

and

$$x_G=\log(1+\max(G,0)).$$

Clock time is encoded cyclically. For the pump regression, $a=hour+minute/60$ (seconds dropped). For the recovery regression, $a=hour$ of the next start (integer hour only). These distinct encodings are required to reproduce the serialized coefficients. Then

$$x_{sin}=\sin(2\pi a/24),\qquad x_{cos}=\cos(2\pi a/24).$$

The global day index is

$$x_{day}=\frac{t-t_{min}}{86400\text{ seconds}}.$$

## 6. Quality screening

### 6.1 Pump-session screen

A pumping session is usable only when all conditions hold:

1. duration is at least 5 minutes;
2. duration is at most 1,440 minutes, or 24 hours;
3. absolute endpoint change is at most 50 m;
4. absolute change rate is at most 0.5 m/min;
5. at least two Type A samples fall in the session;
6. mean discharge is finite and greater than zero.

This leaves 8,087 of 12,355 sessions, or 65.455%.

The 50 m and 0.5 m/min thresholds are pragmatic robust screens, not site-certified physical limits. The all-record evaluation is retained to reveal how strongly anomalies affect performance.

### 6.2 Recovery-transition screen

A recovery transition is usable only when:

1. both adjacent pumping sessions pass the session screen;
2. the off gap is nonnegative;
3. the off gap is no more than 7 days;
4. absolute recovery change is at most 50 m.

This leaves 5,889 of 11,788 transitions, or 49.958%.

## 7. Validated pump-transition model

### 7.1 Target

$$y=\Delta h^{pump}=h^{stop}-h^{start}.$$

The predicted stop depth is

$$\hat h^{stop}=h^{start}+\hat y.$$

### 7.2 Predictors

The exact feature order is:

1. start water-level depth;
2. $\log(1+duration)$;
3. $\log(1+pumped\ volume)$;
4. $\log(1+energy)$;
5. mean discharge;
6. mean power;
7. start-hour sine;
8. start-hour cosine;
9. global day index.

No rainfall, coordinates, geology, static water level, construction depth, pump intake depth, or neighboring-well feature is present in this baseline.

## 8. Validated recovery-transition model

### 8.1 Target

$$y=\Delta h^{rec}=h_{next}^{start}-h_{previous}^{stop}.$$

The predicted next-start depth is

$$\hat h_{next}^{start}=h_{previous}^{stop}+\hat y.$$

### 8.2 Predictors

The exact feature order is:

1. previous stop level;
2. previous start level;
3. previous drawdown;
4. previous log duration;
5. previous log pumped volume;
6. previous mean discharge;
7. previous mean power;
8. log off-gap duration;
9. next-start-hour sine;
10. next-start-hour cosine.

## 9. Robust hierarchical ensemble mathematics

The same fitting procedure is used for the pump and recovery targets.

### 9.1 Standardization

Each feature $x_j$ is standardized using the training mean $\mu_j$ and population standard deviation $s_j$:

$$z_j=\frac{x_j-\mu_j}{s_j}.$$

If a feature has zero scale, the scale is set to 1. An intercept column is added.

### 9.2 Huber iteratively reweighted ridge regression

Let $Z$ be the standardized design matrix including the intercept. Starting with all weights equal to one, the model performs 35 iterations.

At each iteration:

$$\beta=(Z^T W Z+\lambda P)^{-1}Z^T W y,$$

where:

- $W$ is diagonal with current robust weights;
- $\lambda=3$;
- $P$ is the identity except $P_{00}=0$, so the intercept is not penalized.

Residuals are

$$e=y-Z\beta.$$

The robust residual scale is

$$s_e=1.4826\;median(|e-median(e)|)+10^{-8}.$$

The Huber threshold is

$$c=1.345s_e.$$

The next weight for record $r$ is

$$w_r=\min\left(1,\frac{c}{\max(|e_r|,10^{-9})}\right).$$

Small residuals keep weight 1. Large residuals receive less influence. Ridge regularization stabilizes correlated predictors such as duration, volume, and energy.

### 9.3 Well-specific residual effect with shrinkage

The robust global prediction is

$$\hat y_r^{global}=z_r^T\beta.$$

For well $i$, compute the median training residual $m_i$ and record count $n_i$. The shrunken effect is

$$b_i=m_i\frac{n_i}{n_i+5}.$$

The hierarchical prediction is

$$\hat y_{i,r}^{hier}=\hat y_r^{global}+b_i.$$

This lets wells with sufficient history retain a persistent offset while pulling small samples toward zero.

### 9.4 Empirical well-history component

Let $g$ be the global median target and $u_i$ the raw median target for well $i$. The shrunken well median is

$$e_i=g+(u_i-g)\frac{n_i}{n_i+5}.$$

For a previously unseen well, the empirical component defaults to $g$.

### 9.5 Final ensemble

The final change prediction is

$$\hat y=w e_i+(1-w)\hat y_{i,r}^{hier}.$$

The mixing weight $w$ is selected from

$$\{0,0.1,0.2,\ldots,1.0\}$$

using inner chronological validation. Both baseline models selected $w=0.4$. The final prediction is therefore 40% shrunken well-history median and 60% robust hierarchical regression.

## 10. Chronological validation design

### 10.1 Time splits

The split is chronological to avoid learning from the future:

- inner model-building data: before 24 July 2026;
- inner validation for ensemble weight: 24–25 July 2026;
- final training: all quality-screened records before 26 July 2026;
- untouched holdout: 26–29 July 2026.

After selecting $w$, the model is refit on all pre-26-July training data and evaluated once on the holdout.

### 10.2 Error metrics

For errors $e_r=y_r-\hat y_r$:

$$MAE=\frac{1}{n}\sum_{r=1}^{n}|e_r|,$$

$$MedianAE=median(|e_r|),$$

$$RMSE=\sqrt{\frac{1}{n}\sum_{r=1}^{n}e_r^2},$$

and

$$R^2=1-\frac{\sum_r(y_r-\hat y_r)^2}{\sum_r(y_r-\bar y)^2}.$$

The screened $R^2$ values refer to predicted changes, not to the absolute endpoint levels.

For all-record endpoint evaluation, final water-level predictions are clipped to the proof-of-concept range 0–500 m bgs. The target changes themselves are not made physically valid by that clipping.

### 10.3 Screened holdout results

| Model | n | MAE, m | Median AE, m | RMSE, m | $R^2$ |
|---|---:|---:|---:|---:|---:|
| Pump transition, final ensemble | 1,995 | 8.9530 | 4.8750 | 13.7250 | 0.2144 |
| Recovery transition, final ensemble | 1,561 | 7.0878 | 3.7710 | 11.0656 | 0.3448 |
| Pump well-history baseline | 1,995 | 9.0630 | 4.8863 | 13.9146 | 0.1925 |
| Recovery well-history baseline | 1,561 | 7.5468 | 3.9108 | 11.9006 | 0.2421 |

The robust ensemble improved on the well-history baseline, but the gain is modest. The errors remain large relative to many practical water-management decisions.

### 10.4 All-record holdout results

When rejected and anomalous holdout rows are included:

| Model | n | MAE, m | Median AE, m | RMSE, m | $R^2$ |
|---|---:|---:|---:|---:|---:|
| Pump transition | 2,984 | 33.9970 | 9.9016 | 71.2500 | 0.2299 |
| Recovery transition | 2,969 | 29.6914 | 8.7296 | 62.6549 | 0.2849 |

This gap is central to the interpretation. The proof of concept has learned repeatable signal in screened records, while the raw dataset still contains changes that dominate error and require source-level clarification.

### 10.5 Earlier feasibility benchmarks

An earlier experiment established simple reference points:

| Target and dataset | Persistence MAE | Well-median MAE | Global ridge MAE |
|---|---:|---:|---:|
| Pump, all records | 36.0599 | 32.4311 | 38.3593 |
| Recovery, all records | 34.9020 | 30.3059 | 31.6042 |
| Pump, filtered | 10.7330 | — | 10.5095 |

The later robust hierarchical ensemble reached 8.953 m for screened pump transitions and 7.088 m for screened recovery transitions.

### 10.6 Holdout reliability tier used in the offline evaluation

Before predicting a holdout record, a well was labeled:

- higher: at least 10 earlier records and earlier pass rate at least 0.8;
- medium: at least 5 earlier records and pass rate at least 0.6;
- low: otherwise.

For the higher-reliability subset, all-record endpoint results were:

| Target | n | MAE, m | Median AE, m | RMSE, m | $R^2$ |
|---|---:|---:|---:|---:|---:|
| Pump | 1,018 | 13.1444 | 4.2056 | 34.7171 | 0.5272 |
| Recovery | 656 | 9.8474 | 3.1431 | 27.2664 | 0.6716 |

The “higher” label predicts stronger data support and pass history; it does not guarantee lower MAE in every subgroup. Extreme errors can increase the mean while the median remains much smaller.

## 11. Per-well stability model

This model summarizes longer movement within the 15-day record. It is separate from the robust pump and recovery transition regressions.

### 11.1 Daily series

For each well and each calendar day, take the median start water-level depth among usable sessions. Let the result be $(d_j,h_j)$.

### 11.2 Theil–Sen slope

For wells with at least three daily points, calculate every pairwise slope:

$$s_{ab}=\frac{h_b-h_a}{d_b-d_a},\quad b>a.$$

The well slope is the median:

$$s_i=median(s_{ab}).$$

The intercept is

$$a_i=median(h_j-s_i d_j).$$

The residual noise estimate is

$$\sigma_i^{rob}=1.4826\;median(|(h_j-a_i-s_i d_j)-median(h-a_i-s_i d)|).$$

Theil–Sen is used because it is less sensitive than ordinary least squares to a few extreme daily values.

### 11.3 Slope shrinkage

Let $s_F$ be the fleet median slope and $n_i^{day}$ the well’s number of usable daily medians. Define

$$\omega_i=\frac{n_i^{day}}{n_i^{day}+5}.$$

Then

$$\tilde s_i=\omega_i s_i+(1-\omega_i)s_F.$$

If a well cannot produce its own slope, it uses $s_F$.

### 11.4 Stability labels

Let $m_i^{cycle}$ be the median full-cycle change. A well is labeled:

- insufficient data: fewer than 5 usable cycle transitions or fewer than 5 active days;
- stable or recovering: $s_i\le0$ and $m_i^{cycle}\le0$;
- declining: $s_i>0$ and $m_i^{cycle}>0$;
- mixed: all other sign combinations.

Counts across 579 wells:

| Stability label | Wells |
|---|---:|
| Stable or recovering | 82 |
| Declining | 116 |
| Mixed | 133 |
| Insufficient data | 248 |

These labels summarize direction inside the short observed window. They do not establish seasonal or long-term groundwater sustainability.

The share fully recovered is

$$\frac{\#\{\Delta h^{cycle}\le0\}}{\#\{usable\ cycles\}}.$$

### 11.5 Website evidence tier

The website uses a separate evidence rule:

- higher: at least 20 usable cycle transitions and 10 active usable days;
- medium: at least 10 transitions and 7 days;
- low: otherwise.

Counts are 92 higher, 145 medium, and 342 low. This website tier must not be confused with the preprediction offline reliability tier in Section 10.6.

### 11.6 Precomputed 1, 3, and 7-day values

For a horizon $d\in\{1,3,7\}$:

$$\hat h_i(d)=clip(h_i^{latest}+\tilde s_i d,0,500).$$

The exploratory interval half-width is

$$u_i(d)=clip(1.645\sigma_i^{*}\sqrt d,0,500),$$

where $\sigma_i^{*}=\sigma_i^{rob}$ when available and 15 m otherwise. These are descriptive short-horizon summaries, not externally calibrated confidence intervals.

## 12. Public website arbitrary-horizon scenario engine

The root website asks for a well, horizon, pumping condition, recharge condition, and 80% or 95% range. Its calculation is a scenario formula over precomputed well summaries. It does not execute `poc_engine.py` in the browser and does not refit a statistical model.

### 12.1 Horizon conversion

For input value $v$:

$$d=v\times\begin{cases}
1 & days\\
7 & weeks\\
30.4375 & months\\
365.25 & years
\end{cases}$$

The interface accepts up to 100 years to keep the interaction flexible. That input limit is not a scientific claim of 100-year validity.

### 12.2 Well signals

Let $s_0$ be the shrunken daily trend. Let

$$c_i=clip\left(\frac{usable\ cycle\ transitions}{\max(active\ usable\ days,1)},0,4\right).$$

Let

$$P_i=\max(median\ pumping\ change,0),$$

and

$$R_i=|\min(median\ off\ period\ change,0)|.$$

The sensitivities are

$$S_i^{pump}=clip(P_i\max(c_i,0.5)\times0.02,0.02,0.5),$$

$$S_i^{recharge}=clip(R_i\max(c_i,0.5)\times0.02,0.02,0.5).$$

The pumping factor is -1 for low, 0 for typical, and +1 for high. The recharge factor is +1 for dry, 0 for typical, and -1 for wet. The effective trend on the root page is

$$s_{eff}=s_0+f_{pump}S_i^{pump}+f_{recharge}S_i^{recharge}.$$

Because depth below ground is the outcome, dry conditions add depth and wet conditions subtract depth.

### 12.3 Logarithmically decayed projection

The cumulative projected change after $d$ days is

$$\Delta(d)=30s_{eff}\ln(1+d/30).$$

The displayed mean is

$$\hat h(d)=clip(h^{latest}+\Delta(d),0,500).$$

The derivative is

$$\frac{d\Delta}{dd}=\frac{s_{eff}}{1+d/30}.$$

Thus the daily change decays with horizon. The curve grows logarithmically and does not reach a physical equilibrium or true plateau. The form is a conservative extrapolation choice, not an aquifer equation.

### 12.4 Website uncertainty

An evidence-tier starting MAE is assigned:

$$M_i=\begin{cases}
11.5 & higher\\
18 & medium\\
28 & low.
\end{cases}$$

The factor 1.253 approximates $\sqrt{\pi/2}$, converting normal-distribution MAE to standard deviation. With scenario shift $\delta=s_{eff}-s_0$:

$$\sigma_i(d)=1.253M_i\sqrt{1+d/15}+4|\delta|\sqrt{d/15}.$$

The website uses $z=1.282$ for an 80% range and $z=1.96$ for a 95% range:

$$[L(d),U(d)]=[clip(\hat h-z\sigma,0,500),\;clip(\hat h+z\sigma,0,500)].$$

The interval is nonzero at $d=0$. It expands rapidly and often reaches the 0 or 500 m display bounds. This is an explicit uncertainty heuristic, not a statistically calibrated long-horizon interval.

The chart uses between 24 and 140 display points. That changes drawing resolution only, not the mathematical forecast.

### 12.5 Interpretation boundary

The root page is useful for exploring how recent trend, pumping, recovery, and horizon interact. It must not be described as a validated six-month, one-year, or five-year forecast. The only chronological validation used a four-day holdout inside a 15-day dataset.

## 13. Public rainfall experiment

### 13.1 Source

The comparison used NASA POWER daily corrected precipitation `PRECTOTCORR` in local solar time:

- requested point: 12.9716° N, 77.5946° E;
- returned grid point: 12.972° N, 77.595° E;
- returned elevation: 841.72 m;
- history: 1 January 2001 through 29 July 2026;
- source documentation: https://power.larc.nasa.gov/docs/services/api/temporal/daily/

Because the anonymized wells have no coordinates, the same Bengaluru city-centre grid cell is assigned to every well.

### 13.2 Leakage-safe lagged features

For an event on day $t$, rainfall is first shifted by one day. Rolling sums therefore use only prior days:

$$Rain_{t,L}=\sum_{j=1}^{L}P_{t-j},\quad L\in\{1,3,7,14\}.$$

Same-day rainfall is not used. This prevents a session later in the day from receiving precipitation that occurred after its outcome.

Candidate additions were:

1. prior 1 day;
2. prior 3 days;
3. prior 7 days;
4. prior 14 days;
5. prior 1 and 3 days;
6. prior 3 and 7 days;
7. prior 1, 3, and 7 days.

The candidate with lowest inner-validation MAE on 24–25 July was selected, and only then evaluated on 26–29 July.

### 13.3 Observed overlap rainfall

During 15–29 July 2026, the grid cell received 12.64 mm, with 6 days above 0.1 mm.

| Date | Rain, mm | Date | Rain, mm |
|---|---:|---|---:|
| 15 Jul | 0.00 | 23 Jul | 1.31 |
| 16 Jul | 0.00 | 24 Jul | 0.00 |
| 17 Jul | 1.19 | 25 Jul | 0.00 |
| 18 Jul | 5.21 | 26 Jul | 0.00 |
| 19 Jul | 0.61 | 27 Jul | 0.00 |
| 20 Jul | 2.57 | 28 Jul | 0.01 |
| 21 Jul | 0.03 | 29 Jul | 0.05 |
| 22 Jul | 1.66 |  |  |

### 13.4 Selected rainfall features and results

The pump model selected prior-1-day plus prior-3-day rainfall. The recovery model selected prior-1-day rainfall.

| Target | Baseline MAE | Rainfall MAE | MAE improvement | Baseline median AE | Rainfall median AE | Baseline RMSE | Rainfall RMSE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pump | 8.9530 | 8.9491 | 0.0438% | 4.8750 | 4.8269 | 13.7250 | 13.7121 |
| Recovery | 7.0878 | 7.0868 | 0.0129% | 3.7710 | 3.7499 | 11.0656 | 11.0649 |

Weighted by holdout record count, combined screened MAE was:

$$MAE_{base}=8.134227\text{ m},$$

$$MAE_{rain}=8.131628\text{ m},$$

$$Improvement=0.031955\%.$$

The experiment defined material improvement as at least 5%. Neither transition met that threshold.

### 13.5 What the rainfall result does and does not mean

The result says that these particular lagged rainfall features, applied from one grid cell across all wells in this 15-day period, did not improve the four-day holdout materially. It does not establish that rainfall is unimportant to Bengaluru groundwater. Recharge can be delayed, spatially variable, routed through fractures, obscured by pumping, and dependent on antecedent wetness and urban surface conditions.

## 14. Rainfall comparison page scenario mathematics

The rainfall comparison page contains two different ideas:

1. retrospective validation, where lagged rainfall features were fitted in the robust transition models;
2. a forward seasonal scenario, where historical monthly rainfall climatology adjusts the recent-trend path.

The fitted rainfall regression coefficients do not drive the displayed future rainfall mean path. Keeping this distinction is essential.

### 14.1 Monthly climatology

Using 2001–2025 daily rainfall, each year’s monthly total was calculated. For each calendar month, the 25th percentile, median, and 75th percentile across years represent dry, typical, and wet scenarios.

| Month | Dry q25, mm/month | Median, mm/month | Wet q75, mm/month | Mean daily, mm | Wet-day share |
|---|---:|---:|---:|---:|---:|
| Jan | 0.31 | 2.00 | 5.14 | 0.106 | 0.0426 |
| Feb | 0.00 | 0.28 | 5.77 | 0.155 | 0.0496 |
| Mar | 0.91 | 8.31 | 21.31 | 0.506 | 0.1226 |
| Apr | 22.65 | 38.62 | 63.93 | 1.773 | 0.2853 |
| May | 84.88 | 116.14 | 154.88 | 3.866 | 0.5587 |
| Jun | 50.68 | 74.46 | 100.20 | 2.723 | 0.5200 |
| Jul | 56.37 | 70.74 | 142.20 | 3.245 | 0.5974 |
| Aug | 65.13 | 109.37 | 157.54 | 4.205 | 0.6761 |
| Sep | 94.67 | 144.47 | 196.54 | 4.915 | 0.6893 |
| Oct | 97.98 | 138.57 | 180.64 | 4.651 | 0.6555 |
| Nov | 29.03 | 40.29 | 68.07 | 2.035 | 0.4027 |
| Dec | 4.78 | 13.23 | 19.66 | 0.685 | 0.1639 |

Wet-day share is the fraction of historical days with precipitation above 0.5 mm. It is displayed for context and is not used in the future path formula.

### 14.2 Scenario rainfall by date

For each future date, choose the month’s q25, median, or q75 total and spread it uniformly across the number of days in that month:

$$p_d^{scenario}=\frac{MonthlyTotal_{month(d)}^{scenario}}{DaysInMonth(d)}.$$

The typical annual daily reference is

$$\bar p=\frac{\sum_{m=1}^{12}MedianMonthlyRain_m}{365.25}.$$

For the current climatology, $\bar p=2.07112936$ mm/day. The scaling constant is

$$p_{scale}=\max(1.6\bar p,2.25)=3.31380698.$$

The bounded daily rainfall signal is

$$g_d=clip\left(\frac{p_d^{scenario}-\bar p}{p_{scale}},-0.9,1.25\right).$$

### 14.3 Daily decayed update

On future day $d$, the effective trend is

$$s_d=s_0+f_{pump}S^{pump}-g_dS^{recharge}.$$

Starting with cumulative change $C_0=0$:

$$C_d=C_{d-1}+\frac{s_d}{1+d/30}.$$

The displayed mean is

$$\hat h_d=clip(h^{latest}+C_d,0,500).$$

For a fractional final day, cumulative change is linearly interpolated between the adjacent integer days.

This future scenario assumes rainfall is spread evenly within each month and applies an immediate same-day effect through a sensitivity derived from observed recovery. It is an exploratory seasonal scenario, not a weather forecast and not a calibrated recharge-routing model.

### 14.4 Rainfall-page uncertainty

The same website uncertainty function is multiplied by two factors:

$$ratio=\frac{8.131628}{8.134227}=0.999680486,$$

and

$$penalty=\begin{cases}1 & typical\ rainfall\\1.06 & dry\ or\ wet\ rainfall.\end{cases}$$

Thus

$$\sigma_{rain}(d)=\sigma_i(d)\times ratio\times penalty.$$

Because validation improved by only 0.032%, the uncertainty is almost unchanged. The dry and wet scenario penalty makes it slightly wider.

## 15. Worked example: well BW046

BW046 was used as a concrete website example because it has comparatively strong evidence in the supplied record.

### 15.1 Observed summary

| Quantity | Value |
|---|---:|
| Sessions | 38 |
| Usable sessions | 31 |
| Usable cycle transitions | 25 |
| Active usable days | 14 |
| Latest start level | 76.41 m bgs |
| Median pumping change | +11.40 m |
| Median off-period change | -13.13 m |
| Median full-cycle change | -1.40 m |
| Share fully recovered | 0.56 |
| Raw Theil–Sen trend | -0.1200 m/day |
| Shrunken trend | -0.072631579 m/day |
| Stability label | Stable or recovering |
| Website evidence tier | Higher |

### 15.2 Scenario sensitivities

Cycles per day:

$$c=25/14=1.785714.$$

Pump sensitivity:

$$S^{pump}=clip(11.4\times1.785714\times0.02,0.02,0.5)=0.407142857.$$

Recovery sensitivity:

$$S^{recharge}=clip(13.13\times1.785714\times0.02,0.02,0.5)=0.468928571.$$

Under typical pumping and typical recharge on the root page, $s_{eff}=-0.072631579$ m/day.

At 30 days:

$$\Delta(30)=30(-0.072631579)\ln(2)=-1.51033123\text{ m},$$

so

$$\hat h(30)=76.41-1.51033123=74.89966877\text{ m bgs}.$$

For an 80% range, with higher-tier $M=11.5$ and zero scenario shift:

$$\sigma(30)=11.5\times1.253\times\sqrt{1+30/15}=24.95799\text{ m},$$

$$z\sigma=1.282\times24.95799=31.997\text{ m}.$$

The large interval is a visual reminder that the short record does not support a precise one-month forecast.

At six nominal months, $d=6\times30.4375=182.625$ days. The root-page typical projection change is

$$\Delta(182.625)=-4.26710382\text{ m},$$

which gives 72.14289618 m bgs before interval clipping. The typical-rainfall seasonal scenario accumulates approximately -12.73318627 m, giving approximately 63.67681373 m bgs. These two long-horizon means are scenario outputs, not validated forecasts.

## 16. Exact fitted baseline coefficients

The coefficient multiplies the standardized feature, not the raw feature. For a feature $j$, its contribution is

$$\beta_j\frac{x_j-\mu_j}{s_j}.$$

### 16.1 Pump-transition baseline

Intercept: **2.2389521863**. Global target median: **1.56 m**. Number of fitted well effects: **516**. Effect range: **-26.2359 to 21.9913 m**. Shrunken well-median range: **-25.51375 to 25.01212 m**.

| Feature | Training mean $\mu$ | Training scale $s$ | Coefficient $\beta$ |
|---|---:|---:|---:|
| Start level, m bgs | 67.6473752462 | 54.6181462771 | -1.0953862510 |
| Log duration | 4.7905054463 | 1.1782018378 | -7.2228280436 |
| Log volume | 9.2553027408 | 1.1102396130 | 7.4996334923 |
| Log energy | 2.3557754988 | 1.0680987279 | -0.2985217988 |
| Mean discharge | 97.0816542677 | 39.9596003928 | -1.7904223663 |
| Mean power | 4.7505253812 | 2.0255607679 | 0.3976216646 |
| Hour sine | 0.1140209363 | 0.8091907994 | 1.7536377227 |
| Hour cosine | -0.2238971928 | 0.5311115921 | 0.7806737528 |
| Day index | 5.5306774500 | 3.1823736492 | -0.2393416299 |

Inner-validation MAE by empirical weight:

| Weight | MAE, m | Weight | MAE, m |
|---:|---:|---:|---:|
| 0.0 | 8.653289 | 0.6 | 8.607774 |
| 0.1 | 8.632365 | 0.7 | 8.627864 |
| 0.2 | 8.614709 | 0.8 | 8.656497 |
| 0.3 | 8.601568 | 0.9 | 8.694435 |
| 0.4 | **8.596912** | 1.0 | 8.741223 |
| 0.5 | 8.597601 |  |  |

### 16.2 Recovery-transition baseline

Intercept: **-2.3244518082**. Global target median: **-1.65 m**. Number of fitted well effects: **443**. Effect range: **-11.1787 to 21.6543 m**. Shrunken well-median range: **-22.8850 to 27.2071 m**.

| Feature | Training mean $\mu$ | Training scale $s$ | Coefficient $\beta$ |
|---|---:|---:|---:|
| Previous stop level | 62.7343345656 | 46.5669684202 | -2.0507682865 |
| Previous start level | 60.8638562847 | 45.7879752292 | 0.2011652537 |
| Previous drawdown | 1.8704782810 | 14.6720190783 | -7.1366463696 |
| Previous log duration | 4.7985021747 | 1.1542536141 | 1.5558102109 |
| Previous log volume | 9.2406017713 | 1.0847585990 | -1.6167479958 |
| Previous mean discharge | 95.1964226830 | 40.1231653288 | 0.9461421610 |
| Previous mean power | 4.6737327594 | 1.9565892660 | 0.8927268611 |
| Log off gap | 5.7412569856 | 1.2950174320 | -0.5836993664 |
| Next-hour sine | 0.1476930595 | 0.8094905560 | 0.0276491531 |
| Next-hour cosine | -0.2120830768 | 0.5271931037 | -0.5755040999 |

Inner-validation MAE by empirical weight:

| Weight | MAE, m | Weight | MAE, m |
|---:|---:|---:|---:|
| 0.0 | 7.316087 | 0.6 | 7.165806 |
| 0.1 | 7.238699 | 0.7 | 7.232774 |
| 0.2 | 7.183277 | 0.8 | 7.320070 |
| 0.3 | 7.143315 | 0.9 | 7.437094 |
| 0.4 | **7.121661** | 1.0 | 7.584689 |
| 0.5 | 7.130155 |  |  |

## 17. Exact rainfall-enhanced coefficients and selection

### 17.1 Pump rainfall candidates

| Candidate lag set | Inner-validation MAE, m |
|---|---:|
| Prior 1 and 3 days | **8.5830285353** |
| Prior 3 days | 8.5845264222 |
| Prior 1, 3, and 7 days | 8.5919867953 |
| Prior 14 days | 8.5922617422 |
| Prior 3 and 7 days | 8.5927103016 |
| Prior 7 days | 8.5936100799 |
| Prior 1 day | 8.5937745989 |

The selected rainfall pump model used empirical weight 0.3. Its baseline-feature means and scales are the pump values in Section 16.1. Additional rainfall parameters are:

| Feature | Mean | Scale | Coefficient |
|---|---:|---:|---:|
| Prior 1-day rain, mm | 1.1258798424 | 1.4991534591 | 0.1925103355 |
| Prior 3-day rain, mm | 3.3050492449 | 2.8170300356 | -0.4985436581 |

Intercept and all coefficients, in exact feature order, are:

`[2.2419044734, -1.0954106281, -7.2354775164, 7.5164593365, -0.2966279746, -1.7920987221, 0.3973143568, 1.7621863254, 0.7887452206, -0.0324683989, 0.1925103355, -0.4985436581]`

There are 516 well effects, ranging from -26.36899 to 21.87837 m. The global target median remains 1.56 m.

### 17.2 Recovery rainfall candidates

| Candidate lag set | Inner-validation MAE, m |
|---|---:|
| Prior 1 day | **7.1215379085** |
| Prior 3 days | 7.1229536888 |
| Prior 1 and 3 days | 7.1250778374 |
| Prior 14 days | 7.1392436293 |
| Prior 7 days | 7.1409785695 |
| Prior 1, 3, and 7 days | 7.1459274560 |
| Prior 3 and 7 days | 7.1463981986 |

The selected recovery rainfall model used empirical weight 0.4. The additional feature has:

| Feature | Mean | Scale | Coefficient |
|---|---:|---:|---:|
| Prior 1-day rain, mm | 1.1867329020 | 1.5189349412 | 0.0444758095 |

Intercept and all coefficients, in exact feature order, are:

`[-2.3226699356, -2.0511218183, 0.2006556130, -7.1361779601, 1.5558864250, -1.6158081967, 0.9473195232, 0.8911230298, -0.5865354554, 0.0272868896, -0.5756416574, 0.0444758095]`

There are 443 well effects, ranging from -11.15573 to 21.67513 m. The global target median remains -1.65 m.

## 18. Data urgently required for a better model

### 18.1 Highest-priority requests

1. A data dictionary defining every field, unit, sign, timestamp convention, status code, and missing-value rule.
2. Confirmation whether water levels are static, dynamic, or sampled at specific pump-control events.
3. Confirmation whether anonymization changed numeric values or only identities and locations.
4. At least one year of continuous history; two to three years is preferred for monsoon seasonality, annual demand, and validation across years.
5. Latitude and longitude, or a privacy-preserving spatial grid, for local rainfall, elevation, land use, geology, and nearby-well features.
6. Sensor model, calibration history, accuracy, resolution, installation depth, and known resets or replacements.
7. Construction depth, casing depth, open-hole or screen intervals, bore diameter, and pump intake depth.
8. A repeatable static-level or recovery protocol after a known non-pumping interval.
9. Pump command/status, current, power, discharge, and cumulative abstraction with clear ON/OFF semantics.
10. Maintenance, pump replacement, deepening, hydrofracturing, cleaning, and recharge-structure events.

### 18.2 Environmental and network context

- local hourly or subdaily rainfall;
- soil and surface permeability;
- imperviousness and land-use change;
- elevation and drainage position;
- weathered-zone thickness;
- geology, lineaments, fracture density, and aquifer interpretation;
- nearby borewell coordinates, depths, pumping schedules, and abstraction;
- artificial recharge structures and operating history;
- municipal or Cauvery/BWSSB supply interruptions and availability;
- local demand proxies such as occupancy, storage, tanker use, or seasonal consumption.

Municipal supply should usually enter as a demand or pumping driver. A useful causal chain is:

$$Reservoir\ and\ supply\ conditions\rightarrow municipal\ availability\rightarrow borewell\ demand\rightarrow pumping\rightarrow groundwater\ response.$$

### 18.3 Proposed duration by forecast horizon

| Desired use | Suggested minimum data |
|---|---|
| Next pumping/recovery transition | Several dozen clean events per well plus fleet pooling |
| 1–7 day operational outlook | Several months with reliable pump and recovery coverage |
| Seasonal or six-month outlook | At least one full year; multiple years preferred |
| One-year forecast | Two to three years with rainfall, demand, and interventions |
| Five-year planning | Multi-year histories, climate and demand scenarios, land-use change, and explicit structural uncertainty |

## 19. Conceptual production model

The next system should separate aquifer state, recharge, abstraction, local well response, and observation error.

### 19.1 Storage balance

A minimal conceptual balance is

$$\frac{dS}{dt}=R(t)-Q(t)-L(t),$$

where:

- $S$ is aquifer or connected-fracture storage;
- $R$ is natural and engineered recharge;
- $Q$ is pumping abstraction;
- $L$ is lateral outflow and other losses.

The current proof of concept does not estimate these terms separately.

### 19.2 Network state model

For well or spatial node $i$, a more useful research form is

$$\frac{dh_i}{dt}=R_i(t)-Q_i(t)+\sum_j J_{ij}(h_j-h_i)+\epsilon_i(t),$$

where $J_{ij}$ expresses hydraulic connection between wells or fracture zones. The sign convention would need to be defined consistently for either head elevation or depth below ground.

### 19.3 Observation model

Dynamic measured depth can be represented as

$$y_i(t)=h_i(t)+d_i^{pump}(t)+b_i+\eta_i(t),$$

where:

- $h_i(t)$ is underlying groundwater state;
- $d_i^{pump}(t)$ is transient drawdown caused by pumping and well losses;
- $b_i$ is sensor or datum bias;
- $\eta_i(t)$ is measurement noise.

This structure explains why static recovery observations and pump state are essential.

### 19.4 Candidate statistical architecture

A production version could use:

1. event-level robust models for immediate pump drawdown and recovery;
2. a state-space model for latent static level;
3. distributed rainfall-recharge lags learned by location or geology group;
4. neighboring-well graph effects;
5. exogenous demand and municipal-supply inputs;
6. hierarchical pooling for wells with limited history;
7. rolling-origin validation at operational, monthly, seasonal, and annual horizons;
8. calibrated quantile or conformal intervals by horizon and evidence tier.

The preferred model should be chosen by out-of-time performance and calibration, not by complexity.

## 20. Software and deployment architecture

### 20.1 Offline computation

The Python scripts read the raw CSVs, create sessions and transitions, screen records, fit models, compute holdout predictions, summarize wells, and export JSON and CSV artifacts.

### 20.2 Public browser application

The deployed site is static HTML, CSS, JavaScript, and JSON. There is no server-side database and no online retraining. Forecast controls are evaluated locally in the browser. User selections are not sent to an application backend or stored by this code.

The app loads:

- `dist/data/wells.json` for per-well summaries and daily history;
- `dist/data/real_rainfall.json.gz` for real rainfall validation and monthly climatology;
- `dist/data/synthetic_model.json.gz` for M3 parameters, static history and held-out predictions;
- `dist/data/model_comparison.json.gz` for the three-model comparison and reference baselines.

The root remains the real-data trend model. Pages 2 and 3 show M3 scenarios and validation. Page 4 compares all three models and restores M1-vs-M2 real scenarios. Sections 25–28 specify the revised synthetic model and supersede historical rainfall page paths.

### 20.3 Deployment

GitHub Actions publishes the `dist` directory to GitHub Pages. A `.nojekyll` file prevents unwanted Jekyll processing. Links are relative so the app works under the repository project path.

Optional WebMCP tools named `configure_water_level_forecast` and `configure_synthetic_borewell_forecast`, `inspect_synthetic_borewell_validation`, and `compare_borewell_models` expose the same page controls to compatible browser agents. They do not change the model mathematics.

## 21. Reproduction sequence

An implementation should follow this order:

1. Read paired Type A and Type B CSVs and sort all observations by time.
2. Treat Type B intervals as session definitions.
3. Assign inclusive Type A points to each session.
4. Integrate discharge and power with the trapezoid rule.
5. Construct pump targets, recovery targets, and transformed features.
6. Apply the exact quality screens.
7. Split chronologically at 24 July and 26 July 2026.
8. Fit standardized Huber IRLS with ridge 3 and 35 iterations.
9. Add shrunken per-well residual effects and shrunken per-well target medians.
10. Select ensemble weight on 24–25 July and refit before 26 July.
11. Evaluate on 26–29 July with MAE, median AE, RMSE, and $R^2$.
12. Build daily median start levels and Theil–Sen stability summaries.
13. Export per-well histories and summaries for the site.
14. For rainfall comparison, download NASA POWER, shift rainfall by one day, calculate rolling sums, select lags on inner validation, and test on the same holdout.
15. Build the monthly 2001–2025 climatology for scenario display.
16. Publish the static `dist` directory.

## 22. Interpretation rules for another analyst or language model

The following statements are part of the specification:

1. “Water level” means depth below ground in metres unless source documentation proves otherwise.
2. Larger depth means deeper water; positive change means worsening depth under this convention.
3. The feet fields in Type B duplicate the metre water-level values and are not construction depth.
4. Type B sessions, not Type A `pump_status`, define pumping intervals in the implemented model.
5. The model uses Type A discharge and power inside those intervals.
6. The pump-status field was inspected but is not a fitted predictor.
7. The validated models predict one pump transition or one recovery transition.
8. Screened holdout performance must be reported together with all-record performance because raw anomalies are consequential.
9. The short stability trend is a separate Theil–Sen summary.
10. The root website’s arbitrary-horizon curve is a heuristic scenario extrapolation.
11. The rainfall page’s future curve is a climatology scenario, separate from the fitted lagged-rainfall validation model.
12. A user-selectable long horizon does not imply validated accuracy at that horizon.
13. The website’s uncertainty bands are heuristic and clipped; they are not calibrated prediction intervals.
14. Rainfall’s negligible measured gain is specific to this short, low-rain, single-grid-cell experiment.
15. No source data dictionary was available, and dynamic/static semantics remain unconfirmed.
16. Numerical anonymization may have altered values; this is unresolved.
17. The broader project proposal discussed live networks, land use, geology, monsoon, and Cauvery supply. Those layers were context, not columns in the supplied CSVs.
18. The current work is a proof of concept for method and data requirements, not a hydrological certification or operational groundwater-management system.

## 23. Known limitations and open questions

- Observation length is approximately 15 days.
- The holdout is only four days.
- Many wells have limited coverage or no usable sessions.
- Nearly half of recovery transitions fail the pragmatic quality screen.
- Extreme endpoint changes up to approximately ±435 m require source review.
- The apparent Type A OFF power requires explanation.
- Pump status is highly imbalanced and not used directly.
- There are no well coordinates.
- One rainfall grid cell is applied to every well.
- There are no static-level measurements or recovery-test protocols.
- There is no construction depth, pump intake depth, or screened/open interval.
- There is no local geology, fracture, soil, imperviousness, or land-use feature in the fitted data.
- There is no nearby-well pumping or municipal supply feature.
- The data cannot identify seasonal, annual, or five-year behavior.
- The model cannot separate aquifer decline from local drawdown, sensor bias, well loss, or changed pumping behavior.
- The long-horizon scenario is sensitive to recent slope and chosen pumping/recharge categories.
- Clipping at 0 and 500 m can make interval widths appear asymmetric and can conceal extrapolation beyond the display range.

## 24. Final conclusion

The supplied files are sufficient to demonstrate a coherent modeling pipeline. Session-level discharge and power can be linked exactly to start/stop water-level observations. Robust partial pooling yields measurable short-horizon predictive signal and modestly improves on well-history baselines. A separate stability layer summarizes recent daily movement. The public site makes those summaries interactive and exposes the large uncertainty that follows from sparse evidence.

The current evidence does not support precise six-month, one-year, or five-year predictions. Public rainfall alone did not solve that limitation. The next phase should focus first on field definitions, sensor validity, well geometry, static recovery measurements, spatial context, and at least one complete seasonal cycle. Once those inputs exist, the proof-of-concept components can become parts of a validated state and transition model rather than a long-horizon scenario display.


## 25. Synthetic system and Page 2: the 450-well driver model

### 25.1 Sources, targets and generating equation

The workbook `Bengaluru_Borewell_Synthetic_Test_Data_450_Wells.xlsx` contains setup, metadata, common daily drivers, panels, sessions and test cases. The full daily truth and full 180-day sessions companion CSVs cover SYN001–SYN450 on 1 January–29 June 2026. There are 81,000 well-days. Eight scenarios represent stable control, gradual decline, pumping, recharge, mixed response, neighbour interference, sensor drift and structural change.

The physical generator identity is additive:

$$\Delta h^{true}_{i,t}=T_{i,t}+P_{i,t}-R_{i,t}+N_{i,t}+S_{i,t}+\epsilon_{i,t}.$$

Here T is background trend, P pumping storage, R recharge magnitude, N neighbour effects, S structural change and epsilon process noise. Observed static level adds sensor bias and measurement noise. The offline builder verifies the component identity to 0.00011 m. These hidden components and the hidden recharge delay are never predictors. The workbook's metadata is read and all 450 identities matched against the companion files.

The generator's `effective_recharge_rain_mm` is delayed rain. In the supplied generator, imperviousness modifies the recharge coefficient rather than this delayed column. The revised fitted model independently transforms raw rain by the impervious fraction; its learned coefficient accounts for this scale difference. It does not read the hidden effective-rain column or hidden recharge delay.

### 25.2 Raw rainfall transform and delay selection

The candidate delay set is {0, 1, 3, 7, 14, 21, 30, 45} days. It includes longer delays because the generator spans up to 45 days. A normalized causal kernel spans lags 0–60:

$$\tau_D=\max(2,D/2).$$

$$k_D(l)=\frac{\mathbf{1}(l\ge D)\exp(-(l-D)/\tau_D)}{\sum_{j=0}^{60}\mathbf{1}(j\ge D)\exp(-(j-D)/\tau_D)}.$$

$$r^D_{i,t}=(1-I_i)\sum_{l=0}^{60} k_D(l)p_{t-l}.$$

I is impervious fraction and p raw daily rainfall. Missing pre-series rainfall is zero. Current-day rain is allowed when D=0: it is an actual supplied daily input in the conditional test, not a prediction of future rain. For every candidate, fit on days 1–120, roll predictions through 121–150 with their actual drivers, and select each well's kernel by MAE against observed static levels. No hidden true level is used to select the delay. Final pooled and per-well fits use days 1–150 only.

### 25.3 M3 master prediction equation

This is the deployable daily-change equation for M3, distinct from the conceptual Section 19.2 equation and from the Section 12 M1 scenario formula:

$$x_{i,t}=[1,\Delta\hat h_{i,t-1},(V_{i,t}-c_i)/s_i,r^D_{i,t}/q_i,(1-U_t)/0.2,Q_t-1].$$

$$\Delta\hat h_{i,t}=clip(x_{i,t}^{T}\beta_i,-0.8,0.8).$$

$$\hat h_{i,t}=\hat h_{i,t-1}+\Delta\hat h_{i,t}.$$

V is daily volume in cubic metres, c the training median, s=max(training volume SD,1), q=max(training transformed-rain SD,1), U municipal supply index, and Q demand index. Training features use the preceding observed daily change; rolled paths use the preceding predicted change. Responses are observed daily static changes. Training starts on day 3.

### 25.4 Fit, shrinkage and sign constraints

The pooled fleet fit uses ridge strength 1; a well fit uses strength 18 and shrinks toward that fleet coefficient vector. The intercept penalty is one quarter of the other penalties. The objective is:

$$\min_{\beta_i}\|y_i-X_i\beta_i\|^2+18(\beta_i-\beta_F)^T A(\beta_i-\beta_F).$$

A is diag(0.25,1,1,1,1,1). The autoregressive coefficient is constrained to [0,0.98]; pumping, supply-shortfall and demand coefficients are nonnegative; rain is nonpositive; the intercept is free. A convex coordinate-descent solve updates each coefficient using the normal equations until change is below 1e-10 or 500 sweeps. Coefficients are exported to nine decimals.

The autoregressive and driver constraints make higher pumping and drier rainfall produce equal or deeper forecasts for every simulated well. Equality occurs when a coefficient is zero or a display bound is reached. Holdout predictions are not clipped to construction depth, allowing errors to be measured. Forward display paths are clipped to [0, construction depth minus 1]. Reaching the bound indicates saturation of this display convention, not physical stability or sustainable yield.

### 25.5 Shared browser features and future calendar

`meta.feature_spec` defines the kernel length, coefficient order, normalizations and daily-change bound. The offline builder and `dist/model-core.js` interpret this specification. A checked fixture compares 5 wells times 10 days between Python and JavaScript to 1e-6. Pages 2 and 4 use the same M3 arrays or shared forward equations.

Future rain, supply and demand are selected by each forecast date's month/day from a 365-day synthetic typical calendar. Jan–29 June retains the supplied drivers. The remaining year is generated with seed 20260926, wetter monsoon months, gamma-distributed storm sizes consistent with the supplied first half, the same temperature/supply/demand form and capped rainfall of 65 mm/day. Leap day uses 28 February. This is a synthetic seasonal assumption, not NASA observations or a weather forecast.

Future volume uses the mean of training volume times a weekly rhythm [1+0.08 sin(2 pi d/7)] and pumping factors 0.75, 1, 1.25. Rain factors are 0.6, 1, 1.4 for dry, typical, wet. The rainfall convolution retains the actual preceding 180 days of rain before extending the calendar. M3 forward paths retain days 1–150 coefficients and start from the latest observed day 180 level. The arbitrary 1/(1+d/365) attenuation from the old Page 2 has been removed: training, holdout and forecasting now use the same daily-change equation.

## 26. Page 3: conditional validation and interval calibration

### 26.1 Split and information boundaries

Inner training is days 1–120 (1 Jan–30 April). Inner validation is 121–150 (1–30 May). Final training is 1–150; untouched scoring is 151–180 (31 May–29 June). Delay selection uses observed inner levels. Interval calibration uses known synthetic true levels only in the inner window. Final true levels are used only to calculate final test metrics.

The model receives actual future volume, raw rain, supply and demand throughout the test. Thus this measures static-level response conditional on known inputs. It does not validate a joint forecast of weather, supply, demand and levels, and does not establish real Bengaluru accuracy.

### 26.2 Interval equation

Training residual sigma is the root mean squared daily-change residual with minimum 0.08 m/day. Define the original half-width at lead h:

$$b_i(h)=1.282\max(1.35\sigma_i\sqrt h,0.35+0.035h).$$

Compute ratios |inner prediction minus inner true level| / b_i(h) across 450 wells and 30 inner days. Their 80th percentile is multiplier a. Apply this fixed a to final holdout widths; never tune it on final truth. Future widths use:

$$w_i(h)=a\,b_i(\min(h,30))\sqrt{\max(h,30)/30}.$$

The square-root extension after day 30 is extrapolated and has no measured long-horizon coverage. Selecting a nominal 95% range replaces 1.282 with 1.96; this rescaling is not independently calibrated to 95%. Forward intervals are clipped at physical display bounds; holdout intervals remain unclipped.

The fitted multiplier is **0.228571897**. Inner coverage is 80.0%. Final coverage is **63.007%** including drift and **66.714%** without drift, with a mean half-width of **0.327 m**. Calibration did not transfer to the later rainfall regime. The interface explicitly reports this undercoverage; neither range is an achieved coverage guarantee.

### 26.3 Final scenario results

| Scenario | Wells | MAE m | Bias m | Coverage % |
|---|---:|---:|---:|---:|
| gradual decline | 75 | 0.230 | 0.100 | 78.667 |
| mixed response | 75 | 0.337 | 0.084 | 58.044 |
| neighbor interference | 40 | 0.278 | 0.116 | 63.833 |
| pump dominated | 75 | 0.213 | 0.008 | 79.200 |
| recharge dominated | 75 | 0.365 | 0.152 | 51.556 |
| sensor drift | 25 | 4.259 | 4.259 | 0.000 |
| stable control | 60 | 0.221 | 0.100 | 72.222 |
| structural change | 25 | 0.354 | 0.199 | 56.267 |

Sensor-drift MAE is 4.259 m and coverage is zero. The input bias is not identifiable as drift from these data alone; calibration evidence or independent static reference measurements are needed. Structural shifts and unobserved neighbour pumping remain potential errors even when aggregate MAE is low.

## 27. Page 4: comparison design and measured results

### 27.1 Three models, one target

M1 is the real-data trend model. On the synthetic sessions it applies the Section 6.1 screen, daily median usable pump-start readings, Theil–Sen and fleet shrinkage, latest usable pre-holdout session, and typical/typical logarithmic projection exactly as Sections 11–12. The synthetic companion does not contain a Type A sample-count column; its endpoint screen assumes the synthetic session endpoints are available. No synthetic transition regression is newly trained for M1.

M2 is the rainfall-scenario model. It applies Section 14.3 to M1's session summary with actual holdout rain and mean days 1–150 rainfall as p-bar. Its daily cumulative adjustment and heuristic interval ratio 8.131628/8.134227 are retained without holdout tuning. On real wells the panel uses recovered NASA POWER monthly quartiles and each well's actual latest usable date.

M3 is the corrected 450-well driver model in Section 25. Page 3 is its validation, not another model. Every model's scoring target is the same hidden daily static level. M1/M2 deliberately retain dynamic pump-start inputs, so this comparison includes their target mismatch.

Persistence holds day 150 observed static level constant. The 60-day trend extrapolates the ordinary linear fit on days 91–150. The M1-static ablation replaces pump-start medians with daily observed static levels while retaining the M1 trend/shrinkage/log formula. This isolates the gain from readings rather than model complexity.

### 27.2 Final common holdout metrics

| Method | MAE all m | MAE no drift m | Bias all m | Coverage all % |
|---|---:|---:|---:|---:|
| M1 | 4.471 | 4.214 | 4.427 | 98.526 |
| M2 | 3.905 | 3.678 | 3.403 | 98.704 |
| M3 | 0.501 | 0.280 | 0.329 | 63.007 |
| M1_static | 0.692 | 0.497 | 0.503 | 100.000 |
| persistence | 0.921 | 0.783 | 0.034 | — |
| linear60 | 0.583 | 0.352 | 0.542 | — |

The M3 error rises from the older supplied-effective-rain prototype (0.446 all / 0.221 without drift) to 0.501 / 0.280 m. This is expected from the stricter information contract: the model now learns a coarse rain delay from raw input rather than receiving the generator's exact hidden recharge transform, and it enforces physical signs. M1, M2 and baselines reproduce the prototype reference values. More complex modelling is not universally best: the scenario table shows cases where the static trend or a baseline outperforms M3.

Without drift, moving from pump-start M1 to static M1 reduces MAE from 4.214 to 0.497 m. Adding drivers reduces it further to 0.280 m. M1's bias is +4.427 m overall: dynamic readings carry residual drawdown. The 98–100% coverage of the broad M1/M2/static heuristic intervals is not evidence of calibration.

### 27.3 Charts, metrics, tools and forward paths

Page 4 shows model cards, scenario/well selection, the last 60 training observations, 30 hidden days, switchable bands, day 7/15/30 errors, and 183-day forward paths. Forward M1 and M2 update summaries from all 180 session days; M3 retains final training coefficients anchored to the observed day 180 static level. There is no future truth beyond 29 June.

Fleet and scenario MAE, RMSE, signed bias, coverage, mean half-width, lead-day error and three-model win share are reported, with a sensor-drift exclusion toggle. Win share is the proportion of wells with lowest per-well MAE among M1–M3; baselines are excluded. Ties follow M1, M2, M3 order. The matrix distinguishes data availability, target type, horizon validity, drivers, sensor limits and interpretability.

All delivered prediction and truth arrays are rounded to 0.001 m before published metrics are calculated. Browser recalculation from those arrays matches fleet metrics to 0.001. Derived aggregate gzip comparison data remains below 1.5 MB. Raw private real CSVs remain local. The `compare_borewell_models` tool takes `well_id` and `excl_sensor_drift`, returns per-well model metrics and indicates whether the selected well belongs in the selected fleet population.

The real panel reports screened pump/recovery MAE 8.953/7.088 m, all-record 33.997/29.691 m and rainfall combined improvement 8.134227 to 8.131628 m (0.03%). These are session-transition errors, unlike the synthetic daily static errors: they must not be compared directly. M3 cannot yet run on real wells with the current missing static readings, drivers and history.

## 28. Correction audit and reproduction of the review branch

### 28.1 Corrections to Page 1

Null and missing levels are tested explicitly. Wells with zero usable screened sessions have no forecast. Their datalist entries distinguish no readings from rejected readings. The last reading date comes from `latest_start_time`; BW005 correctly shows 19 July for its rejected record. An unavailable selection clears the previous forecast and tool state. Observed chart x positions use actual day differences to that latest date. BW046 retains 74.9 m at 30 days with an 80% heuristic half-width of 32.0 m; its first chart date is 14 days ago.

Form labels and controls are wrapped together on Pages 1 and 3. Navigation links identify all four pages and their active state. Responsive verification covers 375, 768, 1024, 1280 and 1440 px; charts and tables scroll within their own cards.

### 28.2 Replay and scenario direction

Replaying actual 180-day drivers from the first observed static reading yields the following median changes. This diagnostic is an in-history replay with final fitted coefficients, not an independent forecast test. Sensor drift is a designed exception.

| Scenario | True change m | Corrected replay m |
|---|---:|---:|
| recharge dominated | -4.949 | -5.042 |
| neighbor interference | 11.054 | 11.003 |
| mixed response | 5.447 | 5.695 |
| pump dominated | 14.490 | 14.680 |
| gradual decline | 7.452 | 7.625 |
| stable control | 0.198 | 0.518 |
| structural change | 1.001 | 1.604 |
| sensor drift | 5.228 | 10.302 |

All seven non-drift scenarios have the same direction as truth and a median difference within 1.5 m. The old wrong-sign coefficient count (40 pumping, 33 rainfall) is now zero. Every forecast day is checked for all 450 wells at 3 months, 1 year and 5 years: high pumping ≥ typical ≥ low, and dry rain ≥ typical ≥ wet.

### 28.3 Rebuild commands and release boundary

Run `python3 tools/build_model_comparison.py --data-folder '/path/to/local/data '` from the repository with NumPy installed. It reads the XLSX metadata, full daily companion and full sessions companion; recovers the previously committed rainfall aggregate from eb6021e; exports three derived gzip files, feature probes and the build report. It never reads or publishes raw real CSVs. Run `node tools/verify.js` for cross-language features, monotonicity, Page 1 regression examples, all four page scripts and tools, and delivered metric equality.

The readable handoff source, Word and PDF outputs are in `docs/`. The offline builder is outside published `dist/`. GitHub Actions publishes only `dist/` on main. This change is prepared on `site-fixes-and-model-comparison` as a pull request, without merging. Review is required before live deployment.

## Appendix A. Machine-readable pseudocode

```text
INPUT:
  paired TypeA and TypeB CSVs by well_id

FOR each well:
  sort TypeA points and TypeB sessions by time
  FOR each TypeB session [start, stop]:
    segment = TypeA points with start <= timestamp <= stop
    compute mean/median discharge and power
    integrate discharge over minutes to litres
    integrate power over minutes and divide by 60 to kWh
    drawdown = stop_level - start_level
    construct log, clock, and day-index features
    quality_ok = exact pump-screen rules

  FOR each consecutive pair of sessions:
    off_gap = next.start - previous.stop
    recovery = next.start_level - previous.stop_level
    net_cycle = next.start_level - previous.start_level
    quality_ok = exact recovery-screen rules

FOR target in [pump_drawdown, recovery_change]:
  train = quality_ok and event_time < 2026-07-26
  holdout = quality_ok and event_time >= 2026-07-26
  inner_train = train with event_time < 2026-07-24
  inner_validation = train with event_time >= 2026-07-24

  fit standardized Huber IRLS ridge model on inner_train
  calculate shrunken per-well residual effect
  calculate shrunken per-well target median
  choose empirical weight from 0.0 to 1.0 by inner-validation MAE
  refit on all train
  predict holdout
  report MAE, median AE, RMSE, R2

FOR each well:
  daily_level = median usable session-start level per day
  raw_trend = Theil-Sen slope
  shrunk_trend = shrink raw trend toward fleet median
  classify stability from raw trend and median net-cycle change
  assign website evidence tier from usable transitions and days

ROOT WEBSITE:
  convert horizon to days
  derive pump and recovery sensitivities from well summary
  combine base trend and scenario factors
  change = 30 * effective_trend * log(1 + days/30)
  attach heuristic expanding interval

RAINFALL VALIDATION:
  download NASA POWER PRECTOTCORR
  shift daily rain by one day
  create 1, 3, 7, 14-day prior sums
  select lag set on 24–25 July
  evaluate 26–29 July

RAINFALL SCENARIO PAGE:
  construct monthly q25/median/q75 climatology for 2001–2025
  spread selected monthly total evenly within each month
  adjust daily trend by bounded rainfall signal and recovery sensitivity
  accumulate with 1/(1+d/30) decay
  retain heuristic uncertainty, scaled by validation MAE ratio
```

## Appendix B. Glossary

| Term | Meaning in this work |
|---|---|
| Aquifer recharge | Water entering the groundwater or connected-fracture system |
| Dynamic level | Water depth measured while pumping or under recent pumping influence |
| Static level | Water depth after a defined non-pumping recovery period |
| Drawdown | Here, stop depth minus start depth within a pumping session |
| Recovery | Next start depth minus previous stop depth |
| m bgs | Metres below ground surface |
| MAE | Mean absolute error |
| Median AE | Median absolute error |
| RMSE | Root mean squared error |
| Huber regression | Robust regression that reduces the influence of large residuals |
| Ridge | Quadratic coefficient penalty used for numerical stability |
| Partial pooling | Combining fleet-wide learning with shrunken well-specific effects |
| Theil–Sen slope | Median of pairwise slopes, resistant to isolated outliers |
| Chronological holdout | Later data withheld from model fitting and used only for evaluation |
| Climatology | Historical seasonal distribution, not a weather forecast |
| Scenario | Conditional illustration under stated assumptions, not a validated prediction |
