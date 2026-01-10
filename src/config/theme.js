/**
 * ==========================================================================
 * TEMA CENTRALIZADO - PHOTOREKA
 * ==========================================================================
 *
 * Este archivo es la ÚNICA FUENTE DE VERDAD para colores y tokens de diseño.
 * Define tanto el themeOverrides de Naive UI como las CSS variables.
 *
 * Para cambiar un color: modificalo aquí y se aplicará automáticamente
 * en toda la aplicación (componentes Naive UI y HTML/CSS propio).
 */

// ==========================================================================
// PALETA DE COLORES BASE
// ==========================================================================

const colors = {
  // Primary (Blue)
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#0000ff",
    900: "#1e3a8a",
  },
  // Secondary (Purple)
  purple: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7",
    600: "#9333ea",
    700: "#7e22ce",
    800: "#6b21a8",
    900: "#581c87",
  },
  // Accent (Pink)
  pink: {
    50: "#fdf2f8",
    100: "#fce7f3",
    200: "#fbcfe8",
    300: "#f9a8d4",
    400: "#f472b6",
    500: "#ec4899",
    600: "#db2777",
    700: "#be185d",
    800: "#9d174d",
    900: "#831843",
  },
  // Success (Green)
  green: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    800: "#166534",
    900: "#14532d",
  },
  // Warning (Amber)
  amber: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  },
  // Error (Red)
  red: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
  },
  // Info (Cyan)
  cyan: {
    50: "#ecfeff",
    100: "#cffafe",
    200: "#a5f3fc",
    300: "#67e8f9",
    400: "#00ffff",
    500: "#06b6d4",
    600: "#0891b2",
    700: "#0e7490",
    800: "#155e75",
    900: "#164e63",
  },
  // Grays
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },
};

// ==========================================================================
// TEMA DARK (Por defecto)
// ==========================================================================

export const darkTheme = {
  // Colors principales
  primary: colors.blue[600],
  primaryHover: colors.blue[500],
  primaryPressed: colors.blue[800],
  primarySuppl: colors.blue[500],

  // Colors secundarios
  secondary: colors.purple[600],
  secondaryHover: colors.purple[700],
  secondaryPressed: colors.purple[800],

  // Status colors
  success: colors.green[500],
  successHover: colors.green[600],
  successPressed: colors.green[700],

  warning: colors.amber[500],
  warningHover: colors.amber[600],
  warningPressed: colors.amber[700],

  error: colors.red[500],
  errorHover: colors.red[600],
  errorPressed: colors.red[700],

  info: colors.cyan[500],
  infoHover: colors.cyan[600],
  infoPressed: colors.cyan[700],

  // Backgrounds
  bgBody: "#16161a",
  bgContainer: "#1a1a1f",
  bgSurface: "#2c2c32",
  bgSurfaceHover: "#11113f",
  bgCard: "#18181c",
  bgDeepSurface: "black",
  bgOverlay: "rgba(0, 0, 0, 0.6)",
  // bgTag: "rgba(37, 99, 235, 0.7)",

  // Borders
  border: "#2c2c32",
  borderHover: "#3c3c42",
  borderFocus: colors.blue[600],

  // Text
  textPrimary: "rgba(255, 255, 255, 0.82)",
  textSecondary: "rgba(255, 255, 255, 0.45)",
  textTertiary: "rgba(255, 255, 255, 0.38)",
  textPlaceholder: colors.gray[500],
  textDisabled: "rgba(255, 255, 255, 0.25)",
  textOnPrimary: "#ffffff",

  // Icons
  iconPrimary: "rgba(255, 255, 255, 0.82)",
  iconSecondary: colors.gray[400],
  iconTertiary: colors.gray[500],

  // Acento
  accent: colors.cyan[400],

  // Premium Landing específico
  premium: {
    bg: "#0a0a0f",
    bgElevated: "#111118",
    surface: "#16161f",
    border: "rgba(255, 255, 255, 0.08)",
    textPrimary: "rgba(255, 255, 255, 0.95)",
    textSecondary: "rgba(255, 255, 255, 0.65)",
    textTertiary: "rgba(255, 255, 255, 0.45)",
    primary: colors.blue[600],
    primaryHover: colors.blue[500],
    accent: colors.purple[600],
    gradient2: colors.blue[800],
    gradient3: colors.cyan[400],
  },
};

// ==========================================================================
// TEMA LIGHT
// ==========================================================================

