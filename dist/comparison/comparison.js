const NS = "http://www.w3.org/2000/svg";
const state = { wells: new Map(), rainfall: null, rainByMonth: new Map(), lastResult: null };
const $ = id => document.getElementById(id);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "—";

function horizonInDays(value, unit) {
  return value * { days: 1, weeks: 7, months: 30.4375, years: 365.25 }[unit];
}

function horizonLabel(value, unit) {
  return `${value} ${value === 1 ? unit.slice(0, -1) : unit}`;
}

function parseDate(value) { return new Date(`${value}T00:00:00Z`); }
function addDays(date, days) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
function daysInMonth(date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); }

function forecastSignals(well, pumping) {
  const base = Number(well.shrunk_forecast_trend_m_per_day) || 0;
  const cyclesPerDay = clamp((Number(well.usable_cycle_transitions) || 0) / Math.max(Number(well.active_days_usable) || 1, 1), 0, 4);
  const pumpSignal = Math.abs(Math.max(Number(well.median_pumping_change_m) || 0, 0));
  const recoverySignal = Math.abs(Math.min(Number(well.median_off_period_change_m) || 0, 0));
  const pumpSensitivity = clamp(pumpSignal * Math.max(cyclesPerDay, .5) * .02, .02, .5);
  const rechargeSensitivity = clamp(recoverySignal * Math.max(cyclesPerDay, .5) * .02, .02, .5);
  const pumpFactor = { low: -1, typical: 0, high: 1 }[pumping];
  return { base, pumpShift: pumpFactor * pumpSensitivity, rechargeSensitivity };
}

function projectionChange(trend, days) {
  return trend * 30 * Math.log1p(days / 30);
}

function projectionSigma(well, days, shift = 0) {
  const initialMae = well.evidence_tier === "higher" ? 11.5 : well.evidence_tier === "medium" ? 18 : 28;
  return initialMae * 1.253 * Math.sqrt(1 + days / 15) + Math.abs(shift) * 4 * Math.sqrt(days / 15);
}

function pointCount(days) { return Math.min(140, Math.max(28, Math.ceil(days) + 1)); }

function currentForecast(well, inputs) {
  const days = horizonInDays(inputs.value, inputs.unit);
  const signals = forecastSignals(well, inputs.pumping);
  const trend = signals.base + signals.pumpShift;
  const latest = Number(well.latest_start_level_m_bgs);
  const z = inputs.confidence === 95 ? 1.96 : 1.282;
  const forecast = [];
  const count = pointCount(days);
  for (let i = 0; i < count; i++) {
    const day = days * i / (count - 1);
    const mean = clamp(latest + projectionChange(trend, day), 0, 500);
    const width = z * projectionSigma(well, day, signals.pumpShift);
    forecast.push({ day, mean, low: clamp(mean - width, 0, 500), high: clamp(mean + width, 0, 500) });
  }
  return { days, latest, forecast, final: forecast.at(-1), signals };
}

function typicalAnnualDailyRain() {
  const total = state.rainfall.monthly_climatology.reduce((sum, month) => sum + month.median_monthly_mm, 0);
  return total / 365.25;
}

function scenarioRainForDate(date, scenario) {
  const month = state.rainByMonth.get(date.getUTCMonth() + 1);
  const monthly = scenario === "dry" ? month.dry_q25_monthly_mm : scenario === "wet" ? month.wet_q75_monthly_mm : month.median_monthly_mm;
  return monthly / daysInMonth(date);
}

