<template>
  <div class="ccs">
    <AppLogo layout="icon" :height="52" class="ccs-logo" />

    <h2 class="ccs-title">Chat with your canvas</h2>

    <div class="ccs-points">
      <div class="ccs-point">
        <n-icon :size="16" class="ccs-point-icon"><LayersOutline /></n-icon>
        <span>
          It knows <strong>every photo on the board</strong> — it can search
          them, and it never suggests one you already have out.
        </span>
      </div>
      <div class="ccs-point">
        <n-icon :size="16" class="ccs-point-icon"><EyeOutline /></n-icon>
        <span>
          The <strong>halo</strong> is what it actually looks at. Pan the board
          to move it, or click photos to point it at them yourself.
        </span>
      </div>
      <div class="ccs-point">
        <n-icon :size="16" class="ccs-point-icon"><HandLeftOutline /></n-icon>
        <span>
          <strong>Drag any photo</strong> from a reply straight onto the canvas.
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * The canvas chat's blank state.
 *
 * A component rather than a title-and-description pair: what needs explaining here is a
 * distinction — the chat KNOWS the whole board but only SEES what is under the halo —
 * and three lines with their own icons carry that where two fields of text could not.
 * The host owns its blank state; ChatView just renders whatever `uiConfig.emptyState`
 * hands it.
 */
import { NIcon } from "naive-ui";
import { EyeOutline, HandLeftOutline, LayersOutline } from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";

defineOptions({ name: "CanvasChatEmptyState" });
</script>

<style scoped>
.ccs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  max-width: 340px;
  margin: 0 auto;
  padding: var(--spacing-lg);
  text-align: center;
}

.ccs-logo {
  color: var(--text-tertiary);
}

.ccs-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: var(--spacing-xs) 0 0;
}

.ccs-points {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  text-align: left;
  margin-top: var(--spacing-xs);
}

.ccs-point {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-tertiary);
}

.ccs-point-icon {
  color: var(--primary-color);
  flex-shrink: 0;
  margin-top: 2px;
}

.ccs-point strong {
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}
</style>
