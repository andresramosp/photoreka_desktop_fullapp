/**
 * API client for the anonymous /assess endpoint.
 * Sends base64-encoded thumbnails and receives per-photo verdicts.
 */

import axios from "axios";

export interface AssessImageInput {
  /** Raw base64 data — no data-URI prefix. */
  data: string;
  mimeType: string;
}

export interface AssessPhotoResult {
  id: number;
  verdict: "plausible" | "discarded";
  reason: string;
}

export interface AssessmentSummary {
  results: AssessPhotoResult[];
  plausibleCount: number;
  discardedCount: number;
  total: number;
}

export async function assessPhotos(
  images: AssessImageInput[],
): Promise<AssessmentSummary> {
  const payload = {
    images: images.map((img, i) => ({
      id: i + 1,
      data: img.data,
      mimeType: img.mimeType,
    })),
  };

  const { data } = await axios.post(
    `${import.meta.env.VITE_MAIN_API_BASE_URL}/api/geo-recovery/assess`,
    payload,
  );
  return data as AssessmentSummary;
}
