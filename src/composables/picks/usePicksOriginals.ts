import { reactive, ref, type Ref } from "vue";
import { downloadBlob } from "@/utils/picks/download";
import { hasAccess, originalsSupported, requestAccess } from "@/utils/picks/fsAccess";
import { getOriginal, loadSessionRoots } from "@/utils/picks/originalsStore";

/**
 * unavailable: this browser holds no originals for the session (Firefox,
 *   Safari, another device, or a demo session).
 * locked: the references exist but the browser needs permission again,
 *   which happens on every new visit; the download click asks for it.
 */
export type OriginalsAccess = "unavailable" | "locked" | "ready";

// Full-size originals decoded for the big views (podium, detail). A few are
// enough: each can weigh tens of MB once decoded, so the oldest are released.
const HI_RES_CACHE = 12;

const isNotFound = (error: unknown) =>
  error instanceof DOMException && error.name === "NotFoundError";

export function usePicksOriginals(sessionId: Ref<string | null>) {
  const access = ref<OriginalsAccess>("unavailable");
  let roots: FileSystemHandle[] = [];
  const hiRes = reactive(new Map<string, string>());
  const loading = new Set<string>();

  function clearHiRes() {
    hiRes.forEach((url) => URL.revokeObjectURL(url));
    hiRes.clear();
  }

  /**
   * Reads the originals of these photos from disk for the views that show them
   * large. Only with permission already granted: it never prompts on its own.
   */
  async function ensureHiRes(photoIds: string[]) {
    const id = sessionId.value;
    if (access.value !== "ready" || !id) return;
    for (const photoId of photoIds) {
      if (hiRes.has(photoId) || loading.has(photoId)) continue;
      loading.add(photoId);
      try {
        const record = await getOriginal(id, photoId);
        if (!record || id !== sessionId.value) continue;
        const url = URL.createObjectURL(await record.handle.getFile());
        hiRes.set(photoId, url);
        while (hiRes.size > HI_RES_CACHE) {
          const [oldest, oldUrl] = hiRes.entries().next().value!;
          URL.revokeObjectURL(oldUrl);
          hiRes.delete(oldest);
        }
      } catch {
        // Moved or unreadable original: the thumbnail keeps showing.
      } finally {
        loading.delete(photoId);
      }
    }
  }

  async function refresh() {
    const id = sessionId.value;
    roots = [];
    clearHiRes();
    access.value = "unavailable";
    if (!originalsSupported || !id) return;
    const loaded = await loadSessionRoots(id);
    if (id !== sessionId.value || loaded.length === 0) return;
    roots = loaded;
    access.value = (await hasAccess(roots)) ? "ready" : "locked";
  }

  /** Must run inside a click: it may show the browser's permission prompt. */
  async function downloadOriginal(photoId: string): Promise<"ok" | "missing" | "denied"> {
    if (!sessionId.value || access.value === "unavailable") return "denied";
    if (access.value === "locked") {
      if (!(await requestAccess(roots))) return "denied";
      access.value = "ready";
    }
    const record = await getOriginal(sessionId.value, photoId);
    if (!record) return "missing";
    try {
      downloadBlob(await record.handle.getFile(), record.name);
      return "ok";
    } catch (error) {
      if (isNotFound(error)) return "missing";
      throw error;
    }
  }

  return { access, hiRes, refresh, ensureHiRes, downloadOriginal };
}
