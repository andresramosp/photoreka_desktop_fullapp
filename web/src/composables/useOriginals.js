import { ref } from "vue";
import { useMessage } from "naive-ui";
import { api } from "@/utils/axios";

// Originales en el disco del usuario (solo en el escritorio): la API local sabe dónde está cada
// uno y Electron, a través del preload, lo muestra en la carpeta o lo abre.
const bridge = () => window.photorekaDesktop ?? null;

// El navegador reutiliza la imagen ya cargada para una URL aunque la respuesta cambie: tras
// enlazar originales, la URL de la foto seguiría mostrando la miniatura que devolvía antes. Esta
// versión sube con cada enlace y se añade a la URL para que la imagen se vuelva a pedir.
const originalsVersion = ref(0);

export function withOriginalsVersion(url) {
  if (!url || originalsVersion.value === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${originalsVersion.value}`;
}

export function useOriginals() {
  const message = useMessage();
  const available = Boolean(bridge());
  const fileManagerName = bridge()?.platform === "darwin" ? "Finder" : "Explorer";

  /** { path, exists }: dónde está el original de la foto y si sigue ahí. */
  async function fetchLocation(photoId) {
    const { data } = await api.get(`/api/photos/${photoId}/original/location`);
    return data;
  }

  async function withOriginal(photoId, action) {
    const data = await fetchLocation(photoId);
    if (!data.path) {
      message.info("This photo isn't linked to an original file on this computer.");
      return;
    }
    if (!data.exists) {
      message.warning(
        `The original isn't at ${data.path} anymore. If you moved it, use "Locate…" next to its path in the Info panel.`,
        { duration: 8000 },
      );
      return;
    }
    if (!(await action(data.path))) message.error("Couldn't open the original file.");
  }

  const showOriginal = (photoId) =>
    withOriginal(photoId, (path) => bridge().showOriginal(path));
  const openOriginal = (photoId) =>
    withOriginal(photoId, (path) => bridge().openOriginal(path));

  async function fetchSummary() {
    const { data } = await api.get("/api/originals/summary");
    return data;
  }

  /**
   * Pide el archivo de una foto cuyo original se movió y lo enlaza si es el mismo. La API busca
   * además en esa carpeta los demás originales perdidos. Devuelve true si quedó enlazada.
   */
  async function relinkOriginal(photoId, previousPath) {
    const file = await bridge().chooseFile(previousPath);
    if (!file) return false;
    try {
      const { data } = await api.post(`/api/photos/${photoId}/original/relink`, { file });
      originalsVersion.value++;
      message.success(
        "Original found." +
          (data.alsoFound > 0
            ? ` Also found ${data.alsoFound} other missing originals in the same folder.`
            : ""),
      );
      return true;
    } catch (error) {
      if (error.response?.data?.code === "DIFFERENT_FILE") {
        message.error("That file isn't the original of this photo.");
      } else {
        console.error("Error relinking original:", error);
        message.error("Couldn't link that file.");
      }
      return false;
    }
  }

  /** Pide una carpeta y busca en ella los originales que ya no están donde se importaron. */
  async function locateOriginals() {
    const folder = await bridge().chooseFolder();
    if (!folder) return null;
    const { data } = await api.post("/api/originals/locate", { folder });
    if (data.found > 0) originalsVersion.value++;
    return data;
  }

  return {
    available,
    fileManagerName,
    fetchLocation,
    showOriginal,
    openOriginal,
    fetchSummary,
    relinkOriginal,
    locateOriginals,
  };
}
