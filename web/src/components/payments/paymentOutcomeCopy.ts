import {
  checkoutInBrowser,
  type PaymentOutcome,
  type PaymentSummary,
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
          ? "Everything is in your account. Use it anytime, there's no time limit."
          : "The credits are in your account and ready to use.",
      };
    case "delayed":
      if (checkoutInBrowser) {
        return {
          title: "We haven't received the payment yet",
          body: "If you completed it in your browser, it will appear here in a moment. If you cancelled it, nothing has been charged.",
        };
      }
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
      if (checkoutInBrowser) {
        return {
          title: "Finish the payment in your browser",
          body: "We opened Stripe's secure checkout in your browser. This updates as soon as the payment goes through.",
        };
      }
      return {
        title: "Confirming your purchase",
        body: "Stripe has received your payment. We're adding the pack to your account.",
      };
  }
}
