import { GRAVITY_OPTIONS, MORPHOLOGY_OPTIONS, TISSUE_OPTIONS } from "./scenario-model.js";

const optionFor = (options, value) => options.find((option) => option.value === value);
const formatCells = (count) => count >= 1000
  ? `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`
  : String(Math.round(count));
const direction = (value, threshold = 0.04) => value > threshold ? "↑" : value < -threshold ? "↓" : "↔";

function setScenarioCaption(element, labels) {
  element.replaceChildren();
  labels.forEach((label, index) => {
    if (index) {
      const separator = document.createElement("span");
      separator.textContent = "·";
      element.append(separator);
    }
    element.append(document.createTextNode(label));
  });
}

export function createInterface(onScenarioChange, onTimeChange, onPlaybackChange, onLayerChange, onCutModeChange) {
  const drawer = document.querySelector("#experiment-drawer");
  const drawerToggle = document.querySelector("#drawer-toggle");
  const drawerPanel = drawer.querySelector(".drawer-panel");
  const gravityButtons = [...document.querySelectorAll("#gravity-options button")];
  const morphologyButtons = [...document.querySelectorAll("#morphology-options button")];
  const tissueSelect = document.querySelector("#tissue-select");
  const timeline = document.querySelector("#timeline");
  const playButton = document.querySelector("#play-toggle");
  const playLabel = document.querySelector("#play-label");
  const playIcon = playButton.querySelector("span");
  const layerButtons = [...document.querySelectorAll("#viewer-layer-toggles button")];
  const cutModeButtons = [...document.querySelectorAll("#viewer-cut-modes button")];
  const scenario = { gravity: "flight_ug", tissue: "crc_tumor_organoid", morphology: "cyst" };
  const layers = { cells: true, oxygen: true, glucose: false, depletion: true, voxels: false };
  let cutMode = "half";

  const updateScenarioLabels = () => {
    const gravity = optionFor(GRAVITY_OPTIONS, scenario.gravity);
    const tissue = optionFor(TISSUE_OPTIONS, scenario.tissue);
    const morphology = optionFor(MORPHOLOGY_OPTIONS, scenario.morphology);
    document.querySelector("#scenario-gravity").textContent = gravity.shortLabel;
    document.querySelector("#scenario-tissue").textContent = tissue.shortLabel;
    document.querySelector("#scenario-morphology").textContent = morphology.label;
    setScenarioCaption(document.querySelector("#scenario-caption"), [gravity.label, tissue.label, morphology.label]);
    document.querySelector("#morphology-tag").textContent = morphology.value === "cyst" ? "HOLLOW CYST" : "SOLID MORPHOLOGY";
  };

  const emitScenarioChange = () => {
    gravityButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === scenario.gravity)));
    morphologyButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.value === scenario.morphology)));
    tissueSelect.value = scenario.tissue;
    updateScenarioLabels();
    onScenarioChange({ ...scenario });
  };

  gravityButtons.forEach((button) => button.addEventListener("click", () => {
    scenario.gravity = button.dataset.value;
    emitScenarioChange();
  }));
  morphologyButtons.forEach((button) => button.addEventListener("click", () => {
    scenario.morphology = button.dataset.value;
    emitScenarioChange();
  }));
  tissueSelect.addEventListener("change", () => {
    scenario.tissue = tissueSelect.value;
    emitScenarioChange();
  });

  drawerToggle.addEventListener("click", () => {
    const open = !drawer.classList.contains("open");
    drawer.classList.toggle("open", open);
    drawerToggle.setAttribute("aria-expanded", String(open));
    drawerToggle.querySelector(".drawer-icon").textContent = open ? "×" : "＋";
    drawerPanel.inert = !open;
  });
  drawerPanel.inert = true;
  timeline.addEventListener("input", () => onTimeChange(Number(timeline.value)));
  playButton.addEventListener("click", () => onPlaybackChange());

  layerButtons.forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.layer;
    layers[key] = !layers[key];
    button.setAttribute("aria-pressed", String(layers[key]));
    onLayerChange({ ...layers });
  }));
  cutModeButtons.forEach((button) => button.addEventListener("click", () => {
    cutMode = button.dataset.cutMode;
    cutModeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.cutMode === cutMode)));
    onCutModeChange(cutMode);
  }));

  updateScenarioLabels();

  return {
    setTime: (time) => { timeline.value = String(time); },
    setPlayback: (playing) => {
      playLabel.textContent = playing ? "Pause" : "Play";
      playIcon.textContent = playing ? "Ⅱ" : "▶";
      playButton.setAttribute("aria-label", playing ? "Pause trajectory" : "Play trajectory");
    },
    renderState: (state, currentScenario) => {
      const day = state.time.day.toFixed(1);
      document.querySelector("#stage-day").textContent = `DAY ${day}`;
      document.querySelector("#timeline-day").textContent = `Day ${day}`;
      document.querySelector("#metric-cells").textContent = formatCells(state.population.biologicalCells);
      document.querySelector("#metric-growth").textContent = `${state.phenotype.growthFromDay0.toFixed(1)}×`;
      const gravityPercent = (state.phenotype.gravityEffectVs1g - 1) * 100;
      document.querySelector("#metric-gravity-effect").textContent =
        `vs matched 1g · ${gravityPercent > 0 ? "+" : ""}${gravityPercent.toFixed(0)}%`;
      document.querySelector("#metric-hypoxia").textContent = `${Math.round(state.transport.hypoxicFraction * 100)}%`;
      document.querySelector("#metric-core-oxygen").textContent = `${Math.round(state.transport.coreO2 * 100)}%`;
      document.querySelector("#metric-representative").textContent = `~${formatCells(state.population.renderedParticles)} representative cells/clusters modelled`;
      document.querySelector("#metric-sim-agents").textContent = `${formatCells(state.population.simulationAgents)} simulation agents`;
      const signal = state.molecularEvidence;
      const O2arrow = state.transport.coreO2 < 0.55 ? "↓" : "↔";
      const hypoxiaArrow = state.transport.hypoxicFraction > 0.2 ? "↑" : "↔";
      const cyclingArrow = direction(signal.proliferation);
      document.querySelector("#causal-strip").textContent =
        `Core O₂ ${O2arrow} → hypoxia ${hypoxiaArrow} → cycling ${cyclingArrow} → ${currentScenario.morphology === "cyst" ? "cyst shell" : "solid tissue"} ${state.phenotype.growthFromDay0 >= 2 ? "expands" : "adapts"}`;
    }
  };
}
