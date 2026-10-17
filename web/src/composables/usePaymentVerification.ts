import { ref, computed, onScopeDispose } from "vue";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";
import { trackEvent } from "@/utils/analytics";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export interface PaymentSummary {
  status: PaymentStatus;
  type: "photo_package" | "credits";
  packageId: string;
  stripePriceId: string | null;
  stripeProductId: string | null;
  productName: string | null;
  analyzedPhotosGranted: number;
  creditsGranted: number;
  amountEur: number;
}

// "confirming": waiting for Stripe's webhook. "delayed": the wait ran out with
// the payment still pending, so the caller can offer to check again.
export type PaymentOutcome =
  | "confirming"
  | "delayed"
  | "completed"
  | "failed"
  | "refunded"
  | "error";

// The desktop app opens Stripe in the system browser and starts waiting right
// away, while the user is still paying, so it polls for much longer.
export const checkoutInBrowser = import.meta.env.VITE_DESKTOP === "true";

const POLL_INTERVAL_MS = checkoutInBrowser ? 3000 : 1200;
const POLL_ATTEMPTS = checkoutInBrowser ? 400 : 8;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function fetchSummary(sessionId: string): Promise<PaymentSummary> {
  const { data } = await api.get("/api/payments/verify", {
    params: { session_id: sessionId },
  });
  return data.data;
}

// One event per Stripe session; transaction_id lets GA4 dedupe re-verifications.
function trackPurchaseConversion(sessionId: string, s: PaymentSummary) {
  trackEvent("manual_event_PURCHASE", {
    transaction_id: sessionId,
    value: Number(s.amountEur),
    currency: "EUR",
    item_name: s.productName || s.packageId,
    purchase_type: s.type,
  });
}

export function usePaymentVerification() {
  const userStore = useUserStore();

  const summary = ref<PaymentSummary | null>(null);
  const isVerifying = ref(false);
  const hasError = ref(false);

  const outcome = computed<PaymentOutcome>(() => {
    if (hasError.value) return "error";
    if (!summary.value) return "confirming";
    if (summary.value.status === "pending") {
      return isVerifying.value ? "confirming" : "delayed";
    }
    return summary.value.status;
  });

  // Each verify() or stop() starts a new run; an older loop sees it and quits.
  let run = 0;

  async function verify(sessionId: string) {
    const current = ++run;
    isVerifying.value = true;
    hasError.value = false;

    try {
      summary.value = await fetchSummary(sessionId);
      for (
        let i = 0;
        i < POLL_ATTEMPTS && summary.value.status === "pending";
        i++
      ) {
        await sleep(POLL_INTERVAL_MS);
        if (current !== run) return;
        summary.value = await fetchSummary(sessionId);
      }

      if (summary.value.status === "completed") {
        trackPurchaseConversion(sessionId, summary.value);
      }

      await userStore.fetchUsage();
    } catch (err) {
      console.error("Payment verification failed:", err);
      hasError.value = true;
    } finally {
      if (current === run) isVerifying.value = false;
    }
  }

  function stop() {
    run++;
    isVerifying.value = false;
  }

  onScopeDispose(stop);

  return { summary, isVerifying, outcome, verify, stop };
}
