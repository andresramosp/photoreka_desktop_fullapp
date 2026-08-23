import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'
import ScoreSmoothingService, { type SmoothingReport } from '#services/score_smoothing_service'
import {
  SMOOTHING_CONFIG,
  SMOOTHING_VERSION,
  getNeighborStrategy,
  type NeighborStrategy,
} from '#config/score_smoothing'

/**
 * Regularizador de scores artísticos.
 *
 *   node ace scores:regularize --user-id=42 --dry-run
 *   node ace scores:regularize --user-id=42
 *   node ace scores:regularize --all-users
 *   node ace scores:regularize --user-id=42 --revert   # vuelve al original del LLM
 */
export default class RegularizeScores extends BaseCommand {
  static commandName = 'scores:regularize'
  static description =
    'Regulariza artistic_scores entre fotos casi idénticas (idempotente: siempre recalcula desde el original del LLM)'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.number({ description: 'Usuario a procesar' })
  declare userId?: number

  @flags.boolean({
    description: 'Procesar todos los usuarios con fotos analizadas',
    default: false,
  })
  declare allUsers: boolean

  @flags.boolean({ description: 'Calcular y reportar sin escribir nada', default: false })
  declare dryRun: boolean

  @flags.boolean({
    description: 'Devolver los scores originales del LLM, sin recalcular',
    default: false,
  })
  declare revert: boolean

  @flags.string({
    description: "Método de vecindad: 'clip' (por defecto), 'dhash' o 'both'",
  })
  declare strategy?: string

  @flags.boolean({ description: 'Saltar la confirmación', default: false })
  declare force: boolean

  async run() {
    if (!this.userId && !this.allUsers) {
      this.logger.error('Indica --user-id=N o --all-users')
      return
    }

    const service = new ScoreSmoothingService()
    const userIds = this.userId ? [this.userId] : await this.findUsersWithScores()

    if (userIds.length === 0) {
      this.logger.info('No hay usuarios con scores que procesar.')
      return
    }

    // ── Modo revertir: copia el original encima, sin recalcular ──
    if (this.revert) {
      if (
        !(await this.confirm(
          `Devolver los scores originales del LLM a ${userIds.length} usuario(s)?`
        ))
      ) {
        return
      }

      let total = 0
      for (const userId of userIds) {
        const { photosAffected } = await service.revert(userId)
        total += photosAffected
        if (photosAffected > 0) {
          this.logger.info(`Usuario ${userId}: ${photosAffected} fotos revertidas`)
        }
      }
      this.logger.success(`${total} fotos devueltas al original del LLM.`)
      return
    }

    // ── Modo normal ──
    if (this.strategy && !['clip', 'dhash', 'both'].includes(this.strategy)) {
      this.logger.error(`--strategy debe ser 'clip', 'dhash' o 'both' (recibido: ${this.strategy})`)
      return
    }
    const strategy = (this.strategy as NeighborStrategy) ?? getNeighborStrategy()
    const gate =
      strategy === 'dhash'
        ? `hamming ≤ ${SMOOTHING_CONFIG.dhashThreshold}`
        : `coseno ≥ ${SMOOTHING_CONFIG.simThreshold}`
    this.logger.info(
      `Motor ${SMOOTHING_VERSION} | vecindad: ${strategy} (${gate}) | k=${SMOOTHING_CONFIG.k}`
    )
    if (this.dryRun) {
      this.logger.info('DRY RUN: no se escribirá nada en base de datos.')
    } else if (
      !(await this.confirm(
        `Se recalcularán los scores de ${userIds.length} usuario(s) desde el original del LLM. Continuar?`
      ))
    ) {
      return
    }

    let lastLogged = 0
    service.onGraphProgress = (done, total) => {
      if (done === total || done - lastLogged >= 2000) {
        lastLogged = done
        this.logger.info(`  grafo: ${done}/${total} fotos`)
      }
    }

    for (const userId of userIds) {
      lastLogged = 0
      const report = await service.runForUser(userId, { dryRun: this.dryRun, strategy })
      this.printReport(report)
    }
  }

