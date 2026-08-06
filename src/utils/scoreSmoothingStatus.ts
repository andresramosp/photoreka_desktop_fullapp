/**
 * Lo hecho y lo que falta, deducido de la propia simulación.
 *
 * No hay estado guardado en ninguna parte: cada simulación trae, por foto, lo que
 * escribiría (`after`) y lo que hay escrito (`current`). Si coinciden, esa foto ya
 * está; si no, falta. Por eso el ciclo es idempotente — al ejecutar, `current` pasa
 * a ser `after` y lo pendiente desaparece solo en la siguiente simulación.
 */

import type { PreviewGroup, PreviewPhoto } from "../types/scoreSmoothing";

export type SmoothingStatus = "pending" | "done" | "noop";

/** Los scores se comparan ya formateados, así que la tolerancia solo cubre el float. */
const EPSILON = 1e-6;

/**
 * ¿Coinciden los dos juegos de scores? Se recorren las claves de `expected`, que es
 * el mismo criterio que usa el backend para decidir si hace falta un UPDATE.
 */
function sameScores(
  expected: Record<string, number>,
  actual: Record<string, number>,
): boolean {
  for (const [key, value] of Object.entries(expected ?? {})) {
    const other = Number(actual?.[key]);
    if (!Number.isFinite(other) || Math.abs(other - Number(value)) > EPSILON) {
      return false;
    }
  }
  return true;
}

/**
 * - `pending` lo calculado todavía no está escrito → falta por aplicar.
 * - `done`    lo calculado ya está escrito y además mueve algo → hecho.
 * - `noop`    el motor no toca esta foto y no hay nada que hacer con ella.
 */
export function photoStatus(photo: PreviewPhoto): SmoothingStatus {
  if (!sameScores(photo.after, photo.current)) return "pending";
  return sameScores(photo.after, photo.before) ? "noop" : "done";
}

/** Un grupo está pendiente en cuanto le falte una sola foto. */
export function groupStatus(group: PreviewGroup): SmoothingStatus {
  let done = false;

  for (const photo of group.photos) {
    const status = photoStatus(photo);
    if (status === "pending") return "pending";
    if (status === "done") done = true;
  }

  return done ? "done" : "noop";
}

