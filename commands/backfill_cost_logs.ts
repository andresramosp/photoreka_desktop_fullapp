import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import CostLog from '#models/cost_log'

export default class BackfillCostLogs extends BaseCommand {
  static commandName = 'costs:backfill'
  static description = 'Backfill cost_logs table from existing analyzer_processes.cost_report data'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('Starting cost_logs backfill from analyzer_processes...')

    const existing = await CostLog.query().where('category', 'photo_analysis').first()
    if (existing) {
      this.logger.warning(
        'cost_logs already contains photo_analysis entries. Skipping to avoid duplicates.'
      )
      this.logger.info('To re-run, delete existing photo_analysis entries first.')
      return
    }

    const processes = await AnalyzerProcess.query()
      .where('isPreprocess', false)
      .whereNotNull('user_id')
      .whereNotNull('cost_report')
      .select('id', 'userId', 'costReport', 'createdAt')

    let inserted = 0

    for (const p of processes) {
      const report = p.costReport as {
        totalCostInEur?: number
        totalCalls?: number
        category?: string
        byModel?: Record<string, { costInEur: number; calls: number }>
        byTask?: Record<string, { costInEur: number; calls: number }>
      } | null

      if (!report || !report.totalCostInEur || report.totalCostInEur <= 0) continue

      // Insert one row per model for granular tracking
      if (report.byModel && Object.keys(report.byModel).length > 0) {
        for (const [model, data] of Object.entries(report.byModel)) {
          // Find dominant task for this model
          const taskEntries = Object.entries(report.byTask ?? {})
          const task =
            taskEntries.length > 0
              ? taskEntries.sort((a, b) => b[1].costInEur - a[1].costInEur)[0][0]
              : null

          await CostLog.create({
            userId: p.userId!,
            category: 'photo_analysis',
            costInEur: Math.round(data.costInEur * 1_000_000) / 1_000_000,
            calls: data.calls,
            model,
            task,
            referenceId: p.id,
            metadata: { backfilled: true, byTask: report.byTask },
            createdAt: p.createdAt,
          })
          inserted++
        }
      } else {
        // No model breakdown — insert as single entry
        await CostLog.create({
          userId: p.userId!,
          category: 'photo_analysis',
          costInEur: Math.round(report.totalCostInEur * 1_000_000) / 1_000_000,
          calls: report.totalCalls ?? 1,
          model: null,
          task: null,
          referenceId: p.id,
          metadata: { backfilled: true },
          createdAt: p.createdAt,
        })
        inserted++
      }
    }

    this.logger.success(
      `Backfill complete: ${inserted} cost_log entries created from ${processes.length} processes`
    )
  }
}
