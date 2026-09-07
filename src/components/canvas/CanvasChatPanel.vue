<template>
  <aside class="canvas-chat-panel" :style="{ width: `${width}px` }">
    <!-- Drag edge. Sits on the panel's left border and resizes it; the stage picks the
         new width up through the container's ResizeObserver in CanvasView. -->
    <div
      class="ccp-resizer"
      :class="{ 'ccp-resizer--active': isResizing }"
      @mousedown="startResize"
    />

    <header class="ccp-header">
      <div class="ccp-title">
        <n-icon :size="16" class="ccp-title-icon"><RobotOutlined /> </n-icon>
        <span>Canvas Chat</span>
      </div>

      <div class="ccp-header-actions">
        <!-- The halo, on or off. Beside "Canvas only" because they are the same kind of
             thing — two switches that change what the next turn carries — and a switch
             belongs where it can be seen, not behind a hover. While photos are picked by
             hand (a drag-box) the selection is what the chat sees and the halo has no say;
             clicking the toggle then clears the selection and hands the focus back to the
             halo — the reciprocal of how drawing a box takes the focus away from it. -->
        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button
              quaternary
              size="tiny"
              class="ccp-scope-toggle ccp-halo-toggle"
              :class="{
                'is-on': visionEnabled && !isSelectionFocus,
                'is-icononly': !showScopeLabel,
              }"
              @click="onHaloToggle"
            >
              <template #icon>
                <CanvasScopeMark type="focus" :size="14" />
              </template>
              <span v-if="showScopeLabel">Halo</span>
            </n-button>
          </template>
          {{
            isSelectionFocus
              ? "You picked photos by hand — those are what the chat sees. Click to clear the selection and go back to the halo."
              : visionEnabled
                ? "The halo is ON — the photos under the halo are your focused area."
                : "The halo is OFF — drag a box over photos to select your focused area."
          }}
        </n-tooltip>

        <!-- Canvas only. A hard scope the user opts into: on, every search the chat runs
             stays within the photos on this board instead of reaching the catalog. Off by
             default (the agent decides, as before) and disabled while the board is empty,
             since there would be nothing to scope to. -->
        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button
              quaternary
              size="tiny"
              class="ccp-scope-toggle"
              :class="{
                'is-on': scopedToCanvas && canScopeToCanvas,
                'is-icononly': !showScopeLabel,
              }"
              :disabled="!canScopeToCanvas"
              @click="scopedToCanvas = !scopedToCanvas"
            >
              <template #icon>
                <n-icon :size="15"><ScanOutline /></n-icon>
              </template>
              <span v-if="showScopeLabel">Canvas only</span>
            </n-button>
          </template>
          {{
            !canScopeToCanvas
              ? "Add photos to the board first — then you can scope the chat to it"
              : scopedToCanvas
                ? "Canvas only is ON — every search stays within the photos on this board, nothing from the wider catalog"
                : "Canvas only is OFF — the chat searches your whole catalog. Turn it on to keep every result within this board."
          }}
        </n-tooltip>

        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button
              quaternary
              size="tiny"
              class="ccp-icon-btn ccp-newchat-btn"
              :disabled="!canReset || isResetting"
              @click="showResetConfirm = true"
            >
              <template #icon>
                <n-icon :size="18"><CreateOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Start a new chat for this canvas
        </n-tooltip>

        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button
              quaternary
              size="tiny"
              class="ccp-icon-btn"
              @click="emit('close')"
            >
              <template #icon>
                <n-icon :size="16"><ChevronForwardOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Hide the chat
        </n-tooltip>
      </div>
    </header>

    <!-- An unsaved canvas has no id, so there is nothing to attach a conversation to.
         Saving is one click away and the empty state says so, rather than opening a chat
         whose history would be lost the moment the board is saved. -->
    <div v-if="!numericCanvasId" class="ccp-unavailable">
      <n-icon :size="26" class="ccp-unavailable-icon"
        ><RobotOutlined />
      </n-icon>
      <p>Save this canvas to start a chat about it.</p>
      <span
        >Its conversation is kept with the board, not in your chat
        history.</span
      >
    </div>

    <div v-else-if="isLoading" class="ccp-loading">
      <n-spin :size="20" />
    </div>

    <component
      :is="ChatViewAsync"
      v-else
      :key="numericCanvasId"
      class="ccp-chat"
      :ui-config="CHAT_UI_CONFIG"
    />

    <n-modal
      v-model:show="showResetConfirm"
      preset="dialog"
      type="warning"
      title="Start a new chat?"
      content="This canvas's conversation will be deleted. The photos on the board are not affected."
      positive-text="Delete and start over"
      negative-text="Cancel"
      @positive-click="resetConversation"
    />
  </aside>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  markRaw,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import { NButton, NIcon, NModal, NSpin, NTooltip, useMessage } from "naive-ui";
