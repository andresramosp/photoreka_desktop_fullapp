import { ref } from "vue";
import { registerSW } from "virtual:pwa-register";

/**
 * Gestión de actualizaciones de despliegue.
 *
 * El service worker está en modo "prompt" (ver vite.config.ts): un deploy nuevo
 * deja el SW en espera pero NO recarga la página por su cuenta. Quién decide
 * recargar es este módulo:
 *
 *  - Deploy normal  -> se marca `pendingUpdate` y la UI muestra un aviso con un
 *                      botón "Actualizar". El usuario decide cuándo.
 *  - Deploy crítico -> se publica con PHOTOREKA_FORCE_RELOAD=true, lo que emite
 *                      `forceReload: true` en /version.json, y la app se recarga
 *                      sola en el arranque (una sola vez por versión).
 *
 * Nota: /index.html es no-cache y /assets/* es inmutable con hash, así que
 * cualquier carga nueva ya trae el código nuevo sin recargar. El reload sólo
 * importa para pestañas que llevan tiempo abiertas.
 */

const APP_VERSION = __APP_VERSION__;
const STALE_VERSION_FLAG = "photoreka:stale-version-recovery";
const UPDATE_AVAILABLE_FLAG = "photoreka:update-available";

export const UPDATE_AVAILABLE_EVENT = "photoreka:update-available";

export interface UpdateAvailableDetail {
  version: string;
  source: "version-check" | "sw";
}

/** Actualización detectada y pendiente de aplicar. La UI observa este ref. */
export const pendingUpdate = ref<UpdateAvailableDetail | null>(null);

let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};

function flagUpdateAvailable(
  version: string,
  source: UpdateAvailableDetail["source"],
) {
  const key = `${source}:${version}`;
  if (sessionStorage.getItem(UPDATE_AVAILABLE_FLAG) === key) {
    return;
  }
  sessionStorage.setItem(UPDATE_AVAILABLE_FLAG, key);

  const detail: UpdateAvailableDetail = { version, source };
  pendingUpdate.value = detail;
  window.dispatchEvent(
    new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail }),
  );
}

/**
 * Registra el service worker. En modo "prompt" `onNeedRefresh` sí se ejecuta
 * (en "autoUpdate" era código muerto) y aquí sólo avisamos, nunca recargamos.
 */
export function registerAppUpdates() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      flagUpdateAvailable(String(APP_VERSION ?? "unknown"), "sw");
    },
  });
}

/**
 * Aplica la actualización pendiente: activa el SW en espera y recarga.
 * El reload explícito es la red de seguridad para cuando la actualización se
 * detectó por /version.json y todavía no hay ningún SW en espera al que
 * mandarle skipWaiting — en ese caso `updateSW` no dispara nada.
 */
export async function applyUpdateNow() {
  sessionStorage.removeItem(UPDATE_AVAILABLE_FLAG);
  try {
    await updateSW(true);
  } catch (error) {
    console.warn("Failed to activate waiting service worker:", error);
  }
  window.setTimeout(() => window.location.reload(), 600);
}

/**
 * Compara la versión con la que se sirvió este bundle contra la desplegada.
 * Se ejecuta una vez en el arranque, antes de montar la app.
 */
export async function checkDeployedVersion() {
  try {
    const response = await fetch(`/version.json?ts=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const latestVersion = payload?.version;

    if (!latestVersion || latestVersion === APP_VERSION) {
      sessionStorage.removeItem(STALE_VERSION_FLAG);
      return;
    }

    // Ya tratamos esta versión en esta sesión: no repetir (evita bucle de recargas
    // si el servidor sigue devolviendo un bundle antiguo).
    if (sessionStorage.getItem(STALE_VERSION_FLAG) === latestVersion) {
      return;
    }
    sessionStorage.setItem(STALE_VERSION_FLAG, latestVersion);

    if (payload?.forceReload) {
      await applyUpdateNow();
      return;
    }

    flagUpdateAvailable(latestVersion, "version-check");
  } catch (error) {
    console.warn("Failed to verify deployed app version:", error);
  }
}
