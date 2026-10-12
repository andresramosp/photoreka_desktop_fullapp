<template>
  <n-modal
    :show="show"
    :style="{ width: '520px', maxWidth: '95vw' }"
    @update:show="handleShowChange"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="dup-found-card"
    >
      <template #header>
        <div class="dup-found-header">
          <n-icon size="20" color="var(--warning-color)">
            <CopyOutline />
          </n-icon>
          <span>Possible duplicates detected</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="emit('dismiss')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="dup-found-body">
        <p class="dup-found-description">
          We checked your import for visual similarity and found
          <strong
            >{{ totalCount }} photo{{ totalCount !== 1 ? "s" : "" }}</strong
          >
          that look like duplicates. We recommend reviewing them before
          analyzing.
        </p>

        <div
          v-if="batchCount > 0 || workspaceCount > 0"
          class="dup-found-breakdown"
        >
          <div v-if="batchCount > 0" class="dup-found-stat">
            <n-icon size="15" color="var(--warning-color)">
              <LayersOutline />
            </n-icon>
            <span>
              <strong>{{ batchCount }}</strong>
              {{ batchCount !== 1 ? "photos look" : "photo looks" }} like
              duplicates of others within this import
            </span>
          </div>
          <div v-if="workspaceCount > 0" class="dup-found-stat">
            <n-icon size="15" color="var(--warning-color)">
              <AlbumsOutline />
            </n-icon>
            <span>
              <strong>{{ workspaceCount }}</strong>
              {{ workspaceCount !== 1 ? "photos are" : "photo is" }} already in
              your workspace
            </span>
          </div>
        </div>

        <div class="dup-found-info-box">
          <div class="dup-found-info-header">
            <n-icon size="15" color="var(--info-color)">
              <SparklesOutline />
            </n-icon>
            <span class="dup-found-info-title">Why it's worth cleaning up</span>
          </div>
          <ul class="dup-found-benefits">
            <li>
              <strong>Save analysis</strong>: every duplicate you process uses
              up photos from your plan that you could spend on new work.
            </li>

            <li>
              <strong>Sharper analysis</strong>: chat assistant, patterns and
              portfolio tools work from real variety instead of the same shot
              counted many times.
            </li>
            <li>
              <strong>A cleaner workspace</strong>: browsing, search and
              collections stay easy to navigate without near-identical photos
              repeating.
            </li>
          </ul>
        </div>

        <p class="dup-found-note">
          <n-icon size="13" color="var(--text-tertiary, var(--text-secondary))">
            <InformationCircleOutline />
          </n-icon>
          <span>
            This check runs automatically only while your workspace is under
            {{ autoCheckLimit.toLocaleString() }} photos. Beyond that you'll
            need to run it yourself with the <strong>Duplicates</strong> button.
          </span>
        </p>

        <div class="dup-found-dismiss">
          <n-checkbox
            :checked="dontShowAgain"
            @update:checked="(value) => emit('update:dontShowAgain', value)"
          >
            Don't show this again
          </n-checkbox>
        </div>
      </div>

      <template #footer>
        <div class="dup-found-footer">
          <n-button tertiary @click="emit('dismiss')">I don't mind</n-button>
          <n-button type="primary" @click="emit('review')">
            <template #icon>
              <n-icon><EyeOutline /></n-icon>
            </template>
            Review
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
// NModal no está registrado globalmente (ver main.ts), hay que importarlo.
import { NModal } from "naive-ui";
import {
  AlbumsOutline,
  CloseOutline,
  CopyOutline,
  EyeOutline,
  InformationCircleOutline,
  LayersOutline,
  SparklesOutline,
} from "@vicons/ionicons5";

defineProps({
  show: { type: Boolean, default: false },
  // Photos that duplicate another photo inside the lightbox (current import)
  batchCount: { type: Number, default: 0 },
  // Photos that duplicate something already analyzed in the workspace
  workspaceCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  // Tamaño de workspace a partir del cual el chequeo deja de ser automático
  autoCheckLimit: { type: Number, default: 0 },
  dontShowAgain: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:show",
  "update:dontShowAgain",
  "review",
  "dismiss",
]);

// Cerrar desde fuera (click en la máscara, Esc) equivale a "I don't mind":
// el aviso no debe incordiar, así que cualquier cierre limpia las marcas.
const handleShowChange = (value) => {
  emit("update:show", value);
  if (!value) emit("dismiss");
};
</script>

<style scoped>
.dup-found-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.dup-found-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.dup-found-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.dup-found-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.dup-found-breakdown {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: color-mix(in srgb, var(--warning-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning-color) 25%, transparent);
  border-left: 3px solid var(--warning-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
}

.dup-found-stat {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.5;
}

.dup-found-info-box {
  background-color: color-mix(in srgb, var(--info-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 25%, transparent);
  border-left: 3px solid var(--info-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dup-found-info-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dup-found-info-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--info-color);
}

.dup-found-benefits {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.dup-found-note {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--font-size-xs, 12px);
  color: var(--text-tertiary, var(--text-secondary));
  line-height: 1.5;
  opacity: 0.85;
}

.dup-found-dismiss {
  padding-top: 4px;
}

.dup-found-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