import {
  ChevronForwardOutline,
  CreateOutline,
  ScanOutline,
} from "@vicons/ionicons5";
import { RobotOutlined } from "@vicons/antd";

import { api } from "@/utils/axios";
import { useChatStore, disposeChatStore } from "@/stores/chat.js";
import { provideCanvasChatSession } from "@/composables/useCanvasChat";
import CanvasScopeMark from "@/components/canvas/CanvasScopeMark.vue";
import CanvasChatEmptyState from "@/components/canvas/CanvasChatEmptyState.vue";

defineOptions({ name: "CanvasChatPanel" });

// Async for the same reason the dashboard does it: the chat drags in photo dialogs and a
// markdown renderer, and most canvas sessions never open it.
const ChatViewAsync = defineAsyncComponent(
  () => import("@/views/ChatView.vue"),
);

const props = defineProps({
  /** The saved canvas. Null while it has never been saved — see the empty state above. */
  canvasId: { type: [Number, String], default: null },
  width: { type: Number, default: 400 },
  /**
   * The photos actually placed on the board. Kept out of what the agent proposes, and the
   * set every description of the board is computed over.
   */
  boardPhotoIds: { type: Array, default: () => [] },
  /**
   * Photos in the trash zone. Also kept out of what the agent proposes — the user just
   * threw them away — but never part of what describes the board.
   */
  discardedPhotoIds: { type: Array, default: () => [] },
  /** The photos in focus — under the halo or picked by hand — in the board's reading order. */
  focusPhotoIds: { type: Array, default: () => [] },
  /** The same set as objects, for the context panel's thumbnails. */
  focusedPhotos: { type: Array, default: () => [] },
  /** How many photos the focus holds in total — may exceed what the chat is sent. */
  coveredCount: { type: Number, default: 0 },
  /** 'halo' (ambient, follows the viewport) or 'selection' (photos picked by hand). */
  focusSource: { type: String, default: "halo" },
  /** Cap on what a hand-picked selection can hand the chat. */
  maxFocused: { type: Number, default: 12 },
  /**
   * The photos the user spotlighted on the board — the subject of the turn, and the finest
   * of the three nested levels. Board state like the focus, owned by the host: a spotlight
   * points at a photo already placed, which is what separates it from a composer
   * attachment brought in from outside the board.
   */
  spotlightedPhotos: { type: Array, default: () => [] },
  /** The same set as ids, in the board's reading order. */
  spotlightPhotoIds: { type: Array, default: () => [] },
  /**
   * Focus and spotlight as a GRID of ids — rows of cells, `null` where the board is empty.
   * The flat reading order cannot say that two photos sit side by side while a third hangs
   * below them, and that is what a question like "does this fit here" turns on.
   */
  layout: { type: Array, default: () => [] },
  /** Whether that grid reads as more than one cluster apart from each other — see
   *  `layoutHasSeparateGroups`. Live off the same geometry as `layout`. */
  hasSeparateGroups: { type: Boolean, default: false },
  visionEnabled: { type: Boolean, default: true },
  /**
   * Lay a grouping the chat proposed out on the board, as a block, in the order the reply
   * gave it — see `materializeChatGroup` in CanvasView.
   *
   * A function rather than an emit: the transcript's button waits on it to know when the
   * group has landed, and the toast below reports what it actually placed.
   *
   * @type {import("vue").PropType<(group: {label: string, photos: Array<object>}) => Promise<number>>}
   */
  materializeGroup: { type: Function, default: null },
});

