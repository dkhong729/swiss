const CELL_COLORS = {
  proliferating: "#367f9d",
  quiescent: "#6c9291",
  apoptotic: "#ad7b70",
  necrotic: "#59636b"
};
const CELL_TYPES = ["necrotic", "apoptotic", "quiescent", "proliferating"];
const PARTICLE_CAPACITY = 1000;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function seeded(index) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function fateAtDepth(cellState, layerPosition) {
  let edge = cellState.necrotic;
  if (layerPosition < edge) return CELL_TYPES[0];
  edge += cellState.apoptotic;
  if (layerPosition < edge) return CELL_TYPES[1];
  edge += cellState.quiescent;
  if (layerPosition < edge) return CELL_TYPES[2];
  return CELL_TYPES[3];
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

function packedCellLayout(state, morphology, requestedCount) {
  const count = clamp(requestedCount || Math.round(state.population.renderedParticles), 130, PARTICLE_CAPACITY);
  const innerRadius = morphology === "cyst"
    ? clamp(state.geometry.lumenRadiusUm / Math.max(state.geometry.radiusUm, 1), 0, 0.94)
    : 0;
  const packingFraction = clamp(state.geometry.packingFraction || 0.70, 0.64, 0.78);
  const tissueVolumeFraction = morphology === "cyst" ? Math.max(0.06, 1 - innerRadius ** 3) : 1;
  const cellRadius = Math.cbrt(packingFraction * tissueVolumeFraction / count);
  const targetSpacing = cellRadius * 1.9;
  const shellLayerCount = morphology === "cyst"
    ? clamp(Math.round(state.geometry.shellThicknessUm / Math.max(1, state.geometry.representativeCellDiameterUm || 24)), 1, 6)
    : 1;
  const epsilon = clamp(0.035 + state.geometry.anisotropy * 0.18, 0.03, 0.09);
  const positions = new Float32Array(count * 3);
  const depth = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const sphereIndex = Math.floor(((index * 0.618033988749895) % 1) * count);
    const y = 1 - 2 * ((sphereIndex + 0.5) / count);
    const angle = GOLDEN_ANGLE * sphereIndex;
    const planar = Math.sqrt(Math.max(0, 1 - y * y));
    const x = Math.cos(angle) * planar;
    const z = Math.sin(angle) * planar;
    const radialSample = clamp((sphereIndex + 0.5 + (seeded(sphereIndex + 71) - 0.5) * 0.7) / count, 0, 1);
    const radius = morphology === "cyst"
      ? innerRadius + ((sphereIndex % shellLayerCount) + 0.2 + seeded(sphereIndex + 71) * 0.6) / shellLayerCount * (1 - innerRadius)
      : Math.cbrt(radialSample);
    const shellPosition = morphology === "cyst"
      ? (radius - innerRadius) / Math.max(0.01, 1 - innerRadius)
      : radius;
    const surface = surfaceVariation(x, y, z, epsilon, state.tissue);
    const offset = index * 3;
    positions[offset] = x * radius * surface;
    positions[offset + 1] = y * radius * surface;
    positions[offset + 2] = z * radius * surface;
    depth[index] = shellPosition;
  }

  // Deterministic local relaxation improves contact without claiming vertex-model mechanics.
  const bucketSize = targetSpacing * 2.2;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const buckets = new Map();
    const bucketKey = (x, y, z) => `${x},${y},${z}`;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const key = bucketKey(
        Math.floor(positions[offset] / bucketSize),
        Math.floor(positions[offset + 1] / bucketSize),
        Math.floor(positions[offset + 2] / bucketSize)
      );
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    }
    const shifts = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const bx = Math.floor(positions[offset] / bucketSize);
      const by = Math.floor(positions[offset + 1] / bucketSize);
      const bz = Math.floor(positions[offset + 2] / bucketSize);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const neighbours = buckets.get(bucketKey(bx + dx, by + dy, bz + dz));
            if (!neighbours) continue;
            for (const neighbour of neighbours) {
              if (neighbour <= index) continue;
              const other = neighbour * 3;
              const vx = positions[other] - positions[offset];
              const vy = positions[other + 1] - positions[offset + 1];
              const vz = positions[other + 2] - positions[offset + 2];
              const distance = Math.max(1e-5, Math.hypot(vx, vy, vz));
              let displacement = 0;
              if (distance < targetSpacing * 0.88) {
                displacement = (targetSpacing * 0.88 - distance) * 0.11;
              } else if (distance > targetSpacing * 1.12 && distance < targetSpacing * 1.85) {
                displacement = -(distance - targetSpacing * 1.12) * 0.012;
              }
              if (displacement) {
                const sx = (vx / distance) * displacement;
                const sy = (vy / distance) * displacement;
                const sz = (vz / distance) * displacement;
                shifts[offset] -= sx;
                shifts[offset + 1] -= sy;
                shifts[offset + 2] -= sz;
                shifts[other] += sx;
                shifts[other + 1] += sy;
                shifts[other + 2] += sz;
              }
            }
          }
        }
      }
    }
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      let x = positions[offset] + shifts[offset];
      let y = positions[offset + 1] + shifts[offset + 1];
      let z = positions[offset + 2] + shifts[offset + 2];
      let radius = Math.max(1e-5, Math.hypot(x, y, z));
      const nx = x / radius;
      const ny = y / radius;
      const nz = z / radius;
      const limit = surfaceVariation(nx, ny, nz, epsilon, state.tissue) * 0.985;
      const minimum = morphology === "cyst" ? innerRadius + cellRadius * 0.48 : 0;
      if (radius > limit) radius = limit;
      if (radius < minimum) radius = minimum;
      x = nx * radius;
      y = ny * radius;
      z = nz * radius;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
    }
  }
  return { count, cellRadius, positions, depth, innerRadius, epsilon, packingFraction, shellLayerCount };
}

