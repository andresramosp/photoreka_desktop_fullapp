<template>
  <div class="panel-section">
    <div class="welcome-block">
      <h2 class="welcome-name">WELCOME BACK,&nbsp;{{ displayName }}!👋</h2>
      <p class="welcome-tagline">
        <template v-if="avgAestheticScore != null">
          Ready to organize your photos with Photoreka smart tools.
        </template>
        <template v-else>Ready to explore your photo universe.</template>
      </p>
    </div>

    <div class="photo-stats-block">
      <div
        class="photos-primary-stat"
        ref="statBlockRef"
        role="group"
        aria-label="Photo stats"
      >
        <div class="photos-primary-info">
          <n-icon size="18" class="photos-primary-icon">
            <LayersOutline />
          </n-icon>
          <span class="photos-primary-count">{{
            photosCount.toLocaleString()
          }}</span>
          <div class="photos-primary-meta">
            <span class="photos-primary-label">Total photos</span>
            <n-button
              text
              type="primary"
              size="tiny"
              class="photos-workspace-link"
              @click="runInlineAction"
              :aria-label="inlineActionLabel"
            >
              {{ inlineActionText }}
            </n-button>
          </div>
        </div>

        <n-button
          v-if="statBlockCompact"
          type="info"
          size="small"
          @click="runPrimaryAction"
          :aria-label="primaryActionLabel"
        >
          <template #icon>
            <n-icon size="16">
              <component :is="primaryActionIcon" />
            </n-icon>
          </template>
        </n-button>
        <n-button
          v-else
          type="info"
          size="small"
          @click="runPrimaryAction"
          :aria-label="primaryActionLabel"
        >
          <template #icon>
            <n-icon size="16">
              <component :is="primaryActionIcon" />
            </n-icon>
          </template>
          {{ primaryActionText }}
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { LayersOutline, ShareOutline } from "@vicons/ionicons5";

const props = defineProps<{
  userShortName?: string | null;
  avgAestheticScore: number | null;
  photosCount: number;
  preferredSource?: string | null;
}>();

const emit = defineEmits<{
  (event: "go-workspace"): void;
  (event: "go-upload"): void;
}>();

const statBlockRef = ref<HTMLElement | null>(null);
const statBlockCompact = ref(false);
let statBlockObserver: ResizeObserver | null = null;

const displayName = computed(() =>
  (props.userShortName || "photographer").toUpperCase(),
);

const normalizedPreferredSource = computed(() =>
  String(props.preferredSource || "")
    .trim()
    .toLowerCase(),
);

const isLightroomPreferred = computed(
  () =>
    normalizedPreferredSource.value === "lightroom" ||
    normalizedPreferredSource.value === "ligthroom",
);

const primaryActionKind = computed(() =>
  isLightroomPreferred.value ? "workspace" : "upload",
);

const inlineActionKind = computed(() =>
  isLightroomPreferred.value ? "upload" : "workspace",
);

const primaryActionText = computed(() =>
  primaryActionKind.value === "upload" ? "Import Area" : "See Workspace",
);

const inlineActionText = computed(() =>
  inlineActionKind.value === "upload" ? "Import Area" : "See Workspace",
);

const primaryActionLabel = computed(() =>
  primaryActionKind.value === "upload" ? "Import Area" : "See Workspace",
);

const inlineActionLabel = computed(() =>
  inlineActionKind.value === "upload" ? "Import Area" : "See workspace",
);

const primaryActionIcon = computed(() =>
  primaryActionKind.value === "upload" ? ShareOutline : LayersOutline,
);

const runAction = (action: "workspace" | "upload") => {
  if (action === "upload") {
    emit("go-upload");
    return;
  }
  emit("go-workspace");
};

const runPrimaryAction = () => runAction(primaryActionKind.value);
const runInlineAction = () => runAction(inlineActionKind.value);

onMounted(() => {
  if (statBlockRef.value) {
    statBlockObserver = new ResizeObserver(([entry]) => {
      statBlockCompact.value = entry.contentRect.width < 240;
    });
    statBlockObserver.observe(statBlockRef.value);
  }
});

onBeforeUnmount(() => {
  statBlockObserver?.disconnect();
});
</script>

<style scoped>
.welcome-block {
  margin: 0;
}

.photo-stats-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.photos-primary-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px;
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary-color);
  border-radius: 12px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.photos-primary-info {
  display: flex;
  gap: 7px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  align-items: center;
}

.photos-primary-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0;
  justify-content: center;
}

.photos-primary-icon {
  color: var(--accent-color);
  flex-shrink: 0;
}

.photos-primary-count {
  font-size: 24px;
  font-weight: 800;
  color: var(--accent-color);
  line-height: 1;
  letter-spacing: -0.03em;
}

.photos-primary-label {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 600;
  line-height: 1.05;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.photos-workspace-link {
  margin: 0;
  height: auto;
  min-height: 0;
  line-height: 1.05;
  text-align: left;
  justify-content: flex-start;
}

.photos-workspace-link :deep(.n-button__content) {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.05;
}

.photos-workspace-link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  outline-offset: 2px;
  border-radius: 4px;
}

.welcome-name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text-primary);
  margin: 0 0 4px;
  line-height: 1.35;
}

.welcome-tagline {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

@media (max-width: 360px) {
  .photos-primary-stat {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
