export const GRAVITY_OPTIONS = [
  { value: "ground_1g", label: "Ground 1g", shortLabel: "Ground 1g" },
  { value: "flight_ug", label: "ISS microgravity", shortLabel: "ISS µg" },
  { value: "flight_1g_ctrl", label: "ISS 1g centrifuge", shortLabel: "ISS 1g control" },
  { value: "sim_ug_rpm", label: "RPM", shortLabel: "RPM" },
  { value: "sim_ug_clinostat", label: "3D clinostat", shortLabel: "3D clinostat" }
];

export const TISSUE_OPTIONS = [
  { value: "generic", label: "Generic organoid", shortLabel: "Generic organoid" },
  { value: "neural", label: "Neural organoid", shortLabel: "Neural organoid" },
  { value: "cardiac", label: "Cardiac organoid", shortLabel: "Cardiac organoid" },
  { value: "crc_tumor_organoid", label: "Colorectal tumour organoid", shortLabel: "CRC tumour organoid" },
  { value: "cancer_cellline_spheroid", label: "Cancer cell-line spheroid", shortLabel: "Cancer cell-line spheroid" }
];

export const MORPHOLOGY_OPTIONS = [
  { value: "solid", label: "Solid", shortLabel: "Solid" },
  { value: "cyst", label: "Cyst", shortLabel: "Cyst" }
];

export const CELL_STATE_KEYS = ["proliferating", "quiescent", "apoptotic", "necrotic"];

const PROGRAM_DEFAULTS = {
  generic: { proliferation: 0.05, apoptosis: 0.01, anti_apoptosis: 0.02, hypoxia: 0.04, glycolysis: 0.06, adhesion: 0.02, oxphos: 0.02, apoptosis_balance: -0.01 },
  neural: { proliferation: -0.3, apoptosis: -0.15, anti_apoptosis: -0.12, hypoxia: 0.18, glycolysis: 0.36, adhesion: -0.08, oxphos: -0.24, apoptosis_balance: -0.03 },
  cardiac: { proliferation: 0.24, apoptosis: -0.08, anti_apoptosis: 0.08, hypoxia: 0.09, glycolysis: 0.1, adhesion: 0.08, oxphos: 0.14, apoptosis_balance: -0.16 },
  crc_tumor_organoid: { proliferation: 0.2, apoptosis: 0.04, anti_apoptosis: 0.08, hypoxia: 0.16, glycolysis: 0.12, adhesion: 0.2, oxphos: 0.02, apoptosis_balance: -0.04 },
  cancer_cellline_spheroid: { proliferation: -0.2, apoptosis: 0.22, anti_apoptosis: -0.12, hypoxia: 0.28, glycolysis: 0.3, adhesion: -0.04, oxphos: -0.16, apoptosis_balance: 0.34 }
};

export const MOLECULAR_PROGRAMS = Object.keys(PROGRAM_DEFAULTS.generic);

const GRAVITY_PROFILES = {
  ground_1g: { residualG: 1.0, boundaryLayerUm: 60, sedimented: true, shearMPa: 0, radiationPerDay: 0, isMicrogravity: false, mixing: 0.32, responseScale: 0 },
  flight_1g_ctrl: { residualG: 1.0, boundaryLayerUm: 60, sedimented: true, shearMPa: 0, radiationPerDay: 0.3, isMicrogravity: false, mixing: 0.34, responseScale: 0.06 },
  flight_ug: { residualG: 1e-4, boundaryLayerUm: 240, sedimented: false, shearMPa: 0, radiationPerDay: 0.3, isMicrogravity: true, mixing: 0.08, responseScale: 1 },
  sim_ug_rpm: { residualG: 1e-3, boundaryLayerUm: 30, sedimented: false, shearMPa: 10, radiationPerDay: 0, isMicrogravity: true, mixing: 0.82, responseScale: 0.62 },
  sim_ug_clinostat: { residualG: 1e-3, boundaryLayerUm: 40, sedimented: false, shearMPa: 10, radiationPerDay: 0, isMicrogravity: true, mixing: 0.76, responseScale: 0.78 }
};

