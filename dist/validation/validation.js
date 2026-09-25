const NS = "http://www.w3.org/2000/svg";
const state = { data: null, wells: new Map(), selected: null };
const $ = id => document.getElementById(id);
const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const titleCase = value => value.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());

function svgEl(name, attrs = {}, text = "") {
  const node = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}

function linePath(points, x, y, key) {
  return points.map((point, index) => `${index ? "L" : "M"}${x(point.day).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
}

function renderFleetSummary() {
  const metrics = state.data.fleet_metrics;
  $("fleetMae").textContent = `${fmt(metrics.mae_m)} m`;
  $("fleetRmse").textContent = `${fmt(metrics.rmse_m)} m`;
  $("fleetCoverage").textContent = `${fmt(metrics.coverage_80_pct, 1)}%`;
}

function renderValidationChart(well) {
  const svg = $("validationChart");
  svg.replaceChildren(
    svgEl("title", { id: "validationChartTitle" }, `Thirty-day holdout validation for ${well.id}`),
    svgEl("desc", { id: "validationChartDesc" }, "Observed training history followed by a model forecast, its uncertainty range, and the hidden true water level."),
  );
  const W = 1040, H = 440, margin = { left: 74, right: 26, top: 24, bottom: 52 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;
  const trainEnd = state.data.meta.training_days;
  const training = well.history.observed.slice(trainEnd - 60, trainEnd).map((level, index) => ({ day: index - 59, level }));
  const truth = well.history.true.slice(trainEnd).map((level, index) => ({ day: index + 1, level }));
  const predicted = well.validation.predicted.map((level, index) => ({ day: index + 1, level }));
  const band = well.validation.predicted.map((level, index) => ({ day: index + 1, low: well.validation.low80[index], high: well.validation.high80[index] }));
  const values = training.map(point => point.level).concat(truth.map(point => point.level), band.flatMap(point => [point.low, point.high]));
  let min = Math.max(0, Math.min(...values) - 1.5);
  let max = Math.min(well.construction_depth_m, Math.max(...values) + 1.5);
  if (max - min < 6) { min = Math.max(0, min - 3); max = Math.min(well.construction_depth_m, max + 3); }
  const x = day => margin.left + (day + 59) / 89 * innerW;
  const y = value => margin.top + (value - min) / (max - min) * innerH;

  for (let index = 0; index <= 4; index += 1) {
    const value = min + (max - min) * index / 4;
    const yy = y(value);
    svg.append(svgEl("line", { x1: margin.left, y1: yy, x2: W - margin.right, y2: yy, class: "grid-line" }));
    svg.append(svgEl("text", { x: margin.left - 11, y: yy + 4, "text-anchor": "end", class: "axis-label" }, `${fmt(value, 0)} m`));
  }
  [
    { day: -59, label: "60d training" },
    { day: 0, label: "Forecast starts" },
    { day: 15, label: "15d holdout" },
    { day: 30, label: "30d holdout" },
  ].forEach((tick, index, array) => {
    const anchor = index === 0 ? "start" : index === array.length - 1 ? "end" : "middle";
    svg.append(svgEl("text", { x: x(tick.day), y: H - 17, "text-anchor": anchor, class: "axis-label" }, tick.label));
  });

  const upper = band.map(point => ({ day: point.day, value: point.low }));
  const lower = [...band].reverse().map(point => ({ day: point.day, value: point.high }));
  svg.append(svgEl("path", { d: `${linePath(upper, x, y, "value")} ${linePath(lower, x, y, "value").replace(/^M/, "L")} Z`, class: "uncertainty-area" }));
  svg.append(svgEl("path", { d: linePath(training, x, y, "level"), class: "observed-line" }));
  svg.append(svgEl("line", { x1: x(0), y1: margin.top, x2: x(0), y2: H - margin.bottom, class: "split-line" }));
  svg.append(svgEl("path", { d: linePath(predicted, x, y, "level"), class: "forecast-line" }));
  svg.append(svgEl("path", { d: linePath(truth, x, y, "level"), class: "truth-line" }));
  svg.append(svgEl("circle", { cx: x(30), cy: y(predicted.at(-1).level), r: 6, class: "forecast-dot" }));
  svg.append(svgEl("circle", { cx: x(30), cy: y(truth.at(-1).level), r: 6, class: "truth-dot" }));
}

function diagnosisFor(well) {
  const fleet = state.data.fleet_metrics;
  if (well.scenario === "sensor_drift") {
    return {
      title: "The sensor shift is mistaken for physical decline.",
      text: "The model is trained on observed readings, while scoring uses the hidden physical level. This designed failure shows why calibration checks and independent static readings are urgently needed.",
    };
  }
  if (well.validation.mae_m <= fleet.mae_m) {
    return {
      title: "This well is recovered more accurately than the fleet average.",
      text: `Its ${fmt(well.validation.mae_m)} m MAE is below the ${fmt(fleet.mae_m)} m fleet result. The selected drivers and the previous daily movement capture this designed case well.`,
    };
  }
  return {
    title: "This well remains harder than the fleet average.",
    text: `Its ${fmt(well.validation.mae_m)} m MAE is above the ${fmt(fleet.mae_m)} m fleet result. A longer history or additional local and neighbouring-well inputs would be the next model improvement.`,
  };
}

function renderWell(well) {
  const copy = state.data.scenario_copy[well.scenario];
  const diagnosis = diagnosisFor(well);
  const bias = well.validation.bias_m;
  state.selected = well;
  $("validationEyebrow").textContent = `${well.id} · ${copy.label}`;
  $("forecastJump").href = `../comparison/?well=${encodeURIComponent(well.id)}`;
  $("wellMae").textContent = `${fmt(well.validation.mae_m)} m`;
  $("wellRmse").textContent = `${fmt(well.validation.rmse_m)} m`;
  $("wellBias").textContent = `${bias >= 0 ? "+" : "−"}${fmt(Math.abs(bias))} m`;
  $("biasMeaning").textContent = Math.abs(bias) < .05 ? "no material directional bias" : bias > 0 ? "prediction is deeper than truth" : "prediction is shallower than truth";
  $("wellCoverage").textContent = `${fmt(well.validation.coverage_80_pct, 1)}%`;
  $("scenarioTitle").textContent = copy.label;
  $("scenarioBehavior").textContent = copy.behavior;
  $("scenarioTest").textContent = copy.test;
  $("diagnosisTitle").textContent = diagnosis.title;
  $("diagnosisText").textContent = diagnosis.text;
  $("geologyValue").textContent = titleCase(well.geology);
  $("landUseValue").textContent = titleCase(well.land_use);
  $("volumeValue").textContent = `${fmt(well.model.average_volume_m3, 1)} m³/day`;
  $("scenarioSelect").value = well.scenario;
  renderValidationChart(well);
  const url = new URL(window.location.href);
  url.searchParams.set("well", well.id);
  history.replaceState(null, "", url);
}

function renderScenarioBenchmark() {
  const entries = Object.entries(state.data.scenario_metrics).sort((a, b) => b[1].mae_m - a[1].mae_m);
  const svg = $("scenarioChart");
  svg.replaceChildren();
  const W = 760, H = 380, margin = { left: 170, right: 48, top: 18, bottom: 28 };
  const width = W - margin.left - margin.right;
  const rowHeight = (H - margin.top - margin.bottom) / entries.length;
  const max = Math.max(...entries.map(([, metrics]) => metrics.mae_m));
  entries.forEach(([scenario, metrics], index) => {
    const y = margin.top + index * rowHeight + 5;
    const barWidth = width * metrics.mae_m / max;
    const fillClass = scenario === "sensor_drift" ? "scenario-bar difficult" : "scenario-bar";
    svg.append(svgEl("text", { x: margin.left - 10, y: y + 16, "text-anchor": "end", class: "scenario-label" }, state.data.scenario_copy[scenario].label));
    svg.append(svgEl("rect", { x: margin.left, y, width: barWidth, height: 22, class: fillClass }));
    svg.append(svgEl("text", { x: margin.left + barWidth + 8, y: y + 16, class: "scenario-value" }, `${fmt(metrics.mae_m)} m`));
  });
  $("scenarioRows").innerHTML = entries.map(([scenario, metrics]) => `
    <tr data-scenario="${scenario}">
      <td>${state.data.scenario_copy[scenario].label}</td>
      <td>${metrics.well_count}</td>
      <td>${fmt(metrics.mae_m)} m</td>
      <td>${metrics.bias_m >= 0 ? "+" : "−"}${fmt(Math.abs(metrics.bias_m))} m</td>
      <td>${fmt(metrics.coverage_80_pct, 1)}%</td>
    </tr>`).join("");
}

function showError(message) { $("formError").textContent = message; }

function inspectSelection(event) {
  event?.preventDefault();
  const wellId = $("wellInput").value.trim().toUpperCase();
  const well = state.wells.get(wellId);
  if (!well) return showError("Choose a well ID from SYN001 to SYN450.");
  showError("");
  renderWell(well);
}

function selectScenario() {
  const scenario = $("scenarioSelect").value;
  const well = state.data.wells.find(item => item.scenario === scenario);
  if (!well) return;
  $("wellInput").value = well.id;
  renderWell(well);
}

function registerValidationTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  void Promise.resolve(context.registerTool({
    name: "inspect_synthetic_borewell_validation",
    title: "Inspect a synthetic well validation",
    description: "Show the 30-day hidden-truth validation for one synthetic well.",
    inputSchema: {
      type: "object",
      properties: { well_id: { type: "string" } },
      required: ["well_id"],
      additionalProperties: false,
    },
    execute(input) {
      const id = String(input.well_id || "").toUpperCase();
      if (!state.wells.has(id)) throw new Error("Unknown synthetic well ID");
      $("wellInput").value = id;
      renderWell(state.wells.get(id));
      return { well_id: id, ...state.wells.get(id).validation };
    },
  })).catch(error => console.warn("Validation tool registration failed", error));
}

async function init() {
  try {
    await window.SYNTHETIC_MODEL_READY;
    state.data = window.SYNTHETIC_MODEL;
    if (!state.data?.wells?.length) throw new Error("The validation dataset could not be loaded.");
    state.wells = new Map(state.data.wells.map(well => [well.id, well]));
    renderFleetSummary();
    renderScenarioBenchmark();
    $("scenarioSelect").innerHTML = Object.entries(state.data.scenario_copy).map(([value, copy]) => `<option value="${value}">${copy.label}</option>`).join("");
    $("wellOptions").innerHTML = state.data.wells.map(well => `<option value="${well.id}">${state.data.scenario_copy[well.scenario].label}</option>`).join("");
    const requested = new URLSearchParams(window.location.search).get("well")?.toUpperCase();
    const initial = requested && state.wells.has(requested) ? state.wells.get(requested) : state.wells.get("SYN001");
    $("wellInput").value = initial.id;
    $("validationForm").addEventListener("submit", inspectSelection);
    $("scenarioSelect").addEventListener("change", selectScenario);
    registerValidationTool();
    renderWell(initial);
  } catch (error) {
    showError(error.message || "The validation page could not be initialized.");
  }
}

init();
