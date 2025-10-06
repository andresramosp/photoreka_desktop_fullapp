// composables/3d-viewer/useFloatingTags.js
import { ref, computed, watch } from "vue";
import * as THREE from "three";

/**
 * Composable para gestionar tags flotantes en la escena 3D
 * según la posición de la cámara y la densidad de tags cercanos
 *
 * @param {Object} camera - Cámara de Three.js
 * @param {Object} photos - Array reactivo de fotos con sus tags
 * @param {Object} octree - Octree para búsqueda espacial eficiente (opcional)
 * @returns {Object} Estado y métodos para gestionar tags flotantes
 */
export function useFloatingTags(camera, photos, octree = null) {
  // ===== Configuración =====
  const config = ref({
    enabled: true, // Activar/desactivar sistema de tags
    detectionRadius: 15, // Radio de la esfera de detección en unidades del mundo
    updateInterval: 100, // Intervalo de actualización en ms (reducido para más responsividad)
    maxTagsToShow: 9, // Máximo número de tags únicos a mostrar
    minPhotoCount: 1, // Mínimo de fotos para mostrar un tag
    maxPhotoCount: 10, // Número de fotos para intensidad máxima
  });

  // Debug flag (mutable para poder cambiar desde fuera)
  let DEBUG_TAGS = true;

  // ===== Estado =====
  const activeTags = ref([]); // Array de tags actualmente visibles
  const isUpdating = ref(false); // Flag para evitar actualizaciones concurrentes
  let lastUpdateTime = 0; // Timestamp de la última actualización
  let updateAnimationFrame = null; // RAF para actualización continua

  // ===== Funciones auxiliares =====

  /**
   * Calcula la distancia entre dos puntos 3D
   */
  function distance(pos1, pos2) {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    const dz = pos1[2] - pos2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Extrae todos los tags de una foto
   * Soporta múltiples estructuras posibles de datos
   */
  function extractPhotoTags(photo) {
    // Intentar diferentes ubicaciones posibles de tags
    const tags =
      photo.tags || photo.descriptions?.tags || photo.metadata?.tags || [];

    if (DEBUG_TAGS && Array.isArray(tags) && tags.length > 0) {
      console.log(`📸 Foto ${photo.id} tiene ${tags.length} tags`);
    }

    return Array.isArray(tags) ? tags : [];
  }

  /**
   * Encuentra fotos cercanas a la posición de la cámara
   * Usa el octree si está disponible, sino búsqueda lineal
   */
  function findNearbyPhotos(cameraPosition, radius) {
    if (!photos.value || photos.value.length === 0) {
      if (DEBUG_TAGS) console.log("🏷️ No hay fotos disponibles");
      return [];
    }

    const camPos = [cameraPosition.x, cameraPosition.y, cameraPosition.z];

    // Si hay octree disponible, usarlo para búsqueda eficiente
    if (octree && typeof octree === "function") {
      try {
        const results = octree(camPos, radius);
        if (DEBUG_TAGS) {
          console.log(
            `🏷️ Octree encontró ${results.length} fotos cercanas en radio ${radius}`
          );
          if (results.length > 0) {
            // Mostrar una foto de ejemplo
            const sample = results[0];
            console.log("📸 Ejemplo de foto cercana:", {
              id: sample.id,
              position: sample.position,
              hasTags: !!(sample.tags || sample.descriptions?.tags),
              tagsCount: (sample.tags || sample.descriptions?.tags || [])
                .length,
            });
          }
        }
        return results;
      } catch (err) {
        if (DEBUG_TAGS)
          console.warn(
            "⚠️ Error usando octree, fallback a búsqueda lineal:",
            err
          );
      }
    } else {
      if (DEBUG_TAGS)
        console.log("🏷️ Octree no disponible, usando búsqueda lineal");
    }

    // Fallback: búsqueda lineal
    const nearby = photos.value.filter((photo) => {
      const photoPos = photo.position || photo.coordinates || [0, 0, 0];
      return distance(camPos, photoPos) <= radius;
    });

    if (DEBUG_TAGS) {
      console.log(
        `🏷️ Búsqueda lineal encontró ${nearby.length} fotos en radio ${radius}`
      );
      if (nearby.length > 0) {
        // Mostrar una foto de ejemplo
        const sample = nearby[0];
        console.log("📸 Ejemplo de foto cercana:", {
          id: sample.id,
          position: sample.position,
          hasTags: !!(sample.tags || sample.descriptions?.tags),
          tagsCount: (sample.tags || sample.descriptions?.tags || []).length,
        });
      }
    }

    return nearby;
  }

  /**
   * Procesa tags de fotos cercanas y cuenta ocurrencias
   * Devuelve un mapa con información agregada de cada tag
   */
  function aggregateTags(nearbyPhotos) {
    const tagMap = new Map();

    nearbyPhotos.forEach((photo) => {
      const photoTags = extractPhotoTags(photo);

      photoTags.forEach((tag) => {
        const tagKey = `${tag.category || "unknown"}_${tag.name}`;

        if (!tagMap.has(tagKey)) {
          tagMap.set(tagKey, {
            id: tag.id,
            name: tag.name,
            category: tag.category,
            group: tag.group,
            area: tag.area,
            count: 0,
            photoIds: new Set(),
          });
        }

        const tagData = tagMap.get(tagKey);
        tagData.count++;
        tagData.photoIds.add(photo.id);
      });
    });

    return tagMap;
  }

  /**
   * Calcula la intensidad visual de un tag basado en su frecuencia
   * Retorna un valor entre 0 y 1
   */
  function calculateIntensity(count, minCount, maxCount) {
    if (count <= minCount) return 0.3;
    if (count >= maxCount) return 1.0;

    // Interpolación lineal entre min y max
    return 0.3 + (0.7 * (count - minCount)) / (maxCount - minCount);
  }

  /**
   * Obtiene el color basado en el count del tag
   * Escala de temperatura uniforme: azul claro (frío) -> violeta -> magenta -> rojo intenso (caliente)
   * Evita amarillos y verdes para una transición más natural de temperatura
   */
  function getColorByCount(count, minCount, maxCount) {
    // Normalizar count entre 0 y 1
    const normalized = Math.min(
      Math.max((count - minCount) / (maxCount - minCount), 0),
      1
    );

    // Escala de temperatura: azul claro (220°) -> violeta (280°) -> magenta (320°) -> rojo (0°)
    // Usamos una transición que va por el lado violeta/magenta del círculo cromático
    // para evitar pasar por verde/amarillo
    let hue;
    if (normalized < 0.5) {
      // Primera mitad: azul claro (200°) -> violeta/magenta (280°)
      hue = 200 + normalized * 2 * 80; // 200° a 280°
    } else {
      // Segunda mitad: magenta (320°) -> rojo (360°/0°)
      hue = 280 + (normalized - 0.5) * 2 * 80; // 280° a 360°
    }

    const saturation = 60 + normalized * 35; // Más saturado cuando más caliente (60% a 95%)
    const lightness = 60 - normalized * 15; // Más oscuro/intenso cuando más frecuente (60% a 45%)

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  /**
   * Actualiza la lista de tags activos basándose en la posición actual de la cámara
   */
  function updateActiveTags() {
    if (!config.value.enabled || isUpdating.value || !camera.value) {
      return;
    }

    const now = performance.now();
    if (now - lastUpdateTime < config.value.updateInterval) {
      return;
    }

    isUpdating.value = true;
    lastUpdateTime = now;

    try {
      const cameraPosition = camera.value.position;

      if (DEBUG_TAGS) {
        console.log(
          `🏷️ Actualizando tags desde posición: [${cameraPosition.x.toFixed(
            1
          )}, ${cameraPosition.y.toFixed(1)}, ${cameraPosition.z.toFixed(
            1
          )}], radio: ${config.value.detectionRadius}`
        );
      }

      // 1. Encontrar fotos cercanas
      const nearbyPhotos = findNearbyPhotos(
        cameraPosition,
        config.value.detectionRadius
      );

      if (nearbyPhotos.length === 0) {
        if (DEBUG_TAGS) console.log("🏷️ No hay fotos cercanas, limpiando tags");
        activeTags.value = [];
        return;
      }

      if (DEBUG_TAGS) {
        console.log(`🏷️ Procesando ${nearbyPhotos.length} fotos cercanas`);
      }

      // 2. Agregar tags por frecuencia
      const tagMap = aggregateTags(nearbyPhotos);

      if (DEBUG_TAGS) {
        console.log(`🏷️ Encontrados ${tagMap.size} tags únicos`);
      }

      // 3. Convertir a array y filtrar por mínimo de ocurrencias
      let tagsArray = Array.from(tagMap.values())
        .filter((tag) => tag.count >= config.value.minPhotoCount)
        .map((tag) => ({
          ...tag,
          intensity: calculateIntensity(
            tag.count,
            config.value.minPhotoCount,
            config.value.maxPhotoCount
          ),
          color: getColorByCount(
            tag.count,
            config.value.minPhotoCount,
            config.value.maxPhotoCount
          ),
          photoIds: Array.from(tag.photoIds), // Convertir Set a Array
        }));

      if (DEBUG_TAGS) {
        console.log(
          `🏷️ ${tagsArray.length} tags después de filtrar por minPhotoCount (${config.value.minPhotoCount})`
        );
      }

      // 4. Ordenar por frecuencia (descendente) y limitar cantidad
      tagsArray.sort((a, b) => b.count - a.count);
      tagsArray = tagsArray.slice(0, config.value.maxTagsToShow);

      if (DEBUG_TAGS) {
        console.log(
          `🏷️ Mostrando ${tagsArray.length} tags:`,
          tagsArray.map((t) => `${t.name} (×${t.count})`).join(", ")
        );
      }

      // 5. Actualizar estado reactivo
      activeTags.value = tagsArray;
    } catch (err) {
      console.error("❌ Error actualizando tags activos:", err);
    } finally {
      isUpdating.value = false;
    }
  }

  /**
   * Inicia el loop de actualización continua
   */
  function startUpdateLoop() {
    if (updateAnimationFrame) {
      return; // Ya está corriendo
    }

    if (DEBUG_TAGS) {
      console.log("🏷️ Iniciando loop de actualización de tags");
      console.log("📊 Configuración:", {
        detectionRadius: config.value.detectionRadius,
        updateInterval: config.value.updateInterval,
        maxTagsToShow: config.value.maxTagsToShow,
        minPhotoCount: config.value.minPhotoCount,
        totalPhotos: photos.value?.length || 0,
        hasOctree: !!octree,
      });
    }

    const loop = () => {
      updateActiveTags();
      updateAnimationFrame = requestAnimationFrame(loop);
    };

    updateAnimationFrame = requestAnimationFrame(loop);
  }

  /**
   * Detiene el loop de actualización
   */
  function stopUpdateLoop() {
    if (updateAnimationFrame) {
      cancelAnimationFrame(updateAnimationFrame);
      updateAnimationFrame = null;
    }
  }

  /**
   * Resetea el estado de tags
   */
  function reset() {
    stopUpdateLoop();
    activeTags.value = [];
    lastUpdateTime = 0;
  }

  // ===== Watchers =====

  // Reiniciar loop cuando se habilita/deshabilita
  watch(
    () => config.value.enabled,
    (enabled) => {
      if (enabled) {
        startUpdateLoop();
      } else {
        stopUpdateLoop();
        activeTags.value = [];
      }
    }
  );

  // ===== Computed Properties =====

  // Tags agrupados por categoría para facilitar renderizado
  const tagsByCategory = computed(() => {
    const grouped = {};

    activeTags.value.forEach((tag) => {
      const category = tag.category || "unknown";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(tag);
    });

    return grouped;
  });

  // Estadísticas de tags para debug/UI
  const stats = computed(() => ({
    totalActiveTags: activeTags.value.length,
    totalPhotosInRadius: activeTags.value.reduce(
      (sum, tag) => sum + tag.count,
      0
    ),
    categoriesCount: Object.keys(tagsByCategory.value).length,
  }));

  // ===== Métodos públicos =====

  return {
    // Estado
    config,
    activeTags,
    tagsByCategory,
    stats,
    isUpdating,

    // Métodos
    updateActiveTags,
    startUpdateLoop,
    stopUpdateLoop,
    reset,

    // Utilidades exportadas
    getColorByCount,
    calculateIntensity,

    // Debug
    enableDebug: () => {
      DEBUG_TAGS = true;
    },
    disableDebug: () => {
      DEBUG_TAGS = false;
    },
  };
}
