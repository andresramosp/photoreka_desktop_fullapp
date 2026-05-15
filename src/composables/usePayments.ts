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

const photoPackages = ref<PhotoPackage[]>([]);
const creditSteps = ref<CreditStep[]>([]);
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
      fetched = true;
    } catch (err) {
      console.error("Failed to fetch payment packages:", err);
    } finally {
      isLoading.value = false;
    }
  }

  async function checkout(
    type: "photo_package" | "credits",
    stripePriceId: string,
  ): Promise<boolean> {
    try {
      isCheckingOut.value = true;
      const { data } = await api.post("/api/payments/checkout", {
        type,
        itemId: stripePriceId,
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

  return {
    photoPackages,
    creditSteps,
    isLoading,
    isCheckingOut,
    fetchPackages,
    checkout,
  };
}
