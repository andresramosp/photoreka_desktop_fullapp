import { ref } from "vue";
import { api } from "@/utils/axios";

export interface PhotoPackage {
  id: string;
  name: string;
  photos: number;
  analyzedPhotos: number;
  credits: number;
  priceEur: number;
  stripePriceId: string;
  stripeProductId: string;
  currency: string;
  imageUrl: string | null;
  sortOrder: number;
  highlighted?: boolean;
}

export interface CreditStep {
  id: string;
  credits: number;
  priceEur: number;
  description: string;
  stripePriceId: string;
  stripeProductId: string;
  currency: string;
  imageUrl: string | null;
  sortOrder: number;
}

export interface WelcomePack {
  photos: number;
  credits: number;
}

export interface PromotionInfo {
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  name: string | null;
}

const photoPackages = ref<PhotoPackage[]>([]);
const creditSteps = ref<CreditStep[]>([]);
const promotion = ref<PromotionInfo | null>(null);
const welcomePack = ref<WelcomePack | null>(null);
const isLoading = ref(false);
const isCheckingOut = ref(false);

let fetched = false;

export function usePayments() {
  async function fetchPackages() {
    if (fetched && photoPackages.value.length > 0) return;
    try {
      isLoading.value = true;
      const { data } = await api.get("/api/payments/packages");
      photoPackages.value = data.photoPackages || [];
      creditSteps.value = data.creditSteps || [];
      promotion.value = data.promotion ?? null;
      welcomePack.value = data.welcomePack ?? null;
      fetched = true;
    } catch (err) {
      console.error("Failed to fetch payment packages:", err);
    } finally {
      isLoading.value = false;
    }
  }

  // "onboarding" makes Stripe return to the profile wizard instead of Settings.
  async function checkout(
    type: "photo_package" | "credits",
    stripePriceId: string,
    returnTo: "settings" | "onboarding" = "settings",
  ): Promise<boolean> {
    try {
      isCheckingOut.value = true;
      const { data } = await api.post("/api/payments/checkout", {
        type,
        itemId: stripePriceId,
        returnTo,
      });
      if (data.url) {
        window.location.href = data.url;
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("Checkout failed:", err);
      throw err;
    } finally {
      isCheckingOut.value = false;
    }
  }

  // Same rule Stripe applies with the global coupon: percent first, then a fixed amount.
  function priceAfterPromotion(priceEur: number): number {
    const promo = promotion.value;
    if (promo?.percentOff) return priceEur * (1 - promo.percentOff / 100);
    if (promo?.amountOff) return Math.max(0, priceEur - promo.amountOff / 100);
    return priceEur;
  }

  return {
    photoPackages,
    creditSteps,
    promotion,
    welcomePack,
    isLoading,
    isCheckingOut,
    fetchPackages,
    checkout,
    priceAfterPromotion,
  };
}
