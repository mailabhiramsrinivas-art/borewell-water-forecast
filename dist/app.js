const NS = "http://www.w3.org/2000/svg";
const state = { data: null, wells: new Map(), lastResult: null };

const $ = (id) => document.getElementById(id);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const titleCase = (value) => value.replaceAll("_", " ").replace(/\b\w/g, m => m.toUpperCase()).replace("Poc", "POC");

function horizonInDays(value, unit) {
  const factors = { days: 1, weeks: 7, months: 30.4375, years: 365.25 };
  return value * factors[unit];
}

function horizonLabel(value, unit) {
  const singular = value === 1 ? unit.slice(0, -1) : unit;
  return `${value} ${singular}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function scenarioTrend(well, pumping, rain) {
  const base = Number(well.shrunk_forecast_trend_m_per_day) || 0;
  const cyclesPerDay = clamp((Number(well.usable_cycle_transitions) || 0) / Math.max(Number(well.active_days_usable) || 1, 1), 0, 4);
  const pumpSignal = Math.abs(Math.max(Number(well.median_pumping_change_m) || 0, 0));
  const recoverySignal = Math.abs(Math.min(Number(well.median_off_period_change_m) || 0, 0));
  const pumpSensitivity = clamp(pumpSignal * Math.max(cyclesPerDay, .5) * .02, .02, .5);
  const rechargeSensitivity = clamp(recoverySignal * Math.max(cyclesPerDay, .5) * .02, .02, .5);
  const pumpFactor = { low: -1, typical: 0, high: 1 }[pumping];
  const rainFactor = { dry: 1, typical: 0, wet: -1 }[rain];
  return {
    base,
    effective: base + pumpFactor * pumpSensitivity + rainFactor * rechargeSensitivity,
    pumpSensitivity,
    rechargeSensitivity
  };
}

function projectionChange(trend, days) {
  const decayDays = 30;
  return trend * decayDays * Math.log1p(days / decayDays);
}

function projectionSigma(well, days, trendShift) {
  const evidence = well.evidence_tier;
  const initialMae = evidence === "higher" ? 11.5 : evidence === "medium" ? 18 : 28;
  const sigma = initialMae * 1.253;
  const historyGrowth = Math.sqrt(1 + days / 15);
  const scenarioPenalty = Math.abs(trendShift) * 4 * Math.sqrt(days / 15);
  return sigma * historyGrowth + scenarioPenalty;
}

function createForecast(well, inputs) {
  const days = horizonInDays(inputs.value, inputs.unit);
  const trend = scenarioTrend(well, inputs.pumping, inputs.rain);
  const latest = Number(well.latest_start_level_m_bgs);
  const finalMean = clamp(latest + projectionChange(trend.effective, days), 0, 500);
  const z = inputs.confidence === 95 ? 1.96 : 1.282;
  const points = Math.min(140, Math.max(24, Math.ceil(days) + 1));
  const forecast = [];
  for (let i = 0; i < points; i++) {
    const t = days * i / (points - 1);
    const mean = clamp(latest + projectionChange(trend.effective, t), 0, 500);
    const width = z * projectionSigma(well, t, trend.effective - trend.base);
    forecast.push({ day: t, mean, low: clamp(mean - width, 0, 500), high: clamp(mean + width, 0, 500) });
  }
  return { days, trend, latest, finalMean, forecast, final: forecast.at(-1), confidence: inputs.confidence };
}

function svgEl(name, attrs = {}, text = "") {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function pathFrom(points, x, y) {
  return points.map((point, index) => `${index ? "L" : "M"}${x(point).toFixed(1)},${y(point).toFixed(1)}`).join(" ");
}

function renderChart(well, result) {
  const svg = $("forecastChart");
  svg.replaceChildren(svgEl("title", { id: "chartTitle" }, `Water-level forecast for ${well.well_id}`), svgEl("desc", { id: "chartDesc" }, "Observed daily median levels followed by an uncertainty band and projected level."));
  const W = 980, H = 410, margin = { left: 70, right: 28, top: 25, bottom: 50 };
  const innerW = W - margin.left - margin.right, innerH = H - margin.top - margin.bottom;
  const history = (well.history || []).map((p, index, array) => ({ day: index - (array.length - 1), level: Number(p.level), date: p.date }));
  const allValues = history.map(p => p.level).concat(result.forecast.flatMap(p => [p.low, p.high]));
  let minY = Math.max(0, Math.min(...allValues) - 6);
  let maxY = Math.min(500, Math.max(...allValues) + 6);
  if (maxY - minY < 20) { minY = Math.max(0, minY - 10); maxY = Math.min(500, maxY + 10); }
  const minX = history.length ? history[0].day : -1;
  const maxX = Math.max(result.days, 1);
  const x = p => margin.left + ((p.day - minX) / (maxX - minX)) * innerW;
  const yValue = value => margin.top + ((value - minY) / (maxY - minY)) * innerH;
  const y = p => yValue(p.level ?? p.mean);

  for (let i = 0; i <= 4; i++) {
    const value = minY + (maxY - minY) * i / 4;
    const yy = yValue(value);
    svg.append(svgEl("line", { x1: margin.left, y1: yy, x2: W - margin.right, y2: yy, class: "grid-line" }));
    svg.append(svgEl("text", { x: margin.left - 12, y: yy + 4, "text-anchor": "end", class: "axis-label" }, `${value.toFixed(0)} m`));
  }

  const xTicks = [minX, 0, maxX / 2, maxX];
  [...new Set(xTicks.map(v => Number(v.toFixed(2))))].forEach(value => {
    const xx = x({ day: value });
    const label = value < 0 ? `${Math.abs(Math.round(value))}d ago` : value === 0 ? "Latest" : formatHorizonTick(value);
    svg.append(svgEl("text", { x: xx, y: H - 17, "text-anchor": value === minX ? "start" : value === maxX ? "end" : "middle", class: "axis-label" }, label));
  });

  const upper = result.forecast.map(p => ({ day: p.day, level: p.low }));
  const lower = [...result.forecast].reverse().map(p => ({ day: p.day, level: p.high }));
  svg.append(svgEl("path", { d: `${pathFrom(upper, x, y)} ${pathFrom(lower, x, y).replace(/^M/, "L")} Z`, class: "uncertainty-area" }));
  if (history.length > 1) svg.append(svgEl("path", { d: pathFrom(history, x, y), class: "history-line" }));
  svg.append(svgEl("line", { x1: x({day:0}), y1: margin.top, x2: x({day:0}), y2: H - margin.bottom, class: "split-line" }));
  svg.append(svgEl("text", { x: x({day:0}) + 8, y: margin.top + 12, class: "split-label" }, "Forecast starts"));
  svg.append(svgEl("path", { d: pathFrom(result.forecast, x, p => yValue(p.mean)), class: "forecast-line" }));
  const last = result.forecast.at(-1);
  svg.append(svgEl("circle", { cx: x(last), cy: yValue(last.mean), r: 7, class: "forecast-dot" }));
}

function formatHorizonTick(days) {
  if (days < 14) return `${Math.round(days)}d`;
  if (days < 120) return `${Math.round(days / 7)}w`;
  if (days < 730) return `${(days / 30.4375).toFixed(days < 365 ? 0 : 1)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
}

function interpretation(well, result, inputs) {
  const change = result.finalMean - result.latest;
  const absChange = Math.abs(change);
  const direction = absChange < .5 ? "remain near its current depth" : change > 0 ? "become deeper" : "become shallower";
  const scenario = inputs.pumping === "typical" && inputs.rain === "typical" ? "if the recent operating pattern continues" : "under the selected pumping and recharge assumptions";
  const long = result.days > 15;
  return {
    headline: `${well.well_id} is projected to ${direction}.`,
    text: `The model projects approximately ${fmt(result.finalMean)} m below ground after ${horizonLabel(inputs.value, inputs.unit)}, ${scenario}. The ${result.confidence}% range is ${fmt(result.final.low)}–${fmt(result.final.high)} m. ${long ? "This horizon extends beyond the observed history, so the range is driven mainly by extrapolation uncertainty." : "This horizon remains close to the available observation window."}`
  };
}

function renderResult(well, result, inputs) {
  const latestDate = well.history?.at(-1)?.date || "2026-07-29";
  const targetDate = addDays(latestDate, result.days);
  const halfWidth = (result.final.high - result.final.low) / 2;
  const change = result.finalMean - result.latest;
  const direction = Math.abs(change) < .5 ? "Little change" : change > 0 ? "Deeper" : "Shallower";
  const interpretationText = interpretation(well, result, inputs);

  $("resultEyebrow").textContent = `${well.well_id} · ${horizonLabel(inputs.value, inputs.unit)} projection`;
  $("forecastLevel").textContent = `${fmt(result.finalMean)} m bgs`;
  $("forecastDate").textContent = `Around ${formatDate(targetDate)}`;
  $("currentLevel").textContent = `${fmt(result.latest)} m bgs`;
  $("currentDate").textContent = `Latest usable reading · ${formatDate(new Date(`${latestDate}T00:00:00Z`))}`;
  $("forecastError").textContent = `±${fmt(halfWidth)} m`;
  $("confidenceLabel").textContent = `${result.confidence}% projection range`;
  $("directionValue").textContent = direction;
  $("changeValue").textContent = `${change >= 0 ? "+" : ""}${fmt(change)} m from current`;
  $("plainHeadline").textContent = interpretationText.headline;
  $("plainText").textContent = interpretationText.text;
  $("stabilityValue").textContent = titleCase(well.short_term_category);
  $("sessionsValue").textContent = `${well.sessions_screened_usable} of ${well.sessions_total}`;
  $("horizonStatus").textContent = result.days <= 15 ? "Within observed span" : "Extrapolation";

  const badge = $("evidenceBadge");
  badge.textContent = `${titleCase(well.evidence_tier)} evidence`;
  badge.className = `evidence-badge ${well.evidence_tier}`;
  $("warningText").textContent = result.days <= 15
    ? "The horizon is close to the 15-day observation window. The uncertainty still includes measurement noise and well-to-well variation."
    : `Only 15 days were observed. This projection covers ${horizonLabel(inputs.value, inputs.unit)} as an exploratory scenario; no seasonal rainfall pattern is present in the data.`;
  renderChart(well, result);
}

function readInputs() {
  return {
    wellId: $("wellInput").value.trim().toUpperCase(),
    value: Number($("horizonValue").value),
    unit: $("horizonUnit").value,
    pumping: $("pumpingScenario").value,
    rain: $("rainScenario").value,
    confidence: Number($("confidence").value)
  };
}

function runForecast(event) {
  event?.preventDefault();
  const inputs = readInputs();
  const well = state.wells.get(inputs.wellId);
  const days = horizonInDays(inputs.value, inputs.unit);
  if (!well) return showError("Choose a well ID from the list.");
  if (!Number.isFinite(days) || days <= 0) return showError("Enter a forecast length greater than zero.");
  if (days > 36525) return showError("Use a horizon of 100 years or less for this proof of concept.");
  if (!Number.isFinite(Number(well.latest_start_level_m_bgs))) return showError("This well has no usable starting level for a forecast.");
  showError("");
  const result = createForecast(well, inputs);
  state.lastResult = { well, result, inputs };
  renderResult(well, result, inputs);
}

function showError(message) { $("formError").textContent = message; }

function registerForecastTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const allowedUnits = ["days", "weeks", "months", "years"];
  const allowedPumping = ["low", "typical", "high"];
  const allowedRain = ["dry", "typical", "wet"];
  void Promise.resolve(context.registerTool({
    name: "configure_water_level_forecast",
    title: "Configure water-level forecast",
    description: "Select a monitored borewell and generate the same forecast shown in the visible interface.",
    inputSchema: {
      type: "object",
      properties: {
        well_id: { type: "string", description: "A monitored ID such as BW046." },
        horizon: { type: "number", exclusiveMinimum: 0 },
        horizon_unit: { type: "string", enum: allowedUnits },
        pumping: { type: "string", enum: allowedPumping },
        recharge: { type: "string", enum: allowedRain },
        confidence: { type: "number", enum: [80, 95] }
      },
      required: ["well_id", "horizon", "horizon_unit", "pumping", "recharge", "confidence"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const wellId = String(input.well_id || "").trim().toUpperCase();
      if (!state.wells.has(wellId)) throw new Error("Unknown borewell ID");
      if (!Number.isFinite(input.horizon) || input.horizon <= 0) throw new Error("Horizon must be greater than zero");
      if (!allowedUnits.includes(input.horizon_unit) || !allowedPumping.includes(input.pumping) || !allowedRain.includes(input.recharge) || ![80,95].includes(input.confidence)) throw new Error("Invalid forecast setting");
      $("wellInput").value = wellId;
      $("horizonValue").value = input.horizon;
      $("horizonUnit").value = input.horizon_unit;
      $("pumpingScenario").value = input.pumping;
      $("rainScenario").value = input.recharge;
      $("confidence").value = String(input.confidence);
      runForecast();
      if (!state.lastResult) throw new Error("Forecast could not be generated");
      const { result } = state.lastResult;
      return {
        well_id: wellId,
        projected_level_m_bgs: Number(result.finalMean.toFixed(2)),
        range_low_m_bgs: Number(result.final.low.toFixed(2)),
        range_high_m_bgs: Number(result.final.high.toFixed(2)),
        confidence: result.confidence,
        horizon_days: Number(result.days.toFixed(2))
      };
    }
  })).catch(error => console.warn("Forecast tool registration failed", error));
}

async function init() {
  try {
    const response = await fetch("./data/wells.json");
    if (!response.ok) throw new Error("Data could not be loaded");
    state.data = await response.json();
    state.data.wells.forEach(well => state.wells.set(well.well_id, well));
    const options = $("wellOptions");
    state.data.wells.forEach(well => options.append(new Option(`${well.well_id} · ${titleCase(well.evidence_tier)} evidence`, well.well_id)));
    if (!state.wells.has($("wellInput").value)) {
      const preferred = state.data.wells.find(w => w.evidence_tier === "higher") || state.data.wells[0];
      $("wellInput").value = preferred.well_id;
    }
    runForecast();
    registerForecastTool();
  } catch (error) {
    showError("The forecast data could not be loaded. Refresh the page and try again.");
    console.error(error);
  }
}

$("forecastForm").addEventListener("submit", runForecast);
init();
