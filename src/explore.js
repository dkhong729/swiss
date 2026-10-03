import { OPTIONS, STATE_COLORS, computeDemo } from "./data/demoModel.js";

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
let currentResult = null;
let targetResult = null;
let cells = [];
let animationFrame = null;

function setupNav() {
  const nav = document.querySelector("[data-nav]");
  const progress = document.querySelector("[data-progress]");
  const update = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    nav?.classList.toggle("scrolled", scrollTop > 12);
    if (progress) progress.style.width = `${max > 0 ? (scrollTop / max) * 100 : 0}%`;
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function setupReveal() {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("in-view"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("in-view");
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.12 }
  );
  targets.forEach((target) => observer.observe(target));
}

function addOptionButtons(group, defaultValue) {
  const mount = document.querySelector(`[data-options="${group}"]`);
  if (!mount) return;
  mount.innerHTML = "";
  OPTIONS[group].forEach((option) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = group;
    input.value = option.value;
    input.checked = option.value === defaultValue;
    const span = document.createElement("span");
    span.textContent = option.label;
    label.append(input, span);
    mount.append(label);
  });
}

function addSelect(name, defaultValue) {
  const select = document.querySelector(`select[name="${name}"]`);
  if (!select) return;
  select.innerHTML = "";
  OPTIONS[name].forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    item.selected = option.value === defaultValue;
    select.append(item);
  });
}

function setupControls() {
  addOptionButtons("environment", "flight_ug");
  addOptionButtons("morphology", "cyst");
  addOptionButtons("schedule", "continuous");
  addSelect("tissue", "crc_tumor_organoid");
  addSelect("drug", "DrugA_cytotoxic");
  addSelect("hardware", "flight_cubelab_72h");

  const form = document.getElementById("demoForm");
  const dose = form?.elements.namedItem("dose");
  const doseReadout = document.querySelector("[data-dose-readout]");
  const update = () => {
    if (doseReadout && dose) doseReadout.textContent = Number(dose.value).toFixed(2);
    updateDemo();
  };
  form?.addEventListener("input", update);
  form?.addEventListener("change", update);
  update();
}

function getInput() {
  const form = document.getElementById("demoForm");
  const data = new FormData(form);
  return {
    environment: data.get("environment") || "flight_ug",
    tissue: data.get("tissue") || "crc_tumor_organoid",
    morphology: data.get("morphology") || "cyst",
    drug: data.get("drug") || "DrugA_cytotoxic",
    dose: Number(data.get("dose") || 0),
    schedule: data.get("schedule") || "continuous",
    hardware: data.get("hardware") || "flight_cubelab_72h"
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function seedCells() {
  const count = 178;
  cells = Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963 + (index % 7) * 0.04;
    const radius = Math.sqrt((index + 0.5) / count);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.82,
      drift: 0.7 + ((index * 17) % 31) / 80,
      phase: (index * 43) % 360,
      state: "proliferating"
    };
  });
}

function assignStates(result) {
  const entries = Object.entries(result.composition);
  const expanded = [];
  entries.forEach(([state, fraction]) => {
    const n = Math.max(1, Math.round(fraction * cells.length));
    for (let i = 0; i < n; i += 1) expanded.push(state);
  });
  while (expanded.length < cells.length) expanded.push("quiescent");
  cells.forEach((cell, index) => {
    cell.state = expanded[index % expanded.length];
  });
}

