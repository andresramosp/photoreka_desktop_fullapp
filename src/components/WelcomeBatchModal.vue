<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="visible" class="wbm-overlay" @click.self="dismiss">
        <div class="wbm-modal" role="dialog" aria-modal="true">
          <button class="wbm-close" aria-label="Close" @click="dismiss">
            <n-icon :size="18"><CloseOutline /></n-icon>
          </button>

          <!-- Header -->
          <header class="wbm-header">
            <AppLogo theme="light" layout="icon" class="wbm-logo" />
            <div class="wbm-header-text">
              <h2 class="wbm-title">
                Welcome to <span class="wbm-title-accent">Photoreka</span>
              </h2>
              <p class="wbm-subtitle">
                The AI curation layer for your photo library
              </p>
            </div>
          </header>

          <!-- The pack: one panel holding the caption, the two grants and the
               line that ties them together. -->
          <section class="wbm-pack">
            <div class="wbm-pack-caption">
              <svg
                class="wbm-sparkle"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 2c.6 4.9 3.5 7.9 8 8-4.5 1.1-7.4 4-8 8-.6-4-3.5-6.9-8-8 4.5-1.1 7.4-4.1 8-8z"
                  fill="currentColor"
                />
              </svg>
              <n-icon :size="18" class="wbm-pack-gift"><GiftOutline /></n-icon>
              <span class="wbm-pack-label">Your welcome pack</span>
              <svg
                class="wbm-sparkle"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 2c.6 4.9 3.5 7.9 8 8-4.5 1.1-7.4 4-8 8-.6-4-3.5-6.9-8-8 4.5-1.1 7.4-4.1 8-8z"
                  fill="currentColor"
                />
              </svg>
            </div>

            <!-- Flex, not grid: the divider is the second column's left border,
                 so a single grant centers on its own without one. -->
            <div class="wbm-pack-grants">
              <div
                v-if="analyzedPhotosLimit !== null"
                class="wbm-grant wbm-grant--quota"
              >
                <span class="wbm-grant-value">{{
                  formatCount(analyzedPhotosLimit)
                }}</span>
                <span class="wbm-grant-label">
                  <n-icon :size="17" class="wbm-grant-icon">
                    <LayersOutline />
                  </n-icon>
                  Photo analysis
                </span>
                <span class="wbm-grant-hint">For your first batch</span>
              </div>

              <div
                v-if="creditsAvailable !== null"
                class="wbm-grant wbm-grant--credits"
              >
                <span class="wbm-grant-value">{{ creditsAvailable }}</span>
                <span class="wbm-grant-label">
                  <n-icon :size="17" class="wbm-grant-icon">
                    <ConstructOutline />
                  </n-icon>
                  Tool credits
                </span>
                <span class="wbm-grant-hint">For premium tools</span>
              </div>
            </div>

            <p class="wbm-pack-note">
              Explore your library and try premium tools.
            </p>
          </section>

          <!-- Footer: the single action, then the opt-out under it. -->
          <footer class="wbm-footer">
            <button class="wbm-cta" @click="goToChat">
              Claim your welcome pack
              <n-icon :size="17"><ArrowForwardOutline /></n-icon>
            </button>

            <label class="wbm-checkbox-label" @click.stop>
              <input
                type="checkbox"
                v-model="dontShowAgain"
                class="wbm-checkbox"
              />
              <span>Don't show this again</span>
            </label>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { NIcon } from "naive-ui";
import AppLogo from "./AppLogo.vue";
import { useUserStore } from "../stores/userStore";
import {
  CloseOutline,
  ArrowForwardOutline,
  GiftOutline,
  LayersOutline,
  ConstructOutline,
} from "@vicons/ionicons5";

const userStore = useUserStore();
const analyzedPhotosLimit = computed(
  () => userStore.user?.usage?.analyzedPhotosLimit ?? null,
);
const creditsAvailable = computed(
  () => userStore.user?.usage?.creditsAvailable ?? null,
);