function rainfallForecast(well, inputs, validationRatio) {
  const days = horizonInDays(inputs.value, inputs.unit);
  const signals = forecastSignals(well, inputs.pumping);
  const latest = Number(well.latest_start_level_m_bgs);
  const latestDate = parseDate(well.history?.at(-1)?.date || "2026-07-29");
  const annualRain = typicalAnnualDailyRain();
  const rainScale = Math.max(annualRain * 1.6, 2.25);
  const cumulative = [0];
  const rains = [scenarioRainForDate(latestDate, inputs.rainfall)];
  const totalDays = Math.ceil(days);
  for (let day = 1; day <= totalDays; day++) {
    const date = addDays(latestDate, day);
    const rain = scenarioRainForDate(date, inputs.rainfall);
    const rainSignal = clamp((rain - annualRain) / rainScale, -.9, 1.25);
    const effectiveTrend = signals.base + signals.pumpShift - rainSignal * signals.rechargeSensitivity;
    cumulative.push(cumulative.at(-1) + effectiveTrend / (1 + day / 30));
    rains.push(rain);
  }
  const changeAt = day => {
    const low = Math.floor(day), high = Math.min(Math.ceil(day), totalDays);
    if (low === high) return cumulative[low];
    return cumulative[low] + (cumulative[high] - cumulative[low]) * (day - low);
  };
  const rainAt = day => rains[Math.min(Math.round(day), totalDays)];
  const z = inputs.confidence === 95 ? 1.96 : 1.282;
  const scenarioPenalty = inputs.rainfall === "typical" ? 1 : 1.06;
  const count = pointCount(days);
  const forecast = [];
  for (let i = 0; i < count; i++) {
    const day = days * i / (count - 1);
    const mean = clamp(latest + changeAt(day), 0, 500);
    const width = z * projectionSigma(well, day, signals.pumpShift) * validationRatio * scenarioPenalty;
    forecast.push({ day, mean, low: clamp(mean - width, 0, 500), high: clamp(mean + width, 0, 500), rain: rainAt(day) });
  }
  return { days, latest, forecast, final: forecast.at(-1), signals };
}