const emit = defineEmits([
  "close",
  "toggle-vision",
  "clear-focus",
  "resize",
  "highlight-photo",
  "locate-photo",
  "clear-spotlight",
  "fit-to-view",
]);

const message = useMessage();

/**
 * What this host asks ChatView to drop.
 *
 * `backendId` is the only one that reaches the server: it narrows the agent's tools and
 * swaps in the canvas prompts (see `chat_templates_service.ts`). Everything else is
 * chrome that a 400px column has no room for — and the history sidebar would be actively
 * wrong here, since these conversations are reached through their board, never a list.
 *
 * Frozen at module scope: a fresh object per render remounts nothing, but it would make
 * every computed in ChatView that reads it churn on each keystroke.
 */
const CHAT_UI_CONFIG = Object.freeze({
  backendId: "canvas-companion",
  hideHistory: true,
  hideNewChat: true,
  hideTopbar: true,
  // The welcome screen's suggestions are library-wide ("Library Analysis", "Social media
  // ideas") and point away from the board the panel exists to talk about — and its cards
  // do not fit a narrow column anyway. `emptyState` puts a canvas-shaped blank state in
  // its place rather than leaving the panel saying nothing at all.
  //
  // `markRaw` because this is a component sitting inside a frozen config object that Vue
  // would otherwise try to make reactive, warning as it goes.
  hideWelcome: true,
  emptyState: markRaw(CanvasChatEmptyState),
  placeholder: "Chat with your canvas",
  // No selection space here. It is a shelf you curate INTO over a conversation, and the
  // board beside this panel already is one — a second place to set photos aside would
  // compete with the thing the whole surface exists for. Photos go to the canvas by being
  // dragged there, which is also what makes them context for the next turn.
  hideBasket: true,
  // No Phase 3 suggested actions either. They propose destinations elsewhere in the app
  // (create a series, add to a collection), which is a step away from the board the user
  // is in the middle of arranging. It also saves the extra call per turn.
  hideActions: true,
  // The conversation is created archived server-side whatever the client says; this stops
  // the client from refreshing a sidebar that will never list it.
  hiddenConversation: true,
});

const numericCanvasId = computed(() => {
  const id = Number(props.canvasId);
  return Number.isInteger(id) && id > 0 ? id : null;
});

/**
 * The board's photos as a set, so a card in the transcript can tell in O(1) whether its
 * twin is already on the canvas — those are the ones the chat highlights on hover and
 * refuses to drag (there is nothing to add; it is already there).
 */
const boardPhotoIdSet = computed(
  () => new Set(props.boardPhotoIds.map(Number).filter(Number.isFinite)),
);

/**
 * One store per board. The dashboard's chat stays alive under KeepAlive while this one is
 * open, and a shared store would have each answering into the other's transcript.
 */
const storeScope = computed(() =>
  numericCanvasId.value ? `canvas:${numericCanvasId.value}` : null,
);

const chatStore = computed(() => useChatStore(storeScope.value));

const isLoading = ref(false);
const isResetting = ref(false);
const showResetConfirm = ref(false);

/**
 * The "Canvas only" switch. Off by default — the agent decides where to search, exactly as
 * before. On, every search the turn runs is confined to the photos on the board (enforced
 * server-side; see `canvasScopedToCanvas` in the chat payload). A deliberate, per-board
 * constraint the user flips when they want to work strictly within what they have out; a
 * change of board resets it (see the watch below), because a cage is a thing you opt into
 * for the board in front of you.
 */
