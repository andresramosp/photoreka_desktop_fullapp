import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api, api_analyzer } from "../utils/axios";

interface Usage {
  creditsUsed: number;
  photosLimit: number;
  creditsAvailable: number;
  analyzedPhotosLimit: number;
  photosUsage: number;
  analyzedPhotosUsed: number;
  photosRemaining: number;
  analyzedPhotosRemaining: number;
}

export type UserProfile =
  | "general"
  | "commercial"
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
  role?: "user" | "admin";
  avatar?: string;
  provider?: "email" | "google" | "facebook";
  usage?: Usage;
  hasCompletedPurchase?: boolean;
  onboardingOffersPacks?: boolean;
  preferredSource: "web" | "lightroom";
  isEmailConfirmed: boolean;
  profiles?: UserProfile;
}

export const useUserStore = defineStore("user", () => {
  const isAuthenticated = ref(false);
  const token = ref<string | null>(null);
  const user = ref<User | null>(null);
  const isLoading = ref(false);
  const isInitialized = ref(false); // Indica si la inicialización (auth + profile) está completa
  const isRefreshingProfile = ref(false); // Evita refrescos de perfil solapados

  // Getter para el shortname (primer nombre del usuario)
  const userShortName = computed(() => {
    if (!user.value?.name) return null;
    return user.value.name.split(" ")[0];
  });

  // Un usuario sin ninguna cuota de análisis concedida (ni bienvenida, ni
  // invitación, ni bonus, ni compra) no puede usar la app: el wizard de perfil
  // le pide comprar un paquete antes de entrar. Se mira la cuota del propio
  // usuario y no la del tier, así cambiar la bienvenida no afecta a quien ya la tiene.
  const needsInitialPurchase = computed(() => {
    const limit = user.value?.usage?.analyzedPhotosLimit;
    return typeof limit === "number" && limit <= 0;
  });

  // El wizard termina con los paquetes cuando la compra es obligatoria o cuando
  // el backend activa el onboarding híbrido (paquete gratis + paquetes de pago).
  const onboardingShowsPacks = computed(
    () => needsInitialPurchase.value || !!user.value?.onboardingOffersPacks,
  );

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
    // Verificar primero localStorage (usuarios normales), luego sessionStorage (modo demo)
    const savedToken =
      localStorage.getItem("auth_token") ||
      sessionStorage.getItem("auth_token");
    const isDemo =
      !localStorage.getItem("auth_token") &&
      !!sessionStorage.getItem("auth_token");

    if (savedToken) {
      token.value = savedToken;
      // NO establecer isAuthenticated aquí; se establece después de cargar el perfil
      // para evitar que el watcher de App.vue compruebe user.profiles antes de que esté disponible
      try {
        const response = await api.get("/api/auth/profile");
        user.value = response.data.user;
        isAuthenticated.value = true;

        // Fetch usage data after successful profile load
        await fetchUsage();
      } catch (error: any) {
        // Solo limpiar el token si el servidor rechaza explícitamente las credenciales (401/403).
        // Errores 5xx (caída de BD, servidor, etc.) son transitorios y NO deben invalidar el token.
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          token.value = null;
          isAuthenticated.value = false;
          user.value = null;
          localStorage.removeItem("auth_token");
          sessionStorage.removeItem("auth_token");
        } else {
          // Error de servidor/red: mantener el token, marcar como no autenticado por ahora
          // pero sin borrar las credenciales para que el usuario pueda reintentar.
          isAuthenticated.value = false;
          user.value = null;
        }
      }
    }
    // Marcar como inicializado independientemente del resultado
    isInitialized.value = true;
  };

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;
    // Resetear estado de inicialización al hacer login para forzar recarga completa
    isInitialized.value = false;

    try {
      const response = await api.post("/api/auth/login", { email, password });
      const { token: receivedToken } = response.data;

      // Limpiar cualquier sesión de demo anterior
      sessionStorage.removeItem("auth_token");

      token.value = receivedToken;
      localStorage.setItem("auth_token", receivedToken);

      // Obtener datos reales del usuario desde /profile ANTES de marcar como autenticado
      // para evitar race condition con el watcher de App.vue que comprueba user.profiles
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;
      isAuthenticated.value = true;

      // Fetch usage data after successful login
      await fetchUsage();

      // Marcar como inicializado después de cargar todo
      isInitialized.value = true;

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
    inviteCode?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;
    // Resetear estado de inicialización al hacer registro para forzar recarga completa
    isInitialized.value = false;

    try {
      const payload: any = {
        email,
        password,
        name,
      };

      if (inviteCode) {
        payload.inviteCode = inviteCode;
      }

      const response = await api.post("/api/auth/register", payload);
      const { token: receivedToken } = response.data;

      // Limpiar cualquier sesión de demo anterior
      sessionStorage.removeItem("auth_token");

      token.value = receivedToken;
      localStorage.setItem("auth_token", receivedToken);

      // El registro solo devuelve un usuario parcial; el wizard de perfil
      // necesita el completo (p.ej. si el onboarding ofrece paquetes).
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;
      isAuthenticated.value = true;

      // Fetch usage data after successful registration
      await fetchUsage();

      // Marcar como inicializado después de cargar todo
      isInitialized.value = true;

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
    mode: "login" | "register" = "login",
    inviteCode?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (provider === "google") {
      // Redirigir al backend que maneja OAuth
      const backendUrl =
        import.meta.env.VITE_MAIN_API_BASE_URL || "http://localhost:3333";

      // Construir URL con parámetros
      const params = new URLSearchParams();
      params.append("mode", mode);
      if (inviteCode) {
        params.append("inviteCode", inviteCode);
      }

      window.location.href = `${backendUrl}/api/auth/google/redirect?${params.toString()}`;

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
    isInitialized.value = false;
    localStorage.removeItem("auth_token");
    sessionStorage.removeItem("auth_token");
  };

  const dismissUsageWarning = (section: "search" | "curation") => {
    if (!usageLimits.value[section].permanent) {
      usageLimits.value[section].dismissed = true;
    }
  };

  // Re-fetch the user profile from the backend. Needed by views whose content
  // lives in the user object and is generated asynchronously in background
  // (e.g. catalog patterns shown in /report): users who keep the app open
  // never trigger a page reload, so the stale profile would persist forever.
  const refreshProfile = async (): Promise<boolean> => {
    if (!isAuthenticated.value || !token.value) {
      return false;
    }

    if (isRefreshingProfile.value) {
      return false;
    }

    isRefreshingProfile.value = true;

    try {
      const response = await api.get("/api/auth/profile");
      if (response.data?.user) {
        user.value = response.data.user;
      }
      return true;
    } catch (error) {
      console.error("Error refreshing profile:", error);
      return false;
    } finally {
      isRefreshingProfile.value = false;
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
    profileData: any,
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
          profileData.profiles,
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
    token: string,
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
    email: string,
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
    email: string,
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
    newPassword: string,
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
    newPassword: string,
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
    receivedToken: string,
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;
    // Resetear estado de inicialización al hacer OAuth login para forzar recarga completa
    isInitialized.value = false;

    try {
      // Limpiar cualquier sesión de demo anterior
      sessionStorage.removeItem("auth_token");

      // Guardar token
      token.value = receivedToken;
      localStorage.setItem("auth_token", receivedToken);

      // Obtener perfil del usuario ANTES de marcar como autenticado
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;
      isAuthenticated.value = true;

      // Obtener usage
      await fetchUsage();

      // Marcar como inicializado después de cargar todo
      isInitialized.value = true;

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
    handoffToken: string,
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;

    try {
      const response = await api.post("/api/auth_lr/consume-handoff", {
        handoffToken,
      });
      const { token: receivedToken } = response.data;

      // Limpiar cualquier sesión de demo anterior
      sessionStorage.removeItem("auth_token");

      // Actualizar estado de autenticación
      token.value = receivedToken;
      localStorage.setItem("auth_token", receivedToken);

      // Obtener datos del usuario ANTES de marcar como autenticado
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;
      isAuthenticated.value = true;

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

  /**
   * @param variant Cuenta demo a la que entrar ("commercial"…). Sin ella, la
   *   demo de siempre. Las claves válidas son las de config/demoUsers.ts.
   */
  const demoLogin = async (
    variant?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    isLoading.value = true;
    // Resetear estado de inicialización al hacer demo login para forzar recarga completa
    isInitialized.value = false;

    try {
      const response = await api.post(
        variant ? `/api/auth/demo-login/${variant}` : "/api/auth/demo-login",
      );
      const { token: receivedToken } = response.data;

      // Limpiar cualquier sesión anterior (usuario normal)
      localStorage.removeItem("auth_token");

      token.value = receivedToken;
      // Usar sessionStorage para demo - se borra al cerrar la pestaña
      sessionStorage.setItem("auth_token", receivedToken);

      // Obtener datos reales del usuario desde /profile ANTES de marcar como autenticado
      const profileResponse = await api.get("/api/auth/profile");
      user.value = profileResponse.data.user;
      isAuthenticated.value = true;

      // Fetch usage data after successful demo login
      await fetchUsage();

      // Marcar como inicializado después de cargar todo
      isInitialized.value = true;

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error:
          error.response?.data?.message ||
          "Error logging in with demo account.",
      };
    } finally {
      isLoading.value = false;
    }
  };

  const processPatterns = async () => {
    if (!isAuthenticated.value || !token.value) {
      return;
    }

    try {
      const response = await api_analyzer.get(
        "/api/report-review/should-build",
      );
      const { action } = response.data;

      console.log("Portfolio review action:", action);

      // Si hay un build en progreso o se requiere rebuild, establecer polling
      if (action === "BUILDING" || action === "RE-BUILDING") {
        console.log(
          `Portfolio patterns ${action.toLowerCase()}, will refresh profile in 5 minutes`,
        );

        // Establecer intervalo de 5 minutos (300000ms) para refrescar el perfil
        setTimeout(() => {
          console.log("Refreshing user profile after pattern processing");
          void refreshProfile();
        }, 300000); // 5 minutos
      }
    } catch (error) {
      console.error("Error processing patterns:", error);
    }
  };

  return {
    isAuthenticated,
    token,
    user,
    isLoading,
    isInitialized,
    isRefreshingProfile,
    userShortName,
    needsInitialPurchase,
    onboardingShowsPacks,
    usageLimits,
    dismissUsageWarning,
    fetchUsage,
    refreshProfile,
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
    demoLogin,
    processPatterns,
  };
});
