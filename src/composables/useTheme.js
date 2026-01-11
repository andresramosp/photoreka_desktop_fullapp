/**
 * ==========================================================================
 * COMPOSABLE: useTheme
 * ==========================================================================
 *
 * Gestiona el tema de la aplicación (dark/light mode).
 * Sincroniza automáticamente:
 * - Naive UI themeOverrides
 * - CSS variables en :root
 * - Atributo data-theme en <html>
 * - Persistencia en localStorage
 */

import { ref, computed, watch, onMounted } from "vue";
import { darkTheme as naiveUIDarkTheme } from "naive-ui";
import {
  getNaiveThemeOverrides,
  getThemeCSSVariables,
} from "@/config/theme.js";

// ========================================================================
// CONFIGURACIÓN DE TEMA FORZADO
// ========================================================================
// Si se setea a "dark" o "light", fuerza ese tema y oculta el toggle
// Si es null, permite al usuario elegir libremente
const FORCE_APP_THEME = "dark"; // null | "dark" | "light"
const FORCE_LANDING_THEME = null; // null | "dark" | "light"

const DEFAULT_THEME = "light";

// Estado global del tema (compartido entre todos los componentes)
const isDarkMode = ref(true); // Por defecto dark
const STORAGE_KEY = "photoreka-theme-mode";

/**
 * Composable principal del tema
 */
export function useTheme() {
  /**
   * Aplica las CSS variables en :root
   */
  const applyCSSVariables = (isDark) => {
    const cssVars = getThemeCSSVariables(isDark);
    const root = document.documentElement;

    Object.entries(cssVars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  };

  /**
   * Aplica el atributo data-theme en <html>
   */
  const applyThemeAttribute = (isDark) => {
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "dark" : "light"
    );
  };

  /**
   * Cambia el modo del tema
   * @param {boolean} dark - true para dark mode, false para light mode
   * @param {boolean} persist - si debe guardar en localStorage (default: true)
   */
  const setTheme = (dark, persist = true) => {
    isDarkMode.value = dark;
    applyCSSVariables(dark);
    applyThemeAttribute(dark);
    if (persist) {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    }
  };

  /**
   * Alterna entre dark y light
   */
  const toggleTheme = () => {
    setTheme(!isDarkMode.value);
  };

  /**
   * Inicializa el tema desde localStorage o preferencia del sistema
   */
  const initTheme = () => {
    // 0. Detectar si estamos en landing
    const isLanding =
      window.location.pathname === "/" ||
      window.location.pathname === "/landing" ||
      window.location.pathname.includes("/landing");

    // 1. Verificar si hay tema forzado
    const forcedTheme = isLanding ? FORCE_LANDING_THEME : FORCE_APP_THEME;
    if (forcedTheme !== null) {
      setTheme(forcedTheme === "dark", false); // No persistir temas forzados
      return;
    }

    // 2. Intentar cargar desde localStorage
    const stored = localStorage.getItem(STORAGE_KEY);

    if (stored) {
      setTheme(stored === "dark");
      return;
    }

    // 3. Forzar dark mode por defecto (ignorar preferencia del sistema)
    setTheme(DEFAULT_THEME === "dark");
  };

  // Computeds para usar en template
  const naiveTheme = computed(() => {
    return isDarkMode.value ? naiveUIDarkTheme : null;
  });

  const naiveThemeOverrides = computed(() => {
    return getNaiveThemeOverrides(isDarkMode.value);
  });

  const themeMode = computed({
    get: () => (isDarkMode.value ? "dark" : "light"),
    set: (value) => setTheme(value === "dark"),
  });

  // Observar cambios en preferencias del sistema (opcional)
  const watchSystemPreference = () => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    mediaQuery.addEventListener("change", (e) => {
      // Solo aplicar si no hay preferencia guardada
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setTheme(e.matches);
      }
    });
  };

  /**
   * Verifica si el toggle de tema debe estar visible
   * @param {boolean} isLanding - true si es landing page
   */
  const canToggleTheme = (isLanding = false) => {
    const forcedTheme = isLanding ? FORCE_LANDING_THEME : FORCE_APP_THEME;
    return forcedTheme === null;
  };

  return {
    // Estado
    isDarkMode,
    themeMode,

    // Para Naive UI
    naiveTheme,
    naiveThemeOverrides,

    // Métodos
    setTheme,
    toggleTheme,
    initTheme,
    watchSystemPreference,
    canToggleTheme,
  };
}

/**
 * Hook para inicializar el tema en el componente raíz (App.vue)
 */
export function useThemeInit() {
  const theme = useTheme();

  // APLICAR TEMA INMEDIATAMENTE - NO ESPERAR onMounted
  theme.initTheme();
  theme.watchSystemPreference();

  return theme;
}

/**
 * Acceso directo para componentes que solo necesitan leer el tema actual
 */
export function useThemeMode() {
  return {
    isDarkMode: computed(() => isDarkMode.value),
    themeMode: computed(() => (isDarkMode.value ? "dark" : "light")),
  };
}
