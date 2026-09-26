const NS = "http://www.w3.org/2000/svg";
const state = { data: null, wells: new Map(), lastResult: null };
const $ = id => document.getElementById(id);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const fmt = (value, digits = 1) => Number.isFinite(value) ? Number(value).toFixed(digits) : "—";

function parseDate(value) { return new Date(`${value}T00:00:00Z`); }
function addDays(date, days) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + Math.round(days)); return next; }
function formatDate(date) { return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
function horizonDays(value, unit) { return value * { days: 1, weeks: 7, months: 30.4375, years: 365.25 }[unit]; }
function horizonLabel(value, unit) { return `${value} ${value === 1 ? unit.slice(0, -1) : unit}`; }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }

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

function createForecast(well, inputs) {
  const requestedDays = horizonDays(inputs.value, inputs.unit);
  const points = BorewellCore.forecast(state.data, well, Math.ceil(requestedDays), inputs.pumping, inputs.rainfall, inputs.confidence);
  return { days: requestedDays, points, final: points[Math.min(points.length-1, Math.round(requestedDays))], inputs };
}

function sampleSeries(points, maximum = 180) {
  if (points.length <= maximum) return points;
  const sampled = [];
  for (let index = 0; index < maximum - 1; index += 1) {
    sampled.push(points[Math.round(index * (points.length - 1) / (maximum - 1))]);
  }
  sampled.push(points.at(-1));
  return sampled;
}

