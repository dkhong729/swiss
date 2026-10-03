import {
  GRAVITY_OPTIONS,
  TISSUE_OPTIONS,
  computeIllustrativeSensitivity,
  createIllustrativeTrajectory,
  getScenarioState
} from "./scenario-model.js";
import {
  renderCellStates,
  renderGravityCurves,
  renderMolecularEvidence,
  renderSensitivity,
  updateGravityMarkers
} from "./charts.js";
import { createInterface } from "./ui.js";
import { renderMicroenvironment } from "./microenvironment.js";
import { createOrganoidViewer } from "./organoid-viewer.js";
import { renderHeroContext, renderModelDetails } from "./model-info.js";

const repositoryOmics = window.ORBIO_REPOSITORY_OMICS || {};
const runMetadata = window.ORBIO_RUN_METADATA || {};
const growthChart = document.querySelector("#growth-chart");
const viewer = createOrganoidViewer(
  document.querySelector("#organoid-canvas"),
  document.querySelector("#fallback-canvas"),
  document.querySelector("#viewer-fallback")
);
const scenario = { gravity: "flight_ug", tissue: "crc_tumor_organoid", morphology: "cyst" };
const sceneLayers = { cells: true, oxygen: true, glucose: false, depletion: true, voxels: false };
let trajectories = new Map();
let selectedTrajectory = null;
let sensitivity = null;
let currentState = null;
let currentTime = 0;
let playing = false;
let playbackFrame = 0;
let previousFrameTime = 0;
let previousPlaybackRenderTime = 0;

const ui = createInterface(
  (nextScenario) => {
    Object.assign(scenario, nextScenario);
    updateScenarioModel();
  },
  (time) => {
    currentTime = time;
    renderDynamicState();
  },
  () => {
    if (playing) {
      playing = false;
      cancelAnimationFrame(playbackFrame);
      ui.setPlayback(false);
      return;
    }
    if (currentTime >= 1) {
      currentTime = 0;
      ui.setTime(currentTime);
      renderDynamicState();
    }
    playing = true;
    previousFrameTime = 0;
    previousPlaybackRenderTime = 0;
    ui.setPlayback(true);
    playbackFrame = requestAnimationFrame(advancePlayback);
  },
  (layers) => {
    Object.assign(sceneLayers, layers);
    viewer.setLayers(sceneLayers);
    renderHeroContext(currentState, viewer.visibleGlyphCount());
    renderMicroenvironment(currentState, sceneLayers);
  },
  (cutMode) => {
    viewer.setCutMode(cutMode);
    renderHeroContext(currentState, viewer.visibleGlyphCount());
  }
);

function applyGravityEffect(current, gravity, tissue, morphology) {
  const groundTrajectory = trajectories.get("ground_1g");
  if (!groundTrajectory || gravity === "ground_1g") {
    current.phenotype.gravityEffectVs1g = 1;
    return;
  }
  const matched = getScenarioState(groundTrajectory, current.time.normalized);
  current.phenotype.gravityEffectVs1g = current.phenotype.growthFromDay0 / Math.max(1e-6, matched.phenotype.growthFromDay0);
  if (tissue === "crc_tumor_organoid" && morphology === "solid" && (gravity === "sim_ug_clinostat" || gravity === "sim_ug_rpm")) {
    current.phenotype.gravityEffectVs1g = 1 + (current.phenotype.gravityEffectVs1g - 1) * 0.22;
  }
}

function renderDynamicState() {
  currentState = getScenarioState(selectedTrajectory, currentTime);
  applyGravityEffect(currentState, scenario.gravity, scenario.tissue, scenario.morphology);
  ui.setTime(currentTime);
  ui.renderState(currentState, scenario);
  viewer.setState(currentState, scenario.morphology);
  viewer.setLayers(sceneLayers);
  renderHeroContext(currentState, viewer.visibleGlyphCount());
  renderMicroenvironment(currentState, sceneLayers);
  renderCellStates(document, currentState);
  updateGravityMarkers(growthChart, trajectories, currentTime);
}

function updateScenarioModel() {
  trajectories = new Map(GRAVITY_OPTIONS.map(({ value }) => [
    value,
    createIllustrativeTrajectory(value, scenario.tissue, scenario.morphology, { repositoryOmics })
  ]));
  selectedTrajectory = trajectories.get(scenario.gravity);
  sensitivity = computeIllustrativeSensitivity(scenario.gravity, scenario.tissue, scenario.morphology, repositoryOmics);
  currentState = getScenarioState(selectedTrajectory, currentTime);
  applyGravityEffect(currentState, scenario.gravity, scenario.tissue, scenario.morphology);
  const tissueLabel = TISSUE_OPTIONS.find(({ value }) => value === scenario.tissue).shortLabel;
  document.querySelector("#growth-subtitle").textContent = `${tissueLabel} · ${scenario.morphology}`;
  renderGravityCurves(growthChart, trajectories, scenario.gravity);
  renderSensitivity(document, sensitivity);
  renderMolecularEvidence(document.querySelector("#omics-chart"), currentState);
  document.querySelector(".sensitivity-source").textContent = sensitivity.sourceType === "model"
    ? "Reduced-model sensitivity"
    : "Illustrative sensitivity";
  renderDynamicState();
}

renderModelDetails(runMetadata, repositoryOmics);

function advancePlayback(timestamp) {
  if (!playing) return;
  if (!previousFrameTime) previousFrameTime = timestamp;
  const elapsed = timestamp - previousFrameTime;
  previousFrameTime = timestamp;
  currentTime = Math.min(1, currentTime + elapsed / 10000);
  if (timestamp - previousPlaybackRenderTime >= 1000 / 30 || currentTime >= 1) {
    previousPlaybackRenderTime = timestamp;
    renderDynamicState();
  }
  if (currentTime >= 1) {
    playing = false;
    ui.setPlayback(false);
    return;
  }
  playbackFrame = requestAnimationFrame(advancePlayback);
}

window.addEventListener("pagehide", () => {
  if (playing) cancelAnimationFrame(playbackFrame);
  viewer.dispose();
});

updateScenarioModel();
