<template>
  <div class="step-content">
    <div class="profile-header">
      <AppLogo layout="icon" :height="isMobile ? 44 : 52" class="header-logo" />
      <div class="header-text">
        <h1 class="profile-title">{{ copy.title }}</h1>
        <p class="profile-subtitle">{{ copy.body }}</p>
      </div>
    </div>

    <div class="ticket-column">
      <PaymentResult :outcome="outcome" :summary="summary" />

      <n-button
        v-if="outcome === 'failed' || outcome === 'refunded'"
        type="primary"
        size="large"
        class="action-button"
        @click="emit('back')"
      >
        Back to photo packs
      </n-button>

      <n-button
        v-else-if="outcome === 'delayed' || outcome === 'error'"
        type="primary"
        size="large"
        class="action-button"
        @click="verify(sessionId)"
      >
        <template #icon>
          <n-icon><RefreshOutline /></n-icon>
        </template>
        Check again
      </n-button>

      <n-button
        v-else
        type="primary"
        size="large"
        class="action-button"
        icon-placement="right"
        :loading="isVerifying"
        :disabled="isVerifying"
        @click="emit('done')"
      >
        Enter Photoreka
        <template #icon>
          <n-icon><ArrowForwardOutline /></n-icon>
        </template>
      </n-button>
    </div>

    <ConfettiEffect
      :show="celebrate"
      :duration="3500"
      :count="90"
      :colors="[
        'var(--accent-color)',
        'var(--primary-color)',
        '#22c55e',
        '#a855f7',
        '#f59e0b',
      ]"
      @hide="celebrate = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ArrowForwardOutline, RefreshOutline } from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import PaymentResult from "@/components/payments/PaymentResult.vue";
import ConfettiEffect from "@/components/ConfettiEffect.vue";
import { paymentOutcomeCopy } from "@/components/payments/paymentOutcomeCopy";
import { usePaymentVerification } from "@/composables/usePaymentVerification";
import { useIsMobile } from "@/composables/useIsMobile.js";

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ (e: "done"): void; (e: "back"): void }>();

const { isMobile } = useIsMobile();
const { summary, isVerifying, outcome, verify } = usePaymentVerification();
const copy = computed(() => paymentOutcomeCopy(outcome.value, summary.value));
const celebrate = ref(false);

watch(outcome, (value, previous) => {
  if (value === "completed" && previous !== "completed") celebrate.value = true;
});

onMounted(() => verify(props.sessionId));
</script>

<style scoped>
.step-content {
  max-width: 640px;
  margin: 0 auto;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Header (same as the other wizard steps) */
.profile-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 28px;
}

.header-logo {
  flex-shrink: 0;
}

.header-text {
  text-align: left;
}

.profile-title {
  margin: 0 0 2px 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.profile-subtitle {
  margin: 0;
  max-width: 480px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-secondary);
}

/* The single action sits under the ticket, at its width, so both read as one block. */
.ticket-column {
  max-width: 440px;
  margin: 0 auto 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.action-button {
  width: 100%;
  height: 46px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
}

@media (max-width: 768px) {
  .profile-header {
    gap: 12px;
    margin-bottom: 24px;
  }

  .profile-title {
    font-size: 22px;
  }

  .profile-subtitle {
    font-size: 14px;
  }
}
</style>
