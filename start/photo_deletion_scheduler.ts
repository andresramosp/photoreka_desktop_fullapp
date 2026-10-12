/**
 * Scheduler for automatic photo deletion
 *
 * Escritorio: las fotos se borran al momento; este programador reintenta los borrados que
 * fallaron y barre las subidas sin confirmar. Corre al arrancar, porque la app de escritorio
 * rara vez está abierta 12 horas seguidas, y después cada 12 horas.
 */

import PhotoDeletionService from '#services/photo_deletion_service'
import logger from '@adonisjs/core/services/logger'

// Helper to parse number from env (handles quotes from Railway)
function parseEnvNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue
  // Remove quotes if present
  const cleaned = value.replace(/^["']|["']$/g, '')
  const parsed = Number(cleaned)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

// Configuration from environment variables
const DELETION_INTERVAL_HOURS = parseEnvNumber(process.env.PHOTO_DELETION_INTERVAL_HOURS, 12)
const DELETION_ENABLED = process.env.PHOTO_DELETION_ENABLED?.replace(/^["']|["']$/g, '') !== 'false'

// Orphan sweep: soft-deletes unconfirmed upload rows (confirmed = false) older
// than the age threshold. Enabled by default; never touches legacy (NULL) or
// confirmed photos.
const ORPHAN_SWEEP_ENABLED =
  process.env.ORPHAN_SWEEP_ENABLED?.replace(/^["']|["']$/g, '') !== 'false'
const ORPHAN_SWEEP_AGE_MINUTES = parseEnvNumber(process.env.ORPHAN_SWEEP_AGE_MINUTES, 15)

async function runSweepThenDelete() {
  if (ORPHAN_SWEEP_ENABLED) {
    try {
      await PhotoDeletionService.sweepUnconfirmedOrphans(ORPHAN_SWEEP_AGE_MINUTES, false)
    } catch (error) {
      logger.error('[PhotoDeletionScheduler] Error in orphan sweep:', error)
    }
  }
  await PhotoDeletionService.processPendingSoftDeleted(false)
}

logger.info('[PhotoDeletionScheduler] ========================================')
logger.info('[PhotoDeletionScheduler] Photo Deletion Scheduler initialized')
logger.info(`[PhotoDeletionScheduler] Enabled: ${DELETION_ENABLED}`)
logger.info(`[PhotoDeletionScheduler] Interval: Every ${DELETION_INTERVAL_HOURS} hours`)
logger.info(`[PhotoDeletionScheduler] Orphan sweep enabled: ${ORPHAN_SWEEP_ENABLED}`)
logger.info(`[PhotoDeletionScheduler] Orphan sweep age (min): ${ORPHAN_SWEEP_AGE_MINUTES}`)
logger.info(`[PhotoDeletionScheduler] Interval in ms: ${DELETION_INTERVAL_HOURS * 60 * 60 * 1000}`)
logger.info('[PhotoDeletionScheduler] ========================================')

if (DELETION_ENABLED) {
  // Validate interval
  if (DELETION_INTERVAL_HOURS <= 0) {
    logger.error(
      '[PhotoDeletionScheduler] ERROR: Invalid interval hours, must be > 0. Scheduler DISABLED.'
    )
  } else {
    logger.info('[PhotoDeletionScheduler] Running initial deletion on startup...')
    runSweepThenDelete().catch((error) => {
      logger.error('[PhotoDeletionScheduler] Error in startup deletion:', error)
    })

    // Schedule periodic execution
    const intervalMs = DELETION_INTERVAL_HOURS * 60 * 60 * 1000
    setInterval(async () => {
      try {
        logger.info('[PhotoDeletionScheduler] Starting scheduled photo deletion...')
        await runSweepThenDelete()
        logger.info('[PhotoDeletionScheduler] Scheduled photo deletion completed')
      } catch (error) {
        logger.error('[PhotoDeletionScheduler] Error in scheduled deletion:', error)
      }
    }, intervalMs)

    logger.info(`[PhotoDeletionScheduler] Next execution in ${DELETION_INTERVAL_HOURS} hour(s)`)
  }
} else {
  logger.warn('[PhotoDeletionScheduler] Photo deletion scheduler is DISABLED')
  logger.warn('[PhotoDeletionScheduler] Set PHOTO_DELETION_ENABLED=true to enable it')
}