const scopedToCanvas = ref(false);

/** Nothing on the board to confine to — the switch would cage every search to an empty pool. */
const canScopeToCanvas = computed(() => props.boardPhotoIds.length > 0);

/**
 * The header runs out of room for the two toggles' text labels well before the panel's
 * floor, where the vision chip and two icon buttons already fill the row. Below this they
 * both collapse to their icons and the tooltips carry the whole explanation; widen the
 * panel and both labels return. The switches themselves, and their on/off colour, are
 * there at every width.
 *
 * One flag for both on purpose: they are a pair, and a row with one labelled pill beside
 * one bare icon reads as two unrelated controls.
 */
const showScopeLabel = computed(() => props.width >= 520);

const canReset = computed(
  () => !!numericCanvasId.value && !!chatStore.value.activeConversationId,
);

// ── Vision radius readout ───────────────────────────────────────────────────

const isSelectionFocus = computed(() => props.focusSource === "selection");

// One button, two reciprocal meanings. It reads ON only while the halo is on AND owns the
// focus (see `is-on` above); every other state reads OFF, and a single click always flips
// what it reads:
//  - reads ON  → turn the halo off.
//  - reads OFF → make it read ON: drop any hand-picked selection so the halo takes the
//    focus back (mirroring how drawing a box took it away), and switch the halo on if it
//    was off. Both may be needed at once — a selection drawn while the halo was already off
//    left the button OFF for two independent reasons.
const onHaloToggle = () => {
  if (props.visionEnabled && !isSelectionFocus.value) {
    emit("toggle-vision");
    return;
  }
  if (isSelectionFocus.value) emit("clear-focus");
  if (!props.visionEnabled) emit("toggle-vision");
};

// ── The session ChatView injects ────────────────────────────────────────────

/**
 * Whether the empty state's walkthrough is open right now. Owned here so it outlives the
 * empty-state component (which unmounts the moment the first message lands) and can be read
 * from ChatView, which shows the "this closes the tutorial" guard before a send goes.
 * CanvasChatEmptyState writes it; nothing else does.
 */
const tutorialActive = ref(false);

