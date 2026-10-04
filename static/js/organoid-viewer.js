import { radialFieldAt } from "./scenario-model.js";

const CELL_COLORS = {
  proliferating: "#367f9d",
  quiescent: "#6c9291",
  apoptotic: "#ad7b70",
  necrotic: "#59636b"
};
const PARTICLE_CAPACITY = 1000;
const FOUNDER_COUNT = 130;
const REFERENCE_RADIUS_UM = 70;
const FOV_FULL = 34;
const FOV_SECTION = 18;
const FIT_MARGIN = 1.25;
const VISUAL_NN_RATIO = 0.68;
const MAX_RADIUS_GAIN = 2.1;
const NICE_SCALES_UM = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
const BIRTH_EASE_CELLS = 28;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function seeded(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function fateAtDepth(cellState, depth) {
  let edge = cellState.necrotic;
  if (depth < edge) return "necrotic";
  edge += cellState.apoptotic;
  if (depth < edge) return "apoptotic";
  edge += cellState.quiescent;
  if (depth < edge) return "quiescent";
  return "proliferating";
}

function interpolateState(current, target, amount) {
  if (typeof current === "number" && typeof target === "number") return current + (target - current) * amount;
  if (Array.isArray(current) && Array.isArray(target)) {
    return current.map((value, index) => interpolateState(value, target[index], amount));
  }
  if (current && target && typeof current === "object" && typeof target === "object") {
    return Object.fromEntries(Object.keys(current).map((key) => [key, interpolateState(current[key], target[key], amount)]));
  }
  return target;
}

function surfaceVariation(x, y, z, amount, tissue) {
  const tissueOffset = tissue === "cancer_cellline_spheroid" ? 0.7 : tissue === "neural" ? 1.8 : 0;
  const lowFrequency = 0.48 * Math.sin(2.3 * x + 1.7 * z + tissueOffset)
    + 0.31 * Math.sin(2.1 * y - 2.8 * x)
    + 0.21 * Math.cos(2.6 * z + 1.4 * y + tissueOffset);
  return 1 + amount * lowFrequency;
}

/*
 * Persistent agent pool. Agent k keeps one id, one direction and one radial fraction for the
 * whole run. Birth order is the index: agent k exists while renderedParticles > k, so scrubbing
 * the timeline only reveals or hides agents and never re-randomises positions. The first
 * FOUNDER_COUNT agents are present at day 0. Directions/radii come from a 3D low-discrepancy
 * sequence, so every prefix of the pool is evenly spread and a newborn cell lands in a gap.
 */
function buildAgentPool(morphology, tissue) {
  const g = 1.2207440846057596;
  const a1 = 1 / g;
  const a2 = 1 / (g * g);
  const a3 = 1 / (g * g * g);
  const direction = new Float32Array(PARTICLE_CAPACITY * 3);
  const radial = new Float32Array(PARTICLE_CAPACITY);
  const depth = new Float32Array(PARTICLE_CAPACITY);
  const parent = new Int32Array(PARTICLE_CAPACITY).fill(-1);
  const seed = new Float32Array(PARTICLE_CAPACITY);
  const rest = new Float32Array(PARTICLE_CAPACITY * 3);
  const epsilon = 0.05;
  for (let k = 0; k < PARTICLE_CAPACITY; k += 1) {
    const u = (0.5 + k * a1) % 1;
    const v = (0.5 + k * a2) % 1;
    const w = (0.5 + k * a3) % 1;
    const z = 1 - 2 * v;
    const planar = Math.sqrt(Math.max(0, 1 - z * z));
    const phi = 2 * Math.PI * w;
    const dx = Math.cos(phi) * planar;
    const dy = z;
    const dz = Math.sin(phi) * planar;
    direction.set([dx, dy, dz], k * 3);
    seed[k] = seeded(k + 5);
    const surface = surfaceVariation(dx, dy, dz, epsilon, tissue);
    if (morphology === "cyst") {
      const layer = 0.06 + 0.88 * seeded(k + 71);
      radial[k] = layer;
      depth[k] = clamp(layer + (seeded(k + 13) - 0.5) * 0.12, 0, 1);
      rest[k * 3] = dx * surface;
      rest[k * 3 + 1] = dy * surface;
      rest[k * 3 + 2] = dz * surface;
    } else {
      const exponent = k < FOUNDER_COUNT ? 1 / 3 : 0.29;
      const rho = Math.min(0.97, u ** exponent);
      radial[k] = rho * surface;
      depth[k] = clamp(rho ** 3 + (seeded(k + 13) - 0.5) * 0.1, 0, 1);
      rest[k * 3] = dx * radial[k];
      rest[k * 3 + 1] = dy * radial[k];
      rest[k * 3 + 2] = dz * radial[k];
    }
  }
  // Parent = nearest earlier-born agent in the final layout, so a birth appears beside its parent.
  for (let k = FOUNDER_COUNT; k < PARTICLE_CAPACITY; k += 1) {
    let best = -1;
    let bestDistance = Infinity;
    for (let j = 0; j < k; j += 1) {
      const dx = rest[k * 3] - rest[j * 3];
      const dy = rest[k * 3 + 1] - rest[j * 3 + 1];
      const dz = rest[k * 3 + 2] - rest[j * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestDistance) { bestDistance = d; best = j; }
    }
    parent[k] = best;
  }
  return { direction, radial, depth, parent, seed, morphology, tissue };
}

export function createOrganoidViewer(canvas, fallbackCanvas, fallbackWrap) {
  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let organoid = null;
  let cells = null;
  let transportShell = null;
  let transportBody = null;
  let transportCore = null;
  let glucoseShell = null;
  let floorPlane = null;
  let cystLumen = null;
  let coreMesh = null;
  let tissueFill = null;
  let voxelGrid = null;
  let tissueHull = null;
  let surfaceGeometry = null;
  let resizeObserver = null;
  let currentState = null;
  let targetState = null;
  let targetMorphology = "solid";
  let layers = { cells: true, oxygen: true, glucose: false, depletion: true, voxels: false };
  let cutMode = "full";
  let rotation = 0;
  let userRotation = 0;
  let pointerX = null;
  let previousTimestamp = 0;
  let previousSceneUpdate = 0;
  let disposed = false;
  let colorByFate = null;
  let apoptoticFade = null;
  let oxygenColor = null;
  let oxygenLow = null;
  let oxygenHigh = null;
  let pool = null;
  let poolKey = "";
  let cameraDistance = 0;
  let fitState = null;
  let cameraFov = FOV_FULL;
  let displayRadius = 1;
  let lastCanvasSize = { width: 0, height: 0 };
  let visibleCount = 0;
  const spacingCache = { key: '' };
  let sectionDisc = null;
  let sectionCanvas = null;
  let sectionTexture = null;
  let sectionKey = '';
  let sectionDrawnAt = 0;
  let glucoseLow = null;
  let glucoseHigh = null;
  let fieldMix = null;
  let scaleInfo = { pxPerUm: 0, label: '' };
  let scaleKey = '';
  const scaleEl = document.createElement('div');
  scaleEl.className = 'viewer-scale';
  scaleEl.innerHTML = '<div class="viewer-scale-bar"><span class="viewer-scale-line"></span><span class="viewer-scale-label"></span></div><div class="viewer-scale-meta"><span class="scale-diameter"></span><span class="scale-boundary"></span></div>';
  canvas.parentElement.append(scaleEl);
  const scaleLine = scaleEl.querySelector('.viewer-scale-line');
  const scaleLabel = scaleEl.querySelector('.viewer-scale-label');
  const scaleDiameter = scaleEl.querySelector('.scale-diameter');
  const scaleBoundary = scaleEl.querySelector('.scale-boundary');
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function geometryUnits(state) {
    const radius = state.geometry.radiusUm / REFERENCE_RADIUS_UM;
    const lumen = state.geometry.lumenRadiusUm / REFERENCE_RADIUS_UM;
    const inner = state.geometry.morphology === "cyst" ? clamp(lumen / Math.max(radius, 1e-6), 0, 0.95) : 0;
    const layerRatio = Math.max(0.025, state.transport.boundaryLayerUm / Math.max(1, state.geometry.radiusUm));
    return { radius, inner, layerRatio, aniso: state.geometry.anisotropy };
  }

  function computeFit(state) {
    const units = geometryUnits(fitState || state);
    const extent = units.radius * (1 + units.aniso * 0.45);
    let bound = extent;
    const isSection = cutMode === "cross";
    if (layers.depletion || (isSection && (layers.oxygen || layers.glucose))) bound = Math.max(bound, extent * Math.min(1 + units.layerRatio, 1.5));
    if (!isSection && layers.voxels && !layers.cells) bound = Math.max(bound, extent * 1.15);
    const fov = isSection ? FOV_SECTION : FOV_FULL;
    const aspect = lastCanvasSize.width > 0 ? lastCanvasSize.width / Math.max(1, lastCanvasSize.height) : 1;
    const tanHalf = Math.tan((fov * Math.PI) / 360) * Math.min(1, aspect);
    return { bound, distance: (bound / tanHalf) * FIT_MARGIN, fov };
  }

  function setDisplayMode() {
    if (!organoid) return;
    const full = cutMode === "full";
    cells.visible = layers.cells;
    tissueHull.visible = layers.cells && full;
    coreMesh.visible = layers.cells && full && targetMorphology === "solid";
    tissueFill.visible = full && layers.cells;
    cystLumen.visible = full && targetMorphology === "cyst" && layers.cells;
    transportShell.visible = layers.depletion && full;
    transportBody.visible = (layers.oxygen || layers.glucose) && full;
    transportCore.visible = layers.oxygen && full;
    glucoseShell.visible = layers.glucose && full;
    floorPlane.visible = full && Boolean(currentState?.transport.sedimented);
    voxelGrid.visible = layers.voxels;
    if (sectionDisc) {
      sectionDisc.visible = !full && (layers.cells || layers.oxygen || layers.glucose || layers.depletion);
      sectionKey = "";
    }
  }

  function makeIrregularSurface(tissue, anisotropy) {
    const geometry = new THREE.SphereGeometry(1, 32, 24);
    const position = geometry.attributes.position;
    const epsilon = clamp(0.035 + anisotropy * 0.18, 0.03, 0.09);
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const variation = surfaceVariation(x, y, z, epsilon, tissue);
      position.setXYZ(index, x * variation, y * variation, z * variation);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  function rebuildPool(state, morphology) {
    const tissue = state.tissue || "generic";
    const key = `${morphology}:${tissue}`;
    if (key === poolKey) return;
    poolKey = key;
    pool = buildAgentPool(morphology, tissue);
    if (THREE && organoid) {
      const previous = surfaceGeometry;
      surfaceGeometry = makeIrregularSurface(tissue, state.geometry.anisotropy);
      tissueHull.geometry = surfaceGeometry;
      transportShell.geometry = surfaceGeometry;
      transportBody.geometry = surfaceGeometry;
      glucoseShell.geometry = surfaceGeometry;
      previous?.dispose();
    }
  }

  // Number of dense radial layers in a cyst shell, from shell thickness / visual cell diameter.
  function shellLayers(units, count) {
    if (pool?.morphology !== "cyst") return 1;
    const shellFraction = Math.max(0.06, 1 - units.inner ** 3);
    const cellRadius = Math.cbrt((0.7 * shellFraction) / Math.max(FOUNDER_COUNT, count));
    return clamp(Math.round((1 - units.inner) / (2 * cellRadius * 0.8)), 2, 4);
  }

  // Position of agent k in organoid-local units at the current radius / lumen size.
  function agentPosition(k, units, out, layerCount = 1) {
    const d = pool.direction;
    let scale;
    if (pool.morphology === "cyst") {
      const layer = (k % layerCount + 0.5 + (pool.seed[k] - 0.5) * 0.3) / layerCount;
      scale = units.radius * (units.inner + (1 - units.inner) * clamp(layer, 0.02, 0.98));
    } else {
      scale = units.radius * pool.radial[k];
    }
    out.x = d[k * 3] * scale;
    out.y = d[k * 3 + 1] * scale;
    out.z = d[k * 3 + 2] * scale;
    return out;
  }

  function baseCellRadius(units, count, state) {
    const tissueFraction = pool.morphology === "cyst" ? Math.max(0.06, 1 - units.inner ** 3) : 1;
    const packing = clamp(state.geometry.packingFraction || 0.7, 0.64, 0.78);
    return units.radius * Math.cbrt((packing * tissueFraction) / Math.max(FOUNDER_COUNT, count)) * 1.05;
  }

  /*
   * Visual radius per rendered cell: proportional to the distance to its nearest rendered
   * neighbour (centre spacing = 1 / (2 * VISUAL_NN_RATIO) visual radii, about 1.6), so neighbours
   * touch and slightly overlap and the tissue reads as confluent. This is rendering geometry only;
   * the biological cell radius used by the model is untouched. Computed once in unit-radius
   * space and cached; in cross-section the neighbour search runs in the section plane.
   */
  function neighbourSpacing(units, count, state, section) {
    const layerCount = shellLayers(units, count);
    const inner = Math.round(units.inner * 50) / 50;
    const key = `${poolKey}|${count}|${inner}|${layerCount}|${section ? 1 : 0}`;
    if (spacingCache.key === key) return spacingCache;
    const unit = { radius: 1, inner };
    const base = baseCellRadius(unit, count, state);
    const half = base * 1.35;
    const point = { x: 0, y: 0, z: 0 };
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    const zs = new Float32Array(count);
    const members = [];
    for (let k = 0; k < count; k += 1) {
      agentPosition(k, unit, point, layerCount);
      xs[k] = point.x; ys[k] = point.y; zs[k] = point.z;
      if (!section || Math.abs(point.z) <= half) members.push(k);
    }
    const NEIGHBOURS = 4;
    const near = new Float32Array(count * NEIGHBOURS).fill(Infinity);
    const insert = (k, d) => {
      const o = k * NEIGHBOURS;
      if (d >= near[o + NEIGHBOURS - 1]) return;
      let s = o + NEIGHBOURS - 1;
      while (s > o && near[s - 1] > d) { near[s] = near[s - 1]; s -= 1; }
      near[s] = d;
    };
    for (let a = 0; a < members.length; a += 1) {
      const i = members[a];
      for (let b = a + 1; b < members.length; b += 1) {
        const j = members[b];
        const dx = xs[i] - xs[j];
        const dy = ys[i] - ys[j];
        const dz = section ? 0 : zs[i] - zs[j];
        const dist = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(dist);
        insert(i, d);
        insert(j, d);
      }
    }
    const nearest = new Float32Array(count).fill(Infinity);
    for (let k = 0; k < count; k += 1) {
      let sum = 0;
      let n = 0;
      for (let q = 0; q < NEIGHBOURS; q += 1) {
        const d = near[k * NEIGHBOURS + q];
        if (Number.isFinite(d)) { sum += d; n += 1; }
      }
      if (n) nearest[k] = sum / n;
    }
    const radius = new Float32Array(count);
    for (let k = 0; k < count; k += 1) {
      radius[k] = Number.isFinite(nearest[k])
        ? clamp(nearest[k] * VISUAL_NN_RATIO, base * 0.8, base * MAX_RADIUS_GAIN)
        : base;
    }
    Object.assign(spacingCache, { key, radius, half, base, layerCount, inner });
    return spacingCache;
  }

  function collectVisible(state, callback) {
    const units = geometryUnits(state);
    const count = clamp(Math.round(state.population.renderedParticles), FOUNDER_COUNT, PARTICLE_CAPACITY);
    const section = cutMode === "cross";
    const spacing = neighbourSpacing(units, count, state, section);
    const self = { x: 0, y: 0, z: 0 };
    const mother = { x: 0, y: 0, z: 0 };
    const sectionHalf = spacing.half * units.radius;
    let emitted = 0;
    for (let k = 0; k < count; k += 1) {
      agentPosition(k, units, self, spacing.layerCount);
      if (section && Math.abs(self.z) > sectionHalf) continue;
      const age = count - k;
      const fate = fateAtDepth(state.cellState, pool.depth[k]);
      let birth = 1;
      if (k >= FOUNDER_COUNT && age < BIRTH_EASE_CELLS && pool.parent[k] >= 0) {
        const e = (age / BIRTH_EASE_CELLS) ** 2 * (3 - 2 * (age / BIRTH_EASE_CELLS));
        agentPosition(pool.parent[k], units, mother, spacing.layerCount);
        self.x = mother.x + (self.x - mother.x) * e;
        self.y = mother.y + (self.y - mother.y) * e;
        self.z = mother.z + (self.z - mother.z) * e;
        birth = 0.55 + 0.45 * e;
      }
      const sectionFactor = section ? Math.sqrt(Math.max(0.6, 1 - (self.z / sectionHalf) ** 2 * 0.4)) : 1;
      callback(k, self, fate, spacing.radius[k] * units.radius, birth, sectionFactor, units);
      emitted += 1;
    }
    return emitted;
  }
  function fieldColor(field, out) {
    if (layers.oxygen && layers.glucose) {
      out.copy(oxygenLow).lerp(oxygenHigh, field.oxygen);
      fieldMix.copy(glucoseLow).lerp(glucoseHigh, field.glucose);
      return out.lerp(fieldMix, 0.5);
    }
    if (layers.glucose) return out.copy(glucoseLow).lerp(glucoseHigh, field.glucose);
    return out.copy(oxygenLow).lerp(oxygenHigh, field.oxygen);
  }

  /*
   * Cross-section backdrop: one continuous disc that spans the tissue and the depletion layer.
   * It is painted from the same radial field (radiusUm, lumenRadiusUm, boundaryLayerUm) as the
   * profile chart, so the tissue reads as a continuous medium rather than a union of glyphs.
   */
  function drawSectionField(state, units) {
    const transport = state.transport;
    const geometry = state.geometry;
    const key = [layers.cells, layers.oxygen, layers.glucose, layers.depletion, geometry.morphology,
      geometry.radiusUm.toFixed(0), geometry.lumenRadiusUm.toFixed(0), transport.boundaryLayerUm.toFixed(0),
      transport.coreO2.toFixed(2), transport.surfaceO2.toFixed(2), transport.bulkO2.toFixed(2),
      transport.coreGlucose.toFixed(2), transport.surfaceGlucose.toFixed(2)].join('|');
    if (key === sectionKey) return;
    const now = performance.now();
    if (now - sectionDrawnAt < 120) return;
    sectionKey = key;
    sectionDrawnAt = now;
    const size = sectionCanvas.width;
    const context = sectionCanvas.getContext('2d');
    const image = context.createImageData(size, size);
    const extentUm = geometry.radiusUm + transport.boundaryLayerUm;
    const fields = layers.oxygen || layers.glucose;
    const tissue = layers.cells ? [88, 138, 172] : [207, 224, 226];
    const tint = new THREE.Color();
    const TABLE = 512;
    const table = Array.from({ length: TABLE + 1 }, (_, i) => radialFieldAt(transport, geometry, (i / TABLE) * extentUm));
    for (let py = 0; py < size; py += 1) {
      for (let px = 0; px < size; px += 1) {
        const nx = ((px + 0.5) / size) * 2 - 1;
        const ny = ((py + 0.5) / size) * 2 - 1;
        const rr = Math.hypot(nx, ny);
        const offset = (py * size + px) * 4;
        if (rr > 1) continue;
        const field = table[Math.round(rr * TABLE)];
        let rgb = null;
        let alpha = 0;
        if (field.region === 'lumen') {
          rgb = [247, 244, 238]; alpha = 0.92;
        } else if (field.region === 'tissue') {
          rgb = tissue; alpha = layers.cells || fields ? 0.96 : 0;
        } else if (field.region === 'depletion') {
          rgb = [128, 212, 208]; alpha = layers.depletion ? 0.2 : 0;
        }
        if (fields && field.region !== 'bulk') {
          fieldColor(field, tint);
          const hex = tint.getHex();
          const mix = field.region === 'tissue' ? 0.7 : field.region === 'lumen' ? 0.35 : 0.55;
          const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
          rgb = (rgb || tissue).map((v, i) => v + (c[i] - v) * mix);
          alpha = Math.max(alpha, field.region === 'depletion' ? 0.6 : alpha);
        }
        if (!rgb || alpha <= 0) continue;
        image.data[offset] = rgb[0]; image.data[offset + 1] = rgb[1]; image.data[offset + 2] = rgb[2];
        image.data[offset + 3] = Math.round(alpha * 255);
      }
    }
    context.clearRect(0, 0, size, size);
    context.putImageData(image, 0, 0);
    if (layers.depletion) {
      context.strokeStyle = 'rgba(25, 120, 130, 0.75)';
      context.lineWidth = 2;
      context.setLineDash([6, 5]);
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(size / 2, size / 2, (geometry.radiusUm / extentUm) * (size / 2), 0, Math.PI * 2);
      context.stroke();
    }
    sectionTexture.needsUpdate = true;
  }

  // World-unit to pixel conversion from the live camera: pixels per unit at the organoid centre plane.
  function updateScaleBar(pxPerUnit) {
    const state = currentState;
    if (!state || !(pxPerUnit > 0)) return;
    const width = renderer ? lastCanvasSize.width : (fallbackCanvas.clientWidth || 640);
    const pxPerUm = pxPerUnit / REFERENCE_RADIUS_UM;
    const [minPx, maxPx] = width < 480 ? [60, 110] : width < 900 ? [70, 140] : [80, 180];
    let pick = NICE_SCALES_UM[0];
    NICE_SCALES_UM.forEach((value) => { if (value * pxPerUm <= maxPx) pick = value; });
    const length = Math.max(minPx * 0.5, pick * pxPerUm);
    const diameter = Math.round(state.geometry.radiusUm * 2);
    const delta = Math.round(state.transport.boundaryLayerUm);
    const key = `${pick}|${Math.round(length)}|${diameter}|${delta}`;
    scaleInfo = { pxPerUm, label: `${pick} µm`, length };
    if (key === scaleKey) return;
    scaleKey = key;
    scaleLine.style.width = `${length.toFixed(1)}px`;
    scaleLabel.textContent = `${pick} µm`;
    scaleDiameter.textContent = `Organoid diameter ~${diameter} µm`;
    scaleBoundary.textContent = `Boundary layer δ = ${delta} µm`;
  }
  function updateScene(now) {
    if (!cells || !currentState || !pool) return;
    const state = currentState;
    const units = geometryUnits(state);
    const section = cutMode === "cross";
    organoid.scale.set(1 + units.aniso * 0.45, 1 - units.aniso * 0.3, 1 + units.aniso * 0.15);
    organoid.position.y = !section && state.transport.sedimented ? -units.radius * 0.16 : 0;
    organoid.rotation.y = section ? 0 : rotation + userRotation;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const radialAxis = new THREE.Vector3(0, 1, 0);
    const radialDirection = new THREE.Vector3();
    let slot = 0;
    const fieldTint = new THREE.Color();
    const tintAmount = section ? 0.5 : 0;
    visibleCount = collectVisible(state, (k, p, fate, cr, birth, sectionFactor, cellUnits) => {
      const phase = (now / 1650 + pool.seed[k] * 3) % 1;
      const pulse = fate === "proliferating" ? clamp((phase - 0.8) / 0.2, 0, 1) * 0.1 : 0;
      let size = cr * (0.96 + pool.seed[k] * 0.1) * birth * (1 + pulse);
      if (fate === "apoptotic") size *= 0.62;
      else if (fate === "necrotic") size *= 0.9;
      else if (fate === "quiescent") size *= 0.97;
      position.set(p.x, p.y, p.z);
      if (section) {
        quaternion.identity();
        scale.set(size * sectionFactor, size * sectionFactor, size * 0.28);
      } else {
        const len = Math.max(1e-5, Math.hypot(p.x, p.y, p.z));
        radialDirection.set(p.x / len, p.y / len, p.z / len);
        quaternion.setFromUnitVectors(radialAxis, radialDirection);
        const outerRoom = cellUnits.radius * 1.02 - len;
        const innerRoom = cellUnits.inner > 0 ? len - cellUnits.radius * cellUnits.inner * 0.98 : Infinity;
        const radialSize = Math.max(size * 0.55, Math.min(size, outerRoom, innerRoom));
        const tangential = Math.min(size * 1.35, size * Math.sqrt(size / radialSize));
        const wobble = 0.9 + 0.2 * pool.seed[(k * 7) % PARTICLE_CAPACITY];
        scale.set(tangential * wobble, radialSize, tangential / wobble);
      }
      matrix.compose(position, quaternion, scale);
      cells.setMatrixAt(slot, matrix);
      color.copy(colorByFate[fate]);
      if (fate === "apoptotic") color.lerp(apoptoticFade, 0.4);
      if (tintAmount && (layers.oxygen || layers.glucose)) {
        const field = radialFieldAt(state.transport, state.geometry, Math.hypot(p.x, p.y, p.z) * REFERENCE_RADIUS_UM);
        fieldColor(field, fieldTint);
        color.lerp(fieldTint, tintAmount);
      }
      cells.setColorAt(slot, color);
      slot += 1;
    });
    cells.count = slot;
    cells.instanceMatrix.needsUpdate = true;
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true;

    const radius = units.radius;
    coreMesh.scale.setScalar(Math.max(0.04, radius * state.geometry.necroticCoreRadiusUm / Math.max(state.geometry.radiusUm, 1)));
    coreMesh.material.opacity = Math.min(0.4, state.transport.hypoxicFraction * 0.42);
    cystLumen.scale.setScalar(Math.max(0.01, radius * units.inner));
    tissueFill.scale.setScalar(pool.morphology === 'cyst' ? radius * (units.inner + (1 - units.inner) * 0.5) : radius * 0.94);
    transportShell.scale.setScalar(radius * (1 + units.layerRatio));
    tissueHull.scale.setScalar(radius);
    transportBody.scale.setScalar(radius);
    glucoseShell.scale.setScalar(radius);
    oxygenColor.copy(oxygenLow).lerp(oxygenHigh, state.transport.coreO2);
    transportCore.scale.setScalar(radius * Math.max(0.18, 0.3 + state.transport.hypoxicFraction * 0.42));
    transportCore.material.color.copy(oxygenColor);
    floorPlane.position.y = -radius * 1.02;
    floorPlane.scale.setScalar(Math.max(1, radius));
    voxelGrid.scale.setScalar(Math.max(1.2, computeFit(state).bound * 1.1) / 1.2);
    if (section && sectionDisc) {
      const spacing = neighbourSpacing(units, clamp(Math.round(state.population.renderedParticles), FOUNDER_COUNT, PARTICLE_CAPACITY), state, true);
      sectionDisc.scale.setScalar(radius * (1 + units.layerRatio));
      sectionDisc.position.z = -(spacing.half * radius + 0.02);
      drawSectionField(state, units);
    }
    setDisplayMode();
  }

  function updateCamera(delta) {
    if (!camera || !currentState) return;
    const fit = computeFit(currentState);
    displayRadius = fit.bound;
    const blend = reducedMotion ? 1 : 1 - Math.exp(-delta / 0.35);
    cameraDistance = cameraDistance ? cameraDistance + (fit.distance - cameraDistance) * blend : fit.distance;
    cameraFov += (fit.fov - cameraFov) * blend;
    camera.fov = cameraFov;
    camera.position.set(0, 0, cameraDistance);
    camera.near = Math.max(0.05, cameraDistance - fit.bound * 3);
    camera.far = cameraDistance + fit.bound * 4;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    updateScaleBar((lastCanvasSize.height / 2) / (Math.tan((cameraFov * Math.PI) / 360) * cameraDistance));
  }

  function renderFallback(state) {
    const context = fallbackCanvas.getContext("2d");
    if (!context || !pool) return;
    const width = fallbackCanvas.clientWidth || 640;
    const height = fallbackCanvas.clientHeight || 400;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (fallbackCanvas.width !== pixelWidth || fallbackCanvas.height !== pixelHeight) {
      fallbackCanvas.width = pixelWidth;
      fallbackCanvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const units = geometryUnits(state);
    const full = cutMode === "full";
    const bound = units.radius * (layers.depletion && full ? 1 + units.layerRatio : 1);
    const pixelsPerUnit = (Math.min(width, height) * 0.42) / Math.max(bound, 1e-6);
    updateScaleBar(pixelsPerUnit);
    context.save();
    context.translate(width / 2, height / 2);
    if (layers.depletion && full) {
      context.beginPath();
      context.arc(0, 0, units.radius * (1 + units.layerRatio) * pixelsPerUnit, 0, Math.PI * 2);
      context.strokeStyle = "rgba(25, 120, 130, 0.25)";
      context.lineWidth = 3;
      context.stroke();
    }
    const angle = full ? rotation + userRotation : 0;
    const cosR = Math.cos(angle);
    const sinR = Math.sin(angle);
    visibleCount = collectVisible(state, (k, p, fate, cr, birth) => {
      const x = (p.x * cosR + p.z * sinR) * pixelsPerUnit;
      const y = -p.y * pixelsPerUnit;
      context.globalAlpha = fate === "apoptotic" ? 0.7 : 0.95;
      context.fillStyle = CELL_COLORS[fate];
      context.beginPath();
      context.arc(x, y, Math.max(1.5, cr * pixelsPerUnit * birth * (fate === "apoptotic" ? 0.62 : 1)), 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  function frame(timestamp) {
    if (disposed) return;
    const delta = previousTimestamp ? Math.min((timestamp - previousTimestamp) / 1000, 0.05) : 0;
    previousTimestamp = timestamp;
    if (!reducedMotion && cutMode === "full") rotation += delta * 0.12;
    if (currentState && targetState) {
      const blend = 1 - Math.exp(-delta / 0.36);
      currentState = interpolateState(currentState, targetState, blend);
    }
    if (renderer && organoid) {
      if (timestamp - previousSceneUpdate >= 1000 / 30) {
        previousSceneUpdate = timestamp;
        updateScene(timestamp);
      }
      updateCamera(delta);
      renderer.render(scene, camera);
    } else if (currentState) {
      renderFallback(currentState);
    }
    requestAnimationFrame(frame);
  }

  async function initializeThree() {
    try {
      THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js");
      if (disposed) return;
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      colorByFate = Object.fromEntries(Object.entries(CELL_COLORS).map(([key, value]) => [key, new THREE.Color(value)]));
      apoptoticFade = new THREE.Color("#eef1f0");
      oxygenLow = new THREE.Color("#d36d5d");
      oxygenHigh = new THREE.Color("#0f79c8");
      oxygenColor = new THREE.Color();
      glucoseLow = new THREE.Color("#e3b04b");
      glucoseHigh = new THREE.Color("#3b9d85");
      fieldMix = new THREE.Color();
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(FOV_FULL, 1, 0.05, 200);
      scene.add(new THREE.HemisphereLight(0xfbfaf6, 0xc7d7d8, 2.6));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
      keyLight.position.set(-3, 4, 4);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x80d4d0, 0.8);
      fillLight.position.set(3, -2, -3);
      scene.add(fillLight);
      organoid = new THREE.Group();
      scene.add(organoid);
      surfaceGeometry = makeIrregularSurface(currentState?.tissue || "generic", currentState?.geometry.anisotropy || 0.1);
      const cellMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
      cells = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), cellMaterial, PARTICLE_CAPACITY);
      cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      cells.frustumCulled = false;
      organoid.add(cells);
      coreMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14),
        new THREE.MeshBasicMaterial({ color: 0xd36d5d, transparent: true, opacity: 0.08, depthWrite: false }));
      organoid.add(coreMesh);
      cystLumen = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16),
        new THREE.MeshBasicMaterial({ color: 0xf7f4ee, transparent: true, opacity: 0.9 }));
      organoid.add(cystLumen);
      tissueFill = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32),
        new THREE.MeshStandardMaterial({ color: 0x3f7f94, roughness: 0.9, metalness: 0 }));
      organoid.add(tissueFill);
      tissueHull = new THREE.Mesh(surfaceGeometry, new THREE.MeshBasicMaterial({
        color: 0x7ca9a4, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide }));
      organoid.add(tissueHull);
      transportShell = new THREE.Mesh(surfaceGeometry,
        new THREE.MeshBasicMaterial({ color: 0x80d4d0, wireframe: true, transparent: true, opacity: 0.13 }));
      organoid.add(transportShell);
      transportBody = new THREE.Mesh(surfaceGeometry, new THREE.MeshBasicMaterial({
        color: 0x8fb8b1, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide }));
      organoid.add(transportBody);
      transportCore = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16),
        new THREE.MeshBasicMaterial({ color: 0x0f79c8, transparent: true, opacity: 0.4, depthWrite: false }));
      organoid.add(transportCore);
      glucoseShell = new THREE.Mesh(surfaceGeometry,
        new THREE.MeshBasicMaterial({ color: 0x579b88, wireframe: true, transparent: true, opacity: 0.12 }));
      organoid.add(glucoseShell);
      floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({ color: 0x102235, transparent: true, opacity: 0.06, side: THREE.DoubleSide }));
      floorPlane.rotation.x = -Math.PI / 2;
      organoid.add(floorPlane);
      sectionCanvas = document.createElement("canvas");
      sectionCanvas.width = 640;
      sectionCanvas.height = 640;
      sectionTexture = new THREE.CanvasTexture(sectionCanvas);
      sectionTexture.colorSpace = THREE.SRGBColorSpace;
      sectionTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      sectionTexture.generateMipmaps = false;
      sectionTexture.minFilter = THREE.LinearFilter;
      sectionDisc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: sectionTexture, transparent: true, depthWrite: false }));
      sectionDisc.visible = false;
      organoid.add(sectionDisc);
      voxelGrid = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 2.4, 2.4)),
        new THREE.LineBasicMaterial({ color: 0x9ca8b4, transparent: true, opacity: 0.3 }));
      organoid.add(voxelGrid);

      const resize = () => {
        const { width, height } = canvas.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        lastCanvasSize = { width, height };
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas.parentElement);
      resize();
      canvas.hidden = false;
      fallbackWrap.hidden = true;
      setDisplayMode();
    } catch (error) {
      console.warn("Three.js viewer unavailable; using the 2D fallback.", error);
      canvas.hidden = true;
      fallbackWrap.hidden = false;
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    pointerX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointerX === null || cutMode === "cross") return;
    userRotation += (event.clientX - pointerX) * 0.006;
    pointerX = event.clientX;
  });
  const endDrag = () => { pointerX = null; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.hidden = true;
  fallbackWrap.hidden = false;
  initializeThree();
  requestAnimationFrame(frame);

  return {
    setFitState(state) {
      fitState = state;
    },
    setState(nextState, nextMorphology) {
      targetState = nextState;
      if (!currentState) currentState = structuredClone(nextState);
      targetMorphology = nextMorphology;
      rebuildPool(nextState, nextMorphology);
      if (!renderer) { canvas.hidden = true; fallbackWrap.hidden = false; }
    },
    setLayers(nextLayers) {
      layers = { ...nextLayers };
      setDisplayMode();
    },
    setCutMode(nextCutMode) {
      cutMode = nextCutMode === "cross" ? "cross" : "full";
      setDisplayMode();
    },
    visibleGlyphCount() {
      if (!layers.cells || !targetState || !pool) return 0;
      return collectVisible(targetState, () => {});
    },
    debug() {
      return { cameraDistance, cameraFov, displayRadius, cutMode, visibleCount, scale: scaleInfo, renderer: Boolean(renderer) };
    },
    dispose() {
      disposed = true;
      resizeObserver?.disconnect();
      renderer?.dispose();
    }
  };
}
