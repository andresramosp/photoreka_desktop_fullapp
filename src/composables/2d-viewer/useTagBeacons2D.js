// composables/2d-viewer/useTagBeacons2D.js
//
// 2D adaptation of the 3D tag beacons system (useTagBeacons.js).
// Groups photos into spatial cells, picks dominant tags per cell,
// and projects them as overlay screen-space beacons.
//
// Key difference from 3D: positions are [x, y] (no z), projection is
// a simple affine transform (scale + offset) instead of perspective.

import { ref, watch } from "vue";

// ── Cluster-type tag filtering (shared with 3D) ─────────────────────
const TAG_BEACON_FILTER_BY_CLUSTER = {
  story: {
    category: "context_story",
    groups: new Set(["person", "animals", "mood"]),
  },
  context: {
    category: "context_story",
    groups: new Set(["toponym", "environment"]),
  },
  visual_accents: {
    category: "visual_accents",
    groups: null,
  },
  visual_aspects: {
    category: "visual_aspects",
    groups: null,
  },
};

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveClusterType(clusterTypeRefOrValue) {
  if (
    clusterTypeRefOrValue &&
    typeof clusterTypeRefOrValue === "object" &&
    "value" in clusterTypeRefOrValue
  ) {
    return clusterTypeRefOrValue.value;
  }
  return clusterTypeRefOrValue;
}

function isTagAllowedForCluster(tag, clusterType) {
  const ct = normalizeKey(clusterType);
  const rule = TAG_BEACON_FILTER_BY_CLUSTER[ct];
  if (!rule) return true;

  const tagCategory = normalizeKey(tag?.category);
  if (normalizeKey(rule.category) !== tagCategory) return false;

  if (rule.groups && rule.groups.size > 0) {
    const tagGroup = normalizeKey(tag?.group);
    return rule.groups.has(tagGroup);
  }

  return true;
}

/**
 * 2D Tag Beacons system.
 *
 * @param {import('vue').Ref} photosRef       – filtered photos (each with position [x,y] & tags)
 * @param {import('vue').Ref} containerRef    – DOM container for width/height
 * @param {import('vue').Ref} scaleRef        – current zoom level
 * @param {import('vue').Ref} offsetXRef      – current pan X (screen px)
 * @param {import('vue').Ref} offsetYRef      – current pan Y (screen px)
 * @param {number}            scaleFactor     – world→canvas multiplier (default 50)
 * @param {any}               clusterTypeRefOrValue – current clustering type
 */
