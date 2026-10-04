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
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function geometryUnits(state) {
    const radius = state.geometry.radiusUm / REFERENCE_RADIUS_UM;
    const lumen = state.geometry.lumenRadiusUm / REFERENCE_RADIUS_UM;
    const inner = state.geometry.morphology === "cyst" ? clamp(lumen / Math.max(radius, 1e-6), 0, 0.95) : 0;
    const layerRatio = clamp(state.transport.boundaryLayerUm / Math.max(1, state.geometry.radiusUm), 0.025, 0.55);
    return { radius, inner, layerRatio, aniso: state.geometry.anisotropy };
  }

  function computeFit(state) {
    const units = geometryUnits(fitState || state);
    const extent = units.radius * (1 + units.aniso * 0.45);
    let bound = extent;
    const isSection = cutMode === "cross";
    if (!isSection && layers.depletion) bound = Math.max(bound, extent * (1 + units.layerRatio));
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
    cystLumen.visible = full && targetMorphology === "cyst" && layers.cells;
    transportShell.visible = layers.depletion && full;
    transportBody.visible = (layers.oxygen || layers.glucose) && full;
    transportCore.visible = layers.oxygen && full;
    glucoseShell.visible = layers.glucose && full;
    floorPlane.visible = full && Boolean(currentState?.transport.sedimented);
    voxelGrid.visible = layers.voxels;
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

  // Position of agent k in organoid-local units at the current radius / lumen size.
  function agentPosition(k, units, out) {
    const d = pool.direction;
    const r = pool.radial[k];
    const scale = pool.morphology === "cyst"
      ? units.radius * (units.inner + (1 - units.inner) * r)
      : units.radius * r;
    out.x = d[k * 3] * scale;
    out.y = d[k * 3 + 1] * scale;
    out.z = d[k * 3 + 2] * scale;
    return out;
  }

  function cellRadiusFor(units, count, state) {
    const tissueFraction = pool.morphology === "cyst" ? Math.max(0.06, 1 - units.inner ** 3) : 1;
    const packing = clamp(state.geometry.packingFraction || 0.7, 0.64, 0.78);
    return units.radius * Math.cbrt((packing * tissueFraction) / Math.max(FOUNDER_COUNT, count)) * 1.05;
  }

  function collectVisible(state, callback) {
    const units = geometryUnits(state);
    const count = clamp(Math.round(state.population.renderedParticles), FOUNDER_COUNT, PARTICLE_CAPACITY);
    const cr = cellRadiusFor(units, count, state);
    const self = { x: 0, y: 0, z: 0 };
    const mother = { x: 0, y: 0, z: 0 };
    const section = cutMode === "cross";
    const sectionHalf = cr * 1.35;
    let emitted = 0;
    for (let k = 0; k < count; k += 1) {
      agentPosition(k, units, self);
      if (section && Math.abs(self.z) > sectionHalf) continue;
      const age = count - k;
      const fate = fateAtDepth(state.cellState, pool.depth[k]);
      let birth = 1;
      if (k >= FOUNDER_COUNT && age < BIRTH_EASE_CELLS && pool.parent[k] >= 0) {
        const e = (age / BIRTH_EASE_CELLS) ** 2 * (3 - 2 * (age / BIRTH_EASE_CELLS));
        agentPosition(pool.parent[k], units, mother);
        self.x = mother.x + (self.x - mother.x) * e;
        self.y = mother.y + (self.y - mother.y) * e;
        self.z = mother.z + (self.z - mother.z) * e;
        birth = 0.55 + 0.45 * e;
      }
      const sectionFactor = section ? Math.sqrt(Math.max(0.1, 1 - (self.z / sectionHalf) ** 2 * 0.6)) : 1;
      callback(k, self, fate, cr, birth, sectionFactor);
      emitted += 1;
    }
    return emitted;
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
    visibleCount = collectVisible(state, (k, p, fate, cr, birth, sectionFactor) => {
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
        scale.set(size, size * 0.98, size);
      }
      matrix.compose(position, quaternion, scale);
      cells.setMatrixAt(slot, matrix);
      color.copy(colorByFate[fate]);
      if (fate === "apoptotic") color.lerp(apoptoticFade, 0.4);
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
      const cellMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, flatShading: true });
      cells = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cellMaterial, PARTICLE_CAPACITY);
      cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      cells.frustumCulled = false;
      organoid.add(cells);
      coreMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14),
        new THREE.MeshBasicMaterial({ color: 0xd36d5d, transparent: true, opacity: 0.08, depthWrite: false }));
      organoid.add(coreMesh);
      cystLumen = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16),
        new THREE.MeshBasicMaterial({ color: 0xf7f4ee, transparent: true, opacity: 0.9 }));
      organoid.add(cystLumen);
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
      return { cameraDistance, cameraFov, displayRadius, cutMode, visibleCount, renderer: Boolean(renderer) };
    },
    dispose() {
      disposed = true;
      resizeObserver?.disconnect();
      renderer?.dispose();
    }
  };
}
