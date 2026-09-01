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
        <!-- Context. The count on the button is the at-a-glance figure; the panel
             behind it is where the two kinds of context are told apart, which a tooltip
             with one number never could. -->
        <n-popover trigger="click" placement="bottom-end" :width="288">
          <template #trigger>
            <n-button
              quaternary
              size="tiny"
              :type="
                isSelectionFocus
                  ? 'warning'
                  : visionEnabled
                    ? 'primary'
                    : 'default'
              "
              title="What the chat can see"
            >
              <template #icon>
                <n-icon :size="15">
                  <HandRightOutline v-if="isSelectionFocus" />
                  <EyeOutline v-else />
                </n-icon>
              </template>
              <span class="ccp-vision-count">{{ visionLabel }}</span>
            </n-button>
          </template>
          <CanvasChatContext
            :board-count="boardPhotoIds.length"
            :focused-photos="focusedPhotos"
            :focused-total="coveredCount"
            :max-focused="maxFocused"
            :focus-source="focusSource"
            :vision-enabled="visionEnabled"
            @toggle-vision="emit('toggle-vision')"
            @clear-focus="emit('clear-focus')"
          />
        </n-popover>

        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button
              quaternary
              size="tiny"
              :disabled="!canReset || isResetting"
              @click="showResetConfirm = true"
            >
              <template #icon>
                <n-icon :size="15"><TrashOutline /></n-icon>
              </template>
            </n-button>
          </template>
          Start a new chat for this canvas
        </n-tooltip>

        <n-tooltip trigger="hover" placement="bottom">
          <template #trigger>
            <n-button quaternary size="tiny" @click="emit('close')">
              <template #icon>
                <n-icon :size="15"><ChevronForwardOutline /></n-icon>
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
import {
  NButton,
  NIcon,
  NModal,
  NPopover,
  NSpin,
  NTooltip,
  useMessage,
} from "naive-ui";
import {
  ChevronForwardOutline,
  EyeOutline,
  HandRightOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import { RobotOutlined } from "@vicons/antd";

import { api } from "@/utils/axios";
import { useChatStore, disposeChatStore } from "@/stores/chat.js";
import { provideCanvasChatSession } from "@/composables/useCanvasChat";
import CanvasChatContext from "@/components/canvas/CanvasChatContext.vue";
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
  /** The photos under the vision radius, in the board's reading order. */
  visiblePhotoIds: { type: Array, default: () => [] },
  /** The same set as objects, for the context panel's thumbnails. */
  focusedPhotos: { type: Array, default: () => [] },
  /** How many photos the focus holds in total — may exceed what the chat is sent. */
  coveredCount: { type: Number, default: 0 },
  /** 'halo' (ambient, follows the viewport) or 'selection' (photos picked by hand). */
  focusSource: { type: String, default: "halo" },
  /** Cap on what a hand-picked selection can hand the chat. */
  maxFocused: { type: Number, default: 12 },
  visionEnabled: { type: Boolean, default: true },
});

const emit = defineEmits(["close", "toggle-vision", "clear-focus", "resize"]);

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

const canReset = computed(
  () => !!numericCanvasId.value && !!chatStore.value.activeConversationId,
);

// ── Vision radius readout ───────────────────────────────────────────────────

const isSelectionFocus = computed(() => props.focusSource === "selection");

/** Truncated only ever happens with a hand-picked selection — the halo has no cap. */
const isTruncated = computed(
  () => isSelectionFocus.value && props.coveredCount > props.maxFocused,
);

const visionLabel = computed(() => {
  if (isSelectionFocus.value) {
    return isTruncated.value
      ? `${props.maxFocused}/${props.coveredCount}`
      : String(props.coveredCount);
  }
  return props.visionEnabled ? String(props.coveredCount) : "off";
});

// ── The session ChatView injects ────────────────────────────────────────────

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
      // An off radius sends no visible ids at all, so the server injects no canvas view
      // and the agent is told nothing about what the user is looking at — which is
      // exactly what turning it off should mean.
      visibleIds: props.visionEnabled
        ? props.visiblePhotoIds.map(Number).filter(Number.isFinite)
        : [],
    };
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
  gap: 2px;
}

.ccp-vision-count {
  margin-left: 4px;
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
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
   grid inside a bubble overflows it. Two photo columns is what fits, and the transcript
   reads as a stream of suggestions rather than as prose. */
.canvas-chat-panel :deep(.message-row) {
  --bubble-measure: 100%;
}

.canvas-chat-panel :deep(.message-photos-grid) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
