import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import AnalyzerProcessRunner from '#services/analyzer_service'
import PhotoManager from '../app/managers/photo_manager.js'

export default class OverwritePaletteGlobal extends BaseCommand {
  static commandName = 'analysis:overwrite-palette-global'
  static description =
    'Rebuild visual_aspects.palette for all non-deleted photos using a lightweight palette-only task'

  static options: CommandOptions = {
    startApp: true,
  }

  @flags.boolean({ description: 'Skip confirmation prompt', default: false })
  declare force: boolean

  @flags.number({ description: 'Optional user id filter' })
  declare userId?: number

  async run() {
    const photoManager = new PhotoManager()
    const photos = await photoManager.getPhotosForAnalysis(
      'overwrite_metadata',
      undefined,
      this.userId ? String(this.userId) : undefined,
      false
    )
    if (photos.length === 0) {
      this.logger.info('No photos found for palette overwrite.')
      return
    }

    if (!this.force) {
      const scope = this.userId ? `user ${this.userId}` : 'all users'
      const confirmed = await this.prompt.confirm(
        `This will recompute palette for ${photos.length} photos across ${scope}. Continue?`
      )
      if (!confirmed) {
        this.logger.info('Aborted.')
        return
      }
    }

    const runner = new AnalyzerProcessRunner()
    await runner.initProcess(
      photos,
      'overwrite_metadata_palette',
      'overwrite_metadata',
      false,
      undefined,
      this.userId ? String(this.userId) : undefined
    )

    await runner.runAll()

    this.logger.success(
      `Palette overwrite finished for ${photos.length} photos${this.userId ? ` of user ${this.userId}` : ''}.`
    )
  }
}
