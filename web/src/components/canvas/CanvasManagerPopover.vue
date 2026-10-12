<template>
  <n-popover
    v-if="!isPlayground"
    placement="bottom-start"
    trigger="click"
    :show="isOpen"
    @update:show="isOpen = $event"
    :style="{ padding: 0 }"
    :show-arrow="false"
    raw
  >
    <template #trigger>
      <n-tooltip placement="bottom" trigger="hover">
        <template #trigger>
          <n-button
            secondary
            type="primary"
            class="canvas-switcher-btn"
            :class="{ 'is-open': isOpen }"
            :loading="isSwitching"
          >
            <template #icon>
              <n-icon><LayersOutline /></n-icon>
            </template>
            <span class="switcher-label">{{ currentCanvasName }}</span>
            <n-icon
              class="switcher-chevron"
              :style="{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }"
            >
              <ChevronDownOutline />
            </n-icon>
          </n-button>
        </template>
        My canvases
      </n-tooltip>
    </template>

    <div class="canvas-panel surface-elevated" @click.stop>
      <!-- Header -->
      <div class="panel-header">
        <span class="panel-title">My Canvases</span>
        <n-tooltip placement="bottom" trigger="hover">
          <template #trigger>
            <n-button
              quaternary
              circle
              size="tiny"
              :loading="isCreating"
              class="new-btn"
              @click="handleCreate"
            >
              <template #icon>
                <n-icon><AddOutline /></n-icon>
              </template>
            </n-button>
          </template>
          New canvas
        </n-tooltip>
      </div>

      <!-- Canvas list -->
      <div class="canvas-list" v-if="canvasList.length > 0">
        <div
          v-for="canvas in canvasList"
          :key="canvas.id"
          class="canvas-item surface-row"
          :class="{
            active: canvas.id === activeCanvasId,
            'is-loading': loadingId === canvas.id,
          }"
          @click="handleSwitch(canvas.id)"
        >
          <!-- Active indicator -->
          <span
            class="active-dot"
            :class="{ visible: canvas.id === activeCanvasId }"
          />

          <!-- Content -->
          <div class="item-body">
            <!-- Rename mode -->
            <n-input
              v-if="renamingId === canvas.id"
              ref="renameInputRef"
              v-model:value="renameValue"
              size="small"
              class="rename-input"
              @keydown.enter.prevent="confirmRename(canvas.id)"
              @keydown.escape="cancelRename"
              @blur="confirmRename(canvas.id)"
              @click.stop
            />
            <!-- Normal mode -->
            <template v-else>
              <span class="item-name">{{ canvas.name }}</span>
              <span class="item-meta">
                {{ canvas.photoCount }}
                {{ canvas.photoCount === 1 ? "photo" : "photos" }} ·
                {{ relativeTime(canvas.updatedAt) }}
              </span>
            </template>
          </div>

          <!-- Actions -->
          <div v-if="renamingId !== canvas.id" class="item-actions" @click.stop>
            <n-button
              v-if="canvas.id === activeCanvasId"
              quaternary
              circle
              size="tiny"
              class="action-btn"
              title="Reset canvas"
              @click.stop="emit('reset-canvas')"
            >
              <template #icon
                ><n-icon size="11"><ReloadOutline /></n-icon
              ></template>
            </n-button>
            <n-button
              quaternary
              circle
              size="tiny"
              class="action-btn"
              title="Rename"
              @click.stop="startRename(canvas)"
            >
              <template #icon
                ><n-icon size="11"><PencilOutline /></n-icon
              ></template>
            </n-button>
            <n-button
              quaternary
              circle
              size="tiny"
              class="action-btn"
              title="Duplicate"
              @click.stop="handleDuplicate(canvas.id)"
            >
              <template #icon
                ><n-icon size="11"><CopyOutline /></n-icon
              ></template>
            </n-button>
            <div class="item-delete-wrap" @click.stop>
              <template v-if="pendingDeleteId === canvas.id">
                <n-button
                  size="tiny"
                  type="error"
                  class="item-confirm-btn"
                  :disabled="canvasList.length <= 1"
                  @click.stop="handleDelete(canvas.id)"
                  >Delete</n-button
                >
                <n-button
                  size="tiny"
                  quaternary
                  class="item-confirm-btn"
                  @click.stop="pendingDeleteId = null"
                  >Cancel</n-button
                >
              </template>
              <n-button
                v-else
                quaternary
                circle
                size="tiny"
                class="action-btn delete-btn"
                title="Delete canvas"
                :disabled="canvasList.length <= 1"
                @click.stop="pendingDeleteId = canvas.id"
              >
                <template #icon
                  ><n-icon size="11"><TrashOutline /></n-icon
                ></template>
              </n-button>
            </div>
          </div>

          <!-- Loading spinner -->
          <SpiralGridLoader
            v-if="loadingId === canvas.id"
            variant="primary"
            :size="18"
            class="item-spin"
          />
        </div>
      </div>
    </div>
  </n-popover>