export function useTagBeacons2D(
  photosRef,
  containerRef,
  scaleRef,
  offsetXRef,
  offsetYRef,
  scaleFactor = 50,
  clusterTypeRefOrValue = null,
) {
  const config = ref({
    enabled: false,

    // Spatial grouping (world units, same as 3D but only XY)
    cellSize: 40,
    yOffset: 0, // not used visually in 2D but kept for API parity

    // Beacon selection
    maxBeacons: 50,
    topTagsPerCell: 1,
    stackPixelOffset: 18,
    mergeSameTagRadius: 70,
    minPhotosInCell: 5,
    minDominantTagPhotos: 2,
    minDominantShare: 0.1,

    // Visibility distance (in screen pixels from viewport centre)
    // In 2D we skip distance-based fade – all visible beacons inside the
    // viewport (with generous margin) are shown.
    viewportMargin: 200, // px beyond viewport edges

    // Color intensity scaling
    maxPhotoCount: 22,

    // Recompute interval
    recomputeInterval: 2500,
  });

  const visibleBeacons = ref([]);

  let intervalId = null;

  // ── Helpers (identical to 3D) ──────────────────────────────────────

  function extractPhotoTags(photo) {
    const tags =
      photo?.tags || photo?.descriptions?.tags || photo?.metadata?.tags || [];
    return Array.isArray(tags) ? tags : [];
  }

  function calculateIntensity(count, minCount, maxCount) {
    if (count <= minCount) return 0.3;
    if (count >= maxCount) return 1.0;
    return 0.3 + (0.7 * (count - minCount)) / (maxCount - minCount);
  }

  function getColorByCount(count, minCount, maxCount) {
    const normalized = Math.min(
      Math.max((count - minCount) / (maxCount - minCount), 0),
      1,
    );

    let hue;
    if (normalized < 0.5) {
      hue = 200 + normalized * 2 * 80;
    } else {
      hue = 280 + (normalized - 0.5) * 2 * 80;
    }

    const saturation = 60 + normalized * 35;
    const lightness = 60 - normalized * 15;

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  // ── Merge same-tag beacons that are close together ─────────────────

  function mergeBeaconsSameTag(beacons) {
    const radius = Number(config.value.mergeSameTagRadius) || 0;
    if (!radius || radius <= 0) return beacons;

    const radiusSq = radius * radius;
    const merged = [];

    for (const b of beacons) {
      const tagKey = `${b.category || "unknown"}_${b.name}`;
      const bx = Number(b.worldPosition?.[0]) || 0;
      const by = Number(b.worldPosition?.[1]) || 0;

      let mergedInto = null;
      for (const m of merged) {
        if (m.__tagKey !== tagKey) continue;

        const mx = Number(m.worldPosition?.[0]) || 0;
        const my = Number(m.worldPosition?.[1]) || 0;

        const dx = bx - mx;
        const dy = by - my;
        const dSq = dx * dx + dy * dy;
        if (dSq <= radiusSq) {
          mergedInto = m;
          break;
        }
      }

      if (!mergedInto) {
        merged.push({
          ...b,
          __tagKey: tagKey,
          __wSum: b.count,
          __xSum: bx * b.count,
          __ySum: by * b.count,
        });
        continue;
      }

      mergedInto.__wSum += b.count;
      mergedInto.__xSum += bx * b.count;
      mergedInto.__ySum += by * b.count;

      mergedInto.count += b.count;
      mergedInto.cellPhotoCount += b.cellPhotoCount;
      mergedInto.share =
        mergedInto.cellPhotoCount > 0
          ? mergedInto.count / mergedInto.cellPhotoCount
          : mergedInto.share;

      const w = mergedInto.__wSum || 1;
      mergedInto.worldPosition = [mergedInto.__xSum / w, mergedInto.__ySum / w];

      mergedInto.intensity = calculateIntensity(
        mergedInto.count,
        config.value.minDominantTagPhotos,
        config.value.maxPhotoCount,
      );
      mergedInto.color = getColorByCount(
        mergedInto.count,
        config.value.minDominantTagPhotos,
        config.value.maxPhotoCount,
      );
      mergedInto.score =
        mergedInto.count *
        (0.5 + 0.5 * mergedInto.share) *
        (1 + 0.02 * mergedInto.cellPhotoCount);
    }

    for (const m of merged) {
      delete m.__tagKey;
      delete m.__wSum;
      delete m.__xSum;
      delete m.__ySum;
    }

    return merged;
  }

  // ── Main recompute ─────────────────────────────────────────────────

  function recomputeBeacons() {
    if (!config.value.enabled) {
      visibleBeacons.value = [];
      return;
    }

    const photos = photosRef?.value || [];
    if (!photos.length) {
      visibleBeacons.value = [];
      return;
    }

    const cellSize = Math.max(1, config.value.cellSize || 40);
    const cellMap = new Map();
    const clusterType = resolveClusterType(clusterTypeRefOrValue);

    for (const photo of photos) {
      const pos = photo?.position || photo?.coordinates;
      if (!Array.isArray(pos) || pos.length < 2) continue;

      const x = Number(pos[0]) || 0;
      const y = Number(pos[1]) || 0;

      const ix = Math.floor(x / cellSize);
      const iy = Math.floor(y / cellSize);
      const cellKey = `${ix}_${iy}`;

      let cell = cellMap.get(cellKey);
      if (!cell) {
        cell = {
          cellKey,
          ix,
          iy,
          photoCount: 0,
          sumX: 0,
          sumY: 0,
          tagMap: new Map(),
        };
        cellMap.set(cellKey, cell);
      }

      cell.photoCount++;
      cell.sumX += x;
      cell.sumY += y;

      const tags = extractPhotoTags(photo).filter((tag) =>
        isTagAllowedForCluster(tag, clusterType),
      );
      for (const tag of tags) {
        if (!tag?.name) continue;
        const tagKey = `${tag.category || "unknown"}_${tag.name}`;

        let tagData = cell.tagMap.get(tagKey);
        if (!tagData) {
          tagData = {
            id: tag.id,
            name: tag.name,
            category: tag.category,
            group: tag.group,
            photoIds: new Set(),
          };
          cell.tagMap.set(tagKey, tagData);
        }
        tagData.photoIds.add(photo.id);
      }
    }

    const beacons = [];
    const topK = Math.max(
      1,
      Math.min(6, Number(config.value.topTagsPerCell) || 1),
    );

    for (const cell of cellMap.values()) {
      if (cell.photoCount < config.value.minPhotosInCell) continue;
      if (cell.tagMap.size === 0) continue;

      const rankedTags = Array.from(cell.tagMap.values())
        .map((td) => ({
          id: td.id,
          name: td.name,
          category: td.category,
          group: td.group,
          count: td.photoIds.size,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topK);

      if (rankedTags.length === 0) continue;

      const cx = cell.sumX / cell.photoCount;
      const cy = cell.sumY / cell.photoCount;

      rankedTags.forEach((tag, index) => {
        if (!tag) return;
        if (tag.count < config.value.minDominantTagPhotos) return;

        const share = tag.count / cell.photoCount;
        if (share < config.value.minDominantShare) return;

        const intensity = calculateIntensity(
          tag.count,
          config.value.minDominantTagPhotos,
          config.value.maxPhotoCount,
        );

        const color = getColorByCount(
          tag.count,
          config.value.minDominantTagPhotos,
          config.value.maxPhotoCount,
        );

        const rank = index + 1;
        const rankFactor = Math.max(0.55, 1 - (rank - 1) * 0.15);

        const score =
          tag.count *
          (0.5 + 0.5 * share) *
          (1 + 0.02 * cell.photoCount) *
          rankFactor;

        beacons.push({
          key: `${cell.cellKey}_${tag.category || "unknown"}_${tag.name}_${rank}`,
          cellKey: cell.cellKey,
          name: tag.name,
          category: tag.category,
          group: tag.group,
          count: tag.count,
          cellPhotoCount: cell.photoCount,
          share,
          intensity,
          color,
          score,
          rank,
          stackIndex: index,
          worldPosition: [cx, cy],
          screen: { x: 0, y: 0 },
          opacity: 0,
          scale: 1,
        });
      });
    }

    beacons.sort((a, b) => b.score - a.score);

    const mergedBeacons = mergeBeaconsSameTag(beacons);
    mergedBeacons.sort((a, b) => b.score - a.score);

    visibleBeacons.value = mergedBeacons.slice(
      0,
      Math.max(0, config.value.maxBeacons || 0),
    );

    updateScreenPositions();
  }

  // ── Screen projection (2D affine: world * scaleFactor * zoom + offset) ──

  function updateScreenPositions() {
    const container = containerRef?.value;
    if (!container) return;

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    const sc = scaleRef?.value ?? 1;
    const ox = offsetXRef?.value ?? 0;
    const oy = offsetYRef?.value ?? 0;
    const margin = config.value.viewportMargin || 0;
    const stackOffset = Number(config.value.stackPixelOffset) || 0;

    for (const beacon of visibleBeacons.value) {
      const [wx, wy] = beacon.worldPosition || [0, 0];

      // World → canvas (same formula used by Photos2D sprites)
      const canvasX = wx * scaleFactor;
      const canvasY = wy * scaleFactor;

      // Canvas → screen
      const sx = canvasX * sc + ox;
      const syBase = canvasY * sc + oy;

      // Stack offset for multiple tags in same cell
      const stackIdx = Number(beacon.stackIndex) || 0;
      const sy = syBase + (stackOffset > 0 ? stackIdx * stackOffset : 0);

      // Viewport cull with margin
      if (
        sx < -margin ||
        sx > width + margin ||
        sy < -margin ||
        sy > height + margin
      ) {
        beacon.opacity = 0;
        continue;
      }

      beacon.screen.x = sx;
      beacon.screen.y = sy;

      const baseOpacity = 0.85;
      const rank = Number(beacon.rank) || 1;
      const rankAlpha = Math.max(0.85, 1 - (rank - 1) * 0.12);
      beacon.opacity = baseOpacity * rankAlpha;
      beacon.scale = 0.9 + beacon.intensity * 0.25;
    }
  }

  // ── Lifecycle helpers ──────────────────────────────────────────────

  function startUpdateLoop() {
    if (intervalId) return;

    recomputeBeacons();

    intervalId = setInterval(
      () => {
        if (!config.value.enabled) return;
        recomputeBeacons();
      },
      Math.max(300, config.value.recomputeInterval || 2500),
    );
  }

  function stopUpdateLoop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function reset() {
    stopUpdateLoop();
    visibleBeacons.value = [];
  }

  // ── Reactivity ─────────────────────────────────────────────────────

  watch(
    () => [
      config.value.enabled,
      config.value.cellSize,
      config.value.maxBeacons,
      config.value.topTagsPerCell,
      config.value.stackPixelOffset,
      config.value.mergeSameTagRadius,
      config.value.minPhotosInCell,
      config.value.minDominantTagPhotos,
      config.value.minDominantShare,
      config.value.maxPhotoCount,
    ],
    () => {
      if (config.value.enabled) {
        recomputeBeacons();
      } else {
        visibleBeacons.value = [];
      }
    },
  );

  watch(
    () => photosRef?.value?.length || 0,
    () => {
      if (config.value.enabled) recomputeBeacons();
    },
  );

  // Re-project on pan/zoom changes (cheap – no clustering recompute)
  watch(
    () => [scaleRef?.value, offsetXRef?.value, offsetYRef?.value],
    () => {
      if (config.value.enabled && visibleBeacons.value.length > 0) {
        updateScreenPositions();
      }
    },
  );

  return {
    config,
    visibleBeacons,
    recomputeBeacons,
    updateScreenPositions,
    startUpdateLoop,
    stopUpdateLoop,
    reset,
  };
}
