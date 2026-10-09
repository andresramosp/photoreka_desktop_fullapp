/**
 * Resumes Picks sessions that a previous process left half-judged (deploy,
 * crash). Delayed so a rolling deploy's old instance can release its locks;
 * the Redis lock keeps two instances off the same session.
 */

import logger from '@adonisjs/core/services/logger'
import PicksJudgeService from '#services/picks/picks_judge_service'

const RESUME_DELAY_MS = 20_000

setTimeout(() => {
  new PicksJudgeService()
    .resumeInterrupted()
    .then((count) => {
      if (count > 0) logger.info(`[Picks] Resuming ${count} interrupted session(s)`)
    })
    .catch((error) => logger.error(`[Picks] Resume on boot failed: ${error?.message ?? error}`))
}, RESUME_DELAY_MS)
