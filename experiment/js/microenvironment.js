import { radialFieldAt } from "./scenario-model.js";
const SVG_NS = "http://www.w3.org/2000/svg";

function mixHex(low, high, amount) {
  const parse = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const a = parse(low);
  const b = parse(high);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

export function renderMicroenvironment(state, activeFields) {
  if (!state) return;
  const { geometry, transport, time } = state;
  document.querySelector("#transport-day").textContent = `DAY ${time.day.toFixed(1)}`;
  document.querySelector("#spatial-boundary").textContent = `${transport.boundaryLayerUm.toFixed(0)} µm`;
  document.querySelector("#spatial-radius").textContent = `${geometry.radiusUm.toFixed(0)} µm`;
  document.querySelector("#spatial-delta-r").textContent = transport.transportBarrierRatio.toFixed(2);
  document.querySelector("#spatial-penetration").textContent = `${transport.o2PenetrationUm.toFixed(0)} µm`;
  document.querySelector("#spatial-bulk-o2").textContent = `${Math.round(transport.bulkO2 * 100)}%`;
  document.querySelector("#spatial-surface-o2").textContent = `${Math.round(transport.surfaceO2 * 100)}%`;
  document.querySelector("#spatial-core-o2").textContent = `${Math.round(transport.coreO2 * 100)}%`;
  document.querySelector("#spatial-core-glucose").textContent = `${Math.round(transport.coreGlucose * 100)}%`;
  document.querySelector("#spatial-hypoxia").textContent = `${Math.round(transport.hypoxicFraction * 100)}%`;
  const fullRunProfile = window.ORBIO_RUN_METADATA?.profile || {};
  document.querySelector("#spatial-voxel").textContent = Number.isFinite(fullRunProfile.grid_n) && Number.isFinite(fullRunProfile.grid_h)
    ? `${fullRunProfile.grid_n}³ · ${fullRunProfile.grid_h} µm voxel`
    : "Not available";
  document.querySelector("#spatial-residual-g").textContent = transport.residualG < 0.01
    ? `${transport.residualG.toExponential(0)} g`
    : `${transport.residualG.toFixed(2)} g`;
  document.querySelector("#spatial-shear").textContent = `${transport.shearMPa.toFixed(1)} mPa`;
  document.querySelector("#spatial-sedimentation").textContent = transport.sedimented ? "Yes" : "No";
  document.querySelector("#spatial-mixing").textContent = `${Math.round(transport.mixingIndex * 100)}%`;
  document.querySelector("#transport-regime-note").textContent = transport.sedimented
    ? "Sedimented lower contact plane is active in this condition."
    : "Suspended condition: medium surrounds the organoid and mixing dominates transport.";

  renderRadialProfile(state, activeFields);
}

function svgEl(name, attributes, text) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function niceStep(span, target = 5) {
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * magnitude;
}

function renderRadialProfile(state, activeFields) {
  const { geometry, transport } = state;
  const svg = document.querySelector("#transport-profile");
  const radius = geometry.radiusUm;
  const delta = transport.boundaryLayerUm;
  const lumen = geometry.morphology === "cyst" ? geometry.lumenRadiusUm : 0;
  const edge = radius + delta;
  const xMax = Math.ceil((edge + Math.max(40, edge * 0.28)) / 10) * 10;
  const left = 62;
  const right = 738;
  const top = 108;
  const bottom = 292;
  const xAt = (r) => left + (r / xMax) * (right - left);
  const yAt = (value) => bottom - value * (bottom - top);

  const bands = [];
  if (lumen > 0) bands.push({ from: 0, to: lumen, cls: "lumen", label: "LUMEN" });
  bands.push({ from: lumen, to: radius, cls: "tissue", label: lumen > 0 ? "TISSUE SHELL" : "TISSUE INTERIOR" });
  bands.push({ from: radius, to: edge, cls: "depletion", label: "DEPLETION LAYER", sub: `δ = ${delta.toFixed(0)} µm` });
  bands.push({ from: edge, to: xMax, cls: "bulk", label: "BULK MEDIUM" });

  const layer = svg.querySelector("#profile-layer");
  layer.replaceChildren();
  const rows = lumen > 0 ? [26, 50, 74, 26] : [26, 50, 26];
  const rowOf = lumen > 0 ? [0, 1, 2, 0] : [0, 1, 0];
  bands.forEach((band, index) => {
    const x0 = xAt(band.from);
    const x1 = xAt(band.to);
    layer.append(svgEl("rect", { class: `profile-band ${band.cls}`, x: x0, y: top, width: Math.max(0, x1 - x0), height: bottom - top }));
    const narrow = x1 - x0 < band.label.length * 11 + 8;
    const labelY = rows[rowOf[index] ?? 0];
    const anchor = narrow ? "start" : "middle";
    const x = narrow ? x0 + 4 : (x0 + x1) / 2;
    const text = svgEl("text", { class: "profile-region", x, y: labelY, "text-anchor": anchor }, band.label);
    layer.append(text);
    if (band.sub) layer.append(svgEl("text", { class: "profile-region sub", x, y: labelY + 22, "text-anchor": anchor }, band.sub));
  });

  const grid = svg.querySelector("#profile-grid");
  grid.replaceChildren();
  [0, 0.5, 1].forEach((value) => {
    grid.append(svgEl("line", { x1: left, x2: right, y1: yAt(value), y2: yAt(value) }));
    grid.append(svgEl("text", { class: "profile-tick", x: left - 8, y: yAt(value) + 6, "text-anchor": "end" }, `${Math.round(value * 100)}%`));
  });
  const step = niceStep(xMax);
  for (let r = 0; r <= xMax + 1e-6; r += step) {
    grid.append(svgEl("line", { x1: xAt(r), x2: xAt(r), y1: bottom, y2: bottom + 6 }));
    grid.append(svgEl("text", { class: "profile-tick", x: xAt(r), y: bottom + 26, "text-anchor": "middle" }, `${Math.round(r)}`));
  }
  grid.append(svgEl("text", { class: "profile-axis-title", x: (left + right) / 2, y: bottom + 54, "text-anchor": "middle" }, "Distance from organoid centre (µm)"));

  const samples = 120;
  const path = (key) => Array.from({ length: samples + 1 }, (_, i) => {
    const r = (i / samples) * xMax;
    return `${i === 0 ? "M" : "L"}${xAt(r).toFixed(2)},${yAt(radialFieldAt(transport, geometry, r)[key]).toFixed(2)}`;
  }).join(" ");
  svg.querySelector("#profile-oxygen").setAttribute("d", path("oxygen"));
  svg.querySelector("#profile-glucose").setAttribute("d", path("glucose"));
  svg.querySelector("#profile-glucose").setAttribute("opacity", activeFields.glucose ? "0.9" : "0.35");

  const surfaceX = xAt(radius);
  const edgeX = xAt(edge);
  [["#profile-midline", surfaceX], ["#profile-shell-end", edgeX]].forEach(([id, x]) => {
    const line = svg.querySelector(id);
    line.setAttribute("x1", x);
    line.setAttribute("x2", x);
    line.setAttribute("y1", top);
    line.setAttribute("y2", bottom);
  });
  const surfaceLabel = svg.querySelector("#profile-surface-label");
  surfaceLabel.setAttribute("x", surfaceX - 6);
  surfaceLabel.setAttribute("y", bottom - 12);
  surfaceLabel.textContent = `R = ${radius.toFixed(0)} µm`;
  const edgeLabel = svg.querySelector("#profile-edge-label");
  edgeLabel.setAttribute("x", edgeX + 6);
  edgeLabel.setAttribute("y", top + 24);
  edgeLabel.textContent = `R + δ = ${edge.toFixed(0)} µm`;

  const note = geometry.morphology === "cyst"
    ? `Cyst lumen radius ${lumen.toFixed(0)} µm; shell ${geometry.shellThicknessUm.toFixed(0)} µm thick. `
    : "";
  document.querySelector("#profile-lumen-note").textContent =
    `Solid line: O₂ · dashed line: glucose. ${note}ΔO₂ bulk→surface ${(transport.deltaO2 * 100).toFixed(1)}% · δ/R ${transport.transportBarrierRatio.toFixed(2)} · ΦO₂ ${transport.phiO2.toFixed(2)}`;
  svg.querySelector("#core-indicator")?.setAttribute("fill", mixHex("#C98A8F", "#7FC9F2", transport.coreO2));
}