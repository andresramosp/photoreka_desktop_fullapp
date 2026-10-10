import type {
  PaymentOutcome,
  PaymentSummary,
} from "@/composables/usePaymentVerification";

export interface PaymentOutcomeCopy {
  title: string;
  body: string;
}

export function paymentOutcomeCopy(
  outcome: PaymentOutcome,
  summary: PaymentSummary | null,
): PaymentOutcomeCopy {
  const isPack = summary?.type !== "credits";
  switch (outcome) {
    case "completed":
      return {
        title: isPack ? "Your photo pack is ready" : "Your credits are ready",
        body: isPack
          ? "Everything is in your account, and the photos never expire."
          : "The credits are in your account and ready to use.",
      };
    case "delayed":
      return {
        title: "Your payment is safe",
        body: "Stripe is taking a little longer than usual to confirm it. Your pack will be added in a moment.",
      };
    case "failed":
      return {
        title: "The checkout wasn't completed",
        body: "Nothing has been charged and your balance hasn't changed.",
      };
    case "refunded":
      return {
        title: "This purchase was refunded",
        body: "Its photos and credits are no longer active in your account.",
      };
    case "error":
      return {
        title: "We couldn't check your payment",
        body: "If you completed the checkout, your purchase is safe and will appear in your account shortly.",
      };
    default:
      return {
        title: "Confirming your purchase",
        body: "Stripe has received your payment. We're adding the pack to your account.",
      };
  }
}
