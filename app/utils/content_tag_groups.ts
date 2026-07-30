/**
 * Grupos de tags que responden a "qué hay en la foto": entidades físicas, vivas o
 * inertes. Es el eje que faltaba junto a CLIP (todo, incluido el estilo), contextual
 * (el dónde) y narrative (el qué sucede), y alimenta la criteria `content` de la
 * búsqueda por similitud.
 *
 * `tags.group` lo escribe un LLM sin vocabulario cerrado, así que en BD hay ~1000
 * valores distintos. La cola es irrelevante: unos pocos grupos concentran casi todo
 * el uso, y son los que se listan aquí. Añadir un sinónimo nuevo es una línea.
 *
 * Entre paréntesis, usos reales en BD (julio 2026).
 *
 * Dos decisiones que no se ven en esta lista y que hay que respetar al consultar:
 *
 * - NO se filtra por `tags_photos.category`. Un mismo objeto cae en el chunk de
 *   context_story o en el de visual_accents según cómo redactara el LLM, no según
 *   qué sea, así que filtrar por categoría deja el inventario incompleto de forma
 *   arbitraria. Entra algo de ruido (superficies y texturas del escenario), pero
 *   ese ruido se concentra en tags ubicuos y es despriorizable; lo que falta no
 *   se recupera.
 * - SÍ se filtra por `tags_photos.parent_id IS NULL`. Los tags con padre son los
 *   sustantivos derivados que genera TagPhotoManager.addSustantives (de "natural
 *   lighting" nace "lighting"): un tercio de la tabla, y si entran, el mismo
 *   concepto pesa doble en cualquier promedio.
 *
 * Cobertura medida con esos dos criterios: 86% de las fotos, ~8 tags por foto,
 * 1,02% de tags abstractos colados (sobre todo cosas físicas con un adjetivo de
 * estilo pegado, tipo "minimalist kitchen").
 */
export const CONTENT_TAG_GROUPS: string[] = [
  // inertes
  'object', // 251.334
  'objects', // 147.123
  'objekt', // 1 — typo recurrente del LLM
  // personas
  'person', // 112.475
  'people', // 19
  'persons', // 1
  'persona', // 16
  // animales
  'animal', // 4.167
  'animals', // 1.923
]

/** Compara el `group` crudo del tag (puede venir con mayúsculas o espacios) contra una lista. */
export function tagGroupMatches(group: string | null | undefined, groups: string[]): boolean {
  if (!group) return false
  return groups.includes(group.trim().toLowerCase())
}
