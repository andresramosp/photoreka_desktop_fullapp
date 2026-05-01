import type { HttpContext } from '@adonisjs/core/http'
import axios from 'axios'
import UserCostService from '#services/user_cost_service'
import { USD_TO_EUR } from '#services/models_service'

/** Google Vision Safe Search Detection price: $1.50 per 1,000 images. */
const SAFE_SEARCH_COST_USD_PER_IMAGE = 0.0015

/** Likelihoods that trigger a violation. */
const VIOLATION_THRESHOLD = new Set(['VERY_LIKELY'])

/** Vision API fields we enforce. */
const CHECKED_FIELDS = ['adult', 'violence'] as const

/** Vision API accepts at most 16 images per annotate request. */
const MAX_IMAGES_PER_REQUEST = 16

/**
 * Maximum base64 length accepted per image (~150 KB decoded).
 * Prevents oversized payloads from reaching the Vision API.
 */
const MAX_BASE64_LENGTH = 200_000

export default class SafeSearchController {
  /**
   * Checks a batch of base64-encoded images against Google Vision Safe Search.
   * Fails open (passes) when the API key is not configured or the API is unavailable.
   *
   * POST /api/moderation/safe-search
   * Body: { images: string[] }  — pure base64, no data-URL prefix
   */
  public async check({ request, response, auth }: HttpContext) {
    try {
      const user = await auth.use('api').authenticate()

      const apiKey = process.env.GOOGLE_VISION_API_KEY
      if (!apiKey) {
        // Feature disabled – skip check and allow upload to proceed
        return response.ok({ passed: true, skipped: true })
      }

      const { images } = request.only(['images'])

      if (!images || !Array.isArray(images) || images.length === 0) {
        return response.badRequest({ message: 'No images provided' })
      }

      // Sanitise: cap count and reject oversized entries
      const imagesToCheck = (images as unknown[])
        .slice(0, MAX_IMAGES_PER_REQUEST)
        .filter((img): img is string => typeof img === 'string' && img.length <= MAX_BASE64_LENGTH)

      if (imagesToCheck.length === 0) {
        return response.badRequest({ message: 'No valid images provided' })
      }

      const visionRequests = imagesToCheck.map((base64) => ({
        image: { content: base64 },
        features: [{ type: 'SAFE_SEARCH_DETECTION', maxResults: 1 }],
      }))

      const visionResponse = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        { requests: visionRequests },
        { timeout: 15_000 }
      )

      const results = visionResponse.data.responses as Record<string, any>[]

      // Estimate and record cost (fire-and-forget)
      // const costInEur = imagesToCheck.length * SAFE_SEARCH_COST_USD_PER_IMAGE * USD_TO_EUR
      // UserCostService.record(user.id, 'other', costInEur, imagesToCheck.length, {
      //   model: 'google-vision-safe-search',
      //   task: 'safe_search_detection',
      // }).catch(() => {})

      const violations: { imageIndex: number; reasons: string[] }[] = []

      results.forEach((result, index) => {
        const annotation = result.safeSearchAnnotation
        if (!annotation) return

        const reasons: string[] = []
        for (const field of CHECKED_FIELDS) {
          if (VIOLATION_THRESHOLD.has(annotation[field])) {
            reasons.push(field)
          }
        }

        if (reasons.length > 0) {
          violations.push({ imageIndex: index, reasons })
        }
      })

      return response.ok({
        passed: violations.length === 0,
        violations,
      })
    } catch (error) {
      console.error('Safe search check failed:', error)
      // Fail open: if Vision API is unreachable, allow the upload to proceed
      return response.ok({ passed: true, skipped: true })
    }
  }
}
