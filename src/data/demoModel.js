// DEMONSTRATION COEFFICIENTS - NOT SCIENTIFIC PREDICTIONS.
// This deterministic model is only for the interactive public demo. It mirrors
// broad ORBIO concepts (transport, tissue tendency, drug mechanism, uncertainty)
// but does not call the trained ORBIO model and must not be interpreted as AI.

export const STATE_COLORS = {
  proliferating: "#0f79c8",
  quiescent: "#19a28b",
  apoptotic: "#d36d5d",
  necrotic: "#7b6b62"
};

export const OPTIONS = {
  environment: [
    { value: "ground_1g", label: "Ground 1g" },
    { value: "flight_ug", label: "ISS microgravity" },
    { value: "sim_ug_rpm", label: "RPM" },
    { value: "sim_ug_clinostat", label: "Clinostat" }
  ],
  tissue: [
    { value: "generic", label: "Generic" },
    { value: "neural", label: "Neural" },
    { value: "cardiac", label: "Cardiac" },
    { value: "crc_tumor_organoid", label: "CRC tumour organoid" },
    { value: "cancer_cellline_spheroid", label: "Cancer spheroid" }
  ],
  morphology: [
    { value: "solid", label: "Solid" },
    { value: "cyst", label: "Cyst" }
  ],
  drug: [
    { value: "none", label: "None" },
    { value: "DrugA_cytotoxic", label: "A - cytotoxic" },
    { value: "DrugB_cytostatic", label: "B - cytostatic" },
    { value: "DrugC_hypoxia_act", label: "C - hypoxia activated" },
    { value: "DrugD_cytotoxic_lowpen", label: "D - poor penetration cytotoxic" }
  ],
  schedule: [
    { value: "continuous", label: "Continuous" },
    { value: "pulse24", label: "24 h pulse" }
  ],
  hardware: [
    { value: "lab_incubator", label: "Lab incubator" },
    { value: "flight_cubelab_72h", label: "Flight bioreactor" },
    { value: "flight_exchange_failure", label: "Exchange failure" }
  ]
};

const ENVIRONMENT = {
  ground_1g: { transport: 1.0, stress: 0.03, uncertainty: 0.06, growth: 1.0 },
  flight_ug: { transport: 0.68, stress: 0.13, uncertainty: 0.18, growth: 0.96 },
  sim_ug_rpm: { transport: 1.12, stress: 0.08, uncertainty: 0.12, growth: 1.02 },
  sim_ug_clinostat: { transport: 1.04, stress: 0.07, uncertainty: 0.12, growth: 1.01 }
};

const TISSUE = {
  generic: { growth: 1.0, hypoxia: 0.0, ugGrowth: 1.0 },
  neural: { growth: 0.78, hypoxia: -0.02, ugGrowth: 0.91 },
  cardiac: { growth: 1.08, hypoxia: 0.01, ugGrowth: 1.16 },
  crc_tumor_organoid: { growth: 1.22, hypoxia: 0.07, ugGrowth: 1.07 },
  cancer_cellline_spheroid: { growth: 1.08, hypoxia: 0.1, ugGrowth: 0.86 }
};

const DRUG = {
  none: { kill: 0, arrest: 0, penetration: 1.0, hypoxiaBonus: 0 },
  DrugA_cytotoxic: { kill: 0.54, arrest: 0.08, penetration: 0.92, hypoxiaBonus: 0 },
  DrugB_cytostatic: { kill: 0.08, arrest: 0.58, penetration: 1.0, hypoxiaBonus: 0 },
  DrugC_hypoxia_act: { kill: 0.2, arrest: 0.04, penetration: 1.05, hypoxiaBonus: 0.72 },
  DrugD_cytotoxic_lowpen: { kill: 0.62, arrest: 0.05, penetration: 0.52, hypoxiaBonus: -0.08 }
};

const HARDWARE = {
  lab_incubator: { stress: 0, transport: 1, uncertainty: 0 },
  flight_cubelab_72h: { stress: 0.04, transport: 0.9, uncertainty: 0.04 },
  flight_exchange_failure: { stress: 0.18, transport: 0.66, uncertainty: 0.12 }
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value, digits = 2) => Number(value.toFixed(digits));

export function computeDemo(input) {
  const env = ENVIRONMENT[input.environment] || ENVIRONMENT.ground_1g;
  const tissue = TISSUE[input.tissue] || TISSUE.generic;
  const drug = DRUG[input.drug] || DRUG.none;
  const hardware = HARDWARE[input.hardware] || HARDWARE.lab_incubator;
  const dose = clamp(Number(input.dose) || 0, 0, 1.5);
  const isMicro = input.environment !== "ground_1g";
  const cystPenalty = input.morphology === "cyst" ? -0.04 : 0.04;
  const pulseFactor = input.schedule === "pulse24" ? 0.58 : 1.0;

  const transport = clamp(env.transport * hardware.transport + cystPenalty, 0.35, 1.25);
  const hypoxia = clamp(
    0.13 + tissue.hypoxia + hardware.stress + env.stress + (1 - transport) * 0.3,
    0.03,
    0.68
  );
  const tissueMicroGrowth = isMicro ? tissue.ugGrowth : 1.0;
  const baseGrowth = 1.04 * env.growth * tissue.growth * tissueMicroGrowth;
  const penetration = clamp(drug.penetration - hypoxia * (input.drug === "DrugD_cytotoxic_lowpen" ? 0.55 : 0.08), 0.25, 1.1);
  const drugEffect = dose * pulseFactor * penetration;
  const hypoxiaBoost = dose * drug.hypoxiaBonus * hypoxia;
  const kill = clamp(drug.kill * drugEffect + hypoxiaBoost + hardware.stress * 0.45, 0, 0.95);
  const arrest = clamp(drug.arrest * drugEffect + hypoxia * 0.34 + (1 - transport) * 0.16, 0, 0.88);
  const net = baseGrowth - kill * 0.9 - arrest * 0.45 - hypoxia * 0.22;
  const foldChange = clamp(Math.exp((net - 0.72) * 1.18), 0.18, 3.85);

  let predictedClass = "GROWS";
  if (foldChange < 0.78) predictedClass = "REGRESSES";
  else if (foldChange < 1.28) predictedClass = "ARRESTED";

  const apoptotic = clamp(0.05 + kill * 0.42 + dose * 0.04, 0.02, 0.64);
  const necrotic = clamp(0.03 + hypoxia * 0.32 + hardware.stress * 0.16, 0.01, 0.34);
  const quiescent = clamp(0.15 + arrest * 0.52 + hypoxia * 0.2, 0.08, 0.7);
  let proliferating = clamp(1 - apoptotic - necrotic - quiescent, 0.04, 0.82);
  const total = proliferating + quiescent + apoptotic + necrotic;

  const uncertainty = clamp(
    env.uncertainty + hardware.uncertainty + dose * 0.05 + (input.drug === "none" ? -0.03 : 0.02),
    0.05,
    0.42
  );

  return {
    predictedClass,
    foldChange: round(foldChange, 2),
    hypoxicFraction: round(hypoxia, 2),
    transport: round(transport, 2),
    uncertainty: round(uncertainty, 2),
    composition: {
      proliferating: round(proliferating / total, 3),
      quiescent: round(quiescent / total, 3),
      apoptotic: round(apoptotic / total, 3),
      necrotic: round(necrotic / total, 3)
    }
  };
}
