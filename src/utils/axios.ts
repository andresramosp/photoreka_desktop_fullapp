import axios, { type AxiosInstance } from "axios";

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
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para api_analyzer (opcional, igual que api)
api_analyzer.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

export { api, api_analyzer };
