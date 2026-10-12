<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NButton, NIcon, NAlert } from "naive-ui";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import { LockClosedOutline } from "@vicons/ionicons5";
import {
  loadStripe,
  type Stripe,
  type StripeElements,
  type StripeContactDetailsElement,
} from "@stripe/stripe-js";
import { createPaymentIntent, confirmPayment } from "@/utils/geoRecovery/api";

const props = defineProps<{
  token: string;
  photoCount: number;
}>();

const emit = defineEmits<{
  paid: [];
  back: [];
}>();

const stripe = ref<Stripe | null>(null);
const elements = ref<StripeElements | null>(null);
const contactDetailsElement = ref<StripeContactDetailsElement | null>(null);
const loadingIntent = ref(true);
const confirming = ref(false);
const paymentError = ref<string | null>(null);
const customerEmail = ref("");
const isContactDetailsComplete = ref(false);

// Backend pricing values
const pricePerPhotoEur = ref(0);
const minChargeEur = ref(0);
const amountEur = ref(0);

const trimmedCustomerEmail = computed(() => customerEmail.value.trim());

const isMinimumApplied = computed(
  () => props.photoCount * pricePerPhotoEur.value < minChargeEur.value,
);

onMounted(async () => {
  try {
    const [stripeInstance, pricing] = await Promise.all([
      loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string),
      createPaymentIntent(props.token, props.photoCount),
    ]);
    if (!stripeInstance) throw new Error("Stripe.js failed to load");

    // Store backend pricing values
    pricePerPhotoEur.value = pricing.pricePerPhotoEur;
    minChargeEur.value = pricing.minChargeEur;
    amountEur.value = pricing.amountEur;

    stripe.value = stripeInstance;
    elements.value = stripeInstance.elements({
      clientSecret: pricing.clientSecret,
      loader: "never",
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: "#18a058",
          colorBackground: "#242238",
          colorText: "rgba(255,255,255,0.85)",
          colorTextSecondary: "rgba(255,255,255,0.5)",
          colorDanger: "#e03131",
          borderRadius: "8px",
          fontFamily: '"Inter", system-ui, sans-serif',
          spacingUnit: "4px",
        },
        rules: {
          ".Input": {
            border: "1px solid rgba(255,255,255,0.15)",
            backgroundColor: "rgba(255,255,255,0.06)",
          },
          ".Input:focus": {
            border: "1px solid #18a058",
            boxShadow: "0 0 0 2px rgba(24,160,88,0.2)",
          },
          ".Label": { color: "rgba(255,255,255,0.6)", fontSize: "12px" },
          ".Tab": {
            border: "1px solid rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.04)",
          },
          ".Tab--selected": {
            border: "1px solid #18a058",
            backgroundColor: "rgba(255,255,255,0.08)",
          },
        },
      },
    });

    contactDetailsElement.value = elements.value.create("contactDetails");
    contactDetailsElement.value.on("change", (event) => {
      customerEmail.value = event.value.email ?? "";
      isContactDetailsComplete.value = event.complete;
      if (
        event.complete &&
        paymentError.value === "Enter a valid email before paying."
      ) {
        paymentError.value = null;
      }
    });
    contactDetailsElement.value.mount("#stripe-contact-details-element");

    const paymentElement = elements.value.create("payment", {
      layout: "tabs",
      wallets: {
        link: "never",
      },
    });
    paymentElement.mount("#stripe-payment-element");
  } catch (error: any) {
    paymentError.value =
      error?.message ?? "Could not initialize payment form. Please refresh.";
  } finally {
    loadingIntent.value = false;
  }
});

