import axios, { type AxiosInstance, type AxiosError } from "axios";
import { h } from "vue";
import { message, notification } from "./notifications";
import router from "@/router";

// Crear una instancia de axios
const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_MAIN_API_BASE_URL,
});

// Crear una instancia de axios para el analyzer
const api_analyzer: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_ANALYZER_API_BASE_URL,
});

// Interceptor para añadir el token JWT si existe
api.interceptors.request.use((config) => {
  // Verificar primero localStorage (usuarios normales), luego sessionStorage (modo demo)
  const token =
    localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para api_analyzer (opcional, igual que api)
api_analyzer.interceptors.request.use((config) => {
  // Verificar primero localStorage (usuarios normales), luego sessionStorage (modo demo)
  const token =
    localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Evita disparar múltiples redirecciones/mensajes cuando varias requests
// fallan a la vez tras caducar/revocarse la sesión.
let isHandlingSessionExpiry = false;

// Manejador de errores común
const handleApiError = (error: AxiosError) => {
  if (error.response) {
    const { status, data } = error.response;

    // Sesión caducada o revocada (401).
    //
    // Distinguimos el 401 del guard de AdonisJS (token inválido/expirado/revocado
    // o cuenta inactiva desde auth_middleware) de los 401 "de negocio" que lanzan
    // los controllers con response.unauthorized({ message }) — p.ej. credenciales
    // inválidas en el login o un token de sesión de geo-recovery caducado.
    //
    // El guard/middleware serializa como { errors: [{ message }] }; los controllers
    // como { message }. Sólo el primero significa "tu sesión ya no vale", y sólo
    // actuamos si además había un token (así el login sin token nunca redirige).
    const hasToken =
      !!localStorage.getItem("auth_token") ||
      !!sessionStorage.getItem("auth_token");
    const isGuardUnauthorized =
      !!data &&
      typeof data === "object" &&
      Array.isArray((data as any).errors);
    if (status === 401 && hasToken && isGuardUnauthorized) {
      if (!isHandlingSessionExpiry) {
        isHandlingSessionExpiry = true;
        localStorage.removeItem("auth_token");
        sessionStorage.removeItem("auth_token");
        message.warning("Your session has expired. Please log in again.");
        // Hard redirect (not router.replace) so the whole app remounts fresh —
        // a SPA navigation left stale Pinia state (isAuthenticated still true)
        // and App.vue kept showing the authenticated layout instead of /auth.
        window.location.replace("/auth");
      }
      return Promise.reject(error);
    }

    // No mostrar mensaje para errores 404 ni 500+ (errores internos del servidor)
    if (status === 404 || status >= 500) {
      return Promise.reject(error);
    }

    // Detectar créditos insuficientes o quota diaria agotada (402)
    if (status === 402 && data && typeof data === "object") {
      const errorData = data as any;

      // Free daily quota exhausted
      if (errorData.code === "QUOTA_EXHAUSTED") {
        const categoryLabels: Record<string, string> = {
          SEARCH: "Semantic Search",
          SEARCH_PRECISE: "Precise Search",
          SEARCH_BY_PHOTO: "Photo Similarity Search",
          CHAT: "ChatLab Assistant",
          CHAT_KNOWLEDGE_ASSISTANT: "Knowledge Assistant",
        };
        const label =
          categoryLabels[errorData.category as string] ?? "this feature";
        const limit: number = errorData.dailyLimit ?? 0;
        notification.warning({
          title: "Daily free quota reached",
          content: `You've used all ${limit} free daily request${limit !== 1 ? "s" : ""} for ${label}. Try again tomorrow or top up your credits.`,
          action: () =>
            h(
              "a",
              {
                style:
                  "color: var(--primary-color); cursor: pointer; font-size: 14px;",
                onClick: (e: Event) => {
                  e.preventDefault();
                  notification.destroyAll();
                  router.push("/settings");
                },
              },
              "Top up credits →",
            ),
          duration: 8000,
        });
        return Promise.reject(error);
      }

      if (errorData.code === "INSUFFICIENT_CREDITS") {
        notification.warning({
          title: "Insufficient Credits",
          content: errorData.message || "Not enough credits.",
          action: () =>
            h(
              "a",
              {
                style:
                  "color: var(--primary-color); cursor: pointer; font-size: 14px;",
                onClick: (e: Event) => {
                  e.preventDefault();
                  notification.destroyAll();
                  router.push("/settings");
                },
              },
              "Go to Settings →",
            ),
          duration: 8000,
        });
        return Promise.reject(error);
      }
    }

    // Detectar cuenta demo con acceso de solo lectura (403)
    if (status === 403 && data && typeof data === "object") {
      const errorData = data as any;
      if (
        errorData.code === "READ_ONLY_ACCESS" &&
        errorData.isDemoMode === true
      ) {
        // Mostrar el mensaje específico de la cuenta demo
        message.warning(
          "This is a demo account with read-only access. Sign up to gain full access.",
        );
        return Promise.reject(error);
      }
    }

    // Para errores del cliente (4xx), mostrar mensaje
    const errorData = data as any;
    const errorMessage =
      errorData?.message || "An error occurred. Please try again.";
    message.error(errorMessage);
  } else if (error.request) {
    // Error de red o sin respuesta del servidor
    message.error("Network error. Please check your connection and try again.");
  } else {
    // Error en la configuración de la request
    message.error("An unexpected error occurred.");
  }

  return Promise.reject(error);
};

// Interceptor de respuesta para api
api.interceptors.response.use((response) => response, handleApiError);

// Interceptor de respuesta para api_analyzer
api_analyzer.interceptors.response.use((response) => response, handleApiError);

export { api, api_analyzer };
