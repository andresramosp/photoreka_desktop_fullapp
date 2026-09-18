// src/composables/useSuggestedCanvas.js
import { ref } from "vue";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";
import {
  getImageDimensions,
  fitPhotoToBaseBox,
} from "@/utils/canvasPhotoSizing";
import { clusterLayout } from "@/utils/canvasLayout";

/**
 * Propuesta semanal de canvas ("moodboard seed") para el dashboard.
 *
 * Estado a nivel de módulo, como useLatestCanvas: PhotoUniverse decide si
 * tomar el panel y el preview pinta las fotos; ambos comparten la misma carga.
 *
 * El back sólo da { title, photoIds }. La disposición en racimo se calcula aquí
 * una vez (determinista) y es la misma que se persiste al abrir el canvas.
 *
 * El día que toca semilla hay que construirla, y eso lleva una llamada al LLM y
 * una búsqueda por temática. Por eso el back responde primero `generating` y el
 * resultado se recoge sondeando: el panel sabe desde el principio que viene una
 * semilla y enseña su loader, en vez de pintar otra pantalla y taparla después.
 */
const proposal = ref(null); // { title, photoIds }
/** Ya sabemos si hoy hay semilla (o si la espera se ha agotado). */
const statusKnown = ref(false);
/** Se está construyendo ahora mismo. */
const isGenerating = ref(false);
// [{ id, src, config }]
const previewPhotos = ref([]);

/** Entre sondeos. */
const POLL_INTERVAL_MS = 2500;
/** Tope de espera de la generación; pasado esto se deja correr y ya saldrá otro día. */
const POLL_TIMEOUT_MS = 120000;
/**
 * Tope para la PRIMERA respuesta, que es sólo un par de queries. Si tarda más
 * que esto el dashboard deja de esperarla: una semilla tapada de vez en cuando
 * es mejor que un panel en blanco.
 */
const STATUS_TIMEOUT_MS = 2000;

let loadPromise = null;
// Una salida explícita del usuario durante la generación: lo que llegue ya no
// se muestra.
let cancelled = false;

const buildPreviewPhotos = async (photoIds) => {
  const res = await api.post("/api/canvas/photos", { photosIds: photoIds });
  const byId = new Map((res.data || []).map((p) => [p.id, p]));
  const photos = photoIds
    .map((id) => byId.get(id))
    .filter((p) => p?.thumbnailUrl);

  const sizes = await Promise.all(
    photos.map(async (p) => {
      let dims = null;
      try {
        dims = await getImageDimensions(p.thumbnailUrl);
      } catch {
        /* fitPhotoToBaseBox falls back to the horizontal box */
      }
      return { id: p.id, ...fitPhotoToBaseBox(dims) };
    }),
  );

  return clusterLayout(sizes).map(({ id, config }) => ({
    id,
    src: byId.get(id).thumbnailUrl,
    config,
  }));
};

const fetchStatus = async () => {
  const res = await api.get("/api/dashboard/suggested-canvas");
  return res.data ?? { status: "none" };
};

const pollUntilSettled = async () => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline && !cancelled) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (cancelled) break;
    const data = await fetchStatus();
    if (data.status !== "generating") return data;
  }
  return { status: "none" };
};

const loadSuggestedCanvas = () => {
  if (!loadPromise) {
    const userStore = useUserStore();
    const statusTimer = setTimeout(() => {
      statusKnown.value = true;
    }, STATUS_TIMEOUT_MS);

    loadPromise = (async () => {
      if (!userStore.isAuthenticated) return;

      let data = await fetchStatus();
      if (data.status === "generating") {
        isGenerating.value = true;
        // Ya sabemos que hoy toca: el panel puede comprometerse con el loader
        // sin esperar a que la semilla exista.
        statusKnown.value = true;
        data = await pollUntilSettled();
      }
      if (cancelled || data.status !== "ready") return;

      const photos = await buildPreviewPhotos(data.proposal.photoIds);
      if (cancelled || photos.length === 0) return;
      previewPhotos.value = photos;
      proposal.value = data.proposal;
    })()
      .catch((err) => console.error("Error loading suggested canvas:", err))
      .finally(() => {
        clearTimeout(statusTimer);
        isGenerating.value = false;
        statusKnown.value = true;
      });
  }
  return loadPromise;
};

// Shown for the first time: from here the proposal stays on offer for a day.
const markSeen = () => {
  api.post("/api/dashboard/suggested-canvas/seen").catch(() => {});
};

// Turned into a canvas: the proposal is consumed for good.
const markOpened = () => {
  api.post("/api/dashboard/suggested-canvas/opened").catch(() => {});
};

/** Persists the proposal as a real canvas, laid out exactly as previewed. */
const createCanvasFromProposal = async () => {
  const res = await api.post("/api/canvas", {
    name: proposal.value.title,
    data: {
      photos: previewPhotos.value.map((p) => ({ id: p.id, config: p.config })),
      discardedPhotos: [],
      currentZIndex: previewPhotos.value.length + 1,
    },
  });
  return res.data.id;
};

/** Puts the proposal away for this session only; a reload brings it back while
 *  it is still on offer. Also calls off a generation still in flight, so a
 *  seed the user has already walked away from never takes the panel. */
const dismissProposal = () => {
  cancelled = true;
  isGenerating.value = false;
  proposal.value = null;
  previewPhotos.value = [];
};

export function useSuggestedCanvas() {
  return {
    proposal,
    statusKnown,
    isGenerating,
    previewPhotos,
    loadSuggestedCanvas,
    markSeen,
    markOpened,
    createCanvasFromProposal,
    dismissProposal,
  };
}
