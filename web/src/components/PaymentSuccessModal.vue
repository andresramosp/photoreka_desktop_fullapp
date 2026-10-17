<template>
  <n-modal
    :show="show"
    :mask-closable="canClose"
    :close-on-esc="canClose"
    @update:show="onUpdateShow"
  >
    <div class="psm" role="dialog" aria-modal="true">
      <button
        class="psm-close"
        aria-label="Close"
        :disabled="!canClose"
        @click="onUpdateShow(false)"
      >
        <n-icon :size="18"><CloseOutline /></n-icon>
      </button>

      <header class="psm-header">
        <h3 class="psm-title">{{ copy.title }}</h3>
        <p class="psm-body">{{ copy.body }}</p>
      </header>

      <PaymentResult :outcome="outcome" :summary="summary" />

      <button class="psm-cta" :disabled="!canClose" @click="onUpdateShow(false)">
        {{ ctaLabel }}
      </button>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { NModal, NIcon } from "naive-ui";
import { CloseOutline } from "@vicons/ionicons5";
import PaymentResult from "@/components/payments/PaymentResult.vue";
import { paymentOutcomeCopy } from "@/components/payments/paymentOutcomeCopy";
import {
  checkoutInBrowser,
  usePaymentVerification,
} from "@/composables/usePaymentVerification";

const props = defineProps<{ show: boolean; sessionId: string | null }>();
const emit = defineEmits<{ (e: "update:show", v: boolean): void }>();

const router = useRouter();
const route = useRoute();
const { summary, isVerifying, outcome, verify, stop } = usePaymentVerification();
const copy = computed(() => paymentOutcomeCopy(outcome.value, summary.value));

// On desktop the user may still be paying, or may have cancelled, in the browser.
const canClose = computed(() => checkoutInBrowser || !isVerifying.value);
const ctaLabel = computed(() => {
  if (!isVerifying.value) return "Continue";
  return checkoutInBrowser ? "Close" : "Adding it to your account…";
});

watch(
  () => props.show,
  (opened) => {
    if (opened && props.sessionId) {
      clearPaymentQuery();
      verify(props.sessionId);
    }
  },
  { immediate: true },
);

function onUpdateShow(v: boolean) {
  if (!v) stop();
  emit("update:show", v);
}

function clearPaymentQuery() {
  if (!route.query.payment && !route.query.session_id) return;

  const next = { ...route.query };
  delete next.payment;
  delete next.session_id;
  router.replace({ query: next });
}
</script>

<style scoped>
.psm {
  position: relative;
  width: 440px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 28px 28px 24px;
  background: var(--bg-container, #1a1a1f);
  border: 1px solid var(--border-color, #2c2c32);
  border-radius: var(--radius-xl, 20px);
  box-shadow: var(--shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.25));
}

.psm-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 24px;
}

.psm-title {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.25;
  color: var(--text-primary);
}

.psm-body {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-secondary);
}

.psm-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
}

.psm-close:hover:not(:disabled) {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.psm-close:disabled {
  opacity: 0.4;
  cursor: default;
}

.psm-cta {
  width: 100%;
  padding: 14px 20px;
  border: none;
  border-radius: var(--radius-md, 12px);
  background: linear-gradient(
    100deg,
    var(--accent-color-hover, #67e8f9),
    var(--accent-color, #22d3ee)
  );
  color: var(--text-on-accent, #000);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.2s ease;
}

.psm-cta:hover:not(:disabled) {
  filter: brightness(1.08);
}

.psm-cta:disabled {
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: default;
}

@media (max-width: 480px) {
  .psm {
    padding: 24px 18px 20px;
    gap: 20px;
  }
}
</style>
