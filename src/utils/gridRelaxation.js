// utils/gridRelaxation.js
// Dimension-agnostic (2D/3D) overlap-free relaxation for photo positions.
// It treats each item as an axis-aligned box (2D: rectangle, 3D: cuboid) centered
// at its coordinates, and iteratively resolves overlaps using a spatial hash.

/**
 * @typedef {object} GridRelaxationOptions
 * @property {number} [dims] - 2 or 3. If omitted, inferred from first position.
 * @property {(item:any)=>number[]} [getPosition] - Extracts a vector from an item.
 * @property {(item:any, dims:number)=>number[]} [getHalfSize] - Returns half-size per axis.
 * @property {number} [baseSize] - Fallback full size in "world units" (max side).
 * @property {number} [depthSize] - Full size for Z in 3D when no photo dims.
 * @property {number} [padding] - Extra separation added on top of sizes.
 * @property {number} [iterations] - Iterations of overlap resolution.
 * @property {number} [cellSize] - Spatial hash cell size.
 * @property {boolean} [preserveCentroid] - Keep global centroid stable.
 * @property {number} [maxStep] - Clamp max displacement per-iteration per-axis.
 * @property {number} [stepScale] - Scales the overlap correction step.
 * @property {boolean} [snapToGrid] - If true, quantize positions after relaxation.
 * @property {number} [gridSize] - Quantization size when snapToGrid is enabled.
 */

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function safeNumber(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function centroid(positions, dims) {
  const c = new Array(dims).fill(0);
  const n = positions.length || 1;
  for (const p of positions) {
    for (let k = 0; k < dims; k++) c[k] += safeNumber(p[k], 0);
  }
  for (let k = 0; k < dims; k++) c[k] /= n;
  return c;
}

function inferDimsFromPosition(p) {
  if (Array.isArray(p) && p.length >= 3) return 3;
  return 2;
}

function defaultGetPosition(item) {
  return item?.coordinates || item?.position || item?.coords || [0, 0, 0];
}

function defaultGetHalfSize(item, dims, baseSize, depthSize) {
  const w = safeNumber(item?.width, NaN);
  const h = safeNumber(item?.height, NaN);

  // If we have real pixel dimensions, preserve aspect ratio but keep max side = baseSize.
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    const aspect = w / h;
    let fullW;
    let fullH;

    if (aspect >= 1) {
      fullW = baseSize;
      fullH = baseSize / aspect;
    } else {
      fullH = baseSize;
      fullW = baseSize * aspect;
    }

    if (dims === 2) return [fullW / 2, fullH / 2];

    // 3D: use depthSize (or baseSize) as Z.
    const fullZ = depthSize ?? baseSize;
    return [fullW / 2, fullH / 2, fullZ / 2];
  }

  // Fallback: uniform box.
  const half = baseSize / 2;
  if (dims === 2) return [half, half];
  return [half, half, (depthSize ?? baseSize) / 2];
}

function buildGrid(positions, cellSize, dims) {
  const map = new Map();
  const toKey = (p) => {
    if (dims === 2) {
      return `${Math.floor(p[0] / cellSize)}|${Math.floor(p[1] / cellSize)}`;
    }
    return `${Math.floor(p[0] / cellSize)}|${Math.floor(p[1] / cellSize)}|${Math.floor(p[2] / cellSize)}`;
  };

  positions.forEach((p, idx) => {
    const key = toKey(p);
    const arr = map.get(key);
    if (arr) arr.push(idx);
    else map.set(key, [idx]);
  });

  return { map };
}

function neighborCellsKeys(p, cellSize, dims) {
  const cx = Math.floor(p[0] / cellSize);
  const cy = Math.floor(p[1] / cellSize);
  if (dims === 2) {
    const keys = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        keys.push(`${cx + dx}|${cy + dy}`);
      }
    }
    return keys;
  }

  const cz = Math.floor(p[2] / cellSize);
  const keys = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        keys.push(`${cx + dx}|${cy + dy}|${cz + dz}`);
      }
    }
  }
  return keys;
}

function pseudoSign(i, j) {
  // Deterministic pseudo-random sign from indices.
  const x = (i * 73856093) ^ (j * 19349663);
  return x % 2 === 0 ? 1 : -1;
}

