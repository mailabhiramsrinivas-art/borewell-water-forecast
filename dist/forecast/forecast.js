/* "Try a forecast" page: one-year digital-twin monitoring data, blended weekly forecast. */
(() => {
  const $ = id => document.getElementById(id);
  const S = { data: null, wells: new Map(), h: 8, past: false, cur: null };
  const WEEK = 7 * 864e5;
  const f1 = v => Kit.fmt(v, 1), f2 = v => Kit.fmt(v, 2);
  const date = ms => Kit.dateFmt.format(new Date(ms));
  const C = { obs: "var(--s-observed)", fc: "var(--s-blue)", past: "var(--s-orange)" };

  function monthTicks(min, max, width) {
    const out = [];
    const d = new Date(min);
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    const step = width < 560 ? 3 : width < 820 ? 2 : 1;
    for (let k = 0; d.getTime() <= max; k++) { if (k % step === 0) out.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }
    return out;
  }
  const monthLabel = ms => { const d = new Date(ms); return d.getUTCMonth() === 0 ? Kit.monthYearFmt.format(d) : Kit.monthFmt.format(d); };

  function pickExamples(ws) {
    const good = ws.filter(w => w.forecast && w.weeks_with_data >= 40 && w.trend_m_per_week !== null);
    const by = (f, dir = 1) => [...good].sort((a, b) => dir * (f(b) - f(a)))[0];
    const trends = good.map(w => w.trend_m_per_week).sort((a, b) => a - b);
    const med = trends[Math.floor(trends.length / 2)];
    return [
      ["A typical well", by(w => -Math.abs(w.trend_m_per_week - med))],
      ["Falling fastest", by(w => w.trend_m_per_week)],
      ["Most stable", by(w => -Math.abs(w.trend_m_per_week))],
      ["Most sensitive to pumping", by(w => w.pump_sensitivity_m_per_1000m3)],
      ["Deepest water", by(w => w.latest)],
    ];
  }

  function render() {
    const w = S.cur, d = S.data, h = S.h;
    if (!w) return;
    const weeks = d.meta.weeks.map(Kit.day);
    const fromMs = Kit.day(d.meta.forecast_from);
    const f = w.forecast ? w.forecast[`${h}w`] : null;
    const latestMs = w.latest_week ? Kit.day(w.latest_week) : null;
    const targetMs = fromMs + h * WEEK;
    $("tFcLabel").textContent = `In ${h} weeks`;
    if (f) {
      const change = f.level - w.latest;
      const dir = Math.abs(change) < 0.1 ? "about the same as now" : `${f1(Math.abs(change))} m ${change > 0 ? "deeper" : "shallower"} than now`;
      $("answer").innerHTML = "";
      const a = $("answer");
      a.append(`${w.id}'s water is now ${f1(w.latest)} m below ground (week of ${date(latestMs)}). In ${h} weeks, around ${date(targetMs)}, we expect about `);
      const s = document.createElement("strong"); s.textContent = `${f1(f.level)} m`; a.append(s);
      a.append(`, most likely between ${f1(f.lo)} and ${f1(f.hi)} m. That is ${dir}.`);
      $("tNow").textContent = `${f1(w.latest)} m`; $("tNowSub").textContent = `below ground · week of ${date(latestMs)}`;
      $("tFc").textContent = `${f1(f.level)} m`; $("tFcSub").textContent = `around ${date(targetMs)}`;
      $("tRange").textContent = `${f1(f.lo)}–${f1(f.hi)} m`;
      $("tChange").textContent = Math.abs(change) < 0.1 ? "No change" : `${f1(Math.abs(change))} m ${change > 0 ? "deeper" : "shallower"}`;
      $("tChangeSub").textContent = change > 0.1 ? "the water is expected to sink" : change < -0.1 ? "the water is expected to rise" : "about the same as now";
    } else {
      $("answer").textContent = `${w.id} has no resting-level reading in the last three weeks, so we do not forecast it. Its past readings are shown below.`;
      ["tNow", "tFc", "tRange", "tChange"].forEach(k => $(k).textContent = "—");
      $("tNowSub").textContent = "no recent reading"; $("tFcSub").textContent = "not forecast"; $("tChangeSub").textContent = "—";
    }
    // facts
    const tr = w.trend_m_per_week;
    $("fSens").textContent = w.pump_sensitivity_m_per_1000m3 != null ? `${f2(w.pump_sensitivity_m_per_1000m3 / 10)} m` : "—";
    $("fTrend").textContent = tr == null ? "—" : Math.abs(tr) < 0.02 ? "Flat" : `${f2(Math.abs(tr))} m/wk ${tr > 0 ? "deeper" : "shallower"}`;
    $("fPump").textContent = w.mean_weekly_pumping_m3 != null ? Math.round(w.mean_weekly_pumping_m3).toLocaleString("en-IN") : "—";
    $("fWeeks").textContent = String(w.weeks_with_data);

    // level chart
    const obs = weeks.map((x, k) => ({ x, y: w.levels[k] }));
    const series = [{ name: "Weekly resting level", color: C.obs, points: obs, markers: true, r: 2.6, width: 1.6 }];
    if (f && latestMs !== null) {
      const pts = [{ x: latestMs, y: w.latest }], band = [{ x: latestMs, lo: w.latest, hi: w.latest }];
      for (const hh of [4, 8, 12]) {
        const g = w.forecast[`${hh}w`]; const x = fromMs + hh * WEEK;
        pts.push({ x, y: g.level }); band.push({ x, lo: g.lo, hi: g.hi });
      }
      series.push({ name: "Forecast", color: C.fc, points: pts, band, bandName: "80% likely range", width: 2.4 });
      series.push({ name: `In ${h} weeks`, color: C.fc, points: [{ x: targetMs, y: f.level }], markers: true, r: 6, line: false, endLabel: `${f1(f.level)} m`, labelDx: 0, labelDy: -12, labelAnchor: "middle", tip: false });
    }
    let pastPts = [];
    if (S.past && w.past && w.past[String(h)]) {
      pastPts = w.past[String(h)].map(([o, p]) => ({ x: weeks[o - 1 + h], y: p })).filter(p => p.x !== undefined);
      series.push({ name: `Forecast made ${h} weeks earlier`, color: C.past, points: pastPts, markers: true, r: 4.5, line: false });
    }
    const xmin = weeks[0] - 3 * 864e5, xmax = fromMs + 12 * WEEK + 5 * 864e5;
    const box = $("levelChart");
    Kit.line(box, {
      label: `Weekly resting water level for ${w.id} with forecast`,
      x: { min: xmin, max: xmax, ticks: monthTicks(xmin, xmax, box.clientWidth), format: monthLabel },
      y: { invert: true, format: (v, tip) => tip ? `${f2(v)} m` : `${Math.round(v)} m`, unit: " m" },
      series, vlines: [{ x: fromMs, label: "Forecast starts" }], tipTitle: x => `Week of ${date(x)}`, rightPad: 64,
    });
    // legend
    const L = $("legend"); L.replaceChildren();
    const add = (cls, color, text) => { const s = document.createElement("span"); const i = document.createElement("i"); if (cls) i.className = cls; if (color) i.style.setProperty("--c", color); s.append(i, text); L.append(s); };
    add("dot", C.obs, "Weekly resting level (measured)");
    if (f) { add("", C.fc, "Forecast"); add("band", null, "80% likely range"); }
    if (S.past) add("dot", C.past, `What we forecast ${h} weeks earlier`);
    $("chartTake").textContent = S.past
      ? `Orange dots show what the model predicted ${h} weeks before each date, using only data it had then. Where they sit close to the grey line, the forecast was good.`
      : "Each grey dot is one week's resting level. Blue is where we expect it to go. Lower on the chart means deeper water.";
    // table
    const rows = obs.filter(p => p.y !== null).map(p => [date(p.x), `${f2(p.y)} m`, ""]);
    if (f) for (const hh of [4, 8, 12]) { const g = w.forecast[`${hh}w`]; rows.push({ cells: [date(fromMs + hh * WEEK), `${f2(g.level)} m`, `${f2(g.lo)}–${f2(g.hi)} m (forecast)`], highlight: hh === h }); }
    Kit.table($("levelTable"), ["Week of", "Resting level", "Note"], rows);
    // pumping chart
    const pb = $("pumpChart");
    Kit.columns(pb, {
      label: `Weekly pumping for ${w.id}`, height: 150, color: "var(--s-blue)", seriesName: "pumped",
      items: weeks.map((x, k) => ({ x: x + 3.5 * 864e5, value: w.pump_m3[k] })),
      x: { min: xmin, max: xmax, ticks: monthTicks(xmin, xmax, pb.clientWidth), format: monthLabel },
      tipTitle: x => `Week of ${date(x - 3.5 * 864e5)}`, valueFormat: v => `${Math.round(v).toLocaleString("en-IN")} m³`, rightPad: 64,
    });
    const url = new URL(location.href); url.searchParams.set("well", w.id); url.searchParams.set("weeks", h); history.replaceState(null, "", url);
  }

  function choose(id) {
    const w = S.wells.get(String(id || "").trim().toUpperCase());
    if (!w) { $("formError").textContent = "We don't have that well. Pick an ID from the list (BW001–BW579) or tap an example."; return; }
    $("formError").textContent = "";
    S.cur = w; $("wellInput").value = w.id; render();
  }

  async function init() {
    try {
      const r = await fetch("../data/monitoring.json");
      if (!r.ok) throw new Error();
      S.data = await r.json();
    } catch { $("answer").textContent = "The well data could not be loaded. Please refresh the page."; return; }
    S.data.wells.forEach(w => S.wells.set(w.id, w));
    const dl = $("wellList");
    S.data.wells.forEach(w => { const o = document.createElement("option"); o.value = w.id; o.label = w.forecast ? `now ${Kit.fmt(w.latest, 1)} m below ground` : "no recent reading"; dl.appendChild(o); });
    const ex = pickExamples(S.data.wells);
    const box = $("examples");
    for (const [label, w] of ex) {
      if (!w) continue;
      const b = document.createElement("button"); b.type = "button"; b.className = "chip-btn"; b.textContent = `${label} (${w.id})`;
      b.addEventListener("click", () => choose(w.id)); box.appendChild(b);
    }
    const q = new URLSearchParams(location.search);
    const hq = Number(q.get("weeks")); if ([4, 8, 12].includes(hq)) S.h = hq;
    document.querySelectorAll("#horizonSeg button").forEach(b => {
      b.setAttribute("aria-pressed", String(Number(b.dataset.h) === S.h));
      b.addEventListener("click", () => {
        S.h = Number(b.dataset.h);
        document.querySelectorAll("#horizonSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        render();
      });
    });
    $("pastToggle").addEventListener("change", e => { S.past = e.target.checked; render(); });
    $("wellInput").addEventListener("change", e => choose(e.target.value));
    $("wellInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); choose(e.target.value); } });
    choose(q.get("well") && S.wells.has(q.get("well").toUpperCase()) ? q.get("well") : ex[0][1].id);
    Kit.onResize(render);
  }
  init();
})();
