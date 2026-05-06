<template>
  <n-modal
    :show="show"
    :mask-closable="type === 'warning'"
    @update:show="onUpdateShow"
    :style="{ width: '520px', maxWidth: '95vw' }"
  >
    <n-card :bordered="false" role="dialog" aria-modal="true" class="dsw-card">
      <template #header>
        <div class="dsw-header">
          <n-icon
            size="20"
            :color="
              type === 'warning'
                ? 'var(--warning-color, #f59e0b)'
                : 'var(--error-color, #ef4444)'
            "
          >
            <component
              :is="type === 'warning' ? AlertCircleOutline : BanOutline"
            />
          </n-icon>
          <span>{{
            type === "warning" ? "Demo Mode – Heads Up" : "Demo Access Revoked"
          }}</span>
        </div>
      </template>

      <!-- Only show close button on first warning -->
      <template v-if="type === 'warning'" #header-extra>
        <n-button text @click="$emit('close')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="dsw-body">
        <!-- Warning (first offence) -->
        <template v-if="type === 'warning'">
          <p class="dsw-description">
            Photoreka is a
            <strong>semantic photo search engine for photographers</strong> —
            designed to help you find specific moments, subjects, or emotions
            within your own personal photo library.
          </p>
          <div class="dsw-info-box">
            <p class="dsw-info-text">
              This is a <strong>public demo</strong> running on a curated
              library of stock photography. Searches for adult, explicit, or
              otherwise inappropriate content are not what this tool is for —
              and they won't produce useful results anyway.
            </p>
          </div>
          <p class="dsw-hint">
            Try searching for something like
            <em>"golden hour portrait"</em>, <em>"rainy street candid"</em>, or
            <em>"couple at the beach at sunset"</em> to see what Photoreka can
            really do. One more violation will end your demo session.
          </p>
        </template>

        <!-- Banned (second offence) -->
        <template v-else>
          <p class="dsw-description">
            You've repeatedly searched for content that's outside the scope of
            this tool. Your demo session has been terminated.
          </p>
          <div class="dsw-info-box dsw-info-box--error">
            <p class="dsw-info-text">
              This browser has been flagged and will no longer have access to
              the public demo. If you believe this is a mistake, contact us at
              <a href="mailto:hello@photoreka.com" class="dsw-link"
                >hello@photoreka.com</a
              >.
            </p>
          </div>
          <p class="dsw-hint">You will be logged out automatically…</p>
        </template>
      </div>

      <template #footer>
        <div class="dsw-footer">
          <template v-if="type === 'warning'">
            <n-button type="primary" @click="$emit('close')">
              Understood, I'll use it properly
            </n-button>
          </template>
          <template v-else>
            <n-button type="error" disabled>Logging out…</n-button>
          </template>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
import { NModal, NCard, NButton, NIcon } from "naive-ui";
import {
  AlertCircleOutline,
  BanOutline,
  CloseOutline,
} from "@vicons/ionicons5";

defineProps({
  show: { type: Boolean, default: false },
  /** "warning" (first offence) | "banned" (second offence) */
  type: { type: String, default: "warning" },
});

const emit = defineEmits(["close"]);

function onUpdateShow(val) {
  if (!val) emit("close");
}
</script>

<style scoped>
.dsw-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.dsw-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.dsw-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.dsw-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.dsw-info-box {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
}

.dsw-info-box--error {
  border-color: var(--error-color, #ef4444);
  background-color: color-mix(
    in srgb,
    var(--error-color, #ef4444) 8%,
    var(--bg-container)
  );
}

.dsw-info-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.dsw-hint {
  margin: 0;
  font-size: var(--font-size-xs, 12px);
  color: var(--text-tertiary, var(--text-secondary));
  line-height: 1.5;
  font-style: italic;
}

.dsw-link {
  color: var(--primary-color);
  text-decoration: none;
}

.dsw-link:hover {
  text-decoration: underline;
}

.dsw-footer {
  display: flex;
  justify-content: flex-end;
}
</style>