function svgEl(name, attrs = {}, text = "") {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function linePath(points, x, y, key) {
  return points.map((point, index) => `${index ? "L" : "M"}${x(point.day).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
}

function tickLabel(days) {
  if (days < 14) return `${Math.round(days)}d`;
  if (days < 120) return `${Math.round(days / 7)}w`;
  if (days < 730) return `${(days / 30.4375).toFixed(days < 365 ? 0 : 1)}mo`;
  return `${(days / 365.25).toFixed(1)}y`;
}

function renderChart(well, result) {
  const svg = $("forecastChart");
  svg.replaceChildren(
    svgEl("title", { id: "forecastChartTitle" }, `Water-level forecast for ${well.id}`),
    svgEl("desc", { id: "forecastChartDesc" }, "The final 90 observed days followed by the selected forecast and uncertainty range."),
  );
  const W = 1040, H = 440, margin = { left: 74, right: 26, top: 24, bottom: 52 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const recent = well.history.observed.slice(-90).map((level, index, array) => ({ day: index - array.length + 1, level }));
  const forecast = sampleSeries(result.points);
  const values = recent.map(point => point.level).concat(forecast.flatMap(point => [point.low, point.high]));
  let min = Math.max(0, Math.min(...values) - 2);
  let max = Math.min(well.construction_depth_m, Math.max(...values) + 2);
  if (max - min < 8) { min = Math.max(0, min - 4); max = Math.min(well.construction_depth_m, max + 4); }
  const minX = recent[0].day;
  const maxX = Math.max(result.days, 1);
  const x = day => margin.left + (day - minX) / (maxX - minX) * innerW;
  const y = value => margin.top + (value - min) / (max - min) * innerH;

  for (let index = 0; index <= 4; index += 1) {
    const value = min + (max - min) * index / 4;
    const yy = y(value);
    svg.append(svgEl("line", { x1: margin.left, y1: yy, x2: W - margin.right, y2: yy, class: "grid-line" }));
    svg.append(svgEl("text", { x: margin.left - 11, y: yy + 4, "text-anchor": "end", class: "axis-label" }, `${fmt(value, 0)} m`));
  }
  [minX, 0, maxX / 2, maxX].forEach((value, index, array) => {
    if (index && Math.abs(value - array[index - 1]) < .01) return;
    const label = value < 0 ? `${Math.abs(Math.round(value))}d ago` : value === 0 ? "Latest" : tickLabel(value);
    const anchor = value === minX ? "start" : value === maxX ? "end" : "middle";
    svg.append(svgEl("text", { x: x(value), y: H - 17, "text-anchor": anchor, class: "axis-label" }, label));
  });

  const upper = forecast.map(point => ({ ...point, band: point.low }));
  const lower = [...forecast].reverse().map(point => ({ ...point, band: point.high }));
  svg.append(svgEl("path", { d: `${linePath(upper, x, y, "band")} ${linePath(lower, x, y, "band").replace(/^M/, "L")} Z`, class: "uncertainty-area" }));
  svg.append(svgEl("path", { d: linePath(recent, x, y, "level"), class: "observed-line" }));
  svg.append(svgEl("line", { x1: x(0), y1: margin.top, x2: x(0), y2: H - margin.bottom, class: "split-line" }));
  svg.append(svgEl("text", { x: x(0) + 8, y: margin.top + 13, class: "split-label" }, "Forecast starts"));
  svg.append(svgEl("path", { d: linePath(forecast, x, y, "mean"), class: "forecast-line" }));
  svg.append(svgEl("circle", { cx: x(result.final.day), cy: y(result.final.mean), r: 7, class: "forecast-dot" }));
}

function scenarioDifference(well, inputs, type) {
  const baseline = { ...inputs, pumping: "typical", rainfall: "typical" };
  const selected = createForecast(well, inputs).final.mean;
  const counterfactual = type === "pump"
    ? createForecast(well, { ...baseline, rainfall: inputs.rainfall }).final.mean
    : createForecast(well, { ...baseline, pumping: inputs.pumping }).final.mean;
  return selected - counterfactual;
}

function effectText(value) {
  if (Math.abs(value) < .05) return "No material shift";
  return `${value > 0 ? "+" : "−"}${fmt(Math.abs(value), 2)} m ${value > 0 ? "deeper" : "shallower"}`;
}

function checkpointPoints(result) {
  const fractions = [0.25, 0.5, 0.75, 1];
  const seen = new Set();
  return fractions.map(fraction => {
    const day = Math.max(1, Math.round(result.days * fraction));
    if (seen.has(day)) return null;
    seen.add(day);
    return result.points[Math.min(day, result.points.length - 1)];
  }).filter(Boolean);
}

function renderResult(well, result, inputs) {
  const scenario = state.data.scenario_copy[well.scenario];
  const current = well.model.latest_observed_m_bgs;
  const change = result.final.mean - current;
  const halfWidth = (result.final.high - result.final.low) / 2;
  const targetDate = addDays(parseDate(state.data.meta.end_date), result.days);
  const direction = Math.abs(change) < .25 ? "Near current" : change > 0 ? "Deeper" : "Shallower";
  const longRange = result.days > state.data.meta.days;

  $("resultEyebrow").textContent = `${well.id} · ${scenario.label}`;
  $("scenarioChip").textContent = scenario.label;
  $("projectedLevel").textContent = `${fmt(result.final.mean)} m below ground`;
  $("projectedDate").textContent = formatDate(targetDate);
  $("currentLevel").textContent = `${fmt(current)} m below ground`;
  $("errorRange").textContent = `±${fmt(halfWidth)} m`;
  $("confidenceLabel").textContent = `Nominal ${inputs.confidence}% range`;
  $("directionValue").textContent = direction;
  $("changeValue").textContent = `${change >= 0 ? "+" : "−"}${fmt(Math.abs(change))} m from the latest reading`;
  $("plainTitle").textContent = `${well.id} is projected to be ${direction.toLowerCase()} after ${horizonLabel(inputs.value, inputs.unit)}.`;
  $("plainText").textContent = `The selected scenario ends at approximately ${fmt(result.final.mean)} m below ground, with a ${inputs.confidence}% range of ${fmt(result.final.low)}–${fmt(result.final.high)} m. ${scenario.behavior} ${longRange ? "Beyond 30 days this is a scenario extrapolation. Band width grows with the square root of horizon; coverage is not validated here." : "Only the first 30 days have a held-out test; later days and bands are extrapolated."}`;
  $("wellMae").textContent = `${fmt(well.validation.mae_m, 2)} m`;
  $("wellRmse").textContent = `${fmt(well.validation.rmse_m, 2)} m`;
  $("wellScenario").textContent = scenario.label;
  $("wellCluster").textContent = well.cluster;
  $("validationLink").href = `../validation/?well=${encodeURIComponent(well.id)}`;
  $("pumpEffect").textContent = effectText(scenarioDifference(well, inputs, "pump"));
  $("rainEffect").textContent = effectText(scenarioDifference(well, inputs, "rain"));
  $("fitSigma").textContent = `${fmt(well.model.residual_sigma, 2)} m/day`;
  $("rangeHeader").textContent = `${inputs.confidence}% range`;
  $("checkpointRows").innerHTML = checkpointPoints(result).map(point => {
    const date = addDays(parseDate(state.data.meta.end_date), point.day);
    return `<tr><td>${tickLabel(point.day)}</td><td>${formatDate(date)}</td><td>${fmt(point.mean)} m</td><td>${fmt(point.low)}–${fmt(point.high)} m</td></tr>`;
  }).join("");
  renderChart(well, result);
}

function runForecast(event) {
  event?.preventDefault();
  state.lastResult = null;
  const inputs = readInputs();
  const well = state.wells.get(inputs.wellId);
  const days = horizonDays(inputs.value, inputs.unit);
  if (!well) return showError("Choose a well ID from SYN001 to SYN450.");
  if (!Number.isFinite(days) || days <= 0) return showError("Enter a forecast length greater than zero.");
  if (days > 1827) return showError("Use a forecast horizon of five years or less for this proof of concept.");
  showError("");
  const result = createForecast(well, inputs);
  state.lastResult = { well, inputs, result };
  renderResult(well, result, inputs);
  const url = new URL(window.location.href);
  url.searchParams.set("well", well.id);
  history.replaceState(null, "", url);
}

function showError(message) { $("formError").textContent = message; }

function registerForecastTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  void Promise.resolve(context.registerTool({
    name: "configure_synthetic_borewell_forecast",
    title: "Configure the 450-well forecast",
    description: "Select a synthetic well, time horizon, pumping level, rainfall scenario, and uncertainty range.",
    inputSchema: {
      type: "object",
      properties: {
        well_id: { type: "string" },
        horizon: { type: "number", exclusiveMinimum: 0 },
        horizon_unit: { type: "string", enum: ["days", "weeks", "months", "years"] },
        pumping: { type: "string", enum: ["low", "typical", "high"] },
        rainfall: { type: "string", enum: ["dry", "typical", "wet"] },
        confidence: { type: "number", enum: [80, 95] },
      },
      required: ["well_id", "horizon", "horizon_unit", "pumping", "rainfall", "confidence"],
      additionalProperties: false,
    },
    execute(input) {
      $("wellInput").value = String(input.well_id || "").toUpperCase();
      $("horizonValue").value = input.horizon;
      $("horizonUnit").value = input.horizon_unit;
      $("pumpingScenario").value = input.pumping;
      $("rainfallScenario").value = input.rainfall;
      $("confidence").value = String(input.confidence);
      runForecast();
      if (!state.lastResult) throw new Error($("formError").textContent || "Forecast could not be generated");
      return {
        well_id: state.lastResult.well.id,
        projected_level_m_bgs: Number(state.lastResult.result.final.mean.toFixed(2)),
        lower_m_bgs: Number(state.lastResult.result.final.low.toFixed(2)),
        upper_m_bgs: Number(state.lastResult.result.final.high.toFixed(2)),
      };
    },
  })).catch(error => console.warn("Forecast tool registration failed", error));
}

async function init() {
  try {
    await window.SYNTHETIC_MODEL_READY;
    state.data = window.SYNTHETIC_MODEL;
    if (!state.data?.wells?.length) throw new Error("The 450-well model data could not be loaded.");
    state.wells = new Map(state.data.wells.map(well => [well.id, well]));
    $("wellOptions").innerHTML = state.data.wells.map(well => `<option value="${well.id}">${state.data.scenario_copy[well.scenario].label}</option>`).join("");
    const requestedWell = new URLSearchParams(window.location.search).get("well")?.toUpperCase();
    if (requestedWell && state.wells.has(requestedWell)) $("wellInput").value = requestedWell;
    $("forecastForm").addEventListener("submit", runForecast);
    registerForecastTool();
    runForecast();
  } catch (error) {
    showError(error.message || "The forecast page could not be initialized.");
  }
}

init();
