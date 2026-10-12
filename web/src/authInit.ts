import { useUserStore } from "./stores/userStore";

export async function initializeAuth() {
  const userStore = useUserStore();
  await userStore.initAuth();
}
