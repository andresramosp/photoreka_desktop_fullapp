// composables/3d-viewer/useTagBeacons.js
import { ref, watch } from "vue";
import * as THREE from "three";

// Configuración de filtrado de tags para beacons según el cluster type activo.
// Nota: los valores del cluster type vienen de use3DPhotos():
// - general | story | context | visual_accents | visual_aspects | artistic_scores
const TAG_BEACON_FILTER_BY_CLUSTER = {
  // Narrative
  story: {
    category: "context_story",
    groups: new Set(["person", "animals", "mood"]),
  },

  // Context
  context: {
    category: "context_story",
    groups: new Set(["toponym", "environment"]),
  },

  // Visual accents
  visual_accents: {
    category: "visual_accents",
    groups: null, // cualquiera
  },

  // Technical
  visual_aspects: {
    category: "visual_aspects",
    groups: null, // cualquiera
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
  if (!rule) return true; // general/artistic_scores u otros: no filtrar

  const tagCategory = normalizeKey(tag?.category);
  if (normalizeKey(rule.category) !== tagCategory) return false;

  if (rule.groups && rule.groups.size > 0) {
    const tagGroup = normalizeKey(tag?.group);
    return rule.groups.has(tagGroup);
  }

  return true;
}

/**
 * Sistema de "señales"/"beacons" de tags por zonas para navegación a larga distancia.
 * Agrupa fotos en celdas (grid XZ) y elige el tag dominante de cada celda.
 * Renderiza como overlay 2D proyectado (no añade geometría Three.js).
 */
export function useTagBeacons(
  cameraRef,
  photosRef,
  containerRef,
  clusterTypeRefOrValue = null
) {
  const config = ref({
    enabled: true,

    // Agrupación espacial
    cellSize: 40, // unidades del mundo (XZ)
    yOffset: 14, // elevación del beacon respecto al centroide

    // Umbrales de visibilidad/selección
    maxBeacons: 50,
    // Cuántos tags dominantes mostrar por zona (1 = solo el dominante)
    topTagsPerCell: 1,
    // Separación visual entre tags de la misma zona (en px, apilado vertical)
    stackPixelOffset: 18,
    // Fusionar beacons iguales cercanos (0 = desactivado)
    mergeSameTagRadius: 70,
    minPhotosInCell: 5,
    minDominantTagPhotos: 2,
    minDominantShare: 0.1, // dominante / total fotos en celda

    // Distancia cámara
    minDistance: 0, // no mostrar cerca
    maxDistance: 1200, // no mostrar ultra-lejos
    fadeDistance: 100, // suaviza entrada/salida
    avoidNearDistance: 45, // si estás demasiado cerca de la celda, ocultar

    // Color/intensidad (misma escala conceptual que floating tags)
    maxPhotoCount: 22,

    // Frecuencia de recomputo del clustering
    recomputeInterval: 2500,
  });

  const visibleBeacons = ref([]);

  let intervalId = null;

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
      1
    );

    let hue;
    if (normalized < 0.5) {
      hue = 200 + normalized * 2 * 80; // 200° -> 280°
    } else {
      hue = 280 + (normalized - 0.5) * 2 * 80; // 280° -> 360°
    }

    const saturation = 60 + normalized * 35;
    const lightness = 60 - normalized * 15;

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
  }

  function mergeBeaconsSameTag(beacons) {
    const radius = Number(config.value.mergeSameTagRadius) || 0;
    if (!radius || radius <= 0) return beacons;

    const radiusSq = radius * radius;
    const merged = [];

    // Asumimos que beacons viene ordenado por score desc (los más fuertes primero)
    for (const b of beacons) {
      const tagKey = `${b.category || "unknown"}_${b.name}`;
      const bx = Number(b.worldPosition?.[0]) || 0;
      const by = Number(b.worldPosition?.[1]) || 0;
      const bz = Number(b.worldPosition?.[2]) || 0;

      let mergedInto = null;
      for (const m of merged) {
        if (m.__tagKey !== tagKey) continue;

        const mx = Number(m.worldPosition?.[0]) || 0;
        const my = Number(m.worldPosition?.[1]) || 0;
        const mz = Number(m.worldPosition?.[2]) || 0;

        const dx = bx - mx;
        const dy = by - my;
        const dz = bz - mz;
        const dSq = dx * dx + dy * dy + dz * dz;
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
          __zSum: bz * b.count,
        });
        continue;
      }

      // Fusionar: ponderamos la posición por count (votos del tag dominante)
      mergedInto.__wSum += b.count;
      mergedInto.__xSum += bx * b.count;
      mergedInto.__ySum += by * b.count;
      mergedInto.__zSum += bz * b.count;

      mergedInto.count += b.count;
      mergedInto.cellPhotoCount += b.cellPhotoCount;
      mergedInto.share =
        mergedInto.cellPhotoCount > 0
          ? mergedInto.count / mergedInto.cellPhotoCount
          : mergedInto.share;

      const w = mergedInto.__wSum || 1;
      mergedInto.worldPosition = [
        mergedInto.__xSum / w,
        mergedInto.__ySum / w,
        mergedInto.__zSum / w,
      ];

      mergedInto.intensity = calculateIntensity(
        mergedInto.count,
        config.value.minDominantTagPhotos,
        config.value.maxPhotoCount
      );
      mergedInto.color = getColorByCount(
        mergedInto.count,
        config.value.minDominantTagPhotos,
        config.value.maxPhotoCount
      );
      mergedInto.score =
        mergedInto.count *
        (0.5 + 0.5 * mergedInto.share) *
        (1 + 0.02 * mergedInto.cellPhotoCount);
    }

    // Limpieza de props internas
    for (const m of merged) {
      delete m.__tagKey;
      delete m.__wSum;
      delete m.__xSum;
      delete m.__ySum;
      delete m.__zSum;
    }

    return merged;
  }

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

    const cellSize = Math.max(5, config.value.cellSize || 80);

    const cellMap = new Map();

    const clusterType = resolveClusterType(clusterTypeRefOrValue);

    for (const photo of photos) {
      const pos = photo?.position || photo?.coordinates;
      if (!Array.isArray(pos) || pos.length < 3) continue;

      const x = Number(pos[0]) || 0;
      const y = Number(pos[1]) || 0;
      const z = Number(pos[2]) || 0;

      const ix = Math.floor(x / cellSize);
      const iz = Math.floor(z / cellSize);
      const cellKey = `${ix}_${iz}`;

      let cell = cellMap.get(cellKey);
      if (!cell) {
        cell = {
          cellKey,
          ix,
          iz,
          photoCount: 0,
          sumX: 0,
          sumY: 0,
          sumZ: 0,
          tagMap: new Map(),
        };
        cellMap.set(cellKey, cell);
      }

      cell.photoCount++;
      cell.sumX += x;
      cell.sumY += y;
      cell.sumZ += z;

      const tags = extractPhotoTags(photo).filter((tag) =>
        isTagAllowedForCluster(tag, clusterType)
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
      Math.min(6, Number(config.value.topTagsPerCell) || 1)
    );

    for (const cell of cellMap.values()) {
      if (cell.photoCount < config.value.minPhotosInCell) continue;
      if (cell.tagMap.size === 0) continue;

      // Ordenar tags por frecuencia dentro de la celda
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
      const cy = cell.sumY / cell.photoCount + (config.value.yOffset || 0);
      const cz = cell.sumZ / cell.photoCount;

      let anyAdded = false;
      rankedTags.forEach((tag, index) => {
        if (!tag) return;
        if (tag.count < config.value.minDominantTagPhotos) return;

        const share = tag.count / cell.photoCount;
        if (share < config.value.minDominantShare) return;

        const intensity = calculateIntensity(
          tag.count,
          config.value.minDominantTagPhotos,
          config.value.maxPhotoCount
        );

        const color = getColorByCount(
          tag.count,
          config.value.minDominantTagPhotos,
          config.value.maxPhotoCount
        );

        // Penalizar ligeramente por rank para que el dominante se priorice
        const rank = index + 1;
        const rankFactor = Math.max(0.55, 1 - (rank - 1) * 0.15);

        const score =
          tag.count *
          (0.5 + 0.5 * share) *
          (1 + 0.02 * cell.photoCount) *
          rankFactor;

        beacons.push({
          key: `${cell.cellKey}_${tag.category || "unknown"}_${
            tag.name
          }_${rank}`,
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
          worldPosition: [cx, cy, cz],
          screen: { x: 0, y: 0 },
          opacity: 0,
          scale: 1,
          distance: 0,
        });
        anyAdded = true;
      });

      if (!anyAdded) continue;
    }

    beacons.sort((a, b) => b.score - a.score);

    const mergedBeacons = mergeBeaconsSameTag(beacons);
    mergedBeacons.sort((a, b) => b.score - a.score);

    visibleBeacons.value = mergedBeacons.slice(
      0,
      Math.max(0, config.value.maxBeacons || 0)
    );

    updateScreenPositions();
  }

  function updateScreenPositions() {
    const camera = cameraRef?.value;
    const container = containerRef?.value;
    if (!camera || !container) return;

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;

    const camPos = camera.position;

    const stackOffset = Number(config.value.stackPixelOffset) || 0;

    for (const beacon of visibleBeacons.value) {
      const [x, y, z] = beacon.worldPosition || [0, 0, 0];

      const dx = camPos.x - x;
      const dy = camPos.y - y;
      const dz = camPos.z - z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      beacon.distance = dist;

      // Reglas de distancia
      if (
        dist < config.value.minDistance ||
        dist > config.value.maxDistance ||
        dist < config.value.avoidNearDistance
      ) {
        beacon.opacity = 0;
        continue;
      }

      // Fade in/out
      const fade = Math.max(1, config.value.fadeDistance || 1);
      const inFactor = smoothstep(
        config.value.minDistance,
        config.value.minDistance + fade,
        dist
      );
      const outFactor =
        1 -
        smoothstep(
          config.value.maxDistance - fade,
          config.value.maxDistance,
          dist
        );
      const distanceFactor = Math.max(0, Math.min(inFactor * outFactor, 1));

      // Proyección a pantalla
      const v = new THREE.Vector3(x, y, z);
      v.project(camera);

      const inClip = v.z >= -1 && v.z <= 1;
      if (!inClip) {
        beacon.opacity = 0;
        continue;
      }

      if (v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) {
        beacon.opacity = 0;
        continue;
      }

      const sx = (v.x * 0.5 + 0.5) * width;
      const syBase = (-v.y * 0.5 + 0.5) * height;

      // Apilado de tags de la misma zona para evitar superposición
      const stackIndex = Number(beacon.stackIndex) || 0;
      const sy = syBase + (stackOffset > 0 ? stackIndex * stackOffset : 0);

      beacon.screen.x = sx;
      beacon.screen.y = sy;

      // Opacidad base independiente de la intensidad (la intensidad ya se expresa con el color)
      const baseOpacity = 0.8;
      const rank = Number(beacon.rank) || 1;
      const rankAlpha = Math.max(0.85, 1 - (rank - 1) * 0.12);
      beacon.opacity = baseOpacity * distanceFactor * rankAlpha;
      beacon.scale = 0.9 + beacon.intensity * 0.25;
    }
  }

  function startUpdateLoop() {
    if (intervalId) return;

    recomputeBeacons();

    intervalId = setInterval(() => {
      if (!config.value.enabled) return;
      recomputeBeacons();
    }, Math.max(300, config.value.recomputeInterval || 2500));
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

  // Reactividad mínima: recomputa cuando cambian umbrales o volumen de fotos
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
      config.value.minDistance,
      config.value.maxDistance,
      config.value.fadeDistance,
      config.value.avoidNearDistance,
      config.value.maxPhotoCount,
    ],
    () => {
      if (config.value.enabled) {
        recomputeBeacons();
      } else {
        visibleBeacons.value = [];
      }
    }
  );

  watch(
    () => photosRef?.value?.length || 0,
    () => {
      if (config.value.enabled) recomputeBeacons();
    }
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