  private async confirm(message: string): Promise<boolean> {
    if (this.force) return true
    const confirmed = await this.prompt.confirm(message)
    if (!confirmed) this.logger.info('Abortado.')
    return confirmed
  }

  private async findUsersWithScores(): Promise<number[]> {
    const result = await db.rawQuery(
      `SELECT DISTINCT user_id
       FROM photos
       WHERE deleted_at IS NULL
         AND descriptions->'artistic_scores' IS NOT NULL
       ORDER BY user_id`
    )
    return result.rows.map((row: any) => Number(row.user_id))
  }

  private printReport(report: SmoothingReport) {
    const pct = (n: number, total: number) =>
      total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—'

    this.logger.log('')
    this.logger.log(
      `── Usuario ${report.userId} · vecindad ${report.strategy} ${report.dryRun ? '(simulación)' : ''} ────────────────`
    )
    this.logger.log(`Fotos con scores       : ${report.photosWithScores}`)
    this.logger.log(
      `En grupos de duplicados: ${report.photosInGraph} (${pct(report.photosInGraph, report.photosWithScores)}) ` +
        `· ${report.groups} grupos · mayor: ${report.largestGroup}`
    )
    this.logger.log(
      `Perfil de los grupos   : ${report.duplicateGroups} duplicados exactos · ` +
        `${report.versionGroups} revelados distintos · ` +
        `${report.groups - report.duplicateGroups - report.versionGroups} ráfagas`
    )
    if (report.sameFilePairs > 0) {
      this.logger.log(
        `Duplicados por bytes   : ${report.sameFilePairs} parejas sin EXIF rescatadas ` +
          `comparando la miniatura en R2`
      )
    }
    if (report.clipRejectedPairs > 0) {
      this.logger.log(
        `Verificación CLIP      : ${report.clipRejectedPairs} parejas descartadas ` +
          `(coseno < ${SMOOTHING_CONFIG.clipVerifyThreshold})`
      )
    }
    this.logger.log(
      `Fotos ajustadas        : ${report.photosChanged} (${pct(report.photosChanged, report.photosWithScores)}) ` +
        `· ${report.barsChanged} barras`
    )
    this.logger.log(
      `Convergencia           : ${report.iterations} iteraciones${report.converged ? '' : ' (SIN CONVERGER)'} · ${report.durationMs} ms`
    )
    this.logger.log(`Similitudes            : ${JSON.stringify(report.simHistogram)}`)

    if (report.perCriterion.length > 0) {
      this.logger.log('')
      this.logger.log('criterio          | fotos | medio | máx  | cruzan 7.0 | σ ruido LLM (n)')
      for (const stat of report.perCriterion) {
        this.logger.log(
          [
            stat.criterion.padEnd(17),
            String(stat.photosMoved).padStart(5),
            stat.avgAbsShift.toFixed(2).padStart(5),
            stat.maxAbsShift.toFixed(2).padStart(4),
            String(stat.crossedSeven).padStart(10),
            `${stat.noiseSigma ?? '—'} (${stat.noiseSamples})`,
          ].join(' | ')
        )
      }
    }

    if (report.topMovers.length > 0) {
      this.logger.log('')
      this.logger.log('Mayores movimientos:')
      for (const mover of report.topMovers.slice(0, 15)) {
        this.logger.log(
          `  foto ${String(mover.photoId).padStart(7)} · ${mover.criterion.padEnd(17)} ` +
            `${mover.from.toFixed(1)} → ${mover.to.toFixed(1)} (${mover.delta > 0 ? '+' : ''}${mover.delta.toFixed(1)}) ` +
            `· ${mover.neighbors} vecinos · sim ${mover.avgSim.toFixed(3)}`
        )
      }
    }
    this.logger.log('')
  }
}
