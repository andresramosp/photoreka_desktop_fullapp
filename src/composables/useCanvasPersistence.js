import { ref, computed, watch } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";

// Claves localStorage
const CANVAS_STORAGE_KEY = "photoreka_canvas_data";
const ACTIVE_CANVAS_KEY = "photoreka_active_canvas_id";

const getStoredActiveId = () => {
  const id = localStorage.getItem(ACTIVE_CANVAS_KEY);
  return id ? parseInt(id, 10) : null;
};
const storeActiveId = (id) => {
  if (id) localStorage.setItem(ACTIVE_CANVAS_KEY, String(id));
  else localStorage.removeItem(ACTIVE_CANVAS_KEY);
};

export function useCanvasPersistence() {
  const canvasStore = useCanvasStore();
  const userStore = useUserStore();

  const hasUnsavedChanges = ref(false);
  const lastSavedState = ref(null);
  const isLoading = ref(false);
  const isSaving = ref(false);

  // Multi-canvas state
  const activeCanvasId = ref(null);
  const canvasList = ref([]); // [{id, name, photoCount, updatedAt, createdAt}]

  const isSaved = computed(() => !hasUnsavedChanges.value);
  const currentCanvasName = computed(() => {
    if (!activeCanvasId.value) return "My Canvas";
    const found = canvasList.value.find((c) => c.id === activeCanvasId.value);
    return found ? found.name : "My Canvas";
  });

  const useBackend = () => userStore.isAuthenticated;

  // ─── Serialization ───────────────────────────────────────────────────────────

  const serializeCanvas = () => ({
    data: {
      photos: canvasStore.photos.map((p) => ({
        id: p.id,
        config: { ...p.config },
      })),
      discardedPhotos: canvasStore.discardedPhotos.map((p) => ({
        id: p.id,
        config: { ...p.config },
      })),
      currentZIndex: canvasStore.currentZIndex,
    },
  });

  const serializeForBackend = () => ({
    photos: canvasStore.photos.map((p) => ({
      id: p.id,
      config: { ...p.config },
    })),
    discardedPhotos: canvasStore.discardedPhotos.map((p) => ({
      id: p.id,
      config: { ...p.config },
    })),
    currentZIndex: canvasStore.currentZIndex,
  });

  const serializeForLocalStorage = () => ({
    id: "current",
    timestamp: new Date().toISOString(),
    data: {
      photos: canvasStore.photos.map((p) => ({
        id: p.id,
        src: p.src,
        thumbnailUrl: p.thumbnailUrl,
        config: { ...p.config },
        tags: p.tags,
        status: p.status,
        detectionAreas: p.detectionAreas,
      })),
      discardedPhotos: canvasStore.discardedPhotos.map((p) => ({
        id: p.id,
        src: p.src,
        thumbnailUrl: p.thumbnailUrl,
        config: { ...p.config },
        tags: p.tags,
        status: p.status,
        detectionAreas: p.detectionAreas,
      })),
      currentZIndex: canvasStore.currentZIndex,
      basicMode: canvasStore.basicMode,
    },
  });

  // ─── Deserialization ──────────────────────────────────────────────────────────

  const deserializeFromBackend = async (canvasResponse) => {
    if (!canvasResponse?.data) return false;
    isLoading.value = true;
    try {
      const { data } = canvasResponse;
      const allPhotoConfigs = {};
      const photoIds = [];
      const discardedIds = [];

      (data.photos || []).forEach((p) => {
        photoIds.push(p.id);
        allPhotoConfigs[p.id] = p.config;
      });
      (data.discardedPhotos || []).forEach((p) => {
        discardedIds.push(p.id);
        allPhotoConfigs[p.id] = p.config;
      });

      const allIds = [...photoIds, ...discardedIds];
      let fetchedPhotos = [];
      if (allIds.length > 0) {
        try {
          const res = await api.post("/api/catalog/photosByIds", {
            photosIds: allIds,
          });
          fetchedPhotos = res.data || [];
        } catch (err) {
          console.error("Error fetching photos for canvas:", err);
          return false;
        }
      }

      const photosMap = {};
      fetchedPhotos.forEach((p) => {
        photosMap[p.id] = p;
      });

      const makePhoto = (id) => ({
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
      });

      canvasStore.photos = photoIds
        .filter((id) => photosMap[id])
        .map(makePhoto);
      canvasStore.discardedPhotos = discardedIds
        .filter((id) => photosMap[id])
        .map(makePhoto);

      if (typeof data.currentZIndex === "number") {
        canvasStore.currentZIndex = data.currentZIndex;
      }
      canvasStore.updateBasicMode();

      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;
      return true;
    } catch (err) {
      console.error("Error deserializing from backend:", err);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  const deserializeFromLocalStorage = async (canvasData) => {
    if (!canvasData?.data) return false;
    isLoading.value = true;
    try {
      const { data } = canvasData;
      canvasStore.photos = (data.photos || []).map((p) => ({
        ...p,
        selected: false,
        hovered: false,
        showButton: false,
        loading: false,
        image: null,
        isNew: false,
        inTrash: false,
      }));
      canvasStore.discardedPhotos = (data.discardedPhotos || []).map((p) => ({
        ...p,
        selected: false,
        hovered: false,
        showButton: false,
        loading: false,
        image: null,
        isNew: false,
        inTrash: false,
      }));
      if (typeof data.currentZIndex === "number") {
        canvasStore.currentZIndex = data.currentZIndex;
      }
      canvasStore.updateBasicMode();

      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;
      return true;
    } catch (err) {
      console.error("Error deserializing from localStorage:", err);
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  // ─── Clear store ─────────────────────────────────────────────────────────────

  const clearStore = () => {
    canvasStore.photos.forEach((p) => {
      if (p.src?.startsWith("blob:")) URL.revokeObjectURL(p.src);
      if (p.thumbnailUrl?.startsWith("blob:"))
        URL.revokeObjectURL(p.thumbnailUrl);
    });
    canvasStore.$patch({ photos: [], discardedPhotos: [], currentZIndex: 1 });
    lastSavedState.value = JSON.stringify(serializeCanvas());
    hasUnsavedChanges.value = false;
  };

  // ─── Save ─────────────────────────────────────────────────────────────────────

  const saveCanvas = async () => {
    if (isSaving.value) return false;
    isSaving.value = true;
    try {
      if (useBackend()) {
        const data = serializeForBackend();
        if (activeCanvasId.value) {
          await api.put(`/api/canvas/${activeCanvasId.value}`, { data });
          // Update photoCount in list
          const item = canvasList.value.find(
            (c) => c.id === activeCanvasId.value,
          );
          if (item) {
            item.photoCount = data.photos.length;
            item.updatedAt = new Date().toISOString();
          }
        } else {
          // No active canvas yet — create one
          const res = await api.post("/api/canvas", {
            name: "My Canvas",
            data,
          });
          activeCanvasId.value = res.data.id;
          storeActiveId(res.data.id);
          canvasList.value.unshift({
            id: res.data.id,
            name: res.data.name,
            photoCount: data.photos.length,
            updatedAt: res.data.updatedAt,
            createdAt: res.data.createdAt,
          });
        }
      } else {
        localStorage.setItem(
          CANVAS_STORAGE_KEY,
          JSON.stringify(serializeForLocalStorage()),
        );
      }

      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;
      return true;
    } catch (err) {
      console.error("Error saving canvas:", err);
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  // ─── Load ─────────────────────────────────────────────────────────────────────

  /**
   * Carga la lista de canvas del usuario y el canvas activo (o el más reciente).
   */
  const loadCanvas = async () => {
    if (!useBackend()) {
      const savedData = localStorage.getItem(CANVAS_STORAGE_KEY);
      if (!savedData) return false;
      return deserializeFromLocalStorage(JSON.parse(savedData));
    }

    try {
      // 1. Obtener lista
      const listRes = await api.get("/api/canvas");
      canvasList.value = listRes.data || [];

      if (canvasList.value.length === 0) return false;

      // 2. Elegir cuál cargar: el último activo o el más reciente
      const storedId = getStoredActiveId();
      const target =
        canvasList.value.find((c) => c.id === storedId) || canvasList.value[0];

      // 3. Cargar canvas completo
      const canvasRes = await api.get(`/api/canvas/${target.id}`);
      const loaded = await deserializeFromBackend(canvasRes.data);
      if (loaded) {
        activeCanvasId.value = target.id;
        storeActiveId(target.id);
      }
      return loaded;
    } catch (err) {
      console.error("Error loading canvas:", err);
      // Fallback localStorage
      const savedData = localStorage.getItem(CANVAS_STORAGE_KEY);
      if (savedData) return deserializeFromLocalStorage(JSON.parse(savedData));
      return false;
    }
  };

  // ─── Create ───────────────────────────────────────────────────────────────────

  /**
   * Crea un nuevo canvas vacío, limpia el store, y lo activa.
   */
  const createCanvas = async (name = "New Canvas") => {
    try {
      clearStore();
      const res = await api.post("/api/canvas", {
        name,
        data: { photos: [], discardedPhotos: [], currentZIndex: 1 },
      });
      const newCanvas = {
        id: res.data.id,
        name: res.data.name,
        photoCount: 0,
        updatedAt: res.data.updatedAt,
        createdAt: res.data.createdAt,
      };
      canvasList.value.unshift(newCanvas);
      activeCanvasId.value = res.data.id;
      storeActiveId(res.data.id);
      lastSavedState.value = JSON.stringify(serializeCanvas());
      hasUnsavedChanges.value = false;
      return res.data.id;
    } catch (err) {
      console.error("Error creating canvas:", err);
      return null;
    }
  };

  // ─── Switch ───────────────────────────────────────────────────────────────────

  /**
   * Cambia al canvas con el id dado. Limpia el store y carga el nuevo.
   */
  const switchCanvas = async (id) => {
    if (id === activeCanvasId.value) return true;
    try {
      clearStore();
      const res = await api.get(`/api/canvas/${id}`);
      const loaded = await deserializeFromBackend(res.data);
      if (loaded) {
        activeCanvasId.value = id;
        storeActiveId(id);
      }
      return loaded;
    } catch (err) {
      console.error("Error switching canvas:", err);
      return false;
    }
  };

  // ─── Rename ───────────────────────────────────────────────────────────────────

  const renameCanvas = async (id, name) => {
    try {
      await api.patch(`/api/canvas/${id}`, { name });
      const item = canvasList.value.find((c) => c.id === id);
      if (item) item.name = name;
      return true;
    } catch (err) {
      console.error("Error renaming canvas:", err);
      return false;
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────────

  /**
   * Elimina un canvas. Si era el activo, cambia al más reciente restante.
   * Si era el único, limpia el store.
   */
  const deleteCanvas = async (id) => {
    try {
      await api.delete(`/api/canvas/${id}`);
      canvasList.value = canvasList.value.filter((c) => c.id !== id);

      if (activeCanvasId.value === id) {
        if (canvasList.value.length > 0) {
          await switchCanvas(canvasList.value[0].id);
        } else {
          clearStore();
          activeCanvasId.value = null;
          storeActiveId(null);
        }
      }
      return true;
    } catch (err) {
      console.error("Error deleting canvas:", err);
      return false;
    }
  };

  // ─── Clear (reset) ────────────────────────────────────────────────────────────

  /**
   * Limpia el store y guarda el estado vacío en el canvas activo (no lo elimina).
   * Para playground/offline borra también localStorage.
   */
  const clearSavedCanvas = async () => {
    clearStore();
    if (useBackend() && activeCanvasId.value) {
      try {
        await api.put(`/api/canvas/${activeCanvasId.value}`, {
          data: { photos: [], discardedPhotos: [], currentZIndex: 1 },
        });
        const item = canvasList.value.find(
          (c) => c.id === activeCanvasId.value,
        );
        if (item) item.photoCount = 0;
      } catch (err) {
        console.error("Error clearing canvas on backend:", err);
      }
    } else {
      localStorage.removeItem(CANVAS_STORAGE_KEY);
    }
    hasUnsavedChanges.value = false;
    return true;
  };

  // ─── hasSavedCanvas ───────────────────────────────────────────────────────────

  const hasSavedCanvas = () => {
    if (useBackend()) return activeCanvasId.value !== null;
    return localStorage.getItem(CANVAS_STORAGE_KEY) !== null;
  };

  const getCanvasList = () => canvasList.value;

  // ─── Change detection ────────────────────────────────────────────────────────

  const detectChanges = () => {
    if (isLoading.value) return;
    try {
      hasUnsavedChanges.value =
        lastSavedState.value !== JSON.stringify(serializeCanvas());
    } catch (err) {
      console.error("Error detecting changes:", err);
    }
  };

  const initializeChangeDetection = () => {
    watch(
      () => [
        canvasStore.photos.length,
        canvasStore.photos.map((p) => ({ id: p.id, config: { ...p.config } })),
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

  const markAsSaved = () => {
    lastSavedState.value = JSON.stringify(serializeCanvas());
    hasUnsavedChanges.value = false;
  };

  return {
    // Estado
    hasUnsavedChanges,
    isSaved,
    isSaving,
    activeCanvasId,
    canvasList,
    currentCanvasName,

    // Acciones
    saveCanvas,
    loadCanvas,
    clearSavedCanvas,
    createCanvas,
    switchCanvas,
    renameCanvas,
    deleteCanvas,

    // Utilidades
    hasSavedCanvas,
    getCanvasList,
    markAsSaved,
    initializeChangeDetection,

    // Internos (expuestos para tests/debug)
    serializeCanvas,
    deserializeFromBackend,
    deserializeFromLocalStorage,
  };
}
