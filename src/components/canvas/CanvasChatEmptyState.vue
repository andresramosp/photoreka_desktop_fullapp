<template>
  <div class="ccs">
    <AppLogo layout="icon" :height="52" class="ccs-logo" />

    <h2 class="ccs-title">Chat with your canvas</h2>

    <div class="ccs-points">
      <div class="ccs-point">
        <!-- Dashed purple ring: the outer halo, standing for the whole board as ambient
             context — matches the canvas's outer ring in colour and dash. -->
        <svg
          class="ccs-mark ccs-mark--global"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="3 2.2"
          />
        </svg>
        <span>
          Chatlab is aware of <strong>every photo on the board</strong> as
          general context and the overall sense of your canvas.
        </span>
      </div>
      <div class="ccs-point">
        <!-- Filled cyan disc: the focus halo the model actually looks through — matches the
             canvas's central filled glow in colour. -->
        <svg
          class="ccs-mark ccs-mark--focus"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="5" />
        </svg>
        <span>
          Use the circular <strong>halo</strong> to focus on specific images and
          ask more targeted questions. Or select them yourself by clicking, or
          <strong
            >{{ isMac ? "⌘" : "Ctrl" }} +
            <span class="ccs-box" aria-hidden="true"></span
          ></strong>
          to drag a box.
        </span>
      </div>
      <div class="ccs-point">
        <n-icon :size="16" class="ccs-point-icon"><HandLeftOutline /></n-icon>
        <span>
          <strong>Drag any photo</strong> from a response straight onto the
          canvas.
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
import { computed } from "vue";
import { NIcon } from "naive-ui";
import { HandLeftOutline } from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";

defineOptions({ name: "CanvasChatEmptyState" });

// Show the platform's real modifier key, matching the atlas/world-map config panels.
const isMac = computed(
  () => navigator.platform.toUpperCase().indexOf("MAC") >= 0,
);
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

/* Scope marks that mirror the canvas halos: a filled accent disc for the focus halo, a
   dashed secondary ring for the whole-board context. */
.ccs-mark {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.ccs-mark--focus {
  fill: var(--accent-color);
}

.ccs-mark--global {
  color: var(--secondary-color);
}

.ccs-point strong {
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}

/* A little dashed square standing in for the drag-selection box. */
.ccs-box {
  display: inline-block;
  width: 0.72em;
  height: 0.72em;
  border: 1.5px dashed currentColor;
  border-radius: 2px;
  vertical-align: -0.04em;
}
</style>