provideCanvasChatSession({
  canvasId: numericCanvasId,
  // The ref, not its value: this object is built once, while the board it describes can
  // change underneath it. ChatView reads it at its own setup, which a change of canvas
  // re-runs because the view is keyed on the board.
  storeScope,
  /**
   * The board as it is at this exact moment.
   *
   * A function rather than a watched value: photos move and the radius slides
   * continuously, so the only state that matters is the one at the instant the message
   * was sent. Watching it would also re-render the transcript on every pan.
   */
  readContext: () => {
    if (!numericCanvasId.value) return null;
    return {
      canvasId: numericCanvasId.value,
      photoIds: props.boardPhotoIds.map(Number).filter(Number.isFinite),
      discardedIds: props.discardedPhotoIds.map(Number).filter(Number.isFinite),
      // With the halo off and nothing picked by hand there is no focus to send, so the
      // server injects no canvas view and the agent is told nothing about what the user
      // is looking at — which is exactly what turning it off should mean. A hand-picked
      // selection is a focus in its own right and travels whether or not the halo is on,
      // the same way the chip above counts it.
      focusIds:
        props.visionEnabled || props.focusSource === "selection"
          ? props.focusPhotoIds.map(Number).filter(Number.isFinite)
          : [],
      // The photos the user spotlighted on the board — the subject of the turn. Sent
      // whatever the halo is doing: a spotlight is an explicit pick, so unlike the focus
      // it does not depend on a zone being open.
      spotlightIds: props.spotlightPhotoIds.map(Number).filter(Number.isFinite),
      // Focus and spotlight as a grid of ids. Built by the host, which owns the geometry;
      // no coordinate ever crosses the wire.
      layout: props.layout,
      // "Canvas only": the server caps every search at the placed photos. Read at send
      // time like the rest of the board snapshot, so the switch's state when the user
      // pressed enter is the one that counts.
      scopedToCanvas: scopedToCanvas.value,
    };
  },
  // The photos already placed, as a live set. A transcript card looks itself up here to
  // know whether it has a twin on the board.
  boardPhotoIdSet,
  // How many photos are in focus right now (halo or hand-picked), reactively. The empty
  // state offers focus-specific starter prompts only when there is a focus to talk about;
  // zero when vision is off and nothing is hand-picked — matching what the vision chip reads.
  focusedCount: computed(() =>
    props.visionEnabled || props.focusSource === "selection"
      ? props.coveredCount
      : 0,
  ),
  // A card in the transcript is pointing at (or leaving) its twin on the board. The panel
  // just relays it to the host, which owns the canvas and paints the accent highlight —
  // the same effect the related-photos strip uses.
  highlightOnCanvas: (photoId) => emit("highlight-photo", photoId),
  // The eye button on a card already-on-the-board: glide the canvas until its twin is
  // centred. Same relay — the host owns the stage.
  locateOnCanvas: (photoId) => emit("locate-photo", photoId),
  /**
   * Everything the context readout needs about the board, as one object. The readout is
   * rendered from the COMPOSER, next to where the turn is actually written, and ChatView
   * owns that — so the board's half of it travels here rather than through a prop chain,
   * and the attachments never have to travel up at all.
   */
  contextReadout: computed(() => ({
    boardCount: props.boardPhotoIds.length,
    focusedPhotos: props.focusedPhotos,
    focusedTotal: props.coveredCount,
    maxFocused: props.maxFocused,
    focusSource: props.focusSource,
    spotlightedPhotos: props.spotlightedPhotos,
    hasSeparateGroups: props.hasSeparateGroups,
  })),
  /** The readout's one action: drop a hand-picked selection. */
  clearFocus: () => emit("clear-focus"),
  /**
   * Turn the halo off, idempotently — the empty state calls it when the tutorial opens, so
   * the walkthrough starts at the board level and the user opts back up to the focus. Only
   * fires the toggle when the halo is actually on, so it never flips it back on by mistake.
   */
  disableHalo: () => {
    if (props.visionEnabled) emit("toggle-vision");
  },
  /**
   * A labelled group in the transcript is being made real on the board. Relayed to the
   * host, which owns the geometry; the toast lives here because this is the surface the
   * click happened on and the board itself says nothing.
   */
  materializeGroup: async ({ label, photos }) => {
    if (!props.materializeGroup) return;
    try {
      const placed = await props.materializeGroup({ label, photos });
      // if (placed > 0) {
      //   message.success(
      //     `"${label}" laid out on the canvas — ${placed} photo${placed === 1 ? "" : "s"}`,
      //   );
      // }
    } catch (error) {
      console.warn("[CanvasChatPanel] Could not lay out the group:", error);
      message.error("Could not lay that group out on the canvas");
    }
  },
  /** Frame the whole outer vision ring — the empty state calls it as the tutorial opens, so
   *  the user sees everything the board level talks about. */
  fitToView: () => emit("fit-to-view"),
  /**
   * Drop every spotlighted photo — the readout's action, and the empty state calls it as
   * the tutorial opens so the walkthrough starts clean at the board level. Relayed to the
   * host, which owns the set.
   */
  clearSpotlight: () => emit("clear-spotlight"),
  /** The walkthrough's open/closed flag — see `tutorialActive` above. The empty state sets
   *  it as its tutorial screen opens and closes. */
  tutorialActive,
  /** Force the flag closed — ChatView calls it when the user chooses "Send anyway" on the
   *  exit guard, so the tutorial does not linger for the instant before the reply lands. */
  endTutorial: () => {
    tutorialActive.value = false;
  },
});

