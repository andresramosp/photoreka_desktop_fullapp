import { ref } from "vue";
import { registerSW } from "virtual:pwa-register";

/**
 * Gestión de actualizaciones de despliegue.
 *
 * El service worker está en modo "prompt" (ver vite.config.ts): un deploy nuevo
 * deja el SW en espera pero NO recarga ni avisa por su cuenta.
 *
 * El ÚNICO punto de decisión es /version.json, que se lee en el arranque. Por
 * defecto un deploy es silencioso: ni recarga ni aviso. Para cambiarlo, publica
 * el build con una de estas variables:
 *
 *   PHOTOREKA_FORCE_RELOAD=true   -> las pestañas abiertas se recargan solas
 *                                    (una vez por versión). Para cambios críticos.
 *   PHOTOREKA_UPDATE_NOTICE=true  -> muestra un aviso con botón "Update" y el
 *                                    usuario decide cuándo recargar.
 *
 * Nota: /index.html es no-cache y /assets/* es inmutable con hash, así que
 * cualquier carga nueva ya trae el código nuevo sin recargar. Esto sólo importa
 * para pestañas que llevan tiempo abiertas.
 */

const APP_VERSION = __APP_VERSION__;
const STALE_VERSION_FLAG = "photoreka:stale-version-recovery";

export const UPDATE_AVAILABLE_EVENT = "photoreka:update-available";

export interface UpdateAvailableDetail {
  version: string;
}

/** Actualización detectada y pendiente de aplicar. La UI observa este ref. */
export const pendingUpdate = ref<UpdateAvailableDetail | null>(null);

let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};

/**
 * Registra el service worker.
 *
 * `onNeedRefresh` se dispara en CADA deploy en cuanto hay un SW en espera, sin
 * saber nada de las variables de despliegue, así que deliberadamente no toca la
 * UI: sólo deja constancia en consola. Quien decide avisar o recargar es
 * checkDeployedVersion(), leyendo /version.json.
 */
export function registerAppUpdates() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      console.info("[appUpdate] New service worker waiting; no action taken.");
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

    // Deploy silencioso (el caso por defecto): no molestamos al usuario. El
    // código nuevo entra solo en la próxima carga, y router.onError cubre el
    // caso de un chunk lazy que ya no exista.
    if (!payload.forceReload && !payload.updateNotice) {
      return;
    }

    // Ya tratamos esta versión en esta sesión: no repetir (evita bucle de recargas
    // si el servidor sigue devolviendo un bundle antiguo).
    if (sessionStorage.getItem(STALE_VERSION_FLAG) === latestVersion) {
      return;
    }
    sessionStorage.setItem(STALE_VERSION_FLAG, latestVersion);

    if (payload.forceReload) {
      await applyUpdateNow();
      return;
    }

    const detail: UpdateAvailableDetail = { version: latestVersion };
    pendingUpdate.value = detail;
    window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT, { detail }));
  } catch (error) {
    console.warn("Failed to verify deployed app version:", error);
  }
}