const props = defineProps({
  show: { type: Boolean, default: false },
});

const emit = defineEmits(["close"]);

const router = useRouter();
const visible = ref(false);
const dontShowAgain = ref(false);

const STORAGE_KEY = "welcome-batch-modal-dismissed";

watch(
  () => props.show,
  (val) => {
    visible.value = val;
  },
  { immediate: true },
);

// Thousands with dots, matching how counts read elsewhere in the app.
const formatCount = (n) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
// Credits can be fractional (see Settings), so only whole ones drop decimals.
const formatCredits = (n) =>
  Number.isInteger(n) ? formatCount(n) : n.toFixed(1);

const dismiss = () => {
  if (dontShowAgain.value) {
    localStorage.setItem(STORAGE_KEY, "true");
  }
  visible.value = false;
  emit("close");
};

// The chat is where an empty library starts now: it explains the app and keeps
// the import one click away. /chat-lab lands on the dashboard's center panel on
// desktop and on the routed view on mobile, so both cases share this one exit.
const goToChat = () => {
  if (dontShowAgain.value) {
    localStorage.setItem(STORAGE_KEY, "true");
  }
  visible.value = false;
  emit("close");
  router.push({ name: "chat-lab" });
};
</script>

<style scoped>
/* Overlay */
.wbm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay, rgba(0, 0, 0, 0.6));
  backdrop-filter: blur(4px);
  padding: 16px;
  overflow-y: auto;
}

/* Modal */
.wbm-modal {
  position: relative;
  background: var(--bg-container, #1a1a1f);
  border: 1px solid var(--border-color, #2c2c32);
  border-radius: var(--radius-xl, 20px);
  box-shadow: var(--shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.25));
  max-width: 460px;
  width: 100%;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 32px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: auto;
}

.wbm-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--text-tertiary, rgba(255, 255, 255, 0.3));
  cursor: pointer;
  transition: all var(--transition-fast, 0.2s ease);
}

.wbm-close:hover {
  background: var(--bg-surface, #2c2c32);
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
}

/* Header: the mark sits beside the text block and spans title + subtitle. */
.wbm-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  text-align: left;
}

.wbm-logo {
  flex-shrink: 0;
}

/* Sized in CSS (not via the height prop) so it can shrink on narrow screens. */
.wbm-logo :deep(.logo-image) {
  height: 58px !important;
  width: auto;
}

.wbm-header-text {
  min-width: 0;
}

.wbm-title {
  margin: 0;
  font-size: 26px;
  font-weight: var(--font-weight-bold, 700);
  letter-spacing: -0.4px;
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
  line-height: var(--line-height-tight, 1.2);
}