const TISSUE_PROFILES = {
  generic: { ugProlifMult: 1.0, ugApopMult: 1.0, solidEffectFrac: 1.0, demandO2: 1, demandGlucose: 1, adhesionBase: 0.72, growthBias: 1.02 },
  neural: { ugProlifMult: 0.9109, ugApopMult: 1.0, solidEffectFrac: 1.0, demandO2: 1.05, demandGlucose: 1.1, adhesionBase: 0.67, growthBias: 0.88 },
  cardiac: { ugProlifMult: 1.3, ugApopMult: 1.0, solidEffectFrac: 1.0, demandO2: 1.12, demandGlucose: 1.02, adhesionBase: 0.75, growthBias: 1.33 },
  crc_tumor_organoid: { ugProlifMult: 1.07, ugApopMult: 1.0, solidEffectFrac: 0.15, demandO2: 1.22, demandGlucose: 1.18, adhesionBase: 0.7, growthBias: 1.16 },
  cancer_cellline_spheroid: { ugProlifMult: 0.85, ugApopMult: 1.5, solidEffectFrac: 1.0, demandO2: 1.28, demandGlucose: 1.26, adhesionBase: 0.62, growthBias: 0.84 }
};

const MORPH_PROFILES = {
  solid: { shellBias: 1, lumenTarget: 0, lumenRise: 0, compactnessShift: 0.08, anisotropy: 0.1 },
  cyst: { shellBias: 0.78, lumenTarget: 0.55, lumenRise: 0.06, compactnessShift: -0.08, anisotropy: 0.06 }
};

const FIELD_CONSTANTS = {
  D_o2: 7.2e6,
  D_glc: 2.0e6,
  k_o2: 1600,
  k_glc: 250,
  cycleDays: 22 / 24,
  o2ProlifSat: 0.6,
  o2Hypoxic: 0.25,
  o2Necrotic: 0.08,
  glcMin: 0.15,
  baseApoptosis: 0.0015 * 24,
  necrosisRate: 0.08 * 24,
  anoikisRate: 0.05 * 24,
  clearApoptoticRate: 24 / 8,
  voxelSizeUm: 24,
  gridSide: 40,
  maxSimulationAgents: 3500
};

const INITIAL_COUNTS = { proliferating: 88, quiescent: 35, apoptotic: 5, necrotic: 2 };
const INITIAL_BIOLOGICAL_CELLS = 130;
const SAMPLE_COUNT = 71;
const DAY_MAX = 7;
const DT = DAY_MAX / (SAMPLE_COUNT - 1);
const CLAMP = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeFractions = (values) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  return values.map((value) => value / total);
};
const isMicrogravity = (gravity) => gravity === "flight_ug" || gravity === "sim_ug_rpm" || gravity === "sim_ug_clinostat";

