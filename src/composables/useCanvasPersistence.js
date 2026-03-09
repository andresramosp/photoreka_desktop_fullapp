import { ref, computed, watch } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";

// Clave para localStorage (fallback para playground/offline)
const CANVAS_STORAGE_KEY = "photoreka_canvas_data";

export function useCanvasPersistence() {
  const canvasStore = useCanvasStore();
  const userStore = useUserStore();

  // Estado para controlar si hay cambios sin guardar
  const hasUnsavedChanges = ref(false);
  const lastSavedState = ref(null);

  // Flag para evitar detección de cambios durante la carga
  const isLoading = ref(false);

  // Flag para evitar saves concurrentes
  const isSaving = ref(false);

  // Cache para saber si existe canvas guardado
  const _hasSavedCanvas = ref(false);

  // Computed para el estado de guardado
  const isSaved = computed(() => !hasUnsavedChanges.value);

  /**
   * Verifica si el usuario está autenticado (usar backend) o no (usar localStorage)
   */
  const useBackend = () => {
    return userStore.isAuthenticated;
  };

  /**
   * Serializa el estado actual del canvas para detección de cambios
   */
  const serializeCanvas = () => {
    return {
      id: "current",
      name: "Current Canvas",
      timestamp: new Date().toISOString(),
      data: {
        photos: canvasStore.photos.map((photo) => ({
          id: photo.id,
          config: { ...photo.config },
        })),
        discardedPhotos: canvasStore.discardedPhotos.map((photo) => ({
          id: photo.id,
          config: { ...photo.config },
        })),
        currentZIndex: canvasStore.currentZIndex,
      },
    };
  };

  /**
   * Serializa la data para enviar al backend (solo IDs + configs)
   */
  const serializeForBackend = () => {
    return {
      photos: canvasStore.photos.map((photo) => ({
        id: photo.id,
        config: { ...photo.config },
      })),
      discardedPhotos: canvasStore.discardedPhotos.map((photo) => ({
        id: photo.id,
        config: { ...photo.config },
      })),
      currentZIndex: canvasStore.currentZIndex,
    };
  };

  /**
   * Serializa la data completa para localStorage (incluye src/thumbnail para offline)
   */
  const serializeForLocalStorage = () => {
    return {
      id: "current",
      name: "Current Canvas",
      timestamp: new Date().toISOString(),
      data: {
        photos: canvasStore.photos.map((photo) => ({
          id: photo.id,
          src: photo.src,
          thumbnailUrl: photo.thumbnailUrl,
          config: { ...photo.config },
          tags: photo.tags,
          status: photo.status,
          detectionAreas: photo.detectionAreas,
        })),
        discardedPhotos: canvasStore.discardedPhotos.map((photo) => ({
          id: photo.id,
          src: photo.src,
          thumbnailUrl: photo.thumbnailUrl,
          config: { ...photo.config },
          tags: photo.tags,
          status: photo.status,
          detectionAreas: photo.detectionAreas,
        })),
        currentZIndex: canvasStore.currentZIndex,
        basicMode: canvasStore.basicMode,
      },
    };
  };

  /**
   * Deserializa y restaura el estado del canvas desde datos del backend
   * (re-hidrata fotos haciendo fetch por IDs)
   */
  const deserializeFromBackend = async (canvasResponse) => {
    if (!canvasResponse || !canvasResponse.data) return false;

    isLoading.value = true;

    try {
      const { data } = canvasResponse;

      // Recoger todos los photo IDs para re-hidratar
      const allPhotoConfigs = {};
      const photoIds = [];
      const discardedIds = [];

      if (data.photos && Array.isArray(data.photos)) {
        data.photos.forEach((p) => {
          photoIds.push(p.id);
          allPhotoConfigs[p.id] = p.config;
        });
      }

      if (data.discardedPhotos && Array.isArray(data.discardedPhotos)) {
        data.discardedPhotos.forEach((p) => {
          discardedIds.push(p.id);
          allPhotoConfigs[p.id] = p.config;
        });
      }

      // Fetch completo de las fotos desde la API
      const allIds = [...photoIds, ...discardedIds];
      let fetchedPhotos = [];
      if (allIds.length > 0) {
        try {
          const response = await api.post("/api/catalog/photosByIds", {
            photosIds: allIds,
          });
          fetchedPhotos = response.data || [];
        } catch (err) {
          console.error("Error fetching photos for canvas:", err);
          return false;
        }
      }

      // Crear un mapa de fotos por ID
      const photosMap = {};
      fetchedPhotos.forEach((p) => {
        photosMap[p.id] = p;
      });

      // Restaurar fotos principales (solo las que aún existen en la BD)
      const restoredPhotos = photoIds
        .filter((id) => photosMap[id])
        .map((id) => ({
          ...photosMap[id],
          src: photosMap[id].thumbnailUrl,
          config: allPhotoConfigs[id],
          selected: false,
          hovered: false,
          showButton: false,
          loading: false,
          image: null,
          isNew: false,
          inTrash: false,
        }));

      canvasStore.photos = restoredPhotos;

      // Restaurar fotos descartadas
      const restoredDiscarded = discardedIds
        .filter((id) => photosMap[id])
        .map((id) => ({
          ...photosMap[id],
          src: photosMap[id].thumbnailUrl,
          config: allPhotoConfigs[id],
          selected: false,
          hovered: false,
          showButton: false,
          loading: false,
          image: null,
          isNew: false,
          inTrash: false,
        }));

      canvasStore.discardedPhotos = restoredDiscarded;

      // Restaurar otros estados
      if (typeof data.currentZIndex === "number") {
        canvasStore.currentZIndex = data.currentZIndex;
      }

      canvasStore.updateBasicMode();

      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;

      return true;
    } catch (error) {
      console.error("Error deserializing canvas from backend:", error);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Deserializa y restaura el estado del canvas desde localStorage
   */
  const deserializeFromLocalStorage = async (canvasData) => {
    if (!canvasData || !canvasData.data) return false;

    isLoading.value = true;

    try {
      const { data } = canvasData;

      if (data.photos && Array.isArray(data.photos)) {
        canvasStore.photos = data.photos.map((photo) => ({
          ...photo,
          selected: false,
          hovered: false,
          showButton: false,
          loading: false,
          image: null,
          isNew: false,
          inTrash: false,
        }));
      }

      if (data.discardedPhotos && Array.isArray(data.discardedPhotos)) {
        canvasStore.discardedPhotos = data.discardedPhotos.map((photo) => ({
          ...photo,
          selected: false,
          hovered: false,
          showButton: false,
          loading: false,
          image: null,
          isNew: false,
          inTrash: false,
        }));
      }

      if (typeof data.currentZIndex === "number") {
        canvasStore.currentZIndex = data.currentZIndex;
      }

      canvasStore.updateBasicMode();

      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;

      return true;
    } catch (error) {
      console.error("Error deserializing canvas from localStorage:", error);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * Guarda el canvas actual
   */
  const saveCanvas = async () => {
    if (isSaving.value) return false;
    isSaving.value = true;

    try {
      if (useBackend()) {
        const data = serializeForBackend();
        await api.put("/api/canvas", { data });
      } else {
        const canvasData = serializeForLocalStorage();
        localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(canvasData));
      }

      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;
      _hasSavedCanvas.value = true;

      return true;
    } catch (error) {
      console.error("Error saving canvas:", error);
      // Fallback a localStorage si el backend falla
      try {
        const canvasData = serializeForLocalStorage();
        localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(canvasData));
        lastSavedState.value = JSON.stringify(serializeCanvas());
        hasUnsavedChanges.value = false;
        _hasSavedCanvas.value = true;
        return true;
      } catch (lsError) {
        console.error("Error saving to localStorage fallback:", lsError);
        return false;
      }
    } finally {
      isSaving.value = false;
    }
  };

  /**
   * Migra el canvas de localStorage al backend si el backend no tiene canvas.
   * Retorna true si migró algo.
   */
  const migrateLocalStorageToBackend = async () => {
    const savedData = localStorage.getItem(CANVAS_STORAGE_KEY);
    if (!savedData) return false;

    try {
      const canvasData = JSON.parse(savedData);
      if (!canvasData?.data) return false;

      // Cargar en el store primero
      const loaded = await deserializeFromLocalStorage(canvasData);
      if (!loaded) return false;

      // Persistir en backend
      await api.put("/api/canvas", { data: serializeForBackend() });

      // Limpiar localStorage (ya migrado)
      localStorage.removeItem(CANVAS_STORAGE_KEY);

      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;
      _hasSavedCanvas.value = true;

      console.log("Canvas migrated from localStorage to backend");
      return true;
    } catch (err) {
      console.error("Error migrating canvas from localStorage:", err);
      return false;
    }
  };

  /**
   * Carga el canvas guardado
   */
  const loadCanvas = async () => {
    try {
      if (useBackend()) {
        const response = await api.get("/api/canvas");
        if (response.data) {
          _hasSavedCanvas.value = true;
          return await deserializeFromBackend(response.data);
        }
        // Backend sin canvas: intentar migrar desde localStorage
        const migrated = await migrateLocalStorageToBackend();
        if (migrated) return true;
        _hasSavedCanvas.value = false;
        return false;
      } else {
        const savedData = localStorage.getItem(CANVAS_STORAGE_KEY);
        if (!savedData) {
          _hasSavedCanvas.value = false;
          return false;
        }
        const canvasData = JSON.parse(savedData);
        _hasSavedCanvas.value = true;
        return await deserializeFromLocalStorage(canvasData);
      }
    } catch (error) {
      console.error("Error loading canvas:", error);
      // Fallback: intentar cargar desde localStorage
      try {
        const savedData = localStorage.getItem(CANVAS_STORAGE_KEY);
        if (!savedData) return false;
        const canvasData = JSON.parse(savedData);
        _hasSavedCanvas.value = true;
        return await deserializeFromLocalStorage(canvasData);
      } catch (lsError) {
        console.error("Error loading from localStorage fallback:", lsError);
        return false;
      }
    }
  };

  /**
   * Borra el canvas guardado
   */
  const clearSavedCanvas = async () => {
    try {
      if (useBackend()) {
        await api.delete("/api/canvas");
      }
      // Limpiar también localStorage siempre
      localStorage.removeItem(CANVAS_STORAGE_KEY);

      lastSavedState.value = null;
      hasUnsavedChanges.value = false;
      _hasSavedCanvas.value = false;

      return true;
    } catch (error) {
      console.error("Error clearing saved canvas:", error);
      // Limpiar localStorage de todas formas
      localStorage.removeItem(CANVAS_STORAGE_KEY);
      _hasSavedCanvas.value = false;
      return false;
    }
  };

  /**
   * Verifica si hay un canvas guardado
   */
  const hasSavedCanvas = () => {
    return _hasSavedCanvas.value;
  };

  /**
   * Obtiene la lista de canvas disponibles (preparado para futuro)
   */
  const getCanvasList = () => {
    // Por ahora devuelve lista vacía, preparado para múltiples canvas
    return [];
  };

  /**
   * Compara el estado actual con el último guardado para detectar cambios
   */
  const detectChanges = () => {
    if (isLoading.value) return;

    try {
      const currentState = JSON.stringify(serializeCanvas());
      const hasChanges = lastSavedState.value !== currentState;
      hasUnsavedChanges.value = hasChanges;
    } catch (error) {
      console.error("Error detecting changes:", error);
    }
  };

  /**
   * Inicializa el watcher para detectar cambios automáticamente
   */
  const initializeChangeDetection = () => {
    watch(
      () => [
        canvasStore.photos.length,
        canvasStore.photos.map((p) => ({
          id: p.id,
          config: { ...p.config },
        })),
        canvasStore.discardedPhotos.length,
        canvasStore.currentZIndex,
      ],
      detectChanges,
      { deep: true },
    );

    watch(
      () =>
        canvasStore.photos.map((p) => ({
          x: p.config.x,
          y: p.config.y,
          width: p.config.width,
          height: p.config.height,
          zIndex: p.config.zIndex,
        })),
      detectChanges,
      { deep: true },
    );

    watch(() => canvasStore.discardedPhotos.map((p) => p.id), detectChanges, {
      deep: true,
    });
  };

  /**
   * Marca el canvas como guardado
   */
  const markAsSaved = () => {
    lastSavedState.value = JSON.stringify(serializeCanvas());
    hasUnsavedChanges.value = false;
  };

  return {
    // Estado
    hasUnsavedChanges,
    isSaved,

    // Acciones principales
    saveCanvas,
    loadCanvas,
    clearSavedCanvas,

    // Utilidades
    hasSavedCanvas,
    getCanvasList,
    markAsSaved,
    initializeChangeDetection,

    // Para uso interno/futuro
    serializeCanvas,
    deserializeFromBackend,
    deserializeFromLocalStorage,
  };
}
