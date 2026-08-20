/** Tipos del regularizador de scores (backend: app/services/score_smoothing_service.ts). */

export type NeighborStrategy = "clip" | "dhash" | "both";

/**
 * Cuánto se deja corregir al grupo, de más a menos agresivo:
 *  - `duplicate` = el mismo archivo dos veces, nada las distingue → se colapsan.
 *  - `default`   = misma toma y mismo revelado (ráfaga).
 *  - `version`   = misma captura pero alguien tocó el color, así que la diferencia
 *                  puede ser intencionada y apenas se corrige.
 */
export type CriterionProfileMode = "duplicate" | "default" | "version";

export interface PreviewPhoto {
  id: number;
  thumbnailUrl: string | null;
  originalFileName: string | null;
  neighbors: number;
  /** Los demás miembros del grupo: todos son vecinos suyos. */
  neighborIds: number[];
  avgSim: number;
  /** Valores originales del LLM (`artistic_scores_raw`). */
  before: Record<string, number>;
  /** Valores que escribiría esta pasada. */
  after: Record<string, number>;
  /**
   * Valores que hay escritos ahora mismo (`artistic_scores`). Comparado con `after`
   * es lo único que separa una foto ya hecha de una que falta por aplicar.
   */
  current: Record<string, number>;
}

/** Grupo de casi-duplicados: todas sus fotos son vecinas entre sí. */
export interface PreviewGroup {
  size: number;
  avgSim: number;
  changedPhotos: number;
  totalShift: number;
  mode: CriterionProfileMode;
  photos: PreviewPhoto[];
}

export interface CriterionStat {
  criterion: string;
  photosMoved: number;
  avgAbsShift: number;
  maxAbsShift: number;
  crossedSeven: number;
  noiseSigma: number | null;
  noiseSamples: number;
}

export interface SmoothingReport {
  userId: number;
  dryRun: boolean;
  strategy: NeighborStrategy;
  threshold: number;
  version: string;
  photosWithScores: number;
  photosInGraph: number;
  groups: number;
  duplicateGroups: number;
  versionGroups: number;
  largestGroup: number;
  /** Fotos que esta pasada escribiría, o sea: las que FALTAN por aplicar. */
  photosChanged: number;
  barsChanged: number;
  iterations: number;
  converged: boolean;
  perCriterion: CriterionStat[];
  simHistogram: Record<string, number>;
  durationMs: number;
  previewGroups?: PreviewGroup[];
}