function evidenceFor(gravity, tissue, repositoryOmics) {
  const exact = repositoryOmics?.[tissue]?.[gravity];
  if (exact) {
    return {
      scores: Object.fromEntries(MOLECULAR_PROGRAMS.map((name) => [name, exact.programs[name]?.delta ?? 0])),
      metadata: {
        sourceType: "measured",
        sourceFile: exact.sourceFile,
        contrast: exact.contrast,
        detail: exact.detail,
        programs: exact.programs
      }
    };
  }
  if (gravity === "ground_1g") {
    return {
      scores: Object.fromEntries(MOLECULAR_PROGRAMS.map((name) => [name, 0])),
      metadata: {
        sourceType: "repo-derived",
        contrast: "Ground 1g reference",
        detail: "Ground reference baseline from matched-condition definition.",
        programs: {}
      }
    };
  }
  const nearby = repositoryOmics?.[tissue] && Object.values(repositoryOmics[tissue])[0];
  if (nearby && isMicrogravity(gravity)) {
    const sourceGravity = nearby.contrast.includes("sim_ug_clinostat") ? "sim_ug_clinostat" : "flight_ug";
    const scale = GRAVITY_PROFILES[gravity].responseScale / Math.max(0.05, GRAVITY_PROFILES[sourceGravity].responseScale);
    return {
      scores: Object.fromEntries(MOLECULAR_PROGRAMS.map((name) => [name, (nearby.programs[name]?.delta ?? 0) * scale])),
      metadata: {
        sourceType: "repo-derived",
        sourceFile: nearby.sourceFile,
        contrast: `${gravity} analogue`,
        detail: `Scaled from ${nearby.contrast}; this condition has no direct paired omics table.`,
        programs: {}
      }
    };
  }
  const defaults = PROGRAM_DEFAULTS[tissue];
  const scale = GRAVITY_PROFILES[gravity].responseScale;
  return {
    scores: Object.fromEntries(MOLECULAR_PROGRAMS.map((name) => [name, defaults[name] * scale])),
    metadata: {
      sourceType: "model",
      contrast: `${gravity} vs matched 1g`,
      detail: "Reduced-order model prior from tissue-level directional evidence.",
      programs: {}
    }
  };
}

function biologicalToRenderedParticles(biologicalCells) {
  const ratio = Math.log10(Math.max(biologicalCells, INITIAL_BIOLOGICAL_CELLS) / INITIAL_BIOLOGICAL_CELLS)
    / Math.log10(40000 / INITIAL_BIOLOGICAL_CELLS);
  return Math.round(CLAMP(130 + 870 * ratio, 130, 1000));
}

function biologicalToSimulationAgents(biologicalCells) {
  return Math.round(CLAMP(biologicalCells / 7.5, 110, FIELD_CONSTANTS.maxSimulationAgents));
}

function tissueMicrogravityMultiplier(gravity, tissue, morphology, perturbations) {
  const profile = TISSUE_PROFILES[tissue];
  const gravityProfile = GRAVITY_PROFILES[gravity];
  if (!gravityProfile.isMicrogravity) return 1;
  const raw = profile.ugProlifMult;
  const solidFraction = morphology === "solid" ? profile.solidEffectFrac : 1;
  return 1 + (raw - 1) * solidFraction * (perturbations.ugProliferation ?? 1);
}

function buildGeometry(morphology, counts, adhesionShift, progression, perturbations) {
  const morph = MORPH_PROFILES[morphology];
  const biologicalCells = Math.max(1, counts.proliferating + counts.quiescent + counts.apoptotic + counts.necrotic);
  const packingFraction = CLAMP(0.70 + adhesionShift * 0.05 + (morphology === "cyst" ? 0.015 : 0), 0.64, 0.78);
  const cellVolumeUm3 = (4 / 3) * Math.PI * 12 ** 3;
  const tissueVolume = (biologicalCells * cellVolumeUm3) / Math.max(0.12, packingFraction);
  let lumenFraction = 0;
  let outerRadiusUm = Math.cbrt((3 * tissueVolume) / (4 * Math.PI));
  if (morphology === "cyst") {
    const lumenPressure = perturbations.lumenPressure ?? 1;
    lumenFraction = CLAMP(morph.lumenTarget + progression * morph.lumenRise * Math.sqrt(lumenPressure), 0.42, 0.68);
    const outerVolume = tissueVolume / Math.max(0.12, 1 - lumenFraction);
    outerRadiusUm = Math.cbrt((3 * outerVolume) / (4 * Math.PI));
  }
  const lumenRadiusUm = morphology === "cyst" ? outerRadiusUm * Math.cbrt(lumenFraction) : 0;
  const shellThicknessUm = morphology === "cyst" ? outerRadiusUm - lumenRadiusUm : outerRadiusUm;
  const anisotropy = CLAMP(morph.anisotropy + (1 - packingFraction) * 0.12, 0.03, 0.24);
  return {
    morphology,
    radiusUm: outerRadiusUm,
    lumenRadiusUm,
    shellThicknessUm,
    lumenFraction,
    compactness: CLAMP(0.7 + adhesionShift * 0.1 + morph.compactnessShift, 0.34, 0.95),
    anisotropy,
    packingFraction,
    representativeCellDiameterUm: 24,
    necroticCoreRadiusUm: 0
  };
}