/**
 * Computes relaxed positions for an array of items (photos or raw points).
 * Returns an array of vectors (same order).
 *
 * @param {any[]} items
 * @param {GridRelaxationOptions} [opts]
 * @returns {number[][]}
 */
export function gridRelaxation(items, opts = {}) {
  const {
    getPosition = defaultGetPosition,
    dims: dimsOpt,
    getHalfSize,
    baseSize = 4,
    depthSize,
    padding = 0.15,
    iterations,
    cellSize: cellSizeOpt,
    preserveCentroid = true,
    maxStep = 2.0,
    stepScale = 0.85,
    snapToGrid = false,
    gridSize,
  } = opts;

  if (!Array.isArray(items) || items.length === 0) return [];

  const raw0 = getPosition(items[0]);
  const dims = dimsOpt ?? inferDimsFromPosition(raw0);
  const iters = iterations ?? (dims === 2 ? 10 : 8);

  // Positions (copy)
  const positions = items.map((item) => {
    const p = getPosition(item) || [];
    const out = new Array(dims).fill(0);
    for (let k = 0; k < dims; k++) out[k] = safeNumber(p[k], 0);
    return out;
  });

  // Half sizes
  const halfSizes = items.map((item) => {
    if (typeof getHalfSize === "function") return getHalfSize(item, dims);
    return defaultGetHalfSize(item, dims, baseSize, depthSize);
  });

  // Determine a reasonable cell size (based on average max side + padding)
  let avgMaxSide = 0;
  for (const hs of halfSizes) {
    const maxHalf = Math.max(...hs);
    avgMaxSide += maxHalf * 2;
  }
  avgMaxSide /= halfSizes.length || 1;
  const cellSize = cellSizeOpt ?? Math.max(0.5, avgMaxSide + padding * 2);

  const c0 = preserveCentroid ? centroid(positions, dims) : null;

  for (let iter = 0; iter < iters; iter++) {
    const grid = buildGrid(positions, cellSize, dims);
    const disp = positions.map(() => new Array(dims).fill(0));

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const keys = neighborCellsKeys(p, cellSize, dims);

      for (const key of keys) {
        const candidates = grid.map.get(key);
        if (!candidates) continue;

        for (const j of candidates) {
          if (j <= i) continue;

          const q = positions[j];
          const hi = halfSizes[i];
          const hj = halfSizes[j];

          // Check AABB overlap.
          let overlapsAllAxes = true;
          const overlaps = new Array(dims).fill(0);
          const deltas = new Array(dims).fill(0);

          for (let k = 0; k < dims; k++) {
            const d = safeNumber(p[k], 0) - safeNumber(q[k], 0);
            deltas[k] = d;
            const overlap = hi[k] + hj[k] + padding - Math.abs(d);
            overlaps[k] = overlap;
            if (overlap <= 0) overlapsAllAxes = false;
          }

          if (!overlapsAllAxes) continue;

          // Resolve with minimal translation along the axis that requires least movement.
          let axis = 0;
          let minOverlap = overlaps[0];
          for (let k = 1; k < dims; k++) {
            if (overlaps[k] < minOverlap) {
              minOverlap = overlaps[k];
              axis = k;
            }
          }

          let sign =
            deltas[axis] === 0 ? pseudoSign(i, j) : deltas[axis] > 0 ? 1 : -1;
          const shift = minOverlap * stepScale;

          disp[i][axis] += (shift / 2) * sign;
          disp[j][axis] -= (shift / 2) * sign;
        }
      }
    }

    // Apply displacements (clamped)
    for (let i = 0; i < positions.length; i++) {
      for (let k = 0; k < dims; k++) {
        const d = clamp(disp[i][k], -maxStep, maxStep);
        positions[i][k] += d;
      }
    }
  }

  if (preserveCentroid && c0) {
    const c1 = centroid(positions, dims);
    for (let i = 0; i < positions.length; i++) {
      for (let k = 0; k < dims; k++) {
        positions[i][k] -= c1[k] - c0[k];
      }
    }
  }

  if (snapToGrid) {
    const gs = gridSize ?? cellSize;
    if (gs > 1e-9) {
      for (let i = 0; i < positions.length; i++) {
        for (let k = 0; k < dims; k++) {
          positions[i][k] = Math.round(positions[i][k] / gs) * gs;
        }
      }
    }
  }

  return positions;
}

export default gridRelaxation;