async function handlePay() {
  if (!stripe.value || !elements.value || confirming.value) return;

  if (!trimmedCustomerEmail.value || !isContactDetailsComplete.value) {
    paymentError.value = "Enter a valid email before paying.";
    return;
  }

  paymentError.value = null;
  confirming.value = true;
  try {
    const { error, paymentIntent } = await stripe.value.confirmPayment({
      elements: elements.value,
      confirmParams: {
        // Required by Stripe.js even with redirect:'if_required' (used only
        // for payment methods that mandate a redirect, e.g. some bank flows).
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      paymentError.value = error.message ?? "Payment failed. Please try again.";
      return;
    }
    if (paymentIntent?.status !== "succeeded") {
      paymentError.value = "Payment did not complete. Please try again.";
      return;
    }

    // Tell the backend to mark the session as paid immediately â€”
    // closes the race condition with the Stripe webhook.
    await confirmPayment(
      props.token,
      paymentIntent.id,
      trimmedCustomerEmail.value,
    );
    emit("paid");
  } catch (error: any) {
    paymentError.value = error?.message ?? "Payment failed. Please try again.";
  } finally {
    confirming.value = false;
  }
}
</script>

<template>
  <div class="gwp-body">
    <!-- Header -->
    <div>
      <h2 class="gwp-title">Ready to analyze</h2>
      <p class="gwp-sub">
        Your {{ photoCount }} photo{{ photoCount !== 1 ? "s" : "" }} will be
        analyzed by our AI to recover GPS locations.
      </p>
    </div>

    <!-- Price breakdown -->
    <div class="gwp-price-card">
      <div class="gwp-price-row">
        <span class="gwp-price-label">
          {{ photoCount }} photo{{ photoCount !== 1 ? "s" : "" }} × €{{
            pricePerPhotoEur.toFixed(3)
          }}/photo
        </span>
        <span class="gwp-price-value">€{{ amountEur.toFixed(2) }}</span>
      </div>
      <div v-if="isMinimumApplied" class="gwp-price-minimum">
        Minimum charge of €{{ minChargeEur.toFixed(2) }} applied
      </div>
      <div class="gwp-price-divider" />
      <div class="gwp-price-row gwp-price-row--total">
        <span class="gwp-price-label">Total</span>
        <span class="gwp-price-value gwp-price-total">
          €{{ amountEur.toFixed(2) }} EUR
        </span>
      </div>
      <p class="gwp-price-note">One-time payment · no subscription</p>
    </div>

    <!-- Stripe Payment Element -->
    <div class="gwp-payment-form">
      <div v-if="loadingIntent" class="gwp-form-loading">
        <SpiralGridLoader variant="primary" :size="28" />
        <span>Loading payment form…</span>
      </div>
      <div id="stripe-contact-details-element" class="gwp-stripe-email" />
      <div id="stripe-payment-element" />
    </div>

    <!-- Error -->
    <NAlert
      v-if="paymentError"
      type="error"
      :show-icon="true"
      class="gwp-error"
    >
      {{ paymentError }}
    </NAlert>

    <!-- Actions -->
    <div class="gwp-actions">
      <NButton :disabled="confirming" @click="emit('back')">Back</NButton>
      <NButton
        type="primary"
        size="large"
        :loading="confirming"
        :disabled="
          loadingIntent || !trimmedCustomerEmail || !isContactDetailsComplete
        "
        @click="handlePay"
      >
        <template #icon>
          <NIcon :component="LockClosedOutline" />
        </template>
        Pay & analyze
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.gwp-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gwp-title {
  margin: 0 0 6px;
  font-size: 19px;
  font-weight: 700;
}

.gwp-sub {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.65);
}

/* â”€â”€ Price card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

.gwp-price-card {
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.gwp-price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}

.gwp-price-row--total {
  margin-top: 4px;
}

.gwp-price-label {
  line-height: 1.4;
}

.gwp-price-value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.gwp-price-minimum {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin: 4px 0 0;
}

.gwp-price-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 10px 0;
}

.gwp-price-total {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.gwp-price-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

/* â”€â”€ Stripe Payment Element wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

.gwp-payment-form {
  min-height: 120px;
  padding: 16px;
  background: #242238;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.gwp-stripe-email {
  margin-bottom: 14px;
}

.gwp-form-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  justify-content: center;
}

/* â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

.gwp-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