function concentrationFactors(value, low, high) {
  return CLAMP((value - low) / Math.max(1e-5, high - low), 0, 1);
}

function buildRadialProfile(transport) {
  const profile = [];
  for (let i = 0; i <= 48; i += 1) {
    const x = i / 48;
    let o2;
    let glc;
    if (x < 0.55) {
      const inner = x / 0.55;
      o2 = transport.coreO2 + (transport.surfaceO2 - transport.coreO2) * (inner ** 1.35);
      glc = transport.coreGlucose + (transport.surfaceGlucose - transport.coreGlucose) * (inner ** 1.3);
    } else if (x < 0.8) {
      const shell = (x - 0.55) / 0.25;
      o2 = transport.surfaceO2 + (transport.bulkO2 - transport.surfaceO2) * (shell ** 0.82);
      glc = transport.surfaceGlucose + (transport.bulkGlucose - transport.surfaceGlucose) * (shell ** 0.86);
    } else {
      o2 = transport.bulkO2;
      glc = transport.bulkGlucose;
    }
    profile.push({ position: x, oxygen: CLAMP(o2, 0, 1), glucose: CLAMP(glc, 0, 1) });
  }
  return profile;
}

function computeTransport(gravity, tissue, geometry, counts, day, perturbations) {
  const gravityProfile = GRAVITY_PROFILES[gravity];
  const tissueProfile = TISSUE_PROFILES[tissue];
  const demandScale = tissueProfile.demandO2 * Math.sqrt((counts.proliferating + counts.quiescent) / INITIAL_BIOLOGICAL_CELLS);
  const uptakeO2 = FIELD_CONSTANTS.k_o2 * demandScale * (perturbations.oxygenUptake ?? 1) * 0.2;
  const uptakeGlucose = FIELD_CONSTANTS.k_glc * tissueProfile.demandGlucose * (perturbations.glucoseUptake ?? 1) * 0.24
    * Math.sqrt((counts.proliferating + counts.quiescent) / INITIAL_BIOLOGICAL_CELLS);
  const boundaryLayerUm = gravityProfile.boundaryLayerUm * (perturbations.boundaryLayer ?? 1);
  const o2PenetrationUm = Math.sqrt(FIELD_CONSTANTS.D_o2 * (perturbations.oxygenDiffusivity ?? 1) / Math.max(80, uptakeO2));
  const glucosePenetrationUm = Math.sqrt(FIELD_CONSTANTS.D_glc * (perturbations.oxygenDiffusivity ?? 1) / Math.max(30, uptakeGlucose));
  const transportBarrierRatio = boundaryLayerUm / Math.max(1, geometry.radiusUm);
  const phiO2 = geometry.radiusUm / Math.max(1, o2PenetrationUm);
  const load = CLAMP(phiO2 * 0.22 + transportBarrierRatio * 0.3 + (1 - gravityProfile.mixing) * 0.22, 0, 2.2);
  const hardwareDraw = perturbations.mediumOxygenDraw ?? 1;
  const bulkO2 = CLAMP(1 - day * 0.004 * load * hardwareDraw * (gravityProfile.isMicrogravity ? 1.2 : 0.75), 0.72, 1);
  const bulkGlucose = CLAMP(1 - day * 0.005 * load * (perturbations.glucoseDraw ?? 1) * (gravityProfile.isMicrogravity ? 1.1 : 0.85), 0.68, 1);
  const depletion = CLAMP(load * 0.16 * (1 - gravityProfile.mixing * 0.15), 0.02, 0.5);
  const surfaceO2 = CLAMP(bulkO2 - depletion * (boundaryLayerUm / Math.max(boundaryLayerUm + geometry.radiusUm, 1)), 0.06, 1);
  const surfaceGlucose = CLAMP(bulkGlucose - depletion * 0.84 * (boundaryLayerUm / Math.max(boundaryLayerUm + geometry.radiusUm, 1)), 0.05, 1);
  const effectiveCorePath = geometry.morphology === "cyst" ? geometry.shellThicknessUm * 0.95 : geometry.radiusUm;
  const coreO2 = CLAMP(surfaceO2 * Math.exp(-effectiveCorePath / Math.max(8, o2PenetrationUm)), 0.03, 1);
  const coreGlucose = CLAMP(surfaceGlucose * Math.exp(-effectiveCorePath / Math.max(8, glucosePenetrationUm)), 0.03, 1);
  const meanO2 = CLAMP(0.5 * (surfaceO2 + coreO2), 0.04, 1);
  const meanGlucose = CLAMP(0.5 * (surfaceGlucose + coreGlucose), 0.04, 1);
  const hypoxicFraction = CLAMP(
    0.42 * concentrationFactors(FIELD_CONSTANTS.o2Hypoxic - coreO2, 0, 0.24)
    + 0.28 * concentrationFactors(FIELD_CONSTANTS.o2Hypoxic - meanO2, 0, 0.22)
    + (geometry.morphology === "solid" ? 0.04 : 0.015),
    0,
    0.92
  );
  const severeStress = concentrationFactors(FIELD_CONSTANTS.o2Necrotic - coreO2, 0, 0.08);
  return {
    boundaryLayerUm,
    transportBarrierRatio,
    o2PenetrationUm,
    bulkO2,
    surfaceO2,
    meanO2,
    coreO2,
    bulkGlucose,
    surfaceGlucose,
    meanGlucose,
    coreGlucose,
    hypoxicFraction,
    severeStress,
    sedimented: gravityProfile.sedimented,
    shearMPa: gravityProfile.shearMPa,
    residualG: gravityProfile.residualG,
    radiationPerDay: gravityProfile.radiationPerDay,
    mixingIndex: gravityProfile.mixing,
    deltaO2: CLAMP(bulkO2 - surfaceO2, 0, 1),
    voxelSizeUm: FIELD_CONSTANTS.voxelSizeUm,
    gridSide: FIELD_CONSTANTS.gridSide,
    phiO2
  };
}