.wbm-title-accent {
  color: var(--accent-color, #22d3ee);
}

.wbm-subtitle {
  margin: 0 0 0;
  font-size: var(--font-size-base, 14px);
  line-height: var(--line-height-relaxed, 1.5);
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

/* Welcome pack: a single panel, so the two grants read as one gift. */
.wbm-pack {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 20px 18px;
  border: 1px solid var(--border-color, #2c2c32);
  border-radius: var(--radius-lg, 16px);
  background: color-mix(in srgb, var(--bg-surface, #2c2c32) 45%, transparent);
}

.wbm-pack-caption {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--accent-color, #22d3ee);
}

.wbm-sparkle {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  opacity: 0.85;
}

.wbm-pack-gift {
  flex-shrink: 0;
}

.wbm-pack-label {
  font-size: 14px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* The divider between grants is the second one's left border, so a lone grant
   simply centers with nothing beside it. */
.wbm-pack-grants {
  display: flex;
  align-items: stretch;
}

.wbm-grant {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  text-align: center;
}

.wbm-grant + .wbm-grant {
  border-left: 1px solid var(--text-secondary, #2c2c32);
}

.wbm-grant-value {
  font-size: 40px;
  font-weight: var(--font-weight-bold, 700);
  line-height: 1.1;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
  color: var(--wbm-grant-color);
}

/* Same icons and colors Settings uses for each meter, so the two screens name
   the same things the same way. */
.wbm-grant--quota {
  --wbm-grant-color: var(--primary-color-hover, #3b82f6);
}

/* Credits take the secondary purple, so the two read apart without either of
   them competing with the button. */
.wbm-grant--credits {
  --wbm-grant-color: var(--secondary-color, #c084fc);
}

.wbm-grant-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.3;
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
}

/* Tinted with the grant's own color, but softened so the number stays first. */
.wbm-grant-icon {
  flex-shrink: 0;
  color: var(--wbm-grant-color);
  opacity: 0.85;
}

.wbm-grant-hint {
  font-size: var(--font-size-sm, 12px);
  line-height: 1.3;
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

.wbm-pack-note {
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid var(--text-secondary, #2c2c32);
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
}

/* Footer */
.wbm-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.wbm-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 16px 20px;
  border: none;
  border-radius: var(--radius-md, 12px);
  background: linear-gradient(
    100deg,
    var(--accent-color-hover, #67e8f9),
    var(--accent-color, #22d3ee)
  );
  color: var(--text-on-accent, #000);
  font-size: var(--font-size-md, 16px);
  font-weight: var(--font-weight-bold, 700);
  font-family: inherit;
  cursor: pointer;
  transition:
    filter var(--transition-fast, 0.2s ease),
    transform var(--transition-fast, 0.2s ease);
}

.wbm-cta:hover {
  filter: brightness(1.08);
}

.wbm-cta:active {
  transform: translateY(1px);
  filter: brightness(0.95);
}

.wbm-checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: var(--font-size-base, 14px);
  color: var(--text-secondary, rgba(255, 255, 255, 0.45));
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast, 0.2s ease);
}

.wbm-checkbox-label:hover {
  color: var(--text-primary, rgba(255, 255, 255, 0.82));
}

.wbm-checkbox {
  accent-color: var(--accent-color, #22d3ee);
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* Transition */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}

.modal-fade-enter-active .wbm-modal,
.modal-fade-leave-active .wbm-modal {
  transition:
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .wbm-modal,
.modal-fade-leave-to .wbm-modal {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}

/* ─── Responsive ─── */
@media (max-width: 480px) {
  .wbm-overlay {
    padding: 10px;
  }

  .wbm-modal {
    padding: 26px 18px 20px;
    gap: 20px;
    max-height: calc(100vh - 20px);
    border-radius: var(--radius-lg, 16px);
  }

  .wbm-header {
    gap: 12px;
  }

  .wbm-logo :deep(.logo-image) {
    height: 46px !important;
  }

  .wbm-title {
    font-size: 21px;
  }

  .wbm-subtitle {
    font-size: var(--font-size-sm, 12px);
  }

  .wbm-pack {
    padding: 16px 12px 14px;
    gap: 16px;
  }

  .wbm-grant {
    padding: 4px 8px;
  }

  .wbm-grant-value {
    font-size: 30px;
  }

  .wbm-grant-label {
    font-size: var(--font-size-sm, 12px);
    gap: 5px;
  }

  .wbm-grant-hint {
    font-size: 11px;
  }

  .wbm-pack-note,
  .wbm-checkbox-label {
    font-size: var(--font-size-sm, 12px);
  }

  .wbm-cta {
    padding: 14px 16px;
    font-size: var(--font-size-base, 14px);
  }
}

/* Short viewports: keep the modal inside the fold and let it scroll itself. */
@media (max-height: 620px) {
  .wbm-modal {
    gap: 16px;
    padding: 24px 22px 18px;
  }

  .wbm-pack {
    gap: 14px;
    padding: 16px 16px 14px;
  }

  .wbm-grant-value {
    font-size: 32px;
  }

  .wbm-pack-note {
    padding-top: 12px;
  }
}
</style>
