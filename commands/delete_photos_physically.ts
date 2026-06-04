import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import PhotoDeletionService from '#services/photo_deletion_service'

export default class DeletePhotosPhysically extends BaseCommand {
  static commandName = 'delete:photos:physical'
  static description =
    'Delete uploaded anomalies immediately and retained soft-deleted photos after the retention window'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.number({
    description: 'Number of photos to delete per batch',
    default: 50,
  })
  declare batchSize: number

  @flags.boolean({
    description: 'Dry run mode - show what would be deleted without actually deleting',
    default: false,
  })
  declare dryRun: boolean

  @flags.number({
    description: 'Retention window in days for retained photos before hard delete',
    default: 7,
  })
  declare retentionDays: number

  async run() {
    await PhotoDeletionService.deletePhysically(this.batchSize, this.dryRun, this.retentionDays)
  }
}
