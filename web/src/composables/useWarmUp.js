import { ref } from "vue";
import { api } from "@/utils/axios";

export function useWarmUp() {
  const warmedUp = ref(false);

  async function ensureWarmUp(endpointType) {
    try {
      const { data } = await api.get(`/api/warmUp/${endpointType}`);
      warmedUp.value = data.result;
      return data.result;
    } catch (error) {
      console.error("Error warming up endpoint:", error);
      return false;
    }
  }

  return {
    warmedUp,
    ensureWarmUp,
  };
}
