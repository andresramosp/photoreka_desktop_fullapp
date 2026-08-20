/**
 * Tipos de `photo_schema.js`, que es JS plano y hasta ahora obligaba a un
 * `// @ts-ignore` en cada fichero TS que lo importaba — frágil, porque basta con que
 * el formateador parta el import en varias líneas para que el ignore deje de aplicar.
 *
 * Las firmas son deliberadamente laxas: describen lo justo para que los consumidores
 * compilen, sin duplicar aquí el esquema (que vive en el .js y en el backend).
 */

export type PromptVariant = "general" | "style" | "commercial";

export interface VisualAspectDef {
  key: string;
  label: string;
  source: "llm" | "metadata";
  values: readonly string[];
  valuesByProfile?: Record<string, readonly string[]>;
  [key: string]: unknown;
}

export interface ArtisticScoreCriterionDef {
  key: string;
  label: string;
  externalKey?: string;
  weights: Record<string, number>;
  [key: string]: unknown;
}

export interface ArtisticScoresGroupDef {
  key: string;
  label: string;
  description: string;
  color: string;
  criteria: ArtisticScoreCriterionDef[];
}

export const VISUAL_ASPECTS_SCHEMA: VisualAspectDef[];
export const VISUAL_ASPECT_KEYS: string[];
export const VISUAL_ASPECTS_MAP: Record<string, VisualAspectDef>;
export const ARTISTIC_SCORES_BY_VARIANT: Record<string, ArtisticScoresGroupDef[]>;
export const GENRE_PRESET_KEYS_BY_VARIANT: Record<string, string[]>;

export function getProfileVariant(profile: string | null | undefined): PromptVariant;
export function getArtisticSchema(variant: string): ArtisticScoresGroupDef[];
export function getArtisticCriteria(variant: string): ArtisticScoreCriterionDef[];
export function getArtisticInternalKeys(variant: string): string[];
export function getArtisticExternalKeys(variant: string): string[];
export function getGenrePresetKeys(variant: string): string[];
export function getGenreWeights(genre: string, variant: string): Record<string, number>;
export function getGenreFromProfile(profile: string | null | undefined): string;
export function detectVariantFromScores(
  scores: Record<string, unknown> | null | undefined,
): PromptVariant;
export function getAspectValuesForProfile(
  aspect: VisualAspectDef,
  profile: string | null | undefined,
): readonly string[];
export function buildVisualAspectsOptions(
  hiddenKeys?: string[],
  profile?: string | null,
): unknown[];
