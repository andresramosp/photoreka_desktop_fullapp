import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'

export default class ResetCostData extends BaseCommand {
  static commandName = 'costs:reset'
  static description =
    'Reset all cost tracking data: cost_logs, user.costHistory, analyzer_processes.cost_report, and optionally creditsUsed'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'Also reset creditsUsed to 0 for all users', default: false })
  declare resetCredits: boolean

  @flags.boolean({ description: 'Skip confirmation prompt', default: false })
  declare force: boolean

  async run() {
    if (!this.force) {
      const confirm = await this.prompt.confirm(
        'This will DELETE all cost_logs, reset user cost history, and clear analyzer cost reports. Continue?'
      )
      if (!confirm) {
        this.logger.info('Aborted.')
        return
      }

      if (this.resetCredits) {
        const confirmCredits = await this.prompt.confirm(
          'You also chose --reset-credits. This will set creditsUsed to 0 for ALL users. Continue?'
        )
        if (!confirmCredits) {
          this.logger.info('Aborted.')
          return
        }
      }
    }

    // 1. Truncate cost_logs
    const { count: logCount } = (await db.from('cost_logs').count('* as count').first()) ?? {
      count: 0,
    }
    await db.from('cost_logs').delete()
    this.logger.info(`Deleted ${logCount} rows from cost_logs`)

    // 2. Reset user.costHistory to null
    const historyResult = await db
      .from('users')
      .whereNotNull('cost_history')
      .update({ cost_history: null })
    this.logger.info(`Reset cost_history on ${historyResult[0] ?? 0} users`)

    // 3. Clear analyzer_processes.cost_report
    const processResult = await db
      .from('analyzer_processes')
      .whereNotNull('cost_report')
      .update({ cost_report: null })
    this.logger.info(`Cleared cost_report on ${processResult[0] ?? 0} analyzer processes`)

    // 4. Optionally reset creditsUsed (preserves all other usage fields like analyzedPhotosUsed)
    if (this.resetCredits) {
      const creditResult = await db.rawQuery(`
        UPDATE users
        SET usage = jsonb_set(usage, '{creditsUsed}', '0')
        WHERE usage IS NOT NULL
          AND (usage->>'creditsUsed')::int > 0
      `)
      this.logger.info(`Reset creditsUsed to 0 on ${creditResult.rowCount ?? 0} users`)
    }

    this.logger.success('Cost data reset complete. All cost sources are now consistent at zero.')
  }
}