export const lightTheme = {
  // Colors principales
  primary: colors.blue[700],
  primaryHover: colors.blue[600],
  primaryPressed: colors.blue[900],
  primarySuppl: colors.blue[500],

  // Colors secundarios
  secondary: colors.purple[700],
  secondaryHover: colors.purple[800],
  secondaryPressed: colors.purple[900],

  // Status colors
  success: colors.green[600],
  successHover: colors.green[700],
  successPressed: colors.green[800],

  warning: colors.amber[600],
  warningHover: colors.amber[700],
  warningPressed: colors.amber[800],

  error: colors.red[600],
  errorHover: colors.red[700],
  errorPressed: colors.red[800],

  info: colors.cyan[500],
  infoHover: colors.cyan[700],
  infoPressed: colors.cyan[800],

  // Acento
  accent: colors.cyan[400],

  // Backgrounds
  bgBody: "#F7F8FA",
  bgContainer: "#F5F7FA",
  bgDeepSurface: "whitesmoke",
  bgSurface: "#FFFFFF",
  bgSurfaceHover: "#F1F5F9",
  bgCard: "#FFFFFF",

  bgOverlay: "rgba(0, 0, 0, 0.4)",
  bgTag: "rgba(37, 99, 235, 0.12)",

  // Borders
  border: "rgba(0, 0, 0, 0.1)",
  borderHover: "rgba(0, 0, 0, 0.2)",
  borderFocus: colors.blue[700],

  // Text
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textTertiary: "#64748b",
  textPlaceholder: "#94a3b8",
  textDisabled: "#cbd5e1",
  textOnPrimary: "#ffffff",

  // Icons
  iconPrimary: "#0f172a",
  iconSecondary: colors.gray[600],
  iconTertiary: colors.gray[400],

  // Premium Landing específico
  premium: {
    bg: "#ffffff",
    bgElevated: "#ffffff",
    surface: "#ffffff",
    border: "rgba(0, 0, 0, 0.1)",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textTertiary: "#64748b",
    primary: colors.blue[600],
    primaryHover: colors.blue[700],
    accent: colors.purple[700],
    gradient2: colors.blue[800],
    gradient3: colors.cyan[400],
  },
};

// ==========================================================================
// NAIVE UI THEME OVERRIDES
// ==========================================================================

/**
 * Convierte nuestro tema en el formato que Naive UI espera
 */
export function getNaiveThemeOverrides(isDark = true) {
  const theme = isDark ? darkTheme : lightTheme;

  return {
    common: {
      primaryColor: theme.primary,
      primaryColorHover: theme.primaryHover,
      primaryColorPressed: theme.primaryPressed,
      primaryColorSuppl: theme.primarySuppl,

      successColor: theme.success,
      successColorHover: theme.successHover,
      successColorPressed: theme.successPressed,

      warningColor: theme.warning,
      warningColorHover: theme.warningHover,
      warningColorPressed: theme.warningPressed,

      errorColor: theme.error,
      errorColorHover: theme.errorHover,
      errorColorPressed: theme.errorPressed,

      infoColor: theme.info,
      infoColorHover: theme.infoHover,
      infoColorPressed: theme.infoPressed,

      // Backgrounds
      bodyColor: theme.bgBody,
      cardColor: theme.bgCard,
      modalColor: theme.bgContainer,
      popoverColor: theme.bgContainer,
      bgDeepSurface: theme.bgDeepSurface,

      // Borders
      borderColor: theme.border,

      // Text
      textColorBase: theme.textPrimary,
      textColor1: theme.textPrimary,
      textColor2: theme.textSecondary,
      textColor3: theme.textTertiary,
      placeholderColor: theme.textPlaceholder,
    },
    Menu: {
      // Color de fondo del menú completo
      color: isDark ? theme.bgCard : theme.bgSurface,

      // Color de fondo del item seleccionado/activo
      itemColorActive: theme.accent,
      itemColorActiveHover: theme.accent + "30",

      // Color de fondo del item activo cuando el menú está colapsado
      itemColorActiveCollapsed: theme.accent,

      // Color del texto del item activo
      itemTextColorActive: theme.primary,
      itemTextColorActiveHover: theme.primary,

      // Color del icono del item activo
      itemIconColorActive: theme.primary,
      itemIconColorActiveHover: theme.primary,

      // Color del icono cuando el menú está colapsado
      itemIconColorActiveCollapsed: theme.primary,
      // Otros estados
      itemColorHover: theme.bgSurfaceHover,
      itemTextColor: theme.textPrimary,
      itemIconColor: theme.iconSecondary,
    },

    // InternalSelection: {
    //   // Estos son los colores de los tags que realmente se usan
    //   color: theme.primary + "20", // Fondo del tag
    //   textColor: theme.primary, // Texto del tag
    //   colorActive: theme.primary + "30", // Hover
    //   border: "1px solid " + theme.primary + "40",
    //   closeColorHover: theme.primary,
    //   closeColorPressed: theme.primaryPressed,
    // },
    Select: {
      // fondo del tag
      multipleItemColor: "red",
      multipleItemColorHover: theme.primary + "20",
      multipleItemColorPressed: theme.primary,

      // texto
      multipleItemTextColor: theme.primary,
      multipleItemTextColorHover: theme.primary,
      multipleItemTextColorPressed: "#ffffff",

      // borde / radio
      multipleItemBorderRadius: "4px",

      // icono de cerrar
      multipleItemBorderColor: theme.primary,
      multipleItemIconColor: theme.primary,
      multipleItemIconColorHover: theme.primaryHover,
      multipleItemIconColorPressed: theme.primaryPressed,
    },
  };
}

