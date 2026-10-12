import { createDiscreteApi, darkTheme as naiveUIDarkTheme } from "naive-ui";
import { computed } from "vue";
import { getNaiveThemeOverrides } from "@/config/theme.js";

const configProviderProps = computed(() => ({
  theme: naiveUIDarkTheme,
  themeOverrides: getNaiveThemeOverrides(true),
}));

// Crear una API discreta con el tema de la app
// messageProviderProps.containerStyle pushes top-placed messages down so they
// don't overlap the app header (e.g. GlobalSearchAutocomplete bar).
const { message, notification } = createDiscreteApi(
  ["message", "notification"],
  {
    configProviderProps,
    messageProviderProps: {
      containerStyle: { top: "76px" },
    },
  },
);

export { message, notification };