// ── Opening the board's conversation ────────────────────────────────────────

/**
 * Bring up whatever this canvas was last talking about.
 *
 * The binding lives on the server, so this asks rather than remembers: a board opened on
 * another device has a conversation this browser has never seen. A canvas with no chat
 * yet resolves to null and leaves the welcome screen up — the first message creates and
 * binds the conversation server-side.
 */
const openBoundConversation = async (canvasId) => {
  isLoading.value = true;
  try {
    const { data } = await api.get(`/api/chat/canvas-session/${canvasId}`);
    const conversationId = data?.conversationId ?? null;

    if (!conversationId) {
      chatStore.value.startNewConversation();
      return;
    }
    if (chatStore.value.activeConversationId === conversationId) return;

    await chatStore.value.loadConversation(conversationId);
  } catch (error) {
    // Non-fatal: an unreachable binding leaves a blank chat, and the next message simply
    // starts a new conversation for this board.
    console.warn(
      "[CanvasChatPanel] Failed to open the canvas conversation:",
      error?.message,
    );
    chatStore.value.startNewConversation();
  } finally {
    isLoading.value = false;
  }
};

const resetConversation = async () => {
  const canvasId = numericCanvasId.value;
  if (!canvasId || isResetting.value) return;

  isResetting.value = true;
  try {
    await api.post("/api/chat/canvas-session/reset", { canvasId });
    chatStore.value.startNewConversation();
    message.success("Canvas chat cleared");
  } catch (error) {
    message.error(
      error?.response?.data?.message || "Could not clear the canvas chat",
    );
  } finally {
    isResetting.value = false;
  }
};

watch(
  numericCanvasId,
  (canvasId, previousId) => {
    // The board this panel was talking about is gone from it: drop the store so a session
    // that opens twenty canvases does not hold twenty transcripts.
    //
    // `flush: 'post'` matters here — ChatView is keyed on the board, so the old instance
    // is still mounted and still reading this store until the DOM has been patched.
    // Disposing before that pulls the store out from under a live component.
    if (previousId && previousId !== canvasId) {
      disposeChatStore(`canvas:${previousId}`);
      // A cage is opted into for the board in front of you — a different board starts free.
      scopedToCanvas.value = false;
    }
    if (canvasId) openBoundConversation(canvasId);
  },
  { immediate: true, flush: "post" },
);

// ── Resizing ────────────────────────────────────────────────────────────────

// The floor is set by the composer, not by the transcript: below roughly this the attach
// button, the input and the mode selector stop fitting on one row and the box wraps into
// a second one on every keystroke.
const MIN_WIDTH = 380;
const MAX_WIDTH = 680;

const isResizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;

const onResizeMove = (event) => {
  // The panel is on the right, so dragging left (a negative delta) widens it.
  const next = resizeStartWidth - (event.clientX - resizeStartX);
  emit("resize", Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
};

const stopResize = () => {
  isResizing.value = false;
  window.removeEventListener("mousemove", onResizeMove);
  window.removeEventListener("mouseup", stopResize);
};

const startResize = (event) => {
  event.preventDefault();
  isResizing.value = true;
  resizeStartX = event.clientX;
  resizeStartWidth = props.width;
  window.addEventListener("mousemove", onResizeMove);
  window.addEventListener("mouseup", stopResize);
};

onBeforeUnmount(stopResize);
</script>

<style scoped>
.canvas-chat-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  border-left: 1px solid var(--border-color);
  background: var(--bg-body);
}

/* ── Resize edge ─────────────────────────────────────────── */
.ccp-resizer {
  position: absolute;
  top: 0;
  left: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;
}

.ccp-resizer:hover::after,
.ccp-resizer--active::after {
  content: "";
  position: absolute;
  top: 0;
  left: 2px;
  width: 2px;
  height: 100%;
  background: var(--primary-color);
}

