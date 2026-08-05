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
  before: Record<string, number>;
  after: Record<string, number>;
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

/** Foto ya corregida en base de datos (no una simulación). */
export interface AppliedPhoto {
  id: number;
  thumbnailUrl: string | null;
  originalFileName: string | null;
  /** Valores originales del LLM (`artistic_scores_raw`). */
  before: Record<string, number>;
  /** Valores corregidos, que son los que ve el usuario (`artistic_scores`). */
  after: Record<string, number>;
  /** Desplazamiento por criterio: `after - before`. */
  moved: Record<string, number>;
  totalShift: number;
}

export interface AppliedPage {
  photos: AppliedPhoto[];
  total: number;
  page: number;
  perPage: number;
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
  photosChanged: number;
  barsChanged: number;
  iterations: number;
  converged: boolean;
  perCriterion: CriterionStat[];
  simHistogram: Record<string, number>;
  durationMs: number;
  previewGroups?: PreviewGroup[];
}
