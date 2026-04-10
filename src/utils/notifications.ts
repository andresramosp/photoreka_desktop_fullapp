import { createDiscreteApi, darkTheme as naiveUIDarkTheme } from "naive-ui";
import { computed } from "vue";
import { getNaiveThemeOverrides } from "@/config/theme.js";

const configProviderProps = computed(() => ({
  theme: naiveUIDarkTheme,
  themeOverrides: getNaiveThemeOverrides(true),
}));

// Crear una API discreta con el tema de la app
const { message, notification } = createDiscreteApi(
  ["message", "notification"],
  { configProviderProps },
);

export { message, notification };
