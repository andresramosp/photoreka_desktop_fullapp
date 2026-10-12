// utils/adaptiveInitialSpacing.js
// Adaptive initial spacing for 3D photo positions.
// Goal: expand dense clusters slightly to reduce overlap while preserving global shape.
// Approach:
//  1. Compute local densities via a lightweight spatial hash grid.
//  2. Apply a density-weighted radial expansion from the global centroid.
//  3. Run a few iterations of symmetric local repulsion for points in dense regions.
//  4. Blend relaxed positions only for high-density points (smoothstep).
// Complexity: ~O(n * k) with small k due to limited neighbor checks per cell.

/**
 * Build a spatial hash grid for fast neighbor lookups.
 * @param {number[][]} positions
 * @param {number} cellSize
 * @returns {{cellSize:number, map: Map<string, number[]>, toKey:(x:number,y:number,z:number)=>string}}
 */
function buildGrid(positions, cellSize) {
  const map = new Map();
  const toKey = (x, y, z) =>
    `${Math.floor(x / cellSize)}|${Math.floor(y / cellSize)}|${Math.floor(
      z / cellSize
    )}`;
  positions.forEach((p, idx) => {
    const key = toKey(p[0], p[1], p[2]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(idx);
  });
  return { cellSize, map, toKey };
}

/**
 * Collect neighbor indices around a position using the grid.
 * @param {object} grid
 * @param {number[]} p
 * @returns {number[]}
 */
function getNeighborIndices(grid, p) {
  const { cellSize, toKey, map } = grid;
  const cx = Math.floor(p[0] / cellSize);
  const cy = Math.floor(p[1] / cellSize);
  const cz = Math.floor(p[2] / cellSize);
  const res = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx}|${cy + dy}|${cz + dz}`;
        const arr = map.get(key);
        if (arr) res.push(...arr);
      }
    }
  }
  return res;
}

/**
 * Smoothstep function.
 */
function smoothstep(a, b, x) {
  if (b - a < 1e-9) return 0;
  let t = (x - a) / (b - a);
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/**
 * Compute local densities using grid counts (sum of neighbor cell counts minus 1).
 * @param {number[][]} positions
 * @param {number} cellSize
 * @returns {{dens:number[], norm:number[]}}
 */
function computeDensities(positions, cellSize) {
  const grid = buildGrid(positions, cellSize);
  const dens = new Array(positions.length).fill(0);
  let dMin = Number.POSITIVE_INFINITY;
  let dMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < positions.length; i++) {
    const neighbors = getNeighborIndices(grid, positions[i]);
    const d = neighbors.length - 1; // exclude itself
    dens[i] = d;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }
  if (!isFinite(dMin)) dMin = 0;
  if (!isFinite(dMax)) dMax = 0;
  const range = dMax - dMin;
  const norm = dens.map((d) => (range > 1e-9 ? (d - dMin) / range : 0));
  return { dens, norm };
}

/**
 * Compute centroid of points.
 */
function centroid(positions) {
  const c = [0, 0, 0];
  const n = positions.length || 1;
  for (const p of positions) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  return c;
}

/**
 * Adaptive initial spacing main function.
 * @param {number[][]} positions
 * @param {object} opts
 */
export function adaptiveInitialSpacing(positions, opts = {}) {
  const {
    inflateFactorBase = 1.1, // reducir baseline para que se note más la parte adaptativa
    gamma = 1.8,
    cellSize = 4.5, // celdas un poco más pequeñas -> más contraste densidad
    alphaLocal = (inflateFactorBase - 1) * 2.2, // subir peso local
    densityThreshold = 0.25,
    minSeparation = 4.6,
    iterations = 3,
    enableRelaxation = true,
    // Nuevos parámetros
    aggressiveness = 1.0, // multiplicador global de fuerzas locales
    clusterIterations = 2, // iteraciones extra sobre puntos muy densos
    highDensityThreshold = 0.65, // umbral para considerar 'muy denso'
    highDensityBoost = 0.35, // expansión extra radial para muy densos
    nnLocalScale = true, // usar distancia al vecino más cercano para factor adicional
    nnTarget = 5.2, // separación deseada local usando nearest neighbor
  } = opts;

  if (!positions || positions.length < 6) {
    // Too few points, skip heavy ops
    return positions.map((p) => [...p]);
  }

  // 1. Densities
  const { norm: dNorm } = computeDensities(positions, cellSize);

  // 1.5. Nearest-neighbor distances (opcional) para reforzar clusters compactos
  let nnDistances = null;
  if (nnLocalScale) {
    const gridNN = buildGrid(positions, Math.max(3, cellSize * 0.9));
    nnDistances = positions.map((p, i) => {
      const neighIdx = getNeighborIndices(gridNN, p);
      let best = Infinity;
      for (const j of neighIdx) {
        if (j === i) continue;
        const q = positions[j];
        const dx = p[0] - q[0];
        const dy = p[1] - q[1];
        const dz = p[2] - q[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < best) best = dist;
      }
      return isFinite(best) ? best : nnTarget; // fallback si aislado
    });
  }

  // 2. Density-weighted radial expansion
  const C = centroid(positions);
  const base = positions.map((p, i) => {
    const v = [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
    // Factor por densidad
    let localFactor = 1 + alphaLocal * Math.pow(dNorm[i], gamma);
    // Boost adicional para muy densos
    if (dNorm[i] >= highDensityThreshold) {
      localFactor *= 1 + highDensityBoost * aggressiveness;
    }
    // Ajuste por nearest neighbor (si muy juntos, empuja más)
    if (nnDistances) {
      const nn = nnDistances[i];
      if (nn < nnTarget) {
        const shortage = (nnTarget - nn) / nnTarget; // (0..1)
        localFactor *= 1 + shortage * 0.9 * aggressiveness;
      }
    }
    return [
      C[0] + v[0] * inflateFactorBase * localFactor,
      C[1] + v[1] * inflateFactorBase * localFactor,
      C[2] + v[2] * inflateFactorBase * localFactor,
    ];
  });

  if (!enableRelaxation) return base;

  // 3. Local relaxation (repulsion) only for dense points
  let relaxed = base.map((p) => [...p]);
  const activeIdx = [];
  dNorm.forEach((v, i) => v >= densityThreshold && activeIdx.push(i));
  if (activeIdx.length === 0) return base;

  for (let it = 0; it < iterations; it++) {
    const grid = buildGrid(relaxed, minSeparation); // grid cell ~ min separation
    const disp = Array(relaxed.length)
      .fill(0)
      .map(() => [0, 0, 0]);
    for (const i of activeIdx) {
      const p = relaxed[i];
      const neighbors = getNeighborIndices(grid, p);
      for (const j of neighbors) {
        if (i === j) continue;
        const q = relaxed[j];
        let dx = p[0] - q[0];
        let dy = p[1] - q[1];
        let dz = p[2] - q[2];
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-9;
        if (dist < minSeparation) {
          const push = 1 - dist / minSeparation; // (0,1]
          // Normalize direction
          dx /= dist;
          dy /= dist;
          dz /= dist;
          const step = Math.min(push * 0.65 * aggressiveness, 0.55); // más fuerte
          disp[i][0] += dx * step;
          disp[i][1] += dy * step;
          disp[i][2] += dz * step;
          // Symmetric opposite force for stability
          disp[j][0] -= dx * step * 0.35;
          disp[j][1] -= dy * step * 0.35;
          disp[j][2] -= dz * step * 0.35;
        }
      }
    }
    // Apply displacements
    for (let k = 0; k < relaxed.length; k++) {
      relaxed[k][0] += disp[k][0];
      relaxed[k][1] += disp[k][1];
      relaxed[k][2] += disp[k][2];
    }
  }

  // 3b. Iteraciones extra enfocadas SOLO en muy densos (clusterIterations)
  if (clusterIterations > 0) {
    const veryDense = [];
    dNorm.forEach((v, i) => v >= highDensityThreshold && veryDense.push(i));
    for (let it = 0; it < clusterIterations; it++) {
      const gridC = buildGrid(relaxed, minSeparation * 0.9);
      const disp = Array(relaxed.length)
        .fill(0)
        .map(() => [0, 0, 0]);
      for (const i of veryDense) {
        const p = relaxed[i];
        const neighbors = getNeighborIndices(gridC, p);
        for (const j of neighbors) {
          if (i === j) continue;
          const q = relaxed[j];
          let dx = p[0] - q[0];
          let dy = p[1] - q[1];
          let dz = p[2] - q[2];
          let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-9;
          if (dist < nnTarget) {
            const push = 1 - dist / nnTarget;
            dx /= dist;
            dy /= dist;
            dz /= dist;
            const step = Math.min(push * 0.55 * aggressiveness, 0.45);
            disp[i][0] += dx * step;
            disp[i][1] += dy * step;
            disp[i][2] += dz * step;
          }
        }
      }
      for (const idx of veryDense) {
        relaxed[idx][0] += disp[idx][0];
        relaxed[idx][1] += disp[idx][1];
        relaxed[idx][2] += disp[idx][2];
      }
    }
  }

  // 4. Blend only dense points (smoothstep)
  const finalPos = base.map((p, i) => {
    const r = relaxed[i];
    // Doble peso para muy densos
    let t = smoothstep(densityThreshold, 1, dNorm[i]);
    if (dNorm[i] >= highDensityThreshold) t = Math.min(1, t * 1.35);
    return [
      p[0] + (r[0] - p[0]) * t,
      p[1] + (r[1] - p[1]) * t,
      p[2] + (r[2] - p[2]) * t,
    ];
  });

  if (process.env.NODE_ENV !== "production") {
    const sample = finalPos.slice(0, 3);
    console.log("[adaptiveInitialSpacing] stats", {
      count: finalPos.length,
      densSample: dNorm.slice(0, 3),
      nnSample: nnDistances ? nnDistances.slice(0, 3) : null,
      sample,
    });
  }

  return finalPos;
}

export default adaptiveInitialSpacing;
