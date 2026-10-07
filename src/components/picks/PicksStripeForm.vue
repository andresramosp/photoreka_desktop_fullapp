<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { apiErrorMessage, confirmPayment, createPaymentIntent } from "@/utils/picks/api";
import { formatEur } from "@/utils/picks/format";

const props = defineProps<{ token: string; photoCount: number }>();
const emit = defineEmits<{ paid: [] }>();

const contactEl = ref<HTMLElement | null>(null);
const paymentEl = ref<HTMLElement | null>(null);
const loading = ref(true);
const paying = ref(false);
const error = ref<string | null>(null);
const amountEur = ref<number | null>(null);
const email = ref("");
const emailComplete = ref(false);

let stripe: Stripe | null = null;
let elements: StripeElements | null = null;

const APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#f4b740",
    colorBackground: "#15151c",
    colorText: "rgba(255, 255, 255, 0.92)",
    colorTextSecondary: "rgba(255, 255, 255, 0.55)",
    colorDanger: "#f87171",
    fontFamily: '"Plus Jakarta Sans", "Helvetica Neue", Arial, sans-serif',
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid rgba(255,255,255,0.12)", boxShadow: "none" },
    ".Input:focus": {
      border: "1px solid rgba(244,183,64,0.7)",
      boxShadow: "0 0 0 3px rgba(244,183,64,0.15)",
    },
    ".Label": { color: "rgba(255,255,255,0.55)", fontSize: "12px" },
  },
};

onMounted(async () => {
  try {
    const [stripeInstance, intent] = await Promise.all([
      loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string),
      createPaymentIntent(props.token, props.photoCount),
    ]);
    if (!stripeInstance) throw new Error("Stripe could not be loaded");
    stripe = stripeInstance;
    amountEur.value = intent.amountEur;
    elements = stripe.elements({
      clientSecret: intent.clientSecret,
      appearance: APPEARANCE,
      fonts: [
        { cssSrc: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" },
      ],
    });

    const contact = elements.create("contactDetails");
    contact.on("change", (event) => {
      email.value = event.value.email ?? "";
      emailComplete.value = event.complete;
    });
    contact.mount(contactEl.value!);
    elements.create("payment", { layout: "tabs", wallets: { link: "never" } }).mount(paymentEl.value!);
  } catch (err) {
    error.value = apiErrorMessage(err, "The payment form could not be loaded. Please try again.");
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => elements?.getElement("payment")?.destroy());

async function pay() {
  if (!stripe || !elements || paying.value) return;
  if (!emailComplete.value || !email.value.trim()) {
    error.value = "Enter your email: your private results link is sent there.";
    return;
  }
  error.value = null;
  paying.value = true;
  try {
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (result.error) {
      error.value = result.error.message ?? "The payment failed. Please try again.";
      return;
    }
    if (result.paymentIntent?.status !== "succeeded") {
      error.value = "The payment did not complete. Please try again.";
      return;
    }
    // Confirming here instead of waiting for the webhook starts the jury at once.
    await confirmPayment(props.token, result.paymentIntent.id, email.value.trim());
    emit("paid");
  } catch (err) {
    error.value = apiErrorMessage(err, "The payment failed. Please try again.");
  } finally {
    paying.value = false;
  }
}
</script>

<template>
  <div class="pk-stripe" :class="{ 'is-loading': loading }">
    <div v-if="loading" class="pk-stripe-loading">
      <span class="pk-stripe-spinner" />
      Preparing secure payment…
    </div>
    <div ref="contactEl" class="pk-stripe-field" />
    <div ref="paymentEl" class="pk-stripe-field" />

    <p v-if="error" class="pk-stripe-error">{{ error }}</p>

    <button class="pk-cta pk-stripe-pay" :disabled="loading || paying || !amountEur" @click="pay">
      <span v-if="paying" class="pk-stripe-spinner is-dark" />
      {{ paying ? "Processing…" : amountEur ? `Pay ${formatEur(amountEur)}` : "Pay" }}
    </button>
  </div>
</template>

<style scoped>
.pk-stripe {
  margin-top: 18px;
}

.pk-stripe-field:not(:empty) {
  margin-bottom: 14px;
}

.pk-stripe-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 34px 0;
  font-size: 13px;
  color: var(--pk-text-3);
}

.pk-stripe-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.18);
  border-top-color: var(--pk-gold);
  animation: pk-stripe-spin 0.8s linear infinite;
}

.pk-stripe-spinner.is-dark {
  border-color: rgba(26, 18, 6, 0.25);
  border-top-color: #1a1206;
}

@keyframes pk-stripe-spin {
  to {
    transform: rotate(360deg);
  }
}

.pk-stripe-error {
  margin: 4px 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: #fecaca;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.pk-stripe-pay {
  width: 100%;
}

.pk-stripe-pay:disabled {
  opacity: 0.55;
  cursor: default;
  transform: none;
}
</style>
