/**
 * Shared types for the geo-recovery anonymous flow.
 * Mirrors the backend service types (kept in sync manually — both files are small).
 */

export type LocationReliability =
  | "very_likely"
  | "likely"
  | "uncertain"
  | "unknown";
export type LocationGranularity = "place" | "city" | "region" | "country";
export type GeoRecoveryJobStatus = "running" | "completed" | "failed";
export type GeoRecoveryProgressStage =
  | "preparing"
  | "inferring"
  | "placing"
  | "completed"
  | "failed";

export interface SessionInfo {
  sessionToken: string;
  sessionId: string;
  maxPhotos: number;
  allowedMimeTypes: readonly string[];
}

export interface PhotoEntry {
  clientPhotoId: string;
  r2Key: string;
  mime: string;
  originalName: string;
  takenAtMs: number | null;
}

export interface GeoRecoveryJobState {
  jobId: string;
  sessionId: string;
  status: GeoRecoveryJobStatus;
  total: number;
  processed: number;
  located: number;
  unknown: number;
  uncertain: number;
  geocodeMiss: number;
  failed: number;
  proximitySaved: number;
  llmInferred: number;
  progressPercent: number;
  progressStage: GeoRecoveryProgressStage;
  startedAtMs: number;
  updatedAtMs: number;
  finishedAtMs: number | null;
  error?: string;
}

export interface LocatedResult {
  status: "located";
  source: "llm" | "proximity";
  reliability: LocationReliability;
  granularity: LocationGranularity;
  lat: number;
  lng: number;
  place?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

export interface NoLocationResult {
  status: "no_location";
  reason: "unknown" | "low_reliability" | "geocode_miss";
}

export interface FailedResult {
  status: "failed";
  error: string;
}

export type GeoRecoveryResult = LocatedResult | NoLocationResult | FailedResult;

export type GeoRecoveryResultsMap = Record<string, GeoRecoveryResult>;

// ── Front-end preview (before backend upload) ───────────────────────────────

export interface PreviewPhoto {
  /** Stable client-side UUID, generated on file selection. */
  id: string;
  file: File;
  /** Object URL for display — must be revoked when the preview is removed. */
  previewUrl: string;
  name: string;
  addedAt: number;
}

// ── Client-local (IndexedDB) ────────────────────────────────────────────────

export interface LocalPhotoRecord {
  clientPhotoId: string;
  /** Original file bytes — never leaves this browser. */
  originalBlob: Blob;
  originalName: string;
  originalMime: string; // image/jpeg | image/png
  takenAtMs: number | null;
  /** R2 key for the uploaded thumb (cleared from the server at 7 days). */
  r2Key: string;
  /** Public URL of the R2 thumbnail, returned by the registerPhotos endpoint. */
  thumbUrl?: string | null;
  /** Monotonically increasing timestamp (batchStartMs + fileIndex) for stable grid ordering. */
  addedAt?: number;
  /** Manual coord override entered by the user, if any. */
  manualLat?: number;
  manualLng?: number;
}
