const SVG_NS = "http://www.w3.org/2000/svg";

function mixHex(low, high, amount) {
  const parse = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const a = parse(low);
  const b = parse(high);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function radialPath(samples, key, xAt, yAt) {
  return samples.map((sample, index) => `${index === 0 ? "M" : "L"}${xAt(sample.position).toFixed(2)},${yAt(sample[key]).toFixed(2)}`).join(" ");
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
    ? `${fullRunProfile.grid_n}³ · ${fullRunProfile.grid_h} µm voxel (full run)`
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
  document.querySelector("#hero-field-note").textContent = activeFields.glucose
    ? "O₂ + glucose overlays are enabled in the unified 3D scene."
    : "O₂ transport is enabled in the unified 3D scene.";

  const profile = transport.radialProfile;
  const svg = document.querySelector("#transport-profile");
  const left = 62;
  const right = 738;
  const top = 22;
  const bottom = 255;
  const xAt = (x) => left + x * (right - left);
  const yAt = (value) => bottom - value * (bottom - top);
  const oxygenPath = radialPath(profile, "oxygen", xAt, yAt);
  const glucosePath = radialPath(profile, "glucose", xAt, yAt);
  svg.querySelector("#profile-oxygen").setAttribute("d", oxygenPath);
  svg.querySelector("#profile-glucose").setAttribute("d", glucosePath);
  svg.querySelector("#profile-glucose").setAttribute("opacity", activeFields.glucose ? "0.9" : "0.18");
  svg.querySelector("#profile-midline").setAttribute("x1", xAt(0.55));
  svg.querySelector("#profile-midline").setAttribute("x2", xAt(0.55));
  svg.querySelector("#profile-shell-end").setAttribute("x1", xAt(0.8));
  svg.querySelector("#profile-shell-end").setAttribute("x2", xAt(0.8));
  document.querySelector("#profile-lumen-note").textContent = geometry.morphology === "cyst"
    ? `Cyst lumen radius ${geometry.lumenRadiusUm.toFixed(0)} µm; shell-thickness dominated diffusion path ${geometry.shellThicknessUm.toFixed(0)} µm.`
    : `Solid morphology; nutrient path is the full radius ${geometry.radiusUm.toFixed(0)} µm toward the center.`;

  svg.querySelector("#profile-o2-depletion").textContent = `ΔO₂ bulk→surface: ${(transport.deltaO2 * 100).toFixed(1)}%`;
  svg.querySelector("#profile-regime").textContent = `δ/R ${transport.transportBarrierRatio.toFixed(2)} · ΦO₂ ${transport.phiO2.toFixed(2)}`;
  const oxygenColor = mixHex("#d36d5d", "#0f79c8", transport.coreO2);
  svg.querySelector("#core-indicator").setAttribute("fill", oxygenColor);
}