// ==========================================================================
// CSS VARIABLES
// ==========================================================================

/**
 * Convierte el tema en CSS variables para usar en HTML/CSS
 * Se inyectan dinámicamente en :root
 */
export function getThemeCSSVariables(isDark = true) {
  const theme = isDark ? darkTheme : lightTheme;

  return {
    // Primary
    "--primary-color": theme.primary,
    "--primary-color-hover": theme.primaryHover,
    "--primary-color-pressed": theme.primaryPressed,
    "--primary-color-suppl": theme.primarySuppl,

    // Secondary
    "--secondary-color": theme.secondary,
    "--secondary-color-hover": theme.secondaryHover,
    "--secondary-color-pressed": theme.secondaryPressed,

    // Accent
    "--accent-color": theme.accent,

    // Status
    "--success-color": theme.success,
    "--success-color-hover": theme.successHover,
    "--success-color-pressed": theme.successPressed,

    "--warning-color": theme.warning,
    "--warning-color-hover": theme.warningHover,
    "--warning-color-pressed": theme.warningPressed,

    "--error-color": theme.error,
    "--error-color-hover": theme.errorHover,
    "--error-color-pressed": theme.errorPressed,

    "--info-color": theme.info,
    "--info-color-hover": theme.infoHover,
    "--info-color-pressed": theme.infoPressed,

    // Backgrounds
    "--bg-body": theme.bgBody,
    "--bg-container": theme.bgContainer,
    "--bg-surface": theme.bgSurface,
    "--bg-surface-hover": theme.bgSurfaceHover,
    "--bg-card": theme.bgCard,
    "--bg-overlay": theme.bgOverlay,
    "--bg-tag": theme.bgTag,
    "--bg-deep-surface": theme.bgDeepSurface,

    // Canvas
    "--canvas-dot-color": theme.canvasDotColor,

    // Borders
    "--border-color": theme.border,
    "--border-color-hover": theme.borderHover,
    "--border-color-focus": theme.borderFocus,

    // Text
    "--text-primary": theme.textPrimary,
    "--text-secondary": theme.textSecondary,
    "--text-tertiary": theme.textTertiary,
    "--text-placeholder": theme.textPlaceholder,
    "--text-disabled": theme.textDisabled,
    "--text-on-primary": theme.textOnPrimary,

    // Icons
    "--icon-primary": theme.iconPrimary,
    "--icon-secondary": theme.iconSecondary,
    "--icon-tertiary": theme.iconTertiary,

    // Premium
    "--premium-bg": theme.premium.bg,
    "--premium-bg-elevated": theme.premium.bgElevated,
    "--premium-surface": theme.premium.surface,
    "--premium-border": theme.premium.border,
    "--premium-text-primary": theme.premium.textPrimary,
    "--premium-text-secondary": theme.premium.textSecondary,
    "--premium-text-tertiary": theme.premium.textTertiary,
    "--premium-primary": theme.premium.primary,
    "--premium-primary-hover": theme.premium.primaryHover,
    "--premium-accent": theme.premium.accent,
    "--premium-gradient-1": theme.premium.gradient1,
    "--premium-gradient-2": theme.premium.gradient2,
    "--premium-gradient-3": theme.premium.gradient3,
  };
}

// ==========================================================================
// TOKENS ESTÁTICOS (sin cambio entre dark/light)
// ==========================================================================

export const staticTokens = {
  // Shadows
  shadow: {
    sm: "0 2px 4px rgba(0, 0, 0, 0.1)",
    md: "0 4px 12px rgba(0, 0, 0, 0.15)",
    lg: "0 8px 24px rgba(0, 0, 0, 0.2)",
    xl: "0 12px 32px rgba(0, 0, 0, 0.25)",
    primary: "0 4px 12px rgba(37, 99, 235, 0.2)",
    secondary: "0 4px 12px rgba(139, 92, 246, 0.2)",
  },

  // Spacing
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "32px",
    "4xl": "40px",
    "5xl": "48px",
    "6xl": "64px",
  },

  // Border radius
  radius: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "20px",
    "2xl": "24px",
    round: "50%",
  },

  // Typography
  fontSize: {
    xs: "10px",
    sm: "12px",
    base: "14px",
    md: "16px",
    lg: "18px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "28px",
    "4xl": "32px",
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Transitions
  transition: {
    fast: "0.2s ease",
    normal: "0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    slow: "0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // Z-index
  zIndex: {
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modalBackdrop: 400,
    modal: 500,
    popover: 600,
    tooltip: 700,
    toast: 800,
    overlay: 900,
    max: 999,
  },
};

// ==========================================================================
// EXPORT DEFAULT
// ==========================================================================

export default {
  darkTheme,
  lightTheme,
  getNaiveThemeOverrides,
  getThemeCSSVariables,
  staticTokens,
  colors, // Por si necesitas acceder a colores específicos
};
