// src/composables/useLatestCanvas.js
import { ref } from "vue";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";

// Mirrors useCanvasPersistence's key for the anonymous/local-only canvas.
const CANVAS_STORAGE_KEY = "photoreka_canvas_data";

/**
 * Datos del último canvas en el que se trabajó, para el preview del dashboard.
 *
 * Viven a nivel de módulo (cache compartido): PhotoUniverse solo necesita saber si hay
 * algún canvas (para ofrecer o no el modo) y el componente de preview necesita las fotos.
 * Con estado por instancia ambos pedirían la lista por separado.
 *
 * "Último" = el de `updatedAt` más reciente ENTRE LOS QUE TIENEN FOTOS: un canvas
 * vacío no cuenta (sería una pantalla en blanco con un placeholder). Suele coincidir
 * con el canvas activo salvo que el usuario lo haya cambiado desde otro dispositivo.
 */
const hasCanvas = ref(false);
const listLoaded = ref(false);
const isLoading = ref(false);
const canvasId = ref(null);
const canvasName = ref("");
// [{id, src, config:{x, y, width, height, zIndex, opacity}}]
const previewPhotos = ref([]);

// Puerta de entrada del preview del dashboard (ver ALWAYS_PREVIEW_CANVAS en
// PhotoUniverse): en memoria, no persistida. Se resetea en cada recarga de la
// app y se consume, dentro de la misma sesión de pestaña, en cuanto el usuario
// abre el canvas de verdad (ver markCanvasGatewayConsumed, llamado desde
// CanvasView).
const gatewayConsumed = ref(false);
const markCanvasGatewayConsumed = () => {
  gatewayConsumed.value = true;
};

let loadPromise = null;

const loadLocalCanvas = () => {
  try {
    const saved = localStorage.getItem(CANVAS_STORAGE_KEY);
    const photos = saved ? JSON.parse(saved)?.data?.photos || [] : [];
    hasCanvas.value = photos.length > 0;
    canvasName.value = "My Canvas";
    previewPhotos.value = photos
      .filter((p) => p?.config && (p.src || p.thumbnailUrl))
      .map((p) => ({
        id: p.id,
        src: p.thumbnailUrl || p.src,
        config: p.config,
      }));
  } catch {
    hasCanvas.value = false;
    previewPhotos.value = [];
  }
};

const loadBackendCanvas = async () => {
  const listRes = await api.get("/api/canvas");
  const list = listRes.data || [];
  // OJO: no marcar listLoaded aquí. hasCanvas se resuelve en los await de abajo,
  // y quien observa [listLoaded, hasCanvas] revertiría a la preferencia al ver
  // loaded=true con has aún false. loadLatestCanvas lo marca en su .finally.

  // Candidatos de más reciente a más antiguo, solo los que declaran fotos.
  const candidates = [...list]
    .filter((c) => Number(c.photoCount) > 0)
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  for (const candidate of candidates) {
    const canvasRes = await api.get(`/api/canvas/${candidate.id}`);
    const savedPhotos = canvasRes.data?.data?.photos || [];
    // photoCount puede venir obsoleto: si el canvas viene vacío, se prueba
    // con el siguiente en vez de mostrar un placeholder de tablero vacío.
    if (savedPhotos.length === 0) continue;

    hasCanvas.value = true;
    canvasId.value = candidate.id;
    canvasName.value = candidate.name || "My Canvas";

    // El canvas guardado solo lleva {id, config}: las imágenes se piden aparte,
    // igual que hace deserializeFromBackend al cargar el canvas de verdad.
    const ids = savedPhotos.map((p) => p.id);
    let catalogPhotos = [];
    try {
      const res = await api.post("/api/catalog/photosByIds", {
        photosIds: ids,
      });
      catalogPhotos = res.data || [];
    } catch (err) {
      console.error("Error fetching photos for canvas preview:", err);
    }
    const catalogById = new Map(catalogPhotos.map((p) => [p.id, p]));

    previewPhotos.value = savedPhotos
      .filter((p) => p?.config && catalogById.get(p.id)?.thumbnailUrl)
      .map((p) => ({
        id: p.id,
        src: catalogById.get(p.id).thumbnailUrl,
        config: p.config,
      }));
    return;
  }

  hasCanvas.value = false;
  previewPhotos.value = [];
};

/**
 * Carga la lista y el canvas más reciente una sola vez por sesión; llamadas
 * posteriores reutilizan la misma promesa/resultado.
 */
const loadLatestCanvas = () => {
  if (!loadPromise) {
    const userStore = useUserStore();
    isLoading.value = true;
    loadPromise = (
      userStore.isAuthenticated
        ? loadBackendCanvas()
        : Promise.resolve(loadLocalCanvas())
    )
      .catch((err) => console.error("Error loading latest canvas:", err))
      .finally(() => {
        listLoaded.value = true;
        isLoading.value = false;
      });
  }
  return loadPromise;
};

export function useLatestCanvas() {
  return {
    hasCanvas,
    listLoaded,
    isLoading,
    canvasId,
    canvasName,
    previewPhotos,
    loadLatestCanvas,
    gatewayConsumed,
    markCanvasGatewayConsumed,
  };
}
