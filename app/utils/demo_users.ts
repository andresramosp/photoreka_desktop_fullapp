/**
 * Cuentas demo — fuente única en el backend.
 *
 * Había una sola cuenta y su email se leía de `DEMO_USER_EMAIL` en tres sitios
 * distintos (login demo, middleware de solo lectura y límites de LLM). Con más
 * de una variante eso no escala, así que la resolución vive aquí.
 *
 * Cada variante tiene su propia env var. `DEMO_USER_EMAIL` se mantiene tal cual
 * para no tocar los despliegues existentes.
 *
 * El front lleva su propia copia de la lista en web/src/config/demoUsers.js:
 * aquella decide qué esconde la interfaz, esta decide qué se bloquea de verdad.
 * Tienen que decir lo mismo.
 */

/** Variante → nombre de la env var que guarda su email. */
const DEMO_ENV_VARS: Record<string, string> = {
  default: 'DEMO_USER_EMAIL',
  commercial: 'DEMO_USER_EMAIL_COMMERCIAL',
}

export const DEFAULT_DEMO_VARIANT = 'default'

/**
 * Email de la cuenta demo pedida, o null si esa variante no existe o no está
 * configurada en este servidor. Sin variante se resuelve la de siempre.
 *
 * Una variante desconocida devuelve null en vez de caer en la por defecto: si
 * alguien entra por una URL de demo mal escrita, es mejor que se le diga que no
 * hay demo que soltarle un catálogo que no es el que venía a ver.
 */
export function resolveDemoEmail(variant?: string | null): string | null {
  const key = variant ? variant : DEFAULT_DEMO_VARIANT
  const envVar = DEMO_ENV_VARS[key]
  if (!envVar) return null
  const email = process.env[envVar]
  return email && email.trim() ? email.trim() : null
}

/** Todos los emails demo configurados en este servidor. */
export function getDemoEmails(): string[] {
  return Object.values(DEMO_ENV_VARS)
    .map((envVar) => process.env[envVar]?.trim())
    .filter((email): email is string => Boolean(email))
}

/**
 * True si el email pertenece a alguna cuenta demo. Es el predicado que decide
 * si una petición va en modo solo lectura y con los límites de LLM recortados.
 */
export function isDemoEmail(email?: string | null): boolean {
  if (!email) return false
  return getDemoEmails().includes(email)
}