/* ── Header ──────────────────────────────────────────────── */
.ccp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  flex-shrink: 0;
  min-height: 40px;
  padding: var(--spacing-xs) var(--spacing-xs) var(--spacing-xs)
    var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-surface);
}

.ccp-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  white-space: nowrap;
}

.ccp-title-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.ccp-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ccp-icon-btn.n-button {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
}

/* Canvas-only toggle — a compact pill sharing the header's chip language. Muted when off,
   primary-accented when on, so its state reads at a glance the way the vision chip's does. */
.ccp-scope-toggle.n-button {
  height: 26px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  background-color: var(--surface-hover, rgba(255, 255, 255, 0.06));
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.ccp-scope-toggle.n-button :deep(.n-button__icon) {
  margin-right: 5px;
}

/* Icon-only (narrow panel): a neat square-ish pill, no reserved space for a label. */
.ccp-scope-toggle.n-button.is-icononly {
  padding: 0 7px;
}
.ccp-scope-toggle.n-button.is-icononly :deep(.n-button__icon) {
  margin-right: 0;
}
.ccp-scope-toggle.n-button:not(.n-button--disabled):hover {
  color: var(--text-secondary);
  background-color: var(--surface-active, rgba(255, 255, 255, 0.1));
}

/* The halo toggle wears the halo's own colour when on, not the scope pill's amber: it is
   the same blue as the ring on the board and as the focus mark everywhere else. Its mark
   follows the button's text colour so the OFF state reads as muted rather than as a lit
   disc on a dead button. */
.ccp-halo-toggle.n-button :deep(.csm--focus) {
  fill: currentColor;
}

.ccp-halo-toggle.n-button.is-on {
  color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 24%, transparent);
}
.ccp-halo-toggle.n-button.is-on:hover {
  color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 18%, transparent);
}

/* On — the board is the cage. */
.ccp-scope-toggle.n-button:not(.ccp-halo-toggle).is-on {
  color: var(--warning-color);
  background-color: color-mix(in srgb, var(--warning-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--warning-color) 24%, transparent);
}
.ccp-scope-toggle.n-button:not(.ccp-halo-toggle).is-on:hover {
  color: var(--warning-color);
  background-color: color-mix(in srgb, var(--warning-color) 18%, transparent);
}

.ccp-newchat-btn:not(.n-button--disabled) :deep(.n-icon) {
  color: var(--text-secondary);
}
.ccp-newchat-btn:not(.n-button--disabled):hover :deep(.n-icon) {
  color: var(--primary-color);
}

/* ── Body ────────────────────────────────────────────────── */
.ccp-chat {
  flex: 1;
  min-height: 0;
}

.ccp-loading,
.ccp-unavailable {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-lg);
  text-align: center;
}

.ccp-unavailable-icon {
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-xs);
}

.ccp-unavailable p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.ccp-unavailable span {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

/* A narrow column cannot carry the chat's default reading measure: at 680px every photo
   grid inside a bubble overflows it. */
.canvas-chat-panel :deep(.message-row) {
  --bubble-measure: 100%;
}

/* ── Composer ────────────────────────────────────────────── */
/* The chat's own composer is sized for a full-width view: page gutters, a large circular
   attach button and a 28px icon. In a panel that height is the first thing the user
   notices, because it eats the transcript from the bottom on a column that is already
   short. Everything here is size, nothing is layout — the single-row / wrapped-row logic
   in ChatView still decides the arrangement. */
.canvas-chat-panel :deep(.chat-input-area) {
  padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm);
}

.canvas-chat-panel :deep(.attach-btn) {
  width: 30px;
  height: 30px;
  min-width: 30px;
}

.canvas-chat-panel :deep(.attach-btn .n-icon) {
  font-size: 20px;
}

.canvas-chat-panel :deep(.attach-btn svg) {
  width: 20px;
  height: 20px;
}
</style>
