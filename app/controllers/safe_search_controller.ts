import type { HttpContext } from '@adonisjs/core/http'
import axios from 'axios'
import UserCostService from '#services/user_cost_service'
import { USD_TO_EUR } from '#services/models_service'
import User from '#models/user'
import type { ContentViolation } from '#models/user'
import MailService from '#services/mail_service'
import { contentViolationAdminTemplate } from '../utils/email_templates.js'
import PhotoManager from '../managers/photo_manager.js'

/**
 * Users with at least this many processed photos are considered trusted
 * enough to not be auto-deactivated on a safe-search violation — they only
 * get the upload-blocked notice, admin is still alerted.
 */
const TRUSTED_USER_PROCESSED_PHOTO_THRESHOLD = 200

/** Google Vision Safe Search Detection price: $1.50 per 1,000 images. */
const SAFE_SEARCH_COST_USD_PER_IMAGE = 0.0015

/** Vision API accepts at most 16 images per annotate request. */
const MAX_IMAGES_PER_REQUEST = 16

/**
 * Maximum base64 length accepted per image (~150 KB decoded).
 * Prevents oversized payloads from reaching the Vision API.
 */
const MAX_BASE64_LENGTH = 200_000

/**
 * Declarative moderation rules.
 *
 * - threshold: which likelihood values are considered violations
 * - perImage: if true → any single image triggers violation
 * - batchThreshold: % of images required to trigger violation (0–1)
 */
const MODERATION_RULES = {
  adult: {
    threshold: new Set(['VERY_LIKELY']),
    perImage: true,
  },
  violence: {
    threshold: new Set(['VERY_LIKELY']),
    perImage: true,
  },
  spoof: {
    threshold: new Set(['VERY_LIKELY']),
    batchThreshold: 0.75, // ← configurable (ej: 30% del lote)
  },
} as const

type ModerationField = keyof typeof MODERATION_RULES

export default class SafeSearchController {
  public async check({ request, response, auth }: HttpContext) {
    try {
      const user = await auth.use('api').authenticate()

      const apiKey = process.env.GOOGLE_VISION_API_KEY
      if (!apiKey) {
        return response.ok({ passed: true, skipped: true })
      }

      const { images, photoIds } = request.only(['images', 'photoIds'])

      if (!images || !Array.isArray(images) || images.length === 0) {
        return response.badRequest({ message: 'No images provided' })
      }

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

      // Cost tracking (optional)
      // const costInEur = imagesToCheck.length * SAFE_SEARCH_COST_USD_PER_IMAGE * USD_TO_EUR
      // UserCostService.record(user.id, 'other', costInEur, imagesToCheck.length, {
      //   model: 'google-vision-safe-search',
      //   task: 'safe_search_detection',
      // }).catch(() => {})

      const violations: { imageIndex: number; reasons: string[] }[] = []

      // Contadores por campo (para batch rules)
      const batchCounters: Record<ModerationField, number> = {
        adult: 0,
        violence: 0,
        spoof: 0,
      }

      results.forEach((result, index) => {
        const annotation = result.safeSearchAnnotation
        if (!annotation) return

        const reasons: string[] = []

        for (const field of Object.keys(MODERATION_RULES) as ModerationField[]) {
          const rule = MODERATION_RULES[field]
          const value = annotation[field]

          if (rule.threshold.has(value)) {
            batchCounters[field]++

            if (rule.perImage) {
              reasons.push(field)
            }
          }
        }

        if (reasons.length > 0) {
          violations.push({ imageIndex: index, reasons })
        }
      })

      // Evaluación batch (ej: spoof)
      const batchViolations: string[] = []

      for (const field of Object.keys(MODERATION_RULES) as ModerationField[]) {
        const rule = MODERATION_RULES[field]

        if (rule.batchThreshold !== undefined) {
          const ratio = batchCounters[field] / imagesToCheck.length

          if (ratio >= rule.batchThreshold) {
            batchViolations.push(field)
          }
        }
      }

      const passed = violations.length === 0 && batchViolations.length === 0
      let userDeactivated = false

      // Record violation and deactivate user if content policy was violated
      if (!passed) {
        const allReasons = [...new Set(violations.flatMap((v) => v.reasons))]
        const clientIp =
          request.header('x-forwarded-for')?.split(',')[0]?.trim() || request.ip() || 'unknown'

        const violation: ContentViolation = {
          date: new Date().toISOString(),
          reasons: allReasons,
          batchViolations,
          photoIds: Array.isArray(photoIds)
            ? (photoIds as unknown[]).filter((id): id is number => typeof id === 'number')
            : [],
          ip: clientIp,
        }

        let fullUser: User | null = null
        try {
          fullUser = await User.find(user.id)
          if (fullUser) {
            const processedPhotoCount = await new PhotoManager().getProcessedPhotoCount(
              String(user.id)
            )
            const existing = fullUser.contentViolations ?? []
            fullUser.contentViolations = [...existing, violation]
            // Only deactivate trusted-enough-yet-still-under-threshold users.
            // Users with enough processed photos keep their account active —
            // the offending batch is simply rejected and admin is notified.
            if (processedPhotoCount < TRUSTED_USER_PROCESSED_PHOTO_THRESHOLD) {
              fullUser.isActive = false
              userDeactivated = true
            }
            await fullUser.save()
          }
        } catch (recordingError) {
          console.error('Failed to record content violation for user', user.id, recordingError)
        }

        // Notify admin
        try {
          await new MailService().sendEmail({
            from: 'Photoreka <hello@photoreka.com>',
            to: 'andreschennai@gmail.com',
            subject: `⚠ Content Policy Violation — User ${user.id}`,
            body: contentViolationAdminTemplate({
              userId: user.id,
              userName: fullUser?.name ?? 'Unknown',
              userEmail: fullUser?.email ?? (user as any).email ?? 'Unknown',
              reasons: allReasons,
              batchViolations,
              photoIds: violation.photoIds,
              ip: violation.ip,
              date: violation.date,
              totalImages: imagesToCheck.length,
              userDeactivated,
            }),
          })
        } catch (notifyError) {
          console.error('Failed to send content violation admin email', notifyError)
        }
      }

      return response.ok({
        passed,
        violations,
        batchViolations,
        userDeactivated,
        stats: {
          total: imagesToCheck.length,
          counts: batchCounters,
        },
      })
    } catch (error) {
      console.error('Safe search check failed:', error)
      return response.ok({ passed: true, skipped: true })
    }
  }
}
