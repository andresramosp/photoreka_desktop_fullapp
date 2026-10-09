// Own axios instance on purpose, like geoRecovery/api.ts: the shared one injects
// the logged-in user's token and global notifications; Picks authenticates with
// the signed order token instead.

import axios, { type AxiosInstance } from "axios";
import type { PicksGenreKey } from "@/config/picks";
import type { PicksScores } from "./types";

export interface PicksSessionInfo {
  id: string;
  status: "open" | "processing" | "completed" | "failed";
  orderedCount: number;
  paidCount: number | null;
  paid: boolean;
  isFree: boolean;
  uploadCompleted: boolean;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
}

export interface PicksCounts {
  registered: number;
  pending: number;
  judged: number;
  failed: number;
  /** Exact copies, processed through the photo they duplicate. */
  duplicate: number;
}

export interface PicksServerPhoto {
  clientPhotoId: string;
  name: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  scores: PicksScores | null;
  critique: string | null;
  genres: PicksGenreKey[] | null;
  judgedAt: string | null;
  duplicates: string[];
}

export interface PicksStatusResponse {
  session: PicksSessionInfo;
  counts: PicksCounts;
  photos: PicksServerPhoto[];
  cursor: string | null;
}

let instance: AxiosInstance | null = null;
const client = () =>
  (instance ??= axios.create({ baseURL: import.meta.env.VITE_MAIN_API_BASE_URL }));
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export async function createSession(photoCount: number) {
  const { data } = await client().post("/api/picks/session", { photoCount });
  return data as { sessionToken: string; session: PicksSessionInfo };
}

export async function createFreeSession(photoCount: number) {
  const { data } = await client().post("/api/picks/free-session", { photoCount });
  return data as { sessionToken: string; session: PicksSessionInfo };
}

export async function createPaymentIntent(token: string, photoCount: number) {
  const { data } = await client().post("/api/picks/payment-intent", { photoCount }, auth(token));
  return data as { clientSecret: string; amountEur: number };
}

export async function confirmPayment(
  token: string,
  stripePaymentIntentId: string,
  customerEmail: string,
) {
  const { data } = await client().post(
    "/api/picks/confirm-payment",
    { stripePaymentIntentId, customerEmail },
    auth(token),
  );
  return data as { session: PicksSessionInfo };
}

export async function getUploadUrls(
  token: string,
  photos: { clientPhotoId: string; contentType: string }[],
) {
  const { data } = await client().post("/api/picks/upload-urls", { photos }, auth(token));
  return data.urls as Record<string, { uploadUrl: string; r2Key: string }>;
}

export async function registerPhotos(
  token: string,
  photos: {
    clientPhotoId: string;
    r2Key: string;
    originalName: string;
    width: number;
    height: number;
    duplicateOf?: string;
  }[],
) {
  const { data } = await client().post("/api/picks/photos", { photos }, auth(token));
  return data as { accepted: number; rejected: number };
}

export async function markUploadComplete(token: string) {
  await client().post("/api/picks/upload-complete", {}, auth(token));
}

export async function getStatus(token: string, since: string | null) {
  const { data } = await client().get("/api/picks/status", {
    ...auth(token),
    params: since ? { since } : {},
  });
  return data as PicksStatusResponse;
}

export async function getResults(token: string) {
  const { data } = await client().get("/api/picks/results", auth(token));
  return data as { session: PicksSessionInfo; counts: PicksCounts; photos: PicksServerPhoto[] };
}

export async function uploadBlobToR2(uploadUrl: string, blob: Blob): Promise<void> {
  // The signature covers the content type, so the header must match it exactly.
  await axios.put(uploadUrl, blob, {
    headers: { "Content-Type": blob.type },
    transformRequest: [(body) => body],
  });
}

/** The API's own error message when there is one. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as any)?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}
