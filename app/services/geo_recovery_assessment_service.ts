/**
 * GeoRecoveryAssessmentService
 *
 * Lightweight, anonymous LLM-based pre-flight check: given a small batch of
 * uploaded images (base64, max 10), asks Gemini to classify each one as
 * "plausible" or "discarded" for geographic location inference.
 *
 * Applies the same criteria as LocationGeolocatabilityService — outdoor vs
 * indoor, natural vs artificial light, wide shot vs extreme close-up, etc. —
 * but uses vision AI instead of pre-computed visual_aspects since the photos
 * come straight from the browser.
 *
 * No session / auth / R2 required. Meant to be called from the Welcome step
 * before the user commits to paying.
 */

import pLimit from 'p-limit'
import ModelsService from '#services/models_service'
import type { ModelName } from '#services/models_service'

export const ASSESS_MAX_PHOTOS = 10
const ASSESS_BATCH_SIZE = 2
const ASSESS_BATCH_CONCURRENCY = 2
const ASSESS_MAX_RETRIES = 3
const ASSESS_RETRY_BASE_DELAY_MS = 1000
const ASSESS_MODEL: ModelName = 'gemini-2.5-flash-lite'

const ASSESS_SYSTEM_PROMPT = `You are an expert photo analyst. Your task is to decide whether a photograph contains enough visual information for an AI to infer its geographic location.

Ask yourself one question: "Could a geolocation AI extract any meaningful location signal from this image?" If yes → "plausible". If no → "discarded".

A photo is "discarded" when ALL of the following apply simultaneously:
1. The subject fills the frame so completely that no surrounding environment, background, or setting is visible.
2. The subject itself carries no inherent geographic identity — it could exist in any city, country, or region on Earth.
3. There are no secondary elements in the frame (ground, walls, sky, vegetation, signage, other objects, people, shadows, reflections) that could anchor the image to a place.

A photo is also "discarded" if the image is technically unreadable — so dark, overexposed, or degraded that a human cannot identify what is being depicted.

A photo is "plausible" the moment ANY of these are present: a recognizable setting or environment (even partial), architecture, natural landscape, street elements, cultural objects, lighting that implies a specific context, people in a scene, or any background detail however small.

Return JSON: {"results": [{"id": <number>, "verdict": "plausible"|"discarded", "reason": "<max 100 chars>"}]}`

// ── Public types ──────────────────────────────────────────────────────────────

export interface AssessPhotoInput {
  id: number
  /** Base64-encoded image data — no data-URI prefix, raw base64 only. */
  data: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface AssessPhotoResult {
  id: number
  verdict: 'plausible' | 'discarded'
  /** Brief explanation from the model, max 120 chars. */
  reason: string
}

export interface AssessmentSummary {
  results: AssessPhotoResult[]
  plausibleCount: number
  discardedCount: number
  total: number
}

// ── Service ───────────────────────────────────────────────────────────────────

export default class GeoRecoveryAssessmentService {
  private modelsService = new ModelsService()

  public async assess(images: AssessPhotoInput[]): Promise<AssessmentSummary> {
    const batches = chunk(images, ASSESS_BATCH_SIZE)
    const limit = pLimit(ASSESS_BATCH_CONCURRENCY)
    const allResults: AssessPhotoResult[] = []

    await Promise.all(
      batches.map((batch) =>
        limit(async () => {
          let batchResults: AssessPhotoResult[]
          try {
            batchResults = await this.assessBatch(batch)
          } catch (error) {
            console.warn('[GeoRecoveryAssessment] Batch failed, defaulting to plausible:', error)
            batchResults = batch.map((img) => ({
              id: img.id,
              verdict: 'plausible' as const,
              reason: 'Assessment unavailable',
            }))
          }
          allResults.push(...batchResults)
        })
      )
    )

    allResults.sort((a, b) => a.id - b.id)

    const plausibleCount = allResults.filter((r) => r.verdict === 'plausible').length
    const discardedCount = allResults.filter((r) => r.verdict === 'discarded').length

    return { results: allResults, plausibleCount, discardedCount, total: allResults.length }
  }

  private async assessBatch(images: AssessPhotoInput[]): Promise<AssessPhotoResult[]> {
    const userContent: any[] = [
      {
        type: 'text',
        text: 'Classify each photo below. Return only the JSON object.',
      },
    ]

    for (const img of images) {
      userContent.push({ type: 'text', text: `[photo id:${img.id}]` })
      userContent.push({ inlineData: { mimeType: img.mimeType, data: img.data } })
    }

    const response = await this.callWithRetry(userContent)
    return this.normalizeResults(images, response?.result)
  }

  private async callWithRetry(userContent: any[]): Promise<any> {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= ASSESS_MAX_RETRIES; attempt++) {
      try {
        const result = await this.modelsService.getGeminiResponse(
          ASSESS_SYSTEM_PROMPT,
          userContent,
          ASSESS_MODEL,
          { temperature: 0.1 },
          false,
          true,
          { thinkingBudget: 0 }
        )
        if (!result?.result) throw new Error('LLM returned an empty response')
        return result
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt === ASSESS_MAX_RETRIES) break
        const delay = ASSESS_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
    throw lastError ?? new Error('Assessment failed after retries')
  }

  private normalizeResults(images: AssessPhotoInput[], raw: any): AssessPhotoResult[] {
    const source = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : []
    const byId = new Map<number, AssessPhotoResult>()

    for (const item of source) {
      const id = Number(item?.id)
      if (!Number.isFinite(id)) continue
      const verdict: 'plausible' | 'discarded' =
        item?.verdict === 'discarded' ? 'discarded' : 'plausible'
      const reason = typeof item?.reason === 'string' ? item.reason.slice(0, 120) : ''
      byId.set(id, { id, verdict, reason })
    }

    // Fill in any ids the model dropped (benefit of the doubt → plausible)
    return images.map((img) => byId.get(img.id) ?? { id: img.id, verdict: 'plausible', reason: '' })
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
