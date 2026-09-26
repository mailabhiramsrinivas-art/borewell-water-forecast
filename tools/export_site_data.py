"""Export the data behind the investor pages (forecast, accuracy, drivers, network).

Reads the analysis folders that sit next to this repository in the project folder:
  ../long_history_model/   one year of monitoring data (digital twin), weekly resting-level models
  ../well_interaction_model/   synthetic well-interaction model (network page)
Writes dist/data/monitoring.json, dist/data/monitoring_summary.json and dist/data/network.json.
Run from the repository root:  python3 tools/export_site_data.py
"""
import csv
import json
import os
import sys
from collections import defaultdict

import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.dirname(REPO)
LH = os.path.join(PROJECT, "long_history_model")
WI = os.path.join(PROJECT, "well_interaction_model")
OUT = os.path.join(REPO, "dist", "data")
r2 = lambda x: None if x is None or not np.isfinite(x) else round(float(x), 2)
r3 = lambda x: None if x is None or not np.isfinite(x) else round(float(x), 3)


def monitoring():
    sys.path.insert(0, os.path.join(LH, "scripts"))
    import long_horizon as L
    ids, W0, Y, Q = L.weekly_series()
    nweek = Y.shape[1]
    rain, clim = L.rain_weekly(W0, nweek)
    start = np.datetime64("2025-01-01") + int(W0 // 86400)
    weeks = [str(start + 7 * k) for k in range(nweek)]
    res = json.load(open(os.path.join(LH, "results", "long_horizon.json")))
    ens = json.load(open(os.path.join(LH, "results", "ensemble.json")))
    trans = json.load(open(os.path.join(LH, "results", "transition_models.json")))
    audit = json.load(open(os.path.join(LH, "results", "audit.json")))
    summ = {w["well_id"]: w for w in json.load(open(os.path.join(LH, "results", "well_summary.json")))["wells"]}
    wells = np.where(np.isfinite(Y).sum(1) >= L.MIN_WEEKS)[0]

    # past forecasts (blend) per well, origin, horizon
    weights = {h: {int(o): w for o, w in v["weight_on_driver_by_origin"].items()} for h, v in ens["horizons"].items()}
    P = defaultdict(dict)
    with open(os.path.join(LH, "results", "predictions_long_horizon.csv")) as f:
        for r in csv.DictReader(f):
            P[(r["well_id"], int(r["origin_week"]), r["horizon_weeks"])][r["model"]] = (float(r["pred_m"]), float(r["obs_m"]))
    past = defaultdict(list)
    for (wid, o, h), v in P.items():
        if "trend" in v and "driver_forecast" in v:
            w = weights[h][o]
            pred = (1 - w) * v["trend"][0] + w * v["driver_forecast"][0]
            hw = ens["horizons"][h]["mean_80pct_halfwidth_m"]
            past[wid].append((int(h), o, r2(pred), r2(v["trend"][1])))

    out_wells = []
    for i in wells:
        wid = ids[i]
        s = summ.get(wid)
        pw = defaultdict(list)
        for h, o, p_, obs in sorted(past.get(wid, [])):
            pw[str(h)].append([o, p_, obs])  # [forecast-date week index, blended forecast, what happened]
        rec = {"id": wid, "levels": [r2(x) for x in Y[i]], "pump_m3": [int(round(float(x))) for x in Q[i]],
               "weeks_with_data": int(np.isfinite(Y[i]).sum()), "past": pw}
        if s:
            rec.update({"latest": s["latest_resting_level_m_bgs"], "latest_week": s["latest_week_start"],
                        "trend_m_per_week": s["trend_m_per_week_last8"],
                        "pump_sensitivity_m_per_1000m3": s["pumping_sensitivity_m_per_1000m3"],
                        "mean_weekly_pumping_m3": s["mean_weekly_pumping_m3"],
                        "forecast": {k: {"level": v["blend_m_bgs"], "lo": v["range80_m_bgs"][0], "hi": v["range80_m_bgs"][1]}
                                     for k, v in s["forecast"].items()}})
        out_wells.append(rec)
    meta = {"source": "digital twin (physics-based simulation of the 579 wells)", "period": [weeks[0], audit["files"]["last_timestamp"]],
            "weeks": weeks, "origins": {str(o): weeks[o] for o in res["origins_week"]},
            "forecast_from": weeks[-1], "forecast_weeks": [4, 8, 12],
            "range80_halfwidth_m": {h: r2(v["mean_80pct_halfwidth_m"]) for h, v in ens["horizons"].items()}}
    with open(os.path.join(OUT, "monitoring.json"), "w") as f:
        json.dump({"meta": meta, "wells": out_wells}, f, separators=(",", ":"))

    # summary for accuracy and drivers pages
    H = res["horizons_weeks"]
    acc = {m: {str(h): {k: r3(res["results"][m][str(h)][k]) for k in ["mae_m", "median_ae_m", "bias_m", "calibrated_80pct_coverage",
                                                                          "mean_80pct_halfwidth_m", "share_wells_beating_persistence"]}
               for h in H} for m in ["persist", "trend", "driver_forecast", "driver_norain_forecast", "driver_known"]}
    acc["blend"] = {h: {"mae_m": r3(v["mae_m"]), "median_ae_m": r3(v["median_ae_m"]), "bias_m": r3(v["bias_m"]),
                        "calibrated_80pct_coverage": r3(v["calibrated_80pct_coverage"]), "mean_80pct_halfwidth_m": r3(v["mean_80pct_halfwidth_m"])}
                    for h, v in ens["horizons"].items()}
    # one-week detail for the blend
    e = []
    for (wid, o, h), v in P.items():
        if h == "1" and "trend" in v and "driver_forecast" in v:
            w = weights["1"][o]
            e.append(abs((1 - w) * v["trend"][0] + w * v["driver_forecast"][0] - v["trend"][1]))
    e = np.array(e)
    dev = Y[wells] - np.nanmean(Y[wells], 1, keepdims=True)
    fleet = np.nanmedian(dev, 0)
    fits = L.fit_driver(Y, Q, rain, wells, nweek, True)
    sens = [1000 * fits["b"][i] for i in wells if i in fits["b"]]
    months = sorted({w[:7] for w in weeks})
    d = json.load(open(os.path.join(LH, "cache", "nasa_power_bengaluru.json")))["properties"]["parameter"]["PRECTOTCORR"]
    monthly = []
    for m in months:
        tot = sum(max(v, 0) for k, v in d.items() if k[:6] == m.replace("-", ""))
        hist = [sum(max(v, 0) for k, v in d.items() if k[:6] == f"{y}{m[5:]}") for y in range(2001, 2026)]
        monthly.append({"month": m, "rain_mm": round(tot, 1), "typical_mm": round(float(np.median(hist)), 1),
                        "dry_q25_mm": round(float(np.percentile(hist, 25)), 1), "wet_q75_mm": round(float(np.percentile(hist, 75)), 1)})
    T = trans["models"]
    summary = {
        "source": meta["source"], "period": meta["period"], "wells_modelled": int(len(wells)),
        "forecast_dates": list(meta["origins"].values()), "horizons_weeks": H, "accuracy": acc,
        "one_week": {"typical_error_m": r3(np.median(e)), "average_error_m": r3(e.mean()), "within_0_5m": r3(np.mean(e <= 0.5)),
                     "within_1m": r3(np.mean(e <= 1.0)), "forecasts": int(len(e))},
        "rain_value": {k: {"reduction_m": r3(v["mae_reduction_m"]), "pct": round(v["pct_of_norain_mae"], 1),
                           "ci95_m": [r3(v["ci95"][0]), r3(v["ci95"][1])]} for k, v in res["rainfall_value"].items()},
        "sessions": {n: {k: r3(T[n]["pooled"][k]["screened"]["mae"]) for k in ["long_history", "last_15_days_only", "persistence", "well_median_long"]}
                     for n in ["pump", "recovery"]},
        "season": {"weeks": weeks, "typical_well_vs_own_mean_m": [r2(x) for x in fleet],
                   "rain_mm_week": [round(float(x), 1) for x in rain[13:13 + nweek]]},
        "monthly_rain": monthly,
        "effects": {"rain_m_per_100mm": {"previous_week": r2(-100 * fits["c"][0]), "weeks_2_to_4": r2(-100 * fits["c"][1]),
                                         "weeks_5_to_8": r2(-100 * fits["c"][2]), "weeks_9_to_13": r2(-100 * fits["c"][3])},
                    "pumping_m_per_1000m3_pooled": r2(1000 * fits["b_pool"]),
                    "pump_sensitivity_by_well": [r3(x) for x in sens]},
        "audit": {"sessions": audit["screening"]["sessions"], "usable_pct": audit["screening"]["usable_pct"],
                  "pump_readings": audit["files"]["typeA_rows"], "resting_readings": audit["screening"]["resting_readings"],
                  "wells_with_data": audit["files"]["wells"] - audit["files"]["wells_without_data"]},
    }
    with open(os.path.join(OUT, "monitoring_summary.json"), "w") as f:
        json.dump(summary, f, separators=(",", ":"))
    return len(out_wells)


def network():
    sys.path.insert(0, WI)
    import simulate_v2
    import wim_data
    import wim_eval as E
    from wim_model import WIM, Drivers, WARMUP
    meta, daily = wim_data.load()
    v2 = simulate_v2.load(simulate_v2.CONFIRM_SEED)
    xy, mapped = v2["xy"], v2["mapped"]
    dr = Drivers(daily, meta, Q=v2["Q_operational"])
    m = WIM(E.graphs_for("WIMG", xy, mapped)).fit(dr, v2["obs_continuous_operational"], np.arange(WARMUP, 150))
    S_true = simulate_v2.truth_spillover(v2["KF"], v2["muF"], v2["KM"], v2["muM"], 30)
    imp_true = meta["pump_storage_coeff_m_per_m3"] * 30 + S_true.sum(0)
    S = m.spillover_matrix(30)
    imp_mod = m.own_effect(30) + S.sum(0)
    s4 = json.load(open(os.path.join(WI, "results", "step4_network_results.json")))
    s2 = json.load(open(os.path.join(WI, "results", "step2_v2_results.json")))
    conf = s2["networks"]["confirmation"]
    out = {
        "note": "synthetic 450-well system with a simulated fracture network (not real wells)",
        "wells": [{"id": str(meta["well_id"][i]), "x": r2(xy[i, 0]), "y": r2(xy[i, 1]), "true": r3(imp_true[i]), "model": r3(imp_mod[i]),
                   "external_true": r3(S_true[:, i].sum() / imp_true[i])} for i in range(len(xy))],
        "fractures": [[r2(v) for v in seg] for seg in v2["fractures"]],
        "mapped": [[r2(v) for v in seg] for seg in mapped],
        "results": {
            "strength_vs_truth": {"today_sensors": r2(conf["designs"]["operational+endpoint"]["WIMG"]["interaction"]["total_spillover_ratio_model_to_truth"]),
                                  "continuous_logging": r2(conf["designs"]["operational+continuous"]["WIMG"]["interaction"]["total_spillover_ratio_model_to_truth"]),
                                  "distance_only_no_map": r2(conf["designs"]["operational+continuous"]["WIMD"]["interaction"]["total_spillover_ratio_model_to_truth"])},
            "exposed_wells_auc": {"confirmation": r2(conf["designs"]["operational+continuous"]["WIMG"]["interaction"]["vulnerability_auc_top10pct"]),
                                  "development": r2(s2["networks"]["development"]["designs"]["operational+continuous"]["WIMG"]["interaction"]["vulnerability_auc_top10pct"])},
            "pressure_points": {k: {"rank_corr": r2(s4[k]["continuous"]["A_network_impact"]["spearman_model_vs_true"]),
                                    "top30_found": r2(s4[k]["continuous"]["A_network_impact"]["top30_overlap_model_vs_true"]),
                                    "rank_corr_today_sensors": r2(s4[k]["endpoint"]["A_network_impact"]["spearman_model_vs_true"]),
                                    "external_share": r2(s4[k]["continuous"]["A_network_impact"]["true_external_share_median"])}
                                for k in ["development", "confirmation"]},
            "targeted_relief": {lvl: {k: r2(v["true_rise_per_1000m3_saved_m"]) for k, v in B.items()}
                                for lvl, B in [("normal", s4["confirmation"]["continuous"]["B_targeted_relief"]),
                                               ("strong", s4["confirmation_interference_x3"]["continuous"]["B_targeted_relief"])]},
            "benefit_prediction": {lvl: {"network_model_predicted": r2(B["model_guided_WIMG"]["model_predicted_total_rise_m"]),
                                         "network_model_true": r2(B["model_guided_WIMG"]["true_total_rise_m"]),
                                         "no_network_predicted": r2(B["own_effect_only_WIM0"]["model_predicted_total_rise_m"]),
                                         "no_network_true": r2(B["own_effect_only_WIM0"]["true_total_rise_m"]),
                                         "share_on_other_wells": r2(B["model_guided_WIMG"]["true_rise_at_other_wells_m"] / B["model_guided_WIMG"]["true_total_rise_m"])}
                                   for lvl, B in [("normal", s4["confirmation"]["continuous"]["B_targeted_relief"]),
                                                  ("strong", s4["confirmation_interference_x3"]["continuous"]["B_targeted_relief"])]},
            "new_borewell": s4["confirmation"]["continuous"]["C_new_borewell_15m3_per_day"],
        },
    }
    with open(os.path.join(OUT, "network.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    return len(out["wells"])


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("monitoring wells:", monitoring())
    print("network wells:", network())
    for n in ["monitoring.json", "monitoring_summary.json", "network.json"]:
        print(n, os.path.getsize(os.path.join(OUT, n)) // 1024, "KB")
