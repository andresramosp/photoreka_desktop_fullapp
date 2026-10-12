// ══════════════════════════════════════════════════════════════
// CUENTAS DEMO — fuente única de verdad en el front.
//
// El email de la demo estaba repetido a mano en una docena de archivos, así que
// cada cuenta demo nueva obligaba a recorrerlos todos. Aquí viven los emails y
// los dos predicados que necesita la app.
//
// El backend mantiene su propia lista (api/app/utils/demo_users.ts, leída de
// env). Las dos tienen que decir lo mismo: esta decide qué esconde la interfaz,
// la del servidor decide qué peticiones se bloquean de verdad.
// ══════════════════════════════════════════════════════════════

/**
 * Cuentas demo por variante. La clave es la que viaja en la URL de entrada
 * (`/demo` → default, `/demo-commercial` → commercial) y la que el backend
 * espera en POST /api/auth/demo-login/:variant.
 */
export const DEMO_USERS = {
  default: "demo@photorekatest.com",
  commercial: "demo-commercial@photorekatest.com",
} as const;

export type DemoVariant = keyof typeof DEMO_USERS;

/** Todos los emails demo, para comprobaciones sueltas. */
export const DEMO_EMAILS: readonly string[] = Object.values(DEMO_USERS);

/**
 * True si la sesión es una cuenta demo: read-only, sin widget de chat, sin
 * persistir preferencias en localStorage y con el banner de request access.
 */
export function isDemoEmail(email?: string | null): boolean {
  if (!email) return false;
  return DEMO_EMAILS.includes(email);
}

/**
 * Cuentas cuyas fotos entran sin EXIF (imágenes generadas) y necesitan que el
 * front invente unos coherentes al subir. Ver utils/mockExif.js.
 *
 * Deliberadamente separada de DEMO_EMAILS, y no derivada de ella: al montar una
 * demo hay que subir el catálogo *antes* de convertir la cuenta en demo, porque
 * en cuanto lo es el servidor rechaza el upload y la propia interfaz desactiva
 * el botón de importar. Con dos listas, el mock se activa durante esa ventana
 * de carga y la cuenta pasa a demo después.
 */
export const MOCK_EXIF_EMAILS: readonly string[] = [DEMO_USERS.commercial];

/** True si a esta cuenta hay que rellenarle los EXIF que falten al importar. */
export function shouldMockExif(email?: string | null): boolean {
  if (!email) return false;
  return MOCK_EXIF_EMAILS.includes(email);
}
