import { CELL_STATE_KEYS, GRAVITY_OPTIONS, MOLECULAR_PROGRAMS } from "./scenario-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const GRAVITY_COLORS = {
  ground_1g: "#102235",
  flight_ug: "#0f79c8",
  flight_1g_ctrl: "#7b6b62",
  sim_ug_rpm: "#d59a31",
  sim_ug_clinostat: "#19a28b"
};
const PROGRAM_LABELS = {
  proliferation: "Proliferation",
  apoptosis: "Apoptosis",
  anti_apoptosis: "Anti-apoptosis",
  hypoxia: "Hypoxia",
  glycolysis: "Glycolysis",
  adhesion: "Adhesion",
  oxphos: "OXPHOS",
  apoptosis_balance: "Apoptosis balance"
};
const svgElement = (name, attributes = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

function logDomain(trajectories) {
  const maximum = Math.max(...[...trajectories.values()].flatMap((trajectory) =>
    trajectory.map((state) => state.phenotype.growthFromDay0)
  ));
  return Math.max(1, Math.ceil(Math.log10(maximum)));
}

function chartSize(svg) {
  const parent = svg.parentElement;
  const style = getComputedStyle(parent);
  const inner = (parent.clientWidth || 760) - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
  const width = Math.max(300, Math.floor(inner));
  const height = Math.round(Math.min(440, Math.max(300, width * 0.5)));
  return { width, height };
}

function makeChartScales(maxExponent, width = 760, height = 300) {
  const left = 84;
  const right = width - 22;
  const top = 20;
  const bottom = height - 50;
  const xAt = (time) => left + time * (right - left);
  const yAt = (value) => bottom - (Math.log10(Math.max(1, value)) / maxExponent) * (bottom - top);
  return { left, right, top, bottom, xAt, yAt };
}

export function renderGravityCurves(svg, trajectories, selectedGravity) {
  const grid = svg.querySelector(".chart-grid");
  const curveGroup = svg.querySelector(".gravity-trajectories");
  const labels = svg.querySelector(".chart-labels");
  grid.replaceChildren();
  curveGroup.replaceChildren();
  labels.replaceChildren();
  const maxExponent = logDomain(trajectories);
  const { width, height } = chartSize(svg);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.dataset.width = String(width);
  svg.dataset.height = String(height);
  const scales = makeChartScales(maxExponent, width, height);
  const exponents = new Set([0, ...Array.from({ length: maxExponent }, (_, index) => index + 1)]);
  exponents.forEach((exponent) => {
    const y = scales.yAt(10 ** exponent);
    grid.appendChild(svgElement("line", { x1: scales.left, y1: y, x2: scales.right, y2: y }));
    const label = svgElement("text", { x: scales.left - 10, y: y + 6, "text-anchor": "end" });
    label.textContent = `${10 ** exponent}×`;
    labels.appendChild(label);
  });
  for (let day = 0; day <= 7; day += 1) {
    if (width < 520 && day % 2 === 1) continue;
    const label = svgElement("text", { x: scales.xAt(day / 7), y: scales.bottom + 28, "text-anchor": "middle" });
    label.textContent = String(day);
    labels.appendChild(label);
  }
  GRAVITY_OPTIONS.forEach(({ value, label }) => {
    const trajectory = trajectories.get(value);
    const d = trajectory.map((state, index) => {
      const x = scales.xAt(state.time.normalized);
      const y = scales.yAt(state.phenotype.growthFromDay0);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    curveGroup.appendChild(svgElement("path", {
      class: `gravity-curve${value === selectedGravity ? " selected" : ""}`,
      d,
      stroke: GRAVITY_COLORS[value],
      "data-gravity": value,
      "aria-label": `${label} growth trajectory`
    }));
    curveGroup.appendChild(svgElement("circle", {
      class: `gravity-marker${value === selectedGravity ? " selected" : ""}`,
      r: value === selectedGravity ? 7 : 4,
      fill: GRAVITY_COLORS[value],
      "data-gravity-marker": value
    }));
  });
  const legend = document.querySelector("#gravity-legend");
  legend.replaceChildren();
  GRAVITY_OPTIONS.forEach(({ value, label }) => {
    const item = document.createElement("span");
    item.className = `gravity-legend-item${value === selectedGravity ? " selected" : ""}`;
    item.innerHTML = `<i style="--series-color:${GRAVITY_COLORS[value]}"></i>${label}`;
    legend.appendChild(item);
  });
  svg.dataset.maxExponent = String(maxExponent);
}

export function updateGravityMarkers(svg, trajectories, normalizedTime) {
  const scales = makeChartScales(Number(svg.dataset.maxExponent || 1), Number(svg.dataset.width || 760), Number(svg.dataset.height || 300));
  const markerLine = svg.querySelector(".chart-marker-line");
  const x = scales.xAt(normalizedTime);
  markerLine.setAttribute("x1", x);
  markerLine.setAttribute("x2", x);
  markerLine.setAttribute("y1", scales.top);
  markerLine.setAttribute("y2", scales.bottom);
  trajectories.forEach((trajectory, gravity) => {
    const position = normalizedTime * (trajectory.length - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(trajectory.length - 1, lowerIndex + 1);
    const lowerGrowth = trajectory[lowerIndex].phenotype.growthFromDay0;
    const upperGrowth = trajectory[upperIndex].phenotype.growthFromDay0;
    const growth = lowerGrowth + (upperGrowth - lowerGrowth) * (position - lowerIndex);
    const marker = svg.querySelector(`[data-gravity-marker="${gravity}"]`);
    marker.setAttribute("cx", scales.xAt(normalizedTime));
    marker.setAttribute("cy", scales.yAt(growth));
  });
}

function displayedPercentages(state) {
  const values = CELL_STATE_KEYS.map((key) => state.cellState[key] * 100);
  const rounded = values.map(Math.floor);
  let remaining = 100 - rounded.reduce((sum, value) => sum + value, 0);
  values
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, remaining)
    .forEach(({ index }) => { rounded[index] += 1; });
  return rounded;
}

export function renderCellStates(root, state) {
  const percentages = displayedPercentages(state);
  CELL_STATE_KEYS.forEach((key, index) => {
    root.querySelector(`[data-state="${key}"]`).style.flexBasis = `${state.cellState[key] * 100}%`;
    root.querySelector(`[data-state-row="${key}"] strong`).textContent = `${percentages[index]}%`;
  });
  const summary = CELL_STATE_KEYS.map((key, index) => `${key} ${percentages[index]}%`).join(", ");
  root.querySelector("#stacked-bar").setAttribute("aria-label", `Cell-state composition: ${summary}`);
  root.querySelector("#cell-state-day").textContent = state.time.day.toFixed(1);
}

function divergingBar(track, value, className, maxMagnitude) {
  const center = 50;
  const halfRange = 48;
  const width = Math.min(Math.abs(value) / maxMagnitude, 1) * halfRange;
  const bar = document.createElement("i");
  bar.className = className;
  bar.style.left = `${value < 0 ? center - width : center}%`;
  bar.style.width = `${width}%`;
  track.appendChild(bar);
}

export function renderSensitivity(root, sensitivity) {
  const chart = root.querySelector("#tornado-chart");
  chart.replaceChildren();
  const maxMagnitude = Math.max(0.08, ...sensitivity.parameters.flatMap(({ low, high }) => [Math.abs(low), Math.abs(high)]));
  sensitivity.parameters.forEach(({ label, low, high }) => {
    const row = document.createElement("div");
    row.className = "tornado-row";
    const name = document.createElement("span");
    name.className = "tornado-name";
    name.textContent = label;
    const track = document.createElement("span");
    track.className = "tornado-track";
    track.setAttribute("aria-label", `${label}: minus 50 percent ${low.toFixed(2)}, plus 50 percent ${high.toFixed(2)} log growth change`);
    const zero = document.createElement("i");
    zero.className = "tornado-zero";
    track.appendChild(zero);
    divergingBar(track, low, "tornado-bar low", maxMagnitude);
    divergingBar(track, high, "tornado-bar high", maxMagnitude);
    const values = document.createElement("span");
    values.className = "tornado-values";
    values.textContent = `${low.toFixed(2)} / ${high.toFixed(2)}`;
    row.append(name, track, values);
    chart.appendChild(row);
  });
}

function buildOmicsAxes(svg, range) {
  const grid = svg.querySelector(".omics-grid");
  const labels = svg.querySelector(".omics-labels");
  grid.replaceChildren();
  labels.replaceChildren();
  const left = 215;
  const right = 720;
  const top = 25;
  const bottom = 336;
  const xAt = (value) => left + ((value + range) / (2 * range)) * (right - left);
  const zero = xAt(0);
  [-range, -range / 2, 0, range / 2, range].forEach((value) => {
    const x = xAt(value);
    grid.appendChild(svgElement("line", { x1: x, y1: top, x2: x, y2: bottom, class: value === 0 ? "omics-zero" : "" }));
    const label = svgElement("text", { x, y: 362, "text-anchor": "middle" });
    label.textContent = value.toFixed(1);
    labels.appendChild(label);
  });
  return { left, right, top, bottom, xAt, zero };
}

export function renderMolecularEvidence(svg, state) {
  const range = 1.05;
  const scales = buildOmicsAxes(svg, range);
  const bars = svg.querySelector(".omics-bars");
  bars.replaceChildren();
  const scores = state.molecularEvidence;
  const metadata = state.molecularEvidenceMetadata;
  const rowHeight = 40;
  MOLECULAR_PROGRAMS.forEach((program, index) => {
    const y = scales.top + 15 + index * rowHeight;
    const label = svgElement("text", { x: scales.left - 12, y: y + 6, "text-anchor": "end", class: "omics-program-label" });
    label.textContent = PROGRAM_LABELS[program] || program;
    bars.appendChild(label);
    const value = Math.max(-range, Math.min(range, scores[program] || 0));
    const x = scales.xAt(value);
    bars.appendChild(svgElement("rect", {
      x: Math.min(scales.zero, x),
      y: y - 9,
      width: Math.max(0.8, Math.abs(x - scales.zero)),
      height: 18,
      class: value >= 0 ? "omics-bar positive" : "omics-bar negative",
      "data-program": program
    }));
    const sd = metadata.programs?.[program]?.sd;
    if (Number.isFinite(sd) && sd > 0) {
      const lowX = scales.xAt(Math.max(-range, value - sd));
      const highX = scales.xAt(Math.min(range, value + sd));
      bars.appendChild(svgElement("line", { x1: lowX, y1: y, x2: highX, y2: y, class: "omics-error" }));
      bars.appendChild(svgElement("line", { x1: lowX, y1: y - 4, x2: lowX, y2: y + 4, class: "omics-error-cap" }));
      bars.appendChild(svgElement("line", { x1: highX, y1: y - 4, x2: highX, y2: y + 4, class: "omics-error-cap" }));
    }
    const valueLabel = svgElement("text", {
      x: x + (value >= 0 ? 7 : -7),
      y: y + 6,
      "text-anchor": value >= 0 ? "start" : "end",
      class: "omics-value-label"
    });
    valueLabel.textContent = value.toFixed(2);
    bars.appendChild(valueLabel);
  });
  const measured = metadata.sourceType === "repo-data";
  const derived = metadata.sourceType === "repo-derived";
  const sourceLabel = measured
    ? `SOURCE · NASA OSD-940 reanalysis · ${metadata.sourceFile}`
    : derived ? `SOURCE · Repository contrast, scaled · ${metadata.sourceFile || "outputs/omics"}`
      : "SOURCE · Programme index from tissue-level directional evidence";
  document.querySelector("#omics-source").textContent = metadata.contrast;
  document.querySelector("#omics-source-line").textContent = sourceLabel;
  document.querySelector("#omics-footnote").textContent = measured
    ? `Contrast ${metadata.contrast}. Bars show the reported programme delta; whiskers show the reported SD. Condition-level evidence (n per group in the repository table).`
    : derived
      ? `${metadata.detail} Bars show the scaled programme delta.`
      : `Programme index for ${metadata.contrast}. Bars show direction and relative size per programme.`;
  svg.setAttribute("aria-label", `Molecular programme contrasts for ${metadata.contrast}; source type ${metadata.sourceType}.`);
}