function stepCounts(gravity, tissue, morphology, counts, transport, perturbations) {
  const tissueProfile = TISSUE_PROFILES[tissue];
  const hypoxicThreshold = FIELD_CONSTANTS.o2Hypoxic * (perturbations.hypoxicThreshold ?? 1);
  const fO2 = concentrationFactors(transport.meanO2, hypoxicThreshold, FIELD_CONSTANTS.o2ProlifSat);
  const fGlucose = concentrationFactors(transport.coreGlucose, FIELD_CONSTANTS.glcMin, 0.45);
  const ugProlif = tissueMicrogravityMultiplier(gravity, tissue, morphology, perturbations);
  const growthBias = TISSUE_PROFILES[tissue].growthBias * (morphology === "cyst" ? 1.08 : 1);
  const effectiveCycle = FIELD_CONSTANTS.cycleDays / (perturbations.cycleRate ?? 1);
  const divisionRate = (Math.log(2) / effectiveCycle) * ugProlif * growthBias * fO2 * fGlucose;
  const pToQ = CLAMP((1 - fO2) * 0.25 + (1 - fGlucose) * 0.2 + transport.severeStress * 0.12, 0, 0.8);
  const qToP = CLAMP((fO2 * fGlucose) * 0.22 * (ugProlif > 1 ? 1.1 : 0.92), 0, 0.44);
  const stressHazard = FIELD_CONSTANTS.baseApoptosis
    * tissueProfile.ugApopMult
    * (1 + transport.hypoxicFraction * 1.8 + transport.severeStress * 2.8);
  const anoikis = morphology === "cyst" ? FIELD_CONSTANTS.anoikisRate * CLAMP(0.28 - transport.coreO2, 0, 0.28) : 0;
  const apoptosisHazard = stressHazard + anoikis;
  const necrosisHazard = FIELD_CONSTANTS.necrosisRate * concentrationFactors(FIELD_CONSTANTS.o2Necrotic - transport.coreO2, 0, 0.08);
  const p = counts.proliferating;
  const q = counts.quiescent;
  const a = counts.apoptotic;
  const n = counts.necrotic;
  const dP = (divisionRate * p + qToP * q - pToQ * p - apoptosisHazard * p - necrosisHazard * p) * DT;
  const dQ = (pToQ * p - qToP * q - apoptosisHazard * 0.9 * q - necrosisHazard * 0.8 * q) * DT;
  const dA = (apoptosisHazard * (p + 0.9 * q) - FIELD_CONSTANTS.clearApoptoticRate * a) * DT;
  const dN = (necrosisHazard * (p + 0.8 * q) + 0.25 * FIELD_CONSTANTS.clearApoptoticRate * a) * DT;
  return {
    proliferating: Math.max(0, p + dP),
    quiescent: Math.max(0, q + dQ),
    apoptotic: Math.max(0, a + dA),
    necrotic: Math.max(0, n + dN)
  };
}

