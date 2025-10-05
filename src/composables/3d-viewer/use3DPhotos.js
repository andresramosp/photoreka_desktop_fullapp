// composables/use3DPhotos.js
import { ref, computed } from "vue";
import { api } from "@/utils/axios";
import adaptiveInitialSpacing from "@/utils/adaptiveInitialSpacing";

const useAdaptiveSpacing = true;

export function use3DPhotos(userId = null) {
  // Estado reactivo
  const photos3D = ref([]);
  const isLoadingPositions = ref(false);
  const currentChunk = ref("general");
  const error = ref(null);
  const isCatalogMode = Boolean(userId);

  // Opciones de chunks disponibles
  const chunkOptions = [
    { value: "general", label: "General" },
    { value: "story", label: "Narrative" },
    { value: "context", label: "Context" },
    { value: "visual_accents", label: "Visual Accents" },
    // Si no hay userId, incluir los dos últimos
    ...(!userId
      ? [
          { value: "visual_aspects", label: "Technical" },
          { value: "artistic_scores", label: "Scores" },
        ]
      : []),
  ];

  // Función para cargar todas las fotos de una vez
  const loadPhotos = async (chunkName) => {
    try {
      let response;

      if (isCatalogMode) {
        // Modo catálogo público: endpoint no securizado
        response = await api.post(`/api/3d/catalog/${userId}`, {
          chunkName,
          includeVisualAspects: true,
        });
      } else {
        // Modo autenticado normal
        response = await api.post("/api/3d/photos", {
          chunkName,
          includeVisualAspects: true,
        });
      }

      return response.data.photos || [];
    } catch (err) {
      console.error(`Error loading 3D photos:`, err);
      throw new Error(`Error cargando fotos: ${err.message}`);
    }
  };

  // Función simplificada para cargar todas las fotos
  const loadAllPhotos = async (chunkName, reuseExisting = false) => {
    // Actualizar currentChunk al principio
    currentChunk.value = chunkName;

    isLoadingPositions.value = true;
    error.value = null;

    try {
      const photos = await loadPhotos(chunkName);

      // Extract raw coordinates for adaptive spacing
      const rawPositions = photos.map(
        (p) => p.coordinates || p.position || p.coords || [0, 0, 0]
      );

      let adaptedPositions = rawPositions;
      if (useAdaptiveSpacing) {
        try {
          adaptedPositions = adaptiveInitialSpacing(rawPositions, {
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
          });
          console.log("🧩 Adaptive initial spacing aplicado", {
            total: adaptedPositions.length,
            sampleBefore: rawPositions.slice(0, 2),
            sampleAfter: adaptedPositions.slice(0, 2),
          });
        } catch (e) {
          console.warn(
            "⚠️ Falló adaptiveInitialSpacing, usando posiciones raw",
            e
          );
        }
      } else {
        console.log(
          "⏩ Adaptive initial spacing desactivado, usando posiciones raw"
        );
      }

      if (reuseExisting && photos3D.value.length > 0) {
        // Modo reutilización: actualizar solo las coordenadas de las fotos existentes
        console.log(
          `♻️ Actualizando coordenadas de ${photos.length} fotos existentes`
        );

        // Crear un mapa de ID -> nuevas coordenadas
        const coordsMap = new Map();
        photos.forEach((photo, idx) => {
          coordsMap.set(
            photo.id,
            adaptedPositions[idx] || photo.coordinates || [0, 0, 0]
          );
        });

        // Actualizar las fotos existentes con las nuevas coordenadas
        photos3D.value = photos3D.value.map((existingPhoto) => {
          const newCoords = coordsMap.get(existingPhoto.id);
          if (newCoords) {
            return {
              ...existingPhoto,
              position: newCoords,
              coordinates: newCoords,
            };
          }
          return existingPhoto;
        });
      } else {
        // Modo normal: reemplazar todas las fotos
        const processedPhotos = photos.map((photo, idx) => {
          const newPos = adaptedPositions[idx];
          return {
            ...photo,
            // Guardar también coordenadas transformadas para consistencia futura
            position: newPos,
            coordinates: newPos,
            rawCoordinates: photo.coordinates || [0, 0, 0], // por si se requiere debug
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
    });

    // Solo saltar si realmente es el mismo valor Y ya tenemos fotos cargadas
    if (newChunk === currentChunk.value && photos3D.value.length > 0) {
      console.log(
        "⏸️ Saltando cambio de chunk - mismo valor y datos ya cargados"
      );
      return;
    }

    // Decidir si reutilizar fotos existentes
    const shouldReuseExisting = photos3D.value.length > 0;

    console.log("🚀 Ejecutando loadAllPhotos para chunk:", newChunk, {
      reuseExisting: shouldReuseExisting,
    });

    await loadAllPhotos(newChunk, shouldReuseExisting);
    console.log("✅ changeChunk completado para chunk:", newChunk);
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

    // Opciones
    chunkOptions,

    // Métodos
    loadAllPhotos,
    changeChunk,
    reset,
  };
}