function drawCanvas(result) {
  const canvas = document.getElementById("demoCanvas");
  if (!canvas || !result) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const scale = Math.min(width, height) * (0.32 + result.foldChange * 0.025);
  const hyp = result.hypoxicFraction;

  const field = ctx.createRadialGradient(cx, cy, scale * 0.2, cx, cy, scale * (1.25 + hyp));
  field.addColorStop(0, `rgba(211, 109, 93, ${0.08 + hyp * 0.28})`);
  field.addColorStop(0.5, "rgba(128, 212, 208, 0.14)");
  field.addColorStop(1, "rgba(251, 250, 246, 0)");
  ctx.fillStyle = field;
  ctx.beginPath();
  ctx.ellipse(cx, cy, scale * (1.38 + hyp * 0.6), scale * (1.02 + hyp * 0.42), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(213, 154, 49, 0.34)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, scale * (1.02 + hyp * 0.46), scale * (0.76 + hyp * 0.26), 0, 0, Math.PI * 2);
  ctx.stroke();

  const now = performance.now() / 1000;
  cells.forEach((cell, index) => {
    const motion = prefersReduced.matches ? 0 : Math.sin(now * cell.drift + cell.phase) * 3;
    const x = cx + cell.x * scale + motion;
    const y = cy + cell.y * scale + Math.cos(now * cell.drift + cell.phase) * 2;
    const radius = 6.5 + ((index * 5) % 5);
    ctx.beginPath();
    ctx.fillStyle = STATE_COLORS[cell.state] || STATE_COLORS.quiescent;
    ctx.strokeStyle = "rgba(16, 34, 53, 0.55)";
    ctx.lineWidth = 1;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.fillStyle = "rgba(16, 34, 53, 0.72)";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillText("schematic organoid state", 24, height - 28);
}

function updateComposition(result) {
  const mount = document.querySelector("[data-composition]");
  if (!mount) return;
  mount.innerHTML = "";
  Object.entries(result.composition).forEach(([state, value]) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = state;
    const track = document.createElement("span");
    track.className = "bar-track";
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${Math.round(value * 100)}%`;
    fill.style.background = STATE_COLORS[state];
    track.append(fill);
    const num = document.createElement("span");
    num.textContent = `${Math.round(value * 100)}%`;
    row.append(label, track, num);
    mount.append(row);
  });
}

function updateDemo() {
  const next = computeDemo(getInput());
  targetResult = next;
  if (!currentResult) currentResult = next;
  assignStates(next);

  document.querySelector("[data-predicted-class]").textContent = next.predictedClass;
  document.querySelector("[data-fold-change]").textContent = `${next.foldChange.toFixed(2)}x fold change`;
  document.querySelector("[data-hypoxic]").textContent = next.hypoxicFraction.toFixed(2);
  document.querySelector("[data-uncertainty]").textContent = next.uncertainty.toFixed(2);
  document.querySelector("[data-transport-score]").textContent = next.transport.toFixed(2);
  updateComposition(next);

  if (prefersReduced.matches) {
    currentResult = next;
    drawCanvas(currentResult);
  }
}

function animateCanvas() {
  if (targetResult && currentResult) {
    const t = prefersReduced.matches ? 1 : 0.08;
    currentResult = {
      ...targetResult,
      foldChange: lerp(currentResult.foldChange, targetResult.foldChange, t),
      hypoxicFraction: lerp(currentResult.hypoxicFraction, targetResult.hypoxicFraction, t),
      transport: lerp(currentResult.transport, targetResult.transport, t),
      uncertainty: lerp(currentResult.uncertainty, targetResult.uncertainty, t)
    };
    drawCanvas(currentResult);
  }
  if (!prefersReduced.matches) animationFrame = requestAnimationFrame(animateCanvas);
}

function fmtPct(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "not reported";
}

function fmtNum(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "not reported";
}

function addMetric(mount, label, value, sub = "") {
  const item = document.createElement("div");
  item.className = "metric";
  item.innerHTML = `<span>${label}</span><strong>${value}</strong>${sub ? `<span>${sub}</span>` : ""}`;
  mount.append(item);
}

function populateMetrics(data) {
  const mount = document.querySelector("[data-metrics]");
  if (!mount) return;
  const metrics = data.metrics || {};
  const random = metrics.random_split || {};
  const drug = metrics.heldout_drug?.growth_class || {};
  const gravity = metrics.heldout_gravity?.growth_class || {};
  mount.innerHTML = "";
  addMetric(mount, "Random split accuracy", fmtPct(random.accuracy_pct), `balanced ${fmtPct(random.balanced_accuracy_pct)}`);
  addMetric(mount, "Random split macro-F1", fmtNum(random.macro_f1), `ECE ${fmtNum(random.ece)}`);
  addMetric(mount, "Held-out drug accuracy", fmtPct(drug.accuracy_pct), `macro-F1 ${fmtNum(drug.macro_f1)}`);
  addMetric(mount, "Held-out flight accuracy", fmtPct(gravity.accuracy_pct), `balanced ${fmtPct(gravity.balanced_accuracy_pct)}`);
}

const PARAMETER_EXPLANATIONS = {
  "cycle_h (doubling time)": "Shorter cycling time increases proliferating-cell expansion in permissive regions.",
  "drug EC50": "Drug EC50 changes how much dose is needed before cytotoxic or cytostatic effects appear.",
  "D_o2 (O2 diffusivity)": "O2 diffusivity controls how quickly oxygen can refill depleted regions.",
  "k_o2 (O2 uptake)": "O2 uptake sets how strongly living cells draw down local oxygen.",
  "boundary layer (gravity-specific)": "The boundary layer approximates transport around the organoid and differs by gravity condition.",
  "o2_hypoxic threshold": "This threshold decides when oxygen becomes low enough to slow proliferation.",
  "tissue microgravity proliferation mult.": "The tissue-specific microgravity multiplier changes proliferation direction and strength.",
  "tissue ug proliferation mult.": "The tissue-specific microgravity multiplier changes proliferation direction and strength.",
  "medium O2 draw (hardware)": "Finite medium and hardware settings change bulk oxygen depletion."
};

function parameterExplanation(name) {
  const cleaned = name.replace("microgravity", "ug");
  return PARAMETER_EXPLANATIONS[name] || PARAMETER_EXPLANATIONS[cleaned] || "Current sensitivity parameter from the corrected run.";
}

function populateParameters(data) {
  const mount = document.querySelector("[data-parameters]");
  if (!mount) return;
  const sensitivity = data.metrics?.sensitivity?.flight_ug?.params || data.metrics?.sensitivity?.ground_1g?.params || {};
  mount.innerHTML = "";
  const explain = document.createElement("p");
  explain.className = "parameter-explain";
  explain.textContent = "Hover or focus a parameter for a short interpretation.";
  Object.entries(sensitivity).slice(0, 8).forEach(([name, values]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "parameter-button";
    const spread = Array.isArray(values) ? Math.abs(values[0] - values[1]) : 0;
    button.innerHTML = `<strong>${name.replace("µ", "u")}</strong><span>${spread.toFixed(2)}</span>`;
    const set = () => {
      explain.textContent = parameterExplanation(name);
    };
    button.addEventListener("mouseenter", set);
    button.addEventListener("focus", set);
    mount.append(button);
  });
  mount.append(explain);
}

function populateImportance(data) {
  const mount = document.querySelector("[data-importance]");
  if (!mount) return;
  const importance = data.metrics?.permutation_importance || {};
  mount.innerHTML = "";
  Object.entries(importance)
    .sort((a, b) => (b[1]?.[0] || 0) - (a[1]?.[0] || 0))
    .forEach(([name, values]) => {
      const row = document.createElement("div");
      row.className = "importance-row";
      const mean = Array.isArray(values) ? values[0] : 0;
      row.innerHTML = `<strong>${name}</strong><span>${mean.toFixed(3)}</span>`;
      mount.append(row);
    });
}

function populateSourceCaptions(data) {
  const figures = data.figures || {};
  document.querySelectorAll("[data-source]").forEach((caption) => {
    const key = caption.dataset.source;
    if (figures[key]?.source) caption.textContent = `Source: ${figures[key].source}`;
  });
}

function populateTwin(data) {
  const node = document.querySelector("[data-twin-note]");
  const twin = data.metrics?.twin;
  if (!node || !twin) return;
  node.textContent = `Twin ${twin.id || "not reported"}: predicted ${twin.ai_pred_class || "not reported"}, simulated outcome ${twin.true_class || "not reported"}.`;
}

function populateLimitations(data) {
  const list = document.querySelector("[data-limitations]");
  if (!list || !Array.isArray(data.limitations)) return;
  list.innerHTML = "";
  data.limitations.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  });
}

async function loadResults() {
  try {
    const response = await fetch("/src/data/orbio-results.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    populateMetrics(data);
    populateParameters(data);
    populateImportance(data);
    populateSourceCaptions(data);
    populateTwin(data);
    populateLimitations(data);
  } catch (error) {
    console.warn("Could not load ORBIO result JSON", error);
  }
}

function setupToggles() {
  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(button.dataset.toggle);
      if (!target) return;
      target.hidden = !target.hidden;
      button.setAttribute("aria-expanded", String(!target.hidden));
    });
  });
}

function setupDialog() {
  const dialog = document.querySelector("[data-dialog]");
  const dialogImg = dialog?.querySelector("img");
  if (!dialog || !dialogImg) return;
  document.querySelectorAll("[data-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      dialogImg.src = button.dataset.zoom;
      dialogImg.alt = button.querySelector("img")?.alt || "Expanded result figure";
      if (typeof dialog.showModal === "function") dialog.showModal();
      else window.open(button.dataset.zoom, "_blank", "noopener");
    });
  });
  document.querySelector("[data-dialog-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function init() {
  setupNav();
  setupReveal();
  seedCells();
  setupControls();
  setupToggles();
  setupDialog();
  loadResults();
  if (!prefersReduced.matches) animationFrame = requestAnimationFrame(animateCanvas);
  window.addEventListener("beforeunload", () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });
}

init();
