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

// Manejador de errores común
const handleApiError = (error: AxiosError) => {
  if (error.response) {
    const { status, data } = error.response;

    // No mostrar mensaje para errores 404 ni 500+ (errores internos del servidor)
    if (status === 404 || status >= 500) {
      return Promise.reject(error);
    }

    // Detectar créditos insuficientes (402)
    if (status === 402 && data && typeof data === "object") {
      const errorData = data as any;
      if (errorData.code === "INSUFFICIENT_CREDITS") {
        // No mostrar notificación para endpoints de chat (ChatView lo maneja internamente)
        const requestUrl = error.config?.url || "";
        if (!requestUrl.includes("/api/chat")) {
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
        }
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