</template>

<script setup>
import { ref, nextTick } from "vue";
import { NPopover, NButton, NIcon, NTooltip, NInput } from "naive-ui";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import {
  LayersOutline,
  ChevronDownOutline,
  AddOutline,
  PencilOutline,
  CopyOutline,
  TrashOutline,
  ReloadOutline,
} from "@vicons/ionicons5";

const props = defineProps({
  isPlayground: { type: Boolean, default: false },
  activeCanvasId: { type: Number, default: null },
  canvasList: { type: Array, default: () => [] },
  currentCanvasName: { type: String, default: "My Canvas" },
  isSwitching: { type: Boolean, default: false },
});

const emit = defineEmits([
  "switch-canvas",
  "create-canvas",
  "rename-canvas",
  "duplicate-canvas",
  "delete-canvas",
  "reset-canvas",
]);

const isOpen = ref(false);
const isCreating = ref(false);
const loadingId = ref(null);
const renamingId = ref(null);
const renameValue = ref("");
const renameInputRef = ref(null);
const pendingDeleteId = ref(null);

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleSwitch(id) {
  if (id === props.activeCanvasId) return;
  loadingId.value = id;
  isOpen.value = false;
  emit("switch-canvas", id);
  // The parent resets loadingId via the reactive property after switch
  setTimeout(() => {
    loadingId.value = null;
  }, 1500);
}

async function handleCreate() {
  isCreating.value = true;
  isOpen.value = false;
  emit("create-canvas");
  setTimeout(() => {
    isCreating.value = false;
  }, 1500);
}

function startRename(canvas) {
  renamingId.value = canvas.id;
  renameValue.value = canvas.name;
  nextTick(() => {
    const input = renameInputRef.value;
    if (input) {
      // NInput exposes focus via inputInstRef or directly
      const el = input.$el?.querySelector("input");
      if (el) {
        el.focus();
        el.select();
      }
    }
  });
}

function cancelRename() {
  renamingId.value = null;
  renameValue.value = "";
}

function confirmRename(id) {
  const name = renameValue.value.trim();
  if (name && name !== props.canvasList.find((c) => c.id === id)?.name) {
    emit("rename-canvas", id, name);
  }
  cancelRename();
}

function handleDuplicate(id) {
  isOpen.value = false;
  emit("duplicate-canvas", id);
}

function handleDelete(id) {
  pendingDeleteId.value = null;
  emit("delete-canvas", id);
}
</script>

<style scoped>
.canvas-switcher-btn {
  transition: all 0.2s ease;
}

.switcher-label {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.switcher-chevron {
  transition: transform 0.2s ease;
  margin-left: 2px;
  flex-shrink: 0;
}

/* Panel */
.canvas-panel {
  width: 380px;
  backdrop-filter: blur(12px);
  border-radius: 10px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
}

.panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.new-btn {
  opacity: 0.7;
  transition: opacity 0.15s;
}
.new-btn:hover {
  opacity: 1;
}

/* List */
.canvas-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}

.canvas-list::-webkit-scrollbar {
  width: 4px;
}
.canvas-list::-webkit-scrollbar-thumb {
  background: var(--border-color, rgba(255, 255, 255, 0.15));
  border-radius: 2px;
}

/* Item */
.canvas-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px 7px 14px;
  cursor: pointer;
  transition: background 0.15s;
  position: relative;
}

.canvas-item:hover .item-actions {
  opacity: 1;
}

.item-actions:has(.item-confirm-btn) {
  opacity: 1;
}

.active-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent;
  transition: background 0.2s;
}

.active-dot.visible {
  background: var(--primary-color, #6366f1);
}

.item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.canvas-item.active .item-name {
  color: var(--primary-color, #818cf8);
}

.item-meta {
  font-size: 11px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.38));
}

.item-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.action-btn {
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.action-btn:hover {
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
}

.delete-btn:hover {
  color: rgba(239, 68, 68, 0.9) !important;
}

.item-delete-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.item-confirm-btn {
  font-size: 11px !important;
  padding: 0 6px !important;
  height: 20px !important;
}

.rename-input {
  width: 100%;
}

.item-spin {
  flex-shrink: 0;
}
</style>