function buildState(gravity, tissue, morphology, timeIndex, counts, evidence, perturbations) {
  const day = timeIndex * DT;
  const progression = day / DAY_MAX;
  const adhesionShift = CLAMP((evidence.scores.adhesion || 0) * 0.25 + (perturbations.adhesionCompactness ?? 1) - 1, -0.42, 0.42);
  const geometry = buildGeometry(morphology, counts, adhesionShift, progression, perturbations);
  const transport = computeTransport(gravity, tissue, geometry, counts, day, perturbations);
  if (morphology === "solid") {
    geometry.necroticCoreRadiusUm = geometry.radiusUm * Math.sqrt(CLAMP(transport.severeStress, 0, 0.92));
  } else {
    geometry.necroticCoreRadiusUm = 0;
  }
  const biologicalCells = Math.max(1, counts.proliferating + counts.quiescent + counts.apoptotic + counts.necrotic);
  const fractions = normalizeFractions([counts.proliferating, counts.quiescent, counts.apoptotic, counts.necrotic]);
  const renderedParticles = biologicalToRenderedParticles(biologicalCells);
  const simulationAgents = biologicalToSimulationAgents(biologicalCells);
  const profile = buildRadialProfile(transport);
  return {
    tissue,
    time: { normalized: progression, day, stepDays: DT },
    population: {
      biologicalCells,
      initialBiologicalCells: INITIAL_BIOLOGICAL_CELLS,
      renderedParticles,
      simulationAgents,
      proliferatingCount: counts.proliferating,
      quiescentCount: counts.quiescent,
      apoptoticCount: counts.apoptotic,
      necroticCount: counts.necrotic
    },
    geometry,
    transport: { ...transport, radialProfile: profile },
    cellState: {
      proliferating: fractions[0],
      quiescent: fractions[1],
      apoptotic: fractions[2],
      necrotic: fractions[3]
    },
    phenotype: {
      growthFromDay0: biologicalCells / INITIAL_BIOLOGICAL_CELLS,
      viableCellVolumeFromDay0: (counts.proliferating + counts.quiescent) / (INITIAL_COUNTS.proliferating + INITIAL_COUNTS.quiescent),
      gravityEffectVs1g: 1
    },
    molecularEvidence: { ...evidence.scores },
    molecularEvidenceMetadata: evidence.metadata,
    provenance: {
      sourceType: "model",
      transport: "model",
      geometry: "model",
      molecularEvidence: evidence.metadata.sourceType,
      assumptions: {
        packingFraction: "illustrative dense-tissue target range 0.64–0.78",
        lumenNutrientBoundary: "illustrative",
        renderedParticleCompression: "illustrative representative glyphs",
        cellGeometry: "deterministic visual packing abstraction"
      }
    },
    sourceType: "model"
  };
}