function makeIrregularSurface(THREE, tissue, anisotropy) {
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

export function createOrganoidViewer(canvas, fallbackCanvas, fallbackWrap) {
  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let organoid = null;
  let cells = null;
  let divisionDaughters = null;
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
  let clippingPlane = null;
  let clippingPlaneNear = null;
  let clippingPlaneFar = null;
  let resizeObserver = null;
  let currentState = null;
  let targetState = null;
  let currentMorphology = "cyst";
  let targetMorphology = "cyst";
  let morphologyMix = 1;
  let layers = { cells: true, oxygen: true, glucose: false, depletion: true, voxels: false };
  let cutMode = "half";
  let rotation = 0;
  let userRotation = 0;
  let pointerX = null;
  let previousTimestamp = 0;
  let previousSceneUpdate = 0;
  let disposed = false;
  let instanceColors = null;
  let apoptoticColor = null;
  let oxygenColor = null;
  let oxygenLow = null;
  let oxygenHigh = null;
  let cellLayout = null;
  let layoutSignature = "";
  let surfaceTissue = "generic";
  let surfaceAnisotropy = 0.1;

  function allMaterials() {
    return [cells?.material, divisionDaughters?.material, transportShell?.material, transportBody?.material,
      transportCore?.material, glucoseShell?.material, floorPlane?.material, coreMesh?.material, cystLumen?.material,
      tissueHull?.material]
      .filter(Boolean);
  }

  function applyClipMode() {
    if (!renderer) return;
    const materials = allMaterials();
    if (cutMode === "full") {
      materials.forEach((material) => { material.clippingPlanes = []; });
      renderer.localClippingEnabled = false;
      return;
    }
    renderer.localClippingEnabled = true;
    if (cutMode === "half") {
      materials.forEach((material) => { material.clippingPlanes = [clippingPlane]; });
      return;
    }
    materials.forEach((material) => { material.clippingPlanes = [clippingPlaneNear, clippingPlaneFar]; });
  }

  function setFallbackVisible() {
    canvas.hidden = true;
    fallbackWrap.hidden = false;
  }

  function setDisplayMode() {
    if (!organoid) return;
    cells.visible = layers.cells;
    divisionDaughters.visible = layers.cells;
    tissueHull.visible = layers.cells;
    coreMesh.visible = layers.cells && currentMorphology === "solid";
    cystLumen.visible = currentMorphology === "cyst";
    transportShell.visible = layers.depletion;
    transportBody.visible = layers.oxygen || layers.glucose;
    transportCore.visible = layers.oxygen;
    glucoseShell.visible = layers.glucose;
    floorPlane.visible = Boolean(currentState?.transport.sedimented);
    voxelGrid.visible = layers.voxels;
  }

  function prepareLayout(state, morphology) {
    const actualCount = clamp(Math.round(state.population.renderedParticles), 130, PARTICLE_CAPACITY);
    const layoutCount = Math.min(PARTICLE_CAPACITY, Math.ceil(actualCount / 32) * 32);
    const innerRadius = morphology === "cyst"
      ? clamp(state.geometry.lumenRadiusUm / Math.max(state.geometry.radiusUm, 1), 0, 0.94)
      : 0;
    const shellLayerCount = morphology === "cyst"
      ? clamp(Math.round(state.geometry.shellThicknessUm / Math.max(1, state.geometry.representativeCellDiameterUm || 24)), 1, 6)
      : 1;
    const signature = [
      morphology,
      state.tissue || "generic",
      layoutCount,
      Math.round(innerRadius * 20),
      shellLayerCount,
      Math.round((state.geometry.packingFraction || 0.70) * 20),
      Math.round(state.geometry.anisotropy * 10)
    ].join(":");
    if (signature === layoutSignature) return;
    layoutSignature = signature;
    cellLayout = packedCellLayout(state, morphology, layoutCount);
    surfaceTissue = state.tissue || "generic";
    surfaceAnisotropy = state.geometry.anisotropy;
    if (THREE && organoid) {
      const previousGeometry = surfaceGeometry;
      surfaceGeometry = makeIrregularSurface(THREE, surfaceTissue, surfaceAnisotropy);
      tissueHull.geometry = surfaceGeometry;
      transportShell.geometry = surfaceGeometry;
      transportBody.geometry = surfaceGeometry;
      glucoseShell.geometry = surfaceGeometry;
      if (previousGeometry) previousGeometry.dispose();
    }
  }

  function setCellInstance(index, matrix, position, quaternion, scale, color, mesh = cells) {
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color);
  }

  function updateScene(now) {
    if (!cells || !currentState || !cellLayout) return;
    currentMorphology = targetMorphology;
    const state = currentState;
    const innerRadius = clamp(state.geometry.lumenRadiusUm / Math.max(state.geometry.radiusUm, 1), 0, 0.95);
    const growthScale = 0.72 * Math.min(1.95, Math.cbrt(state.phenotype.growthFromDay0));
    organoid.scale.set(
      growthScale * (1 + state.geometry.anisotropy * 0.45),
      growthScale * (1 - state.geometry.anisotropy * 0.3),
      growthScale * (1 + state.geometry.anisotropy * 0.15)
    );
    organoid.position.y = state.transport.sedimented ? -0.16 : 0;
    organoid.rotation.y = rotation + userRotation;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const instanceColor = new THREE.Color();
    const radialAxis = new THREE.Vector3(0, 1, 0);
    const radial = new THREE.Vector3();
    const daughters = [];
    const renderedCount = clamp(Math.round(state.population.renderedParticles), 130, PARTICLE_CAPACITY);
    const tissueVolumeFraction = morphologyMix > 0.5
      ? Math.max(0.06, 1 - innerRadius ** 3)
      : 1;
    const particleRadius = Math.cbrt(
      clamp(state.geometry.packingFraction || 0.70, 0.64, 0.78) * tissueVolumeFraction / renderedCount
    );
    let indexOut = 0;

    for (let i = 0; i < renderedCount; i += 1) {
      const offset = i * 3;
      const x = cellLayout.positions[offset];
      const y = cellLayout.positions[offset + 1];
      const z = cellLayout.positions[offset + 2];
      const depth = cellLayout.depth[i];
      position.set(x, y, z);
      if (cutMode === "half" && position.x < 0) continue;
      if (cutMode === "cross" && Math.abs(position.x) > 0.1) continue;
      const fate = fateAtDepth(state.cellState, depth);
      const cyclePhase = (now / 1650 + seeded(i + 23) * 3) % 1;
      const divisionPulse = fate === "proliferating" ? clamp((cyclePhase - 0.78) / 0.22, 0, 1) : 0;
      const fateScale = fate === "apoptotic" ? 0.82 : fate === "necrotic" ? 0.88 : fate === "quiescent" ? 0.97 : 1;
      const radiusVariation = particleRadius * (0.96 + seeded(i + 7) * 0.1) * fateScale;
      const radialLength = Math.max(1e-5, Math.hypot(x, y, z));
      radial.set(x / radialLength, y / radialLength, z / radialLength);
      quaternion.setFromUnitVectors(radialAxis, radial);
      const surfaceCell = depth > 0.82;
      const radialFlattening = morphologyMix > 0.5 ? (surfaceCell ? 0.96 : 1.08) : (surfaceCell ? 0.9 : 0.98);
      const localVariation = 0.97 + seeded(i + 31) * 0.06;
      scale.set(
        radiusVariation * localVariation,
        radiusVariation * radialFlattening * (1 + divisionPulse * 0.12),
        radiusVariation * (1.03 - (surfaceCell ? 0.01 : 0.04)) * localVariation
      );
      instanceColor.copy(fate === "apoptotic" ? apoptoticColor : instanceColors[fate]);
      setCellInstance(indexOut, matrix, position, quaternion, scale, instanceColor);
      indexOut += 1;

      if (divisionPulse > 0.9 && fate === "proliferating" && daughters.length < 14) {
        const offset = particleRadius * 0.9 * (divisionPulse - 0.8) * 4.5;
        const daughterPosition = position.clone().add(radial.clone().multiplyScalar(offset));
        daughters.push({ position: daughterPosition, size: radiusVariation * 0.72 });
      }
    }
    cells.count = indexOut;
    cells.instanceMatrix.needsUpdate = true;
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
    divisionDaughters.count = daughters.length;
    daughters.forEach((daughter, index) => {
      scale.setScalar(daughter.size);
      instanceColor.set(CELL_COLORS.proliferating);
      setCellInstance(index, matrix, daughter.position, quaternion, scale, instanceColor, divisionDaughters);
    });
    divisionDaughters.instanceMatrix.needsUpdate = true;
    if (divisionDaughters.instanceColor) divisionDaughters.instanceColor.needsUpdate = true;

    const coreSize = Math.max(0.04, state.geometry.necroticCoreRadiusUm / Math.max(state.geometry.radiusUm, 1));
    coreMesh.scale.setScalar(coreSize);
    coreMesh.material.opacity = Math.min(0.4, state.transport.hypoxicFraction * 0.42);
    cystLumen.scale.setScalar(innerRadius);
    cystLumen.material.opacity = 0.9;
    const layerRatio = clamp(state.transport.boundaryLayerUm / Math.max(1, state.geometry.radiusUm), 0.025, 0.55);
    transportShell.scale.setScalar(1 + layerRatio);
    transportShell.material.opacity = layers.depletion ? 0.16 : 0;
    transportBody.scale.setScalar(1);
    oxygenColor.copy(oxygenLow).lerp(oxygenHigh, state.transport.coreO2);
    transportCore.scale.setScalar(Math.max(0.18, 0.3 + state.transport.hypoxicFraction * 0.42));
    transportCore.material.color.copy(oxygenColor);
    transportCore.material.opacity = layers.oxygen ? 0.52 : 0;
    glucoseShell.scale.setScalar(1);
    glucoseShell.material.opacity = layers.glucose ? 0.12 : 0;
    transportShell.material.opacity = layers.depletion ? 0.11 : 0;
    tissueHull.material.opacity = layers.cells ? 0.045 : 0;
    tissueHull.scale.setScalar(1);
    transportBody.scale.setScalar(1);
    glucoseShell.scale.setScalar(1);
    floorPlane.position.y = -1.02;
    setDisplayMode();
  }

  function renderFallback(state) {
    const context = fallbackCanvas.getContext("2d");
    if (!context) return;
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
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.29 * Math.min(1.8, Math.cbrt(state.phenotype.growthFromDay0));
    const lumenRadius = radius * clamp(state.geometry.lumenRadiusUm / Math.max(state.geometry.radiusUm, 1), 0, 0.9);
    context.save();
    context.translate(cx, cy);
    context.rotate(rotation + userRotation);
    if (layers.depletion) {
      const thickness = radius * clamp(state.transport.boundaryLayerUm / Math.max(1, state.geometry.radiusUm), 0.025, 0.55);
      context.beginPath();
      context.arc(0, 0, radius + thickness, 0, Math.PI * 2);
      context.strokeStyle = "rgba(25, 120, 130, 0.17)";
      context.lineWidth = Math.max(4, thickness);
      context.stroke();
    }
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.strokeStyle = "rgba(54, 127, 157, 0.12)";
    context.lineWidth = Math.max(1.5, radius * 0.025);
    context.stroke();
    const particleCount = clamp(Math.round(state.population.renderedParticles), 130, PARTICLE_CAPACITY);
    const tissueVolumeFraction = morphologyMix > 0.5
      ? Math.max(0.06, 1 - (state.geometry.lumenRadiusUm / Math.max(state.geometry.radiusUm, 1)) ** 3)
      : 1;
    const particleRadius = Math.cbrt(
      clamp(state.geometry.packingFraction || 0.70, 0.64, 0.78) * tissueVolumeFraction / particleCount
    );
    for (let i = 0; i < particleCount; i += 1) {
      const offset = i * 3;
      const x = cellLayout.positions[offset] * radius;
      const y = cellLayout.positions[offset + 1] * radius;
      const z = cellLayout.positions[offset + 2] * radius;
      if (cutMode === "half" && x < 0) continue;
      if (cutMode === "cross" && Math.abs(x) > radius * 0.1) continue;
      const fate = fateAtDepth(state.cellState, cellLayout.depth[i]);
      const aspect = morphologyMix > 0.5 ? 1.04 : 0.94;
      const cellRadius = radius * particleRadius * (0.96 + seeded(i + 7) * 0.1);
      context.globalAlpha = fate === "apoptotic" ? 0.76 : fate === "necrotic" ? 0.84 : 0.96;
      context.fillStyle = CELL_COLORS[fate];
      context.beginPath();
      context.ellipse(x, -y * 0.78, cellRadius, cellRadius * aspect, Math.atan2(z, x), 0, Math.PI * 2);
      context.fill();
    }
    if (state.geometry.morphology === "cyst") {
      context.globalCompositeOperation = "destination-out";
      context.beginPath();
      context.arc(0, 0, lumenRadius, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "source-over";
    }
    context.restore();
  }

  function frame(timestamp) {
    if (disposed) return;
    const delta = previousTimestamp ? Math.min((timestamp - previousTimestamp) / 1000, 0.05) : 0;
    previousTimestamp = timestamp;
    rotation += delta * 0.12;
    if (currentState && targetState) {
      const blend = 1 - Math.exp(-delta / 0.36);
      currentState = interpolateState(currentState, targetState, blend);
      morphologyMix += ((targetMorphology === "cyst" ? 1 : 0) - morphologyMix) * blend;
    }
    if (renderer && organoid) {
      if (timestamp - previousSceneUpdate >= 1000 / 30) {
        previousSceneUpdate = timestamp;
        updateScene(timestamp);
      }
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
      clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
      clippingPlaneNear = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.08);
      clippingPlaneFar = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.08);
      instanceColors = Object.fromEntries(Object.entries(CELL_COLORS).map(([key, color]) => [key, new THREE.Color(color)]));
      apoptoticColor = new THREE.Color(CELL_COLORS.apoptotic).lerp(new THREE.Color("#f7f4ee"), 0.32);
      oxygenLow = new THREE.Color("#d36d5d");
      oxygenHigh = new THREE.Color("#0f79c8");
      oxygenColor = new THREE.Color();
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.set(0, 0, 4.3);
      scene.add(new THREE.HemisphereLight(0xfbfaf6, 0xc7d7d8, 2.6));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
      keyLight.position.set(-3, 4, 4);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0x80d4d0, 0.8);
      fillLight.position.set(3, -2, -3);
      scene.add(fillLight);
      organoid = new THREE.Group();
      scene.add(organoid);
      surfaceGeometry = makeIrregularSurface(THREE, currentState?.tissue || "generic", currentState?.geometry.anisotropy || 0.1);
      const cellGeometry = new THREE.IcosahedronGeometry(1, 1);
      const cellMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.94,
        metalness: 0,
        flatShading: true,
        clippingPlanes: []
      });
      cells = new THREE.InstancedMesh(cellGeometry, cellMaterial, PARTICLE_CAPACITY);
      cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      organoid.add(cells);
      divisionDaughters = new THREE.InstancedMesh(cellGeometry, cellMaterial, 14);
      divisionDaughters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      organoid.add(divisionDaughters);
      coreMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 14),
        new THREE.MeshBasicMaterial({ color: 0xd36d5d, transparent: true, opacity: 0.08, depthWrite: false, clippingPlanes: [] })
      );
      organoid.add(coreMesh);
      cystLumen = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 16),
        new THREE.MeshBasicMaterial({ color: 0xf7f4ee, transparent: true, opacity: 0.9, clippingPlanes: [] })
      );
      organoid.add(cystLumen);
      tissueHull = new THREE.Mesh(
        surfaceGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x7ca9a4,
          transparent: true,
          opacity: 0.045,
          depthWrite: false,
          side: THREE.DoubleSide,
          clippingPlanes: []
        })
      );
      organoid.add(tissueHull);
      transportShell = new THREE.Mesh(
        surfaceGeometry,
        new THREE.MeshBasicMaterial({ color: 0x80d4d0, wireframe: true, transparent: true, opacity: 0.13, clippingPlanes: [] })
      );
      organoid.add(transportShell);
      transportBody = new THREE.Mesh(
        surfaceGeometry,
        new THREE.MeshBasicMaterial({ color: 0x8fb8b1, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [] })
      );
      organoid.add(transportBody);
      transportCore = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 16),
        new THREE.MeshBasicMaterial({ color: 0x0f79c8, transparent: true, opacity: 0.35, depthWrite: false, clippingPlanes: [] })
      );
      organoid.add(transportCore);
      glucoseShell = new THREE.Mesh(
        surfaceGeometry,
        new THREE.MeshBasicMaterial({ color: 0x579b88, wireframe: true, transparent: true, opacity: 0.12, clippingPlanes: [] })
      );
      organoid.add(glucoseShell);
      floorPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 3.2),
        new THREE.MeshBasicMaterial({ color: 0x102235, transparent: true, opacity: 0.06, side: THREE.DoubleSide, clippingPlanes: [] })
      );
      floorPlane.rotation.x = -Math.PI / 2;
      organoid.add(floorPlane);
      voxelGrid = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 2.4, 2.4)),
        new THREE.LineBasicMaterial({ color: 0x9ca8b4, transparent: true, opacity: 0.18, clippingPlanes: [] })
      );
      organoid.add(voxelGrid);

      const resize = () => {
        const { width, height } = canvas.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas.parentElement);
      resize();
      canvas.hidden = false;
      fallbackWrap.hidden = true;
      applyClipMode();
      setDisplayMode();
    } catch (error) {
      console.warn("Three.js viewer unavailable; using the schematic fallback.", error);
      setFallbackVisible();
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    pointerX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointerX === null) return;
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
    setState(nextState, nextMorphology) {
      targetState = nextState;
      if (!currentState) currentState = structuredClone(nextState);
      targetMorphology = nextMorphology;
      currentMorphology = nextMorphology;
      prepareLayout(nextState, nextMorphology);
      if (!renderer) setFallbackVisible();
    },
    setLayers(nextLayers) {
      layers = { ...nextLayers };
      setDisplayMode();
    },
    setCutMode(nextCutMode) {
      cutMode = nextCutMode;
      applyClipMode();
      setDisplayMode();
    },
    visibleGlyphCount() {
      if (!layers.cells || !targetState || !cellLayout) return 0;
      const count = clamp(Math.round(targetState.population.renderedParticles), 130, PARTICLE_CAPACITY);
      let visible = 0;
      for (let index = 0; index < count; index += 1) {
        const x = cellLayout.positions[index * 3];
        if (cutMode === "half" && x < 0) continue;
        if (cutMode === "cross" && Math.abs(x) > 0.1) continue;
        visible += 1;
      }
      return visible;
    },
    dispose() {
      disposed = true;
      resizeObserver?.disconnect();
      renderer?.dispose();
    }
  };
}
