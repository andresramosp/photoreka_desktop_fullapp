/**
 * Scheduler for automatic photo deletion
 *
 * This scheduler runs periodically to physically delete soft-deleted photos.
 * Configure the interval using environment variables.
 */

import PhotoDeletionService from '#services/photo_deletion_service'
import logger from '@adonisjs/core/services/logger'

// Configuration from environment variables
const DELETION_INTERVAL_HOURS = Number(process.env.PHOTO_DELETION_INTERVAL_HOURS || 24) // Default: daily
const DELETION_BATCH_SIZE = Number(process.env.PHOTO_DELETION_BATCH_SIZE || 50)
const DELETION_ENABLED = process.env.PHOTO_DELETION_ENABLED !== 'false' // Default: enabled

logger.info('[PhotoDeletionScheduler] ========================================')
logger.info('[PhotoDeletionScheduler] Photo Deletion Scheduler initialized')
logger.info(`[PhotoDeletionScheduler] Enabled: ${DELETION_ENABLED}`)
logger.info(`[PhotoDeletionScheduler] Interval: Every ${DELETION_INTERVAL_HOURS} hours`)
logger.info(`[PhotoDeletionScheduler] Batch size: ${DELETION_BATCH_SIZE}`)
logger.info('[PhotoDeletionScheduler] ========================================')

if (DELETION_ENABLED) {
  // Execute immediately on startup (optional)
  if (process.env.PHOTO_DELETION_RUN_ON_STARTUP === 'true') {
    logger.info('[PhotoDeletionScheduler] Running initial deletion on startup...')
    PhotoDeletionService.deletePhysically(DELETION_BATCH_SIZE, false).catch((error) => {
      logger.error('[PhotoDeletionScheduler] Error in startup deletion:', error)
    })
  }

  // Schedule periodic execution
  const intervalMs = 10000 //; DELETION_INTERVAL_HOURS * 60 * 60 * 1000
  setInterval(async () => {
    try {
      logger.info('[PhotoDeletionScheduler] Starting scheduled photo deletion...')
      await PhotoDeletionService.deletePhysically(DELETION_BATCH_SIZE, false)
      logger.info('[PhotoDeletionScheduler] Scheduled photo deletion completed')
    } catch (error) {
      logger.error('[PhotoDeletionScheduler] Error in scheduled deletion:', error)
    }
  }, intervalMs)

  logger.info(`[PhotoDeletionScheduler] Next execution in ${DELETION_INTERVAL_HOURS} hour(s)`)
} else {
  logger.warn('[PhotoDeletionScheduler] Photo deletion scheduler is DISABLED')
  logger.warn('[PhotoDeletionScheduler] Set PHOTO_DELETION_ENABLED=true to enable it')
}
