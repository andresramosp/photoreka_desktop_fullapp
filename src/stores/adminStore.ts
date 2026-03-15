import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api } from "../utils/axios";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export const useAdminStore = defineStore("admin", () => {
  const isAuthenticated = ref(false);
  const token = ref<string | null>(null);
  const user = ref<AdminUser | null>(null);
  const isLoading = ref(false);

  const STORAGE_KEY = "admin_auth_token";

  async function login(email: string, password: string) {
    isLoading.value = true;
    try {
      const response = await api.post("/api/admin/auth/login", {
        email,
        password,
      });
      token.value = response.data.token;
      user.value = response.data.user;
      isAuthenticated.value = true;
      localStorage.setItem(STORAGE_KEY, response.data.token);

      // Set token in axios for subsequent requests
      api.defaults.headers.common["Authorization"] =
        `Bearer ${response.data.token}`;

      return { success: true };
    } catch (error: any) {
      const message = error?.response?.data?.message || "Login failed";
      return { success: false, error: message };
    } finally {
      isLoading.value = false;
    }
  }

  async function initAuth() {
    const savedToken = localStorage.getItem(STORAGE_KEY);
    if (!savedToken) return;

    token.value = savedToken;
    api.defaults.headers.common["Authorization"] = `Bearer ${savedToken}`;

    try {
      const response = await api.get("/api/admin/auth/profile");
      user.value = response.data.user;
      isAuthenticated.value = true;
    } catch {
      logout();
    }
  }

  async function logout() {
    try {
      if (token.value) {
        await api.post("/api/admin/auth/logout");
      }
    } catch {
      // Ignore errors on logout
    }
    token.value = null;
    user.value = null;
    isAuthenticated.value = false;
    localStorage.removeItem(STORAGE_KEY);
    delete api.defaults.headers.common["Authorization"];
  }

  return {
    isAuthenticated,
    token,
    user,
    isLoading,
    login,
    initAuth,
    logout,
  };
});