export function createIllustrativeTrajectory(gravity, tissue, morphology, options = {}) {
  if (!GRAVITY_PROFILES[gravity] || !TISSUE_PROFILES[tissue] || !MORPH_PROFILES[morphology]) {
    throw new RangeError("Unsupported gravity, tissue, or morphology condition.");
  }
  const repositoryOmics = options.repositoryOmics || {};
  const evidence = evidenceFor(gravity, tissue, repositoryOmics);
  const perturbations = options.perturbations || {};
  const trajectory = [];
  let counts = { ...INITIAL_COUNTS };
  for (let step = 0; step < SAMPLE_COUNT; step += 1) {
    const state = buildState(gravity, tissue, morphology, step, counts, evidence, perturbations);
    trajectory.push(state);
    if (step < SAMPLE_COUNT - 1) {
      counts = stepCounts(gravity, tissue, morphology, counts, state.transport, perturbations);
    }
  }
  return trajectory;
}

function interpolateValue(left, right, amount) {
  if (typeof left === "number" && typeof right === "number") return left + (right - left) * amount;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.map((value, index) => interpolateValue(value, right[index], amount));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    return Object.fromEntries(Object.keys(left).map((key) => [key, interpolateValue(left[key], right[key], amount)]));
  }
  return left;
}

export function getScenarioState(trajectory, normalizedTime) {
  if (!Array.isArray(trajectory) || trajectory.length < 2) {
    throw new TypeError("A scenario trajectory must contain at least two samples.");
  }
  const t = CLAMP(Number(normalizedTime), 0, 1);
  const position = t * (trajectory.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(trajectory.length - 1, lowerIndex + 1);
  const state = interpolateValue(trajectory[lowerIndex], trajectory[upperIndex], position - lowerIndex);
  state.time.normalized = t;
  state.time.day = t * DAY_MAX;
  state.population.biologicalCells = Math.round(state.population.biologicalCells);
  state.population.renderedParticles = Math.round(state.population.renderedParticles);
  state.population.simulationAgents = Math.round(state.population.simulationAgents);
  return state;
}

export function computeIllustrativeSensitivity(gravity, tissue, morphology, repositoryOmics) {
  const baseline = createIllustrativeTrajectory(gravity, tissue, morphology, { repositoryOmics }).at(-1).phenotype.viableCellVolumeFromDay0;
  const parameters = [
    ["Tissue µg proliferation", "ugProliferation"],
    ["Cycle / doubling time", "cycleRate"],
    ["Boundary layer", "boundaryLayer"],
    ["O₂ diffusivity", "oxygenDiffusivity"],
    ["O₂ uptake", "oxygenUptake"],
    ["Glucose uptake", "glucoseUptake"],
    ["O₂ hypoxic threshold", "hypoxicThreshold"],
    ["Adhesion / compactness", "adhesionCompactness"],
    ["Lumen pressure (cyst)", "lumenPressure"]
  ];
  const results = parameters.map(([label, key]) => {
    const lowFactor = 0.5;
    const highFactor = 1.5;
    const low = createIllustrativeTrajectory(gravity, tissue, morphology, {
      repositoryOmics,
      perturbations: { [key]: lowFactor }
    }).at(-1).phenotype.viableCellVolumeFromDay0;
    const high = createIllustrativeTrajectory(gravity, tissue, morphology, {
      repositoryOmics,
      perturbations: { [key]: highFactor }
    }).at(-1).phenotype.viableCellVolumeFromDay0;
    return { label, low: Math.log(Math.max(1e-6, low / baseline)), high: Math.log(Math.max(1e-6, high / baseline)) };
  });
  return { baseline: 0, parameters: results, sourceType: "model" };
}
