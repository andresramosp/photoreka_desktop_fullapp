import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api } from "../utils/axios";

interface Usage {
  creditsUsed: number;
  photosLimit: number;
  creditsAvailable: number;
  analyzedPhotosLimit: number;
  photosUsage: number;
  analyzedPhotosUsage: number;
  photosRemaining: number;
  analyzedPhotosRemaining: number;
}

export type UserProfile =
  | "general"
  | "street-photography"
  | "documentary"
  | "artistic"
  | "street-photography|artistic"
  | "documentary|artistic"
  | "street-photography|documentary";

interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider?: "email" | "google" | "facebook";
  usage?: Usage;
  preferredSource: "web" | "ligthroom";
  isEmailConfirmed: boolean;
  profiles?: UserProfile;
}

export const useUserStore = defineStore("user", () => {
  const isAuthenticated = ref(false);
  const token = ref<string | null>(null);
  const user = ref<User | null>(null);
  const isLoading = ref(false);
  const isInitialized = ref(false); // Indica si la inicialización (auth + profile) está completa

  // Getter para el shortname (primer nombre del usuario)
  const userShortName = computed(() => {
    if (!user.value?.name) return null;
    return user.value.name.split(" ")[0];
  });

  // Mock usage limits state by section
  const usageLimits = ref({
    search: {
      exceeded: false,
      permanent: false, // Can be closed by user
      dismissed: false, // Whether user dismissed the badge
    },
    curation: {
      exceeded: false,
      permanent: false, // Cannot be closed, requires credits
      dismissed: false, // Not used when permanent is true
    },
  });

  // Check for existing token on store initialization
  const initAuth = async () => {
    const savedToken = localStorage.getItem("auth_token");
    if (savedToken) {
      token.value = savedToken;
      isAuthenticated.value = true;
      try {
        const response = await api.get("/api/auth/profile");
        user.value = response.data.user;

        // Fetch usage data after successful profile load
        await fetchUsage();
      } catch (error) {
        // Si el token no es válido, limpiar estado
        token.value = null;
        isAuthenticated.value = false;
        user.value = null;
        localStorage.removeItem("auth_token");
      }
    }
    // Marcar como inicializado independientemente del resultado
    isInitialized.value = true;
  };

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;

    try {
      const response = await api.post("/api/auth/login", { email, password });
      const { token: receivedToken } = response.data;

      token.value = receivedToken;
      isAuthenticated.value = true;
      localStorage.setItem("auth_token", receivedToken);

      // Obtener datos reales del usuario desde /profile
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;

      // Fetch usage data after successful login
      await fetchUsage();

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || "Error logging in.",
      };
    } finally {
      isLoading.value = false;
    }
  };

  const register = async (
    email: string,
    password: string,
    name: string,
    authCode?: string
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;

    try {
      const payload: any = {
        email,
        password,
        name,
      };

      if (authCode) {
        payload.authCode = authCode;
      }

      const response = await api.post("/api/auth/register", payload);
      const { token: receivedToken, user: receivedUser } = response.data;

      token.value = receivedToken;
      isAuthenticated.value = true;
      user.value = receivedUser;

      localStorage.setItem("auth_token", receivedToken);

      // Fetch usage data after successful registration
      await fetchUsage();

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || "Error registering.",
      };
    } finally {
      isLoading.value = false;
    }
  };

  const loginWithProvider = async (
    provider: "google" | "facebook",
    mode: "login" | "register" = "login"
  ): Promise<{ success: boolean; error?: string }> => {
    if (provider === "google") {
      // Redirigir al backend que maneja OAuth
      const backendUrl =
        import.meta.env.VITE_MAIN_API_BASE_URL || "http://localhost:3333";
      // Pasar el modo para que el backend sepa si es login o registro
      window.location.href = `${backendUrl}/api/auth/google/redirect?mode=${mode}`;

      // La función retorna pero no se completa aquí
      // El flujo continúa en el componente AuthCallback
      return { success: true };
    }

    // Facebook aún no implementado
    return {
      success: false,
      error: "Facebook login not implemented yet",
    };
  };

  const logout = () => {
    token.value = null;
    isAuthenticated.value = false;
    user.value = null;
    localStorage.removeItem("auth_token");
  };

  const dismissUsageWarning = (section: "search" | "curation") => {
    if (!usageLimits.value[section].permanent) {
      usageLimits.value[section].dismissed = true;
    }
  };

  const fetchUsage = async () => {
    if (!isAuthenticated.value || !token.value) {
      return;
    }

    try {
      const { data: response } = await api.get("/api/usage");
      if (user.value && response.data) {
        user.value.usage = response.data;
      }
    } catch (error) {
      console.error("Error fetching usage:", error);
    }
  };

  // Función para traducir array de profiles a UserProfile
  const translateProfilesToUserProfile = (profiles: string[]): UserProfile => {
    if (profiles.length === 0) {
      return "general";
    }

    // Ordenar alfabéticamente y unir con pipes
    return profiles.sort().join("|") as UserProfile;
  };

  const updateProfile = async (
    profileData: any
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isAuthenticated.value || !token.value) {
      return {
        success: false,
        error: "User is not authenticated.",
      };
    }

    try {
      // Traducir profiles array a UserProfile si existen
      const translatedData = { ...profileData };
      if (profileData.profiles && Array.isArray(profileData.profiles)) {
        translatedData.profiles = translateProfilesToUserProfile(
          profileData.profiles
        );
      }

      const response = await api.put("/api/auth/profile", translatedData);

      // Update local user data if successful
      if (user.value && response.data.user) {
        user.value = { ...user.value, ...response.data.user };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || "Error updating profile.",
      };
    }
  };

  const confirmEmail = async (
    token: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.post("/api/auth/confirm-email", { token });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || "Error confirming email.",
      };
    }
  };

  const resendConfirmation = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.post("/api/auth/resend-confirmation", { email });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error:
          error.response?.data?.message ||
          "Error resending confirmation email.",
      };
    }
  };

  const forgotPassword = async (
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.post("/api/auth/forgot-password", { email });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error:
          error.response?.data?.message ||
          "Error sending password reset email.",
      };
    }
  };

  const resetPassword = async (
    token: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await api.post("/api/auth/reset-password", { token, newPassword });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || "Error resetting password.",
      };
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isAuthenticated.value || !token.value) {
      return {
        success: false,
        error: "User is not authenticated.",
      };
    }

    try {
      await api.post("/api/auth/change-password", {
        currentPassword,
        newPassword,
      });
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || "Error changing password.",
      };
    }
  };

  const processOAuthCallback = async (
    receivedToken: string
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;

    try {
      // Guardar token
      token.value = receivedToken;
      isAuthenticated.value = true;
      localStorage.setItem("auth_token", receivedToken);

      // Obtener perfil del usuario
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;

      // Obtener usage
      await fetchUsage();

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || "Error processing OAuth login",
      };
    } finally {
      isLoading.value = false;
    }
  };

  const consumeHandoff = async (
    handoffToken: string
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;

    try {
      const response = await api.post("/api/auth_lr/consume-handoff", {
        handoffToken,
      });
      const { token: receivedToken } = response.data;

      // Actualizar estado de autenticación
      token.value = receivedToken;
      isAuthenticated.value = true;
      localStorage.setItem("auth_token", receivedToken);

      // Obtener datos del usuario
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;

      // Obtener datos de uso
      await fetchUsage();

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error:
          error.response?.data?.message || "Error consuming handoff token.",
      };
    } finally {
      isLoading.value = false;
    }
  };

  // Initialize auth state
  // Llamar de forma asíncrona para no bloquear la carga
  initAuth();

  return {
    isAuthenticated,
    token,
    user,
    isLoading,
    isInitialized,
    userShortName,
    usageLimits,
    dismissUsageWarning,
    fetchUsage,
    updateProfile,
    login,
    register,
    loginWithProvider,
    processOAuthCallback,
    logout,
    initAuth,
    confirmEmail,
    resendConfirmation,
    forgotPassword,
    resetPassword,
    changePassword,
    consumeHandoff,
  };
});
