<template>
  <div class="step-content">
    <div class="profile-header">
      <AppLogo layout="icon" :height="isMobile ? 44 : 52" class="header-logo" />
      <div class="header-text">
        <h1 class="profile-title">{{ copy.title }}</h1>
        <p class="profile-subtitle">{{ copy.body }}</p>
      </div>
    </div>

    <PaymentResult :outcome="outcome" :summary="summary" />

    <WizardActions :show-back="false">
      <n-button
        v-if="outcome === 'failed' || outcome === 'refunded'"
        type="primary"
        size="large"
        @click="emit('back')"
      >
        Back to photo packs
      </n-button>
      <n-button
        v-else-if="outcome === 'delayed' || outcome === 'error'"
        type="primary"
        size="large"
        @click="verify(sessionId)"
      >
        <template #icon>
          <n-icon><RefreshOutline /></n-icon>
        </template>
        Check again
      </n-button>
      <n-button
        v-else-if="checkoutInBrowser && isVerifying"
        size="large"
        @click="emit('back')"
      >
        Back to photo packs
      </n-button>
      <n-button
        v-else
        type="primary"
        size="large"
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
      <template v-if="balance" #note>
        You now have
        <strong>{{ balance.photos.toLocaleString() }}</strong> photos
        <span class="note-dot">·</span>
        <strong>{{ balance.credits.toLocaleString() }}</strong> credits
      </template>
    </WizardActions>

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
import WizardActions from "./WizardActions.vue";
import ConfettiEffect from "@/components/ConfettiEffect.vue";
import { paymentOutcomeCopy } from "@/components/payments/paymentOutcomeCopy";
import {
  checkoutInBrowser,
  usePaymentVerification,
} from "@/composables/usePaymentVerification";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { useUserStore } from "@/stores/userStore";

const props = defineProps<{ sessionId: string }>();
const emit = defineEmits<{ (e: "done"): void; (e: "back"): void }>();

const { isMobile } = useIsMobile();
const { summary, isVerifying, outcome, verify } = usePaymentVerification();
const copy = computed(() => paymentOutcomeCopy(outcome.value, summary.value));
const celebrate = ref(false);

// Verification refreshes the usage, so once completed it includes the pack.
const userStore = useUserStore();
const balance = computed(() => {
  const usage = userStore.user?.usage;
  if (outcome.value !== "completed" || isVerifying.value || !usage) return null;
  return {
    photos: usage.analyzedPhotosRemaining,
    credits: Math.max(0, usage.creditsAvailable - (usage.creditsUsed || 0)),
  };
});

watch(outcome, (value, previous) => {
  if (value === "completed" && previous !== "completed") celebrate.value = true;
});

onMounted(() => verify(props.sessionId));
</script>

<style scoped>
.step-content {
  max-width: 720px;
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

.note-dot {
  margin: 0 4px;
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