function svgEl(name, attrs = {}, text = "") {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function pathFrom(points, x, y, valueKey = "mean") {
  return points.map((point, index) => `${index ? "L" : "M"}${x(point.day).toFixed(1)},${y(point[valueKey]).toFixed(1)}`).join(" ");
}

function horizonTick(days) {
  if (days < 14) return `${Math.round(days)}d`;
  if (days < 120) return `${Math.round(days / 7)}w`;
  if (days < 730) return `${(days / 30.4375).toFixed(days < 365 ? 0 : 1)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
}

function renderForecastChart(svg, well, result, extent, rainfall = false) {
  const titleId = rainfall ? "rainChartTitle" : "currentChartTitle";
  const descId = rainfall ? "rainChartDesc" : "currentChartDesc";
  const description = rainfall ? "Observed water levels followed by a seasonal public-rainfall scenario and uncertainty range." : "Observed water levels followed by the current-data forecast and uncertainty range.";
  svg.replaceChildren(svgEl("title", { id: titleId }, `${rainfall ? "Rainfall scenario" : "Current model"} for ${well.well_id}`), svgEl("desc", { id: descId }, description));
  const W = 760, H = 350, margin = { left: 61, right: 22, top: 25, bottom: 46 };
  const innerW = W - margin.left - margin.right, innerH = H - margin.top - margin.bottom;
  const history = (well.history || []).map((point, index, array) => ({ day: index - (array.length - 1), level: Number(point.level) }));
  const minX = history.length ? history[0].day : -1;
  const maxX = Math.max(result.days, 1);
  const x = day => margin.left + ((day - minX) / (maxX - minX)) * innerW;
  const y = value => margin.top + ((value - extent.min) / (extent.max - extent.min)) * innerH;

  for (let i = 0; i <= 4; i++) {
    const value = extent.min + (extent.max - extent.min) * i / 4;
    const yy = y(value);
    svg.append(svgEl("line", { x1: margin.left, y1: yy, x2: W - margin.right, y2: yy, class: "grid-line" }));
    svg.append(svgEl("text", { x: margin.left - 9, y: yy + 4, "text-anchor": "end", class: "axis-label" }, `${value.toFixed(0)}m`));
  }

  if (rainfall) {
    const maxRain = Math.max(...result.forecast.map(point => point.rain || 0), 1);
    result.forecast.forEach((point, index) => {
      if (index % Math.max(1, Math.floor(result.forecast.length / 45)) !== 0) return;
      const height = 34 * (point.rain || 0) / maxRain;
      svg.append(svgEl("rect", { x: x(point.day) - 2, y: margin.top, width: 4, height, class: "rain-ribbon" }));
    });
  }

  [minX, 0, maxX / 2, maxX].forEach((value, index, array) => {
    if (index && Math.abs(value - array[index - 1]) < .01) return;
    const label = value < 0 ? `${Math.abs(Math.round(value))}d ago` : value === 0 ? "Latest" : horizonTick(value);
    svg.append(svgEl("text", { x: x(value), y: H - 15, "text-anchor": value === minX ? "start" : value === maxX ? "end" : "middle", class: "axis-label" }, label));
  });

  const upper = result.forecast.map(point => ({ ...point, band: point.low }));
  const lower = [...result.forecast].reverse().map(point => ({ ...point, band: point.high }));
  svg.append(svgEl("path", { d: `${pathFrom(upper, x, y, "band")} ${pathFrom(lower, x, y, "band").replace(/^M/, "L")} Z`, class: "uncertainty-area" }));
  if (history.length > 1) svg.append(svgEl("path", { d: pathFrom(history.map(p => ({ day: p.day, mean: p.level })), x, y), class: "history-line" }));
  svg.append(svgEl("line", { x1: x(0), y1: margin.top, x2: x(0), y2: H - margin.bottom, class: "split-line" }));
  svg.append(svgEl("path", { d: pathFrom(result.forecast, x, y), class: "forecast-line" }));
  svg.append(svgEl("circle", { cx: x(result.final.day), cy: y(result.final.mean), r: 6, class: "forecast-dot" }));
}

function sharedExtent(well, current, rainfall) {
  const values = (well.history || []).map(point => Number(point.level));
  values.push(...current.forecast.flatMap(point => [point.low, point.high]), ...rainfall.forecast.flatMap(point => [point.low, point.high]));
  let min = Math.max(0, Math.min(...values) - 5), max = Math.min(500, Math.max(...values) + 5);
  if (max - min < 20) { min = Math.max(0, min - 10); max = Math.min(500, max + 10); }
  return { min, max };
}

function readInputs() {
  return {
    wellId: $("wellInput").value.trim().toUpperCase(),
    value: Number($("horizonValue").value),
    unit: $("horizonUnit").value,
    pumping: $("pumpingScenario").value,
    rainfall: $("rainfallScenario").value,
    confidence: Number($("confidence").value),
  };
}

function renderComparison(well, current, rainfall, inputs) {
  const extent = sharedExtent(well, current, rainfall);
  renderForecastChart($("currentChart"), well, current, extent, false);
  renderForecastChart($("rainChart"), well, rainfall, extent, true);
  const currentHalf = (current.final.high - current.final.low) / 2;
  const rainHalf = (rainfall.final.high - rainfall.final.low) / 2;
  $("currentProjection").textContent = `${fmt(current.final.mean)} m bgs`;
  $("rainProjection").textContent = `${fmt(rainfall.final.mean)} m bgs`;
  $("currentRange").textContent = `±${fmt(currentHalf)} m · ${inputs.confidence}% range`;
  $("rainRange").textContent = `±${fmt(rainHalf)} m · ${inputs.confidence}% range`;
  $("rainScenarioLabel").textContent = `${inputs.rainfall[0].toUpperCase()}${inputs.rainfall.slice(1)} rainfall`;

  const difference = rainfall.final.mean - current.final.mean;
  const direction = Math.abs(difference) < .5 ? "nearly the same" : difference > 0 ? `${fmt(Math.abs(difference))} m deeper` : `${fmt(Math.abs(difference))} m shallower`;
  $("plainTitle").textContent = `${well.well_id}: the rainfall scenario is ${direction}.`;
  $("plainText").textContent = `After ${horizonLabel(inputs.value, inputs.unit)}, the current-data model projects ${fmt(current.final.mean)} m below ground and the ${inputs.rainfall} seasonal rainfall scenario projects ${fmt(rainfall.final.mean)} m. The uncertainty remains almost unchanged because public rainfall improved the four-day holdout MAE by only ${fmt(state.rainfall.validation.combined_screened_mae_m.improvement_percent, 2)}%.`;
}

function runComparison(event) {
  event?.preventDefault();
  const inputs = readInputs();
  const well = state.wells.get(inputs.wellId);
  const days = horizonInDays(inputs.value, inputs.unit);
  if (!well) return showError("Choose a well ID from the list.");
  if (!Number.isFinite(days) || days <= 0) return showError("Enter a forecast length greater than zero.");
  if (days > 36525) return showError("Use a horizon of 100 years or less for this proof of concept.");
  if (!Number.isFinite(Number(well.latest_start_level_m_bgs))) return showError("This well has no usable starting level.");
  showError("");
  const validation = state.rainfall.validation.combined_screened_mae_m;
  const ratio = validation.rainfall_enhanced / validation.baseline;
  const current = currentForecast(well, inputs);
  const rainfall = rainfallForecast(well, inputs, ratio);
  state.lastResult = { well, inputs, current, rainfall };
  renderComparison(well, current, rainfall, inputs);
}

function showError(message) { $("formError").textContent = message; }

function renderValidation() {
  const data = state.rainfall;
  const combined = data.validation.combined_screened_mae_m;
  const pump = data.validation.pump_transition;
  const recovery = data.validation.recovery_transition;
  $("combinedBefore").textContent = `${fmt(combined.baseline, 3)} m MAE`;
  $("combinedAfter").textContent = `${fmt(combined.rainfall_enhanced, 3)} m MAE`;
  $("improvementValue").textContent = `${fmt(combined.improvement_percent, 2)}%`;
  $("pumpBefore").textContent = `${fmt(pump.baseline.mae_m, 3)} m`;
  $("pumpAfter").textContent = `${fmt(pump.rainfall_enhanced.mae_m, 3)} m`;
  $("pumpChange").textContent = `${fmt(pump.mae_improvement_percent, 2)}% improvement · ${pump.baseline.n.toLocaleString("en-IN")} records`;
  $("recoveryBefore").textContent = `${fmt(recovery.baseline.mae_m, 3)} m`;
  $("recoveryAfter").textContent = `${fmt(recovery.rainfall_enhanced.mae_m, 3)} m`;
  $("recoveryChange").textContent = `${fmt(recovery.mae_improvement_percent, 2)}% improvement · ${recovery.baseline.n.toLocaleString("en-IN")} records`;
  $("overlapRain").textContent = `${fmt(data.meta.rainfall_total_during_overlap_mm, 2)} mm`;
  $("sourceLink").href = data.meta.source_docs;
}

function renderBarChart(svg, data, valueKey, labelKey, unit) {
  svg.replaceChildren();
  const W = 700, H = 230, margin = { left: 38, right: 12, top: 16, bottom: 39 };
  const width = W - margin.left - margin.right, height = H - margin.top - margin.bottom;
  const max = Math.max(...data.map(item => Number(item[valueKey])), 1);
  svg.append(svgEl("line", { x1: margin.left, y1: margin.top + height, x2: W - margin.right, y2: margin.top + height, class: "rain-axis" }));
  const slot = width / data.length;
  data.forEach((item, index) => {
    const value = Number(item[valueKey]);
    const barHeight = value / max * (height - 10);
    const x = margin.left + index * slot + slot * .18;
    const y = margin.top + height - barHeight;
    svg.append(svgEl("rect", { x, y, width: slot * .64, height: barHeight, rx: 2, class: `rain-bar ${value > max * .72 ? "peak" : ""}` }));
    const every = data.length > 12 ? 3 : 1;
    if (index % every === 0 || index === data.length - 1) {
      svg.append(svgEl("text", { x: x + slot * .32, y: H - 15, "text-anchor": "middle", class: "rain-label" }, item[labelKey]));
    }
  });
  svg.append(svgEl("text", { x: margin.left, y: margin.top + 2, class: "rain-label" }, `${fmt(max, 0)} ${unit}`));
}

function renderRainfallCharts() {
  const daily = state.rainfall.daily_overlap.map(item => ({ ...item, label: item.date.slice(8) }));
  renderBarChart($("dailyRainChart"), daily, "rain_mm", "label", "mm/day");
  renderBarChart($("monthlyRainChart"), state.rainfall.monthly_climatology, "median_monthly_mm", "label", "mm/month");
}

function registerComparisonTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  void Promise.resolve(context.registerTool({
    name: "configure_rainfall_comparison",
    title: "Configure rainfall forecast comparison",
    description: "Compare the current borewell forecast with a public-rainfall seasonal scenario on this page.",
    inputSchema: {
      type: "object",
      properties: {
        well_id: { type: "string", description: "A monitored ID such as BW046." },
        horizon: { type: "number", exclusiveMinimum: 0 },
        horizon_unit: { type: "string", enum: ["days", "weeks", "months", "years"] },
        pumping: { type: "string", enum: ["low", "typical", "high"] },
        rainfall: { type: "string", enum: ["dry", "typical", "wet"] },
        confidence: { type: "number", enum: [80, 95] },
      },
      required: ["well_id", "horizon", "horizon_unit", "pumping", "rainfall", "confidence"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const wellId = String(input.well_id || "").trim().toUpperCase();
      if (!state.wells.has(wellId)) throw new Error("Unknown borewell ID");
      if (!Number.isFinite(input.horizon) || input.horizon <= 0) throw new Error("Horizon must be greater than zero");
      $("wellInput").value = wellId;
      $("horizonValue").value = input.horizon;
      $("horizonUnit").value = input.horizon_unit;
      $("pumpingScenario").value = input.pumping;
      $("rainfallScenario").value = input.rainfall;
      $("confidence").value = String(input.confidence);
      runComparison();
      return {
        well_id: wellId,
        current_projection_m_bgs: Number(state.lastResult.current.final.mean.toFixed(2)),
        rainfall_projection_m_bgs: Number(state.lastResult.rainfall.final.mean.toFixed(2)),
        measured_holdout_mae_improvement_percent: Number(state.rainfall.validation.combined_screened_mae_m.improvement_percent.toFixed(3)),
      };
    },
  })).catch(error => console.warn("Comparison tool registration failed", error));
}

async function init() {
  try {
    const [wellResponse, rainfallResponse] = await Promise.all([
      fetch("../data/wells.json"),
      fetch("./data/rainfall_comparison.json"),
    ]);
    if (!wellResponse.ok || !rainfallResponse.ok) throw new Error("Comparison data could not be loaded");
    const wellData = await wellResponse.json();
    state.rainfall = await rainfallResponse.json();
    state.wells = new Map(wellData.wells.map(well => [well.well_id, well]));
    state.rainByMonth = new Map(state.rainfall.monthly_climatology.map(month => [month.month, month]));
    const options = [...state.wells.keys()].map(id => `<option value="${id}"></option>`).join("");
    $("wellOptions").innerHTML = options;
    renderValidation();
    renderRainfallCharts();
    $("comparisonForm").addEventListener("submit", runComparison);
    registerComparisonTool();
    runComparison();
  } catch (error) {
    showError(error.message || "The comparison could not be initialized.");
  }
}

init();
