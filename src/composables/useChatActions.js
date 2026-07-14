// composables/useChatActions.js
//
// Executes the grounded action suggestions produced by the backend Phase 3 agent.
// This is the frontend half of the contract in
// api/app/utils/chat_actions_catalog.ts — a single dispatcher that maps each
// typed action to an existing app flow.
//
// Design note: create/add actions run "de golpe" (no pre-filled modal), matching
// how the canvas quick-create works, so the three creation flows feel homogeneous.
// A success toast offers "View" and, for creations, "Undo".
//
// Photo scope: the backend already resolved WHICH photos an action covers — it emits
// `params.photoIds` (what we operate on) plus, when the turn showed photo groups, the
// single `params.groupId`/`groupLabel` those ids came from. Handlers act on photoIds; the
// group reference is what the chip tooltip and the hover highlight use to show the user
// the action's scope before they click it. `params.title` is a real resource name, but no
// LLM wrote it: it's the group's own label (or the assistant's name for the selection).

import { h } from "vue";
import { useRouter } from "vue-router";
import { useMessage, useNotification } from "naive-ui";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { createCanvasWithPhotos } from "@/services/canvasQuickCreate.js";
import { gridFiltersToQuery } from "@/utils/photosGridQuery.js";

export function useChatActions() {
  const router = useRouter();
  const message = useMessage();
  const notification = useNotification();
  const collectionsStore = useCollectionsStore();
  const seriesStore = useSeriesStore();
  const { takeTo2D, takeToAtlas } = usePhotoToolSelection();

  const noop = () => {};

  const linkButton = (label, onClick) =>
    h(
      "button",
      {
        style: {
          color: "var(--accent-color)",
          fontWeight: "600",
          padding: "6px 12px",
          marginRight: "8px",
          background: "rgba(139, 92, 246, 0.1)",
          borderRadius: "6px",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          cursor: "pointer",
        },
        onClick,
      },
      label,
    );

  const successToast = (title, content, actions) =>
    notification.success({
      title,
      content,
      duration: 6000,
      action: () => h("div", { style: { display: "flex" } }, actions),
    });

  // ── Individual handlers ──────────────────────────────────────

  const createCollection = async ({ title, photoIds }) => {
    const created = await collectionsStore.createCollection({
      title,
      description: "",
      photoIds,
    });
    successToast(
      "Collection created",
      `“${title}” · ${photoIds.length} photos`,
      [
        linkButton("View", () => router.push(`/collections/${created.id}`)),
        // linkButton("Undo", async () => {
        //   try {
        //     await collectionsStore.deleteCollection(created.id);
        //     message.info("Collection removed");
        //   } catch {
        //     message.error("Couldn't undo");
        //   }
        // }),
      ],
    );
  };

  const createSeries = async ({ title, photoIds }) => {
    const created = await seriesStore.createSeries({ title, photoIds });
    successToast("Series created", `“${title}” · ${photoIds.length} photos`, [
      linkButton("View", () => router.push(`/series/${created.id}`)),
      // linkButton("Undo", async () => {
      //   try {
      //     await seriesStore.deleteSeries(created.id);
      //     message.info("Series removed");
      //   } catch {
      //     message.error("Couldn't undo");
      //   }
      // }),
    ]);
  };

  const createCanvas = async ({ title, photoIds }) => {
    const created = await createCanvasWithPhotos(title, photoIds);
    window.dispatchEvent(new Event("canvas:list-updated"));
    successToast(
      "Canvas created",
      `“${created.name}” · ${photoIds.length} photos`,
      [
        linkButton("Open", () => {
          router.push({
            name: "canvas",
            params: { canvasId: String(created.id) },
          });
        }),
      ],
    );
  };

  const addToCollection = async ({ collectionId, photoIds }) => {
    await collectionsStore.addPhotosToCollection(collectionId, photoIds);
    successToast("Photos added", `${photoIds.length} added to collection`, [
      linkButton("View", () => router.push(`/collections/${collectionId}`)),
    ]);
  };

  const addToSeries = async ({ seriesId, photoIds }) => {
    await seriesStore.addPhotosToSeries(seriesId, photoIds);
    successToast("Photos added", `${photoIds.length} added to series`, [
      linkButton("View", () => router.push(`/series/${seriesId}`)),
    ]);
  };

  const openWorkspace = async ({ filters }) => {
    router.push({ name: "workspace", query: gridFiltersToQuery(filters) });
  };

  // Broad semantic content search in SearchView (always broad + semantic, no
  // filters). SearchView reads `q` from the route and auto-runs the search.
  const searchPhotos = async ({ query }) => {
    router.push({ name: "search", query: { q: query } });
  };

  const viewPhoto = async ({ photoId, view }) => {
    if (view === "3d") {
      await takeToAtlas([photoId], noop);
    } else {
      await takeTo2D([photoId], noop);
    }
  };

  const VIEW_ROUTES = {
    report: { name: "report" },
    portfolios: { name: "portfolios" },
    portfolio: { name: "portfolio-detail" },
    collections: { name: "collections" },
    collection: { name: "collection-detail" },
    "series-list": { name: "series" },
    series: { name: "series-detail" },
    "world-map": { name: "world-map" },
    tagcloud: { name: "tagcloud" },
  };

  const openView = async ({ view, id, filters }) => {
    const target = VIEW_ROUTES[view];
    if (!target) return;
    const to = { name: target.name };
    if (id != null) to.params = { id };
    const query = { ...(target.query || {}), ...(filters ? gridFiltersToQuery(filters) : {}) };
    if (Object.keys(query).length > 0) to.query = query;
    router.push(to);
  };

  const HANDLERS = {
    create_collection: createCollection,
    create_series: createSeries,
    create_canvas: createCanvas,
    add_to_collection: addToCollection,
    add_to_series: addToSeries,
    search_photos: searchPhotos,
    open_workspace: openWorkspace,
    view_photo: viewPhoto,
    open_view: openView,
  };

  const WRITE_ACTION_TYPES = new Set([
    "create_collection",
    "create_series",
    "create_canvas",
    "add_to_collection",
    "add_to_series",
  ]);

  const isWriteAction = (action) => WRITE_ACTION_TYPES.has(action?.type);

  /**
   * Execute a suggested action. Returns true if a handler ran.
   * @param {{ type: string, label: string, params: object }} action
   */
  const executeAction = async (action) => {
    const handler = HANDLERS[action?.type];
    if (!handler) {
      console.warn("[useChatActions] unknown action type:", action?.type);
      return false;
    }
    try {
      await handler(action.params || {});
      return true;
    } catch (err) {
      console.error("[useChatActions] action failed:", action?.type, err);
      message.error("Couldn't complete that action");
      return false;
    }
  };

  return { executeAction, isWriteAction };
}
