/**
 * Thin axios client for the anonymous geo-recovery API.
 *
 * We DO NOT use the shared `api` instance from `@/utils/axios` because that one:
 *   - Injects the authenticated user's Bearer token (we want the geo-recovery token instead)
 *   - Surfaces global notifications (we want fine-grained control on this flow)
 *
 * The token is stored in IndexedDB and passed in `Authorization` per call.
 */

import axios, { type AxiosInstance } from "axios";

import type {
  GeoRecoveryJobState,
  GeoRecoveryResultsMap,
  PhotoEntry,
  SessionInfo,
} from "./types";

let _instance: AxiosInstance | null = null;
function client(): AxiosInstance {
  if (_instance) return _instance;
  _instance = axios.create({
    baseURL: import.meta.env.VITE_MAIN_API_BASE_URL,
  });
  return _instance;
}

export async function createSession(): Promise<SessionInfo> {
  const { data } = await client().post("/api/geo-recovery/session");
  return {
    sessionToken: data.sessionToken,
    sessionId: data.sessionId,
    maxPhotos: data.maxPhotos,
    allowedMimeTypes: data.allowedMimeTypes,
  };
}

export async function getUploadUrl(
  token: string,
  clientPhotoId: string,
  contentType: string,
): Promise<{ uploadUrl: string; r2Key: string }> {
  const { data } = await client().post(
    "/api/geo-recovery/upload-url",
    { clientPhotoId, contentType },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function registerPhotos(
  token: string,
  photos: PhotoEntry[],
): Promise<{ photoCount: number; photoUrls: Record<string, string> }> {
  const { data } = await client().post(
    "/api/geo-recovery/photos",
    { photos },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return { photoCount: data.photoCount, photoUrls: data.photoUrls ?? {} };
}

export async function mockPay(token: string): Promise<void> {
  await client().post(
    "/api/geo-recovery/mock-pay",
    {},
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export async function startJob(token: string): Promise<GeoRecoveryJobState> {
  const { data } = await client().post(
    "/api/geo-recovery/start_",
    {},
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data.job;
}

export async function pollJob(token: string): Promise<{
  job: GeoRecoveryJobState | null;
  results: GeoRecoveryResultsMap;
}> {
  const { data } = await client().get("/api/geo-recovery/job", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

export async function uploadBlobToR2(
  uploadUrl: string,
  blob: Blob,
): Promise<void> {
  // The upload-worker signature already encodes the contentType, so we MUST
  // send the exact same value as the Content-Type header.
  await axios.put(uploadUrl, blob, {
    headers: { "Content-Type": blob.type },
    // Pre-signed URL: do NOT forward auth headers
    transformRequest: [(d) => d],
  });
}

// ── Geocoding (correction popup) ────────────────────────────────────────────

export interface GeocodingSuggestion {
  mapbox_id: string;
  name: string;
  place_formatted?: string;
  full_address?: string;
}

export async function geocodingSuggest(
  token: string,
  query: string,
  sessionToken: string,
): Promise<{ suggestions: GeocodingSuggestion[] }> {
  const { data } = await client().post(
    "/api/geo-recovery/geocoding/suggest",
    { query, session_token: sessionToken },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}

export async function geocodingRetrieve(
  token: string,
  mapboxId: string,
  sessionToken: string,
): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
  placeId: string | null;
  granularity: string | null;
}> {
  const { data } = await client().post(
    "/api/geo-recovery/geocoding/retrieve",
    { mapbox_id: mapboxId, session_token: sessionToken },
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return data;
}
