const number = (value, digits = 0) => Number.isFinite(value)
  ? value.toLocaleString(undefined, { maximumFractionDigits: digits })
  : "Not available";

function pair(label, value, note = "") {
  return { label, value, note };
}

function addGroup(root, title, rows) {
  const group = document.createElement("section");
  group.className = "model-info-group";
  const heading = document.createElement("h4");
  heading.textContent = title;
  group.append(heading);
  const list = document.createElement("dl");
  rows.forEach(({ label, value, note }) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    list.append(term, description);
    if (note) {
      const detail = document.createElement("dd");
      detail.className = "info-note";
      detail.textContent = note;
      list.append(detail);
    }
  });
  group.append(list);
  root.append(group);
}

function fillDetails(root, groups) {
  if (!root) return;
  root.replaceChildren();
  groups.forEach(([title, rows]) => addGroup(root, title, rows));
}

export function renderModelDetails(metadata, omicsData) {
  const profile = metadata.profile || {};
  const gpu = metadata.gpu || {};
  const quality = metadata.quality || {};
  const physics = metadata.physics || {};
  const initial = metadata.initialization || {};
  const architecture = metadata.architecture || {};
  const available = metadata.available;
  const profileLabel = profile.name || "Not available";
  const gpuName = gpu.name || "Not available";
  const vram = Number.isFinite(gpu.vramGb) ? `${number(gpu.vramGb, 1)} GB` : "Not available";
  const bf16 = gpu.bf16 === true ? "BF16 supported"
    : gpu.bf16 === false ? "BF16 unsupported" : "BF16 status unavailable";
  const capText = Number.isFinite(quality.capped)
    ? `${number(quality.capped)} capped / excluded of ${number(quality.attempted)} attempted (cap policy: ${quality.policy || "not available"})`
    : "Capping statistics not available";
  const retainedText = Number.isFinite(quality.retained) ? `${number(quality.retained)} uncensored runs retained` : "Not available";
  const grid = Number.isFinite(profile.grid_n) && Number.isFinite(profile.grid_h)
    ? `${number(profile.grid_n)}³ voxels · ${number(profile.grid_h)} µm spacing`
    : "Not available";
  const fieldIterations = Number.isFinite(physics.jacobiIterations) ? `${number(physics.jacobiIterations)} Jacobi iterations per step` : "Warm-started Jacobi iteration";

  fillDetails(document.querySelector("#global-run-info"), [
    ["Compute", [
      pair("GPU", gpuName),
      pair("VRAM", vram),
      pair("CUDA / PyTorch", `${gpu.cudaBuild || "Not available"} / ${gpu.torch || "Not available"}`),
      pair("Compute capability", gpu.computeCapability ? `${gpu.computeCapability} (${(gpu.architecture || []).slice(-1)[0] || "architecture not available"})` : "Not available"),
      pair("Precision", `${bf16} · AMP ${profile.amp === true ? "enabled" : "disabled"}`)
    ]],
    ["Simulation", [
      pair("Model", "GPU-accelerated agent-based virtual organoid"),
      pair("Profile", profileLabel),
      pair("Field grid", grid),
      pair("Maximum agents", number(profile.max_agents)),
      pair("Scenarios / workers", `${number(profile.n_scenarios)} / ${number(profile.workers)}`),
      pair("Mechanical pair chunk", number(profile.pair_chunk))
    ]],
    ["AI training", [
      pair("Encoder", `${architecture.encoder || "Not available"} · ${number(architecture.inputFeatures)} features · ${number(architecture.nearestNeighbours)} nearest neighbours`),
      pair("Graph size / batch", `${number(profile.cells_per_graph)} cells per graph · batch ${number(profile.graph_batch)}`),
      pair("Training", `${architecture.pretraining || "Not available"} · ${number(profile.encoder_epochs)} encoder epochs · ${number(profile.head_epochs)} prediction-head epochs`),
      pair("Ensemble", `${number(profile.ensemble)} models · ${number(architecture.embeddingDimensions)} embedding dimensions`),
      pair("Active learning", `${number(profile.al_baselines)} baselines · ${number(profile.al_rounds)} rounds × ${number(profile.al_batch)} acquisitions`)
    ]],
    ["Experiment initialisation & quality", [
      pair("Dataset initialisation", `${number(initial.datasetMinimumAgents)}–${number(initial.datasetMaximumAgents)} simulation agents per virtual experiment`),
      pair("Scenario default", `${number(initial.scenarioDefaultAgents)} simulation agents`),
      pair("Capped runs", capText, `${retainedText}. ${quality.scopeNote || ""}`.trim()),
      pair("Corrected-run source", metadata.source || "Not available")
    ]]
  ]);

  const timeStepHours = Number.isFinite(physics.simulationStepHours) ? `${number(physics.simulationStepHours)} h` : "1 h (full simulator configuration)";
  fillDetails(document.querySelector("#transport-model-info"), [
    ["Full ORBIO field solver", [
      pair("Equation", "D∇²c − kc = 0"),
      pair("Method", `Quasi-steady finite difference · ${fieldIterations}`),
      pair("Corrected-run grid", grid),
      pair("O₂ / glucose diffusivity", physics.d_o2 && physics.d_glc
        ? `${number(physics.d_o2)} / ${number(physics.d_glc)} µm²/h` : "See repository run metadata")
    ]],
    ["Display", [
      pair("Depletion-shell display cap", "0.55 scene radii")
    ]]
  ]);

  fillDetails(document.querySelector("#growth-model-info"), [
    ["Displayed curves", [
      pair("Source", "Reduced mechanistic model (browser, forward steps)"),
      pair("Time window", "Day 0–7"),
      pair("Conditions", "Five gravity trajectories for the selected tissue and morphology"),
      pair("Full-run dataset initialisation", `${number(initial.datasetMinimumAgents)}–${number(initial.datasetMaximumAgents)} agents per virtual experiment`),
      pair("Population ceiling", `${number(profile.max_agents)} agents in the full simulator`),
      pair("Population meaning", "The browser’s estimated biological-cell count is distinct from full-simulator agents and rendered glyphs")
    ]]
  ]);

  fillDetails(document.querySelector("#cell-state-info"), [
    ["State model", [
      pair("Classes", "Proliferating · Quiescent · Apoptotic · Necrotic"),
      pair("Full simulator update", timeStepHours),
      pair("Browser model", "Forward reduced-model steps with continuous interpolation between sampled states"),
      pair("Browser step", "0.1 day (2.4 h); 71 samples across Day 0–7")
    ]],
    ["Full-simulator thresholds", [
      pair("O₂ proliferation", Number.isFinite(physics.o2Hypoxic) && Number.isFinite(physics.o2ProliferationSaturation)
        ? `Below ${number(physics.o2Hypoxic * 100)}% O₂ is inhibited; above ${number(physics.o2ProliferationSaturation * 100)}% is full-speed`
        : "Not available"),
      pair("Necrosis", Number.isFinite(physics.o2Necrotic) ? `Below approximately ${number(physics.o2Necrotic * 100)}% O₂` : "Not available"),
      pair("Glucose", Number.isFinite(physics.glucoseMinimum) ? `Below ${number(physics.glucoseMinimum * 100)}% prevents division` : "Not available")
    ]]
  ]);

  fillDetails(document.querySelector("#sensitivity-model-info"), [
    ["Sensitivity method", [
      pair("Method", "One-at-a-time reduced-model sensitivity"),
      pair("Perturbation", "Each parameter varied to 0.5× and 1.5× baseline"),
      pair("Target", "Day-7 viable-volume change in ln-fold units (ln 2.3 ≈ 10×); viable cell-equivalents use a fixed per-cell volume")
    ]]
  ]);

  const neuralProliferation = omicsData?.neural?.flight_ug?.programs?.proliferation;
  const neuralExample = neuralProliferation
    ? `Neural flight proliferation Δ ${number(neuralProliferation.delta, 2)} ± ${number(neuralProliferation.sd, 2)} bootstrap SD (n=${number(neuralProliferation.n)} pairs); the neural prior in the reduced model uses a 0.9109 multiplier.`
    : "No neural flight proliferation contrast is available.";
  fillDetails(document.querySelector("#omics-model-info"), [
    ["Dataset and interpretation", [
      pair("Data", "NASA OSD RNA-seq processed into ORBIO programme scores"),
      pair("Programmes", "Proliferation · apoptosis · anti-apoptosis · hypoxia · glycolysis · adhesion · OXPHOS"),
      pair("Uncertainty", "Reported SD for available measured contrasts"),
      pair("Calibration rule", "Condition-level signals with a clear direction set the reduced-model priors"),
      pair("Verified example", neuralExample)
    ]]
  ]);

  document.querySelectorAll("[data-full-run-grid]").forEach((node) => { node.textContent = grid; });
  document.querySelectorAll("[data-full-run-agents]").forEach((node) => { node.textContent = number(profile.max_agents); });
  document.querySelectorAll("[data-full-run-scenarios]").forEach((node) => { node.textContent = number(profile.n_scenarios); });
  document.querySelectorAll("[data-run-metadata-state]").forEach((node) => {
    node.textContent = available ? `Run info: ${gpuName}` : "Run metadata unavailable";
  });
}

export function renderHeroContext(state, visibleGlyphCount) {
  if (!state) return;
  const initialCount = state.population.initialBiologicalCells;
  document.querySelector("#hero-initial-population").textContent = `~${number(initialCount)} estimated biological cells at D0`;
  document.querySelector("#hero-rendered-glyphs").textContent =
    `${number(visibleGlyphCount ?? state.population.renderedParticles)} representative glyphs visible of ${number(state.population.renderedParticles)}`;
  document.querySelector("#hero-simulation-agents").textContent = `~${number(state.population.simulationAgents)} coarse-grained simulation agents`;
  document.querySelector("#hero-timestep").textContent = `Reduced-model step: ${number(state.time.stepDays, 1)} day; 7-day timeline`;
}
