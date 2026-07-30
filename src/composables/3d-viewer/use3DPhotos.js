// composables/use3DPhotos.js
import { ref, computed } from "vue";
import { api } from "@/utils/axios";
import { buildChunkOptions } from "@/config/searchCriteria";
import adaptiveInitialSpacing from "@/utils/adaptiveInitialSpacing";
import gridRelaxation from "@/utils/gridRelaxation";

const useAdaptiveSpacing = true;

// Easy global toggle (edit this constant when you want a default behavior change)
const GRID_RELAXATION_ENABLED_DEFAULT = true;

// lowPerformance: si es true limita a 750 fotos priorizando mayor aesthetic_quality
export function use3DPhotos(userId = null, lowPerformanceMode = false) {
  // Estado reactivo
  const photos3D = ref([]);
  const isLoadingPositions = ref(false);
  const currentChunk = ref("general");
  const error = ref(null);
  const isCatalogMode = Boolean(userId);
  const lowPerformance = ref(lowPerformanceMode); // Guardar configuración de performance
  const outputDims = ref(3); // 2 para 2D, 3 para 3D (default 3D)

  // Toggle: if false, photos keep backend coordinates (no adaptive spacing, no relaxation)
  const gridRelaxationEnabled = ref(GRID_RELAXATION_ENABLED_DEFAULT);

  // Photo plane in Three.js is 4x3 (see usePhotoTextureManager). Use that as spacing baseline.
  const RELAX_BASE_SIZE = 4.0;
  const RELAX_DEPTH_SIZE = 4.0;
  const RELAX_PADDING = 0.25;

  const toDims = (pos, dims) => {
    const p = Array.isArray(pos) ? pos : [];
    if (dims === 2) return [p[0] || 0, p[1] || 0];
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  };

  const to3 = (pos) => {
    const p = Array.isArray(pos) ? pos : [];
    return [p[0] || 0, p[1] || 0, p[2] || 0];
  };

  const computeFinalPositions = (workingPhotos, rawPositions, targetDims) => {
    let adaptedPositions = rawPositions;

    if (useAdaptiveSpacing) {
      try {
        // adaptiveInitialSpacing is 3D-only; if we're in 2D mode keep Z=0 and skip it.
        adaptedPositions =
          targetDims === 3
            ? adaptiveInitialSpacing(rawPositions, {
                inflateFactorBase: 1.08, // menor radial global
                gamma: 1.9,
                cellSize: 4.2,
                densityThreshold: 0.1,
                minSeparation: 5,
                iterations: 3,
                enableRelaxation: true,
                aggressiveness: 1.15,
                clusterIterations: 2,
                highDensityThreshold: 0.6,
                highDensityBoost: 0.4,
                nnLocalScale: true,
                nnTarget: 5.4,
              })
            : rawPositions;
      } catch (e) {
        console.warn(
          "⚠️ Falló adaptiveInitialSpacing, usando posiciones raw",
          e,
        );
        adaptedPositions = rawPositions;
      }
    }

    // Default: legacy behavior (adapted if enabled, else raw)
    let finalPositions =
      targetDims === 2
        ? adaptedPositions.map((p) => [p[0] || 0, p[1] || 0, 0])
        : adaptedPositions.map((p) => [p[0] || 0, p[1] || 0, p[2] || 0]);

    if (!gridRelaxationEnabled.value) return finalPositions;

    // Ensure non-overlap with a dimension-agnostic relaxation.
    try {
      const items = workingPhotos.map((photo, idx) => ({
        ...photo,
        __relaxPos: adaptedPositions[idx],
      }));

      const relaxed = gridRelaxation(items, {
        dims: targetDims,
        getPosition: (p) => p.__relaxPos,
        baseSize: RELAX_BASE_SIZE,
        depthSize: RELAX_DEPTH_SIZE,
        padding: RELAX_PADDING,
        // Avoid snapping in 3D: preserve continuous shape
        snapToGrid: false,
      });

      finalPositions =
        targetDims === 2
          ? relaxed.map((p) => [p[0] || 0, p[1] || 0, 0])
          : relaxed.map((p) => [p[0] || 0, p[1] || 0, p[2] || 0]);
    } catch (e) {
      console.warn("⚠️ Falló gridRelaxation, usando posiciones previas", e);
    }

    return finalPositions;
  };

  const reapplyLayout = () => {
    if (!photos3D.value.length) return;
    const targetDims = outputDims.value === 2 ? 2 : 3;
    const workingPhotos = photos3D.value;

    const rawPositions = workingPhotos.map((p) =>
      toDims(
        p.rawCoordinates || p.coordinates || p.position || [0, 0, 0],
        targetDims,
      ),
    );
    const rawPositions3 = rawPositions.map((p) =>
      targetDims === 2
        ? [p[0] || 0, p[1] || 0, 0]
        : [p[0] || 0, p[1] || 0, p[2] || 0],
    );

    const finalPositions = computeFinalPositions(
      workingPhotos,
      rawPositions,
      targetDims,
    );

    photos3D.value = workingPhotos.map((photo, idx) => {
      const newPos = finalPositions[idx] || to3(photo.position);
      return {
        ...photo,
        rawCoordinates: rawPositions3[idx] || to3(photo.rawCoordinates),
        position: newPos,
        coordinates: newPos,
      };
    });
  };

  // Opciones de chunks disponibles
  const chunkOptionDefinitions = [
    { value: "general", label: "General", criterion: "embedding" },
    { value: "story", label: "Narrative", criterion: "story" },
    { value: "context", label: "Context", criterion: "context" },
    { value: "content", label: "Content", criterion: "content" },
    { value: "color_histogram", label: "Chromatic", criterion: "chromatic" },
    // { value: "color_histogram_dominant", label: "Dominant color" },

    // Si no hay userId, incluir los dos últimos
    ...(!userId
      ? [
          {
            value: "visual_aspects",
            label: "Technical",
            criterion: "technical",
          },
          // { value: "artistic_scores", label: "Scores" },
        ]
      : []),
  ];

  const chunkOptions = buildChunkOptions(chunkOptionDefinitions);

  // Función para cargar todas las fotos de una vez
  const loadPhotos = async (chunkName, limit = 5000) => {
    try {
      let response;

      if (isCatalogMode) {
        // Modo catálogo público: endpoint no securizado
        response = await api.post(`/api/3d/catalog/${userId}`, {
          chunkName,
          includeVisualAspects: true,
          limit,
        });
      } else {
        // Modo autenticado normal
        response = await api.post("/api/3d/photos", {
          chunkName,
          includeVisualAspects: true,
          outputDims: outputDims.value,
          limit,
        });
      }

      return response.data.photos || [];
    } catch (err) {
      console.error(`Error loading 3D photos:`, err);
      throw new Error(`Error cargando fotos: ${err.message}`);
    }
  };

  // Función simplificada para cargar todas las fotos
  const loadAllPhotos = async (
    chunkName,
    reuseExisting = false,
    limit = 5000,
  ) => {
    // Actualizar currentChunk al principio
    currentChunk.value = chunkName;

    isLoadingPositions.value = true;
    error.value = null;

    try {
      const photos = await loadPhotos(chunkName, limit);

      // Check if photos array is empty
      if (!photos || photos.length === 0) {
        console.warn("⚠️ No photos received from API");
        error.value = "Your catalog doesn't have enough photos to be processed";
        photos3D.value = [];
        isLoadingPositions.value = false;
        return;
      }

      // Filtrado para modo lowPerformance
      let workingPhotos = photos;
      if (lowPerformance.value && photos.length > 750) {
        const getScore = (p) =>
          p?.descriptions?.artistic_scores?.aesthetic_quality ?? -Infinity;
        workingPhotos = [...photos]
          .sort((a, b) => getScore(b) - getScore(a))
          .slice(0, 750);
        console.log(
          `⚡ LowPerformance activo: filtradas ${photos.length} -> ${workingPhotos.length} (top aesthetic_quality)`,
        );
      }

      // Extract raw coordinates for adaptive spacing
      const targetDims = outputDims.value === 2 ? 2 : 3;
      const rawPositions = workingPhotos.map((p) =>
        toDims(
          p.coordinates || p.position || p.coords || [0, 0, 0],
          targetDims,
        ),
      );

      const rawPositions3 =
        targetDims === 2
          ? rawPositions.map((p) => [p[0] || 0, p[1] || 0, 0])
          : rawPositions.map((p) => [p[0] || 0, p[1] || 0, p[2] || 0]);

      // NOTE: When gridRelaxation is disabled we still want the legacy 3D behavior,
      // which included adaptiveInitialSpacing. So we don't early-return here.

      const finalPositions = computeFinalPositions(
        workingPhotos,
        rawPositions,
        targetDims,
      );

      // Modo reutilización: actualizar solo las coordenadas de las fotos existentes si ya están cargadas
      if (reuseExisting && photos3D.value.length > 0) {
        // Modo reutilización: actualizar solo las coordenadas de las fotos existentes
        console.log(
          `♻️ Actualizando coordenadas de ${workingPhotos.length} fotos existentes`,
        );

        // Crear un mapa de ID -> nuevas coordenadas
        const coordsMap = new Map();
        const rawMap = new Map();
        workingPhotos.forEach((photo, idx) => {
          coordsMap.set(photo.id, finalPositions[idx] || [0, 0, 0]);
          rawMap.set(photo.id, rawPositions3[idx] || [0, 0, 0]);
        });

        // Actualizar las fotos existentes con las nuevas coordenadas
        photos3D.value = photos3D.value.map((existingPhoto) => {
          const newCoords = coordsMap.get(existingPhoto.id);
          if (!newCoords) return existingPhoto;
          return {
            ...existingPhoto,
            rawCoordinates:
              rawMap.get(existingPhoto.id) || to3(existingPhoto.rawCoordinates),
            position: newCoords,
            coordinates: newCoords,
          };
        });
      } else {
        // Modo normal: reemplazar todas las fotos
        const processedPhotos = workingPhotos.map((photo, idx) => {
          const newPos = finalPositions[idx];
          return {
            ...photo,
            // Guardar también coordenadas transformadas para consistencia futura
            position: newPos,
            coordinates: newPos,
            rawCoordinates: rawPositions3[idx] ||
              photo.coordinates || [0, 0, 0], // baseline backend
          };
        });

        console.log(`📸 Cargadas ${processedPhotos.length} fotos`);
        photos3D.value = processedPhotos;
      }

      console.log(`Carga completa: ${photos3D.value.length} fotos`);
    } catch (err) {
      error.value = err.message;
      console.error("Error en loadAllPhotos:", err);
    } finally {
      isLoadingPositions.value = false;
    }
  };

  // Función para cambiar de chunk (optimizada para reutilización)
  const changeChunk = async (newChunk) => {
    console.log("🔄 changeChunk called:", {
      newChunk,
      currentChunk: currentChunk.value,
      hasExistingPhotos: photos3D.value.length > 0,
      willSkip: newChunk === currentChunk.value,
      lowPerformance: lowPerformance.value,
    });

    // Solo saltar si realmente es el mismo valor Y ya tenemos fotos cargadas
    if (newChunk === currentChunk.value && photos3D.value.length > 0) {
      console.log(
        "⏸️ Saltando cambio de chunk - mismo valor y datos ya cargados",
      );
      return;
    }

    // Decidir si reutilizar fotos existentes
    const shouldReuseExisting = photos3D.value.length > 0;

    console.log("🚀 Ejecutando loadAllPhotos para chunk:", newChunk, {
      reuseExisting: shouldReuseExisting,
      lowPerformance: lowPerformance.value,
    });

    await loadAllPhotos(newChunk, shouldReuseExisting);
    console.log("✅ changeChunk completado para chunk:", newChunk);
  };

  // Función para cambiar entre 2D/3D
  const changeDimensions = async (newDims) => {
    console.log("🔄 changeDimensions called:", {
      newDims,
      currentDims: outputDims.value,
      currentChunk: currentChunk.value,
      hasExistingPhotos: photos3D.value.length > 0,
    });

    // Actualizar outputDims
    outputDims.value = newDims;

    // Recargar fotos con la nueva dimensión (reutilizando fotos existentes para transición suave)
    const shouldReuseExisting = photos3D.value.length > 0;

    console.log("🚀 Recargando fotos con outputDims:", newDims, {
      reuseExisting: shouldReuseExisting,
    });

    await loadAllPhotos(currentChunk.value, shouldReuseExisting);
    console.log("✅ changeDimensions completado para dims:", newDims);
  };

  // Función para reiniciar
  const reset = () => {
    photos3D.value = [];
    error.value = null;
  };

  return {
    // Estado
    photos3D,
    isLoadingPositions,
    currentChunk,
    error,
    isCatalogMode,
    outputDims,
    gridRelaxationEnabled,

    // Opciones
    chunkOptions,

    // Métodos
    loadAllPhotos,
    changeChunk,
    changeDimensions,
    reapplyLayout,
    reset,
  };
}
