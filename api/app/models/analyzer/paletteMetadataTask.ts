import { AnalyzerTask } from './analyzerTask.js'
import Logger, { LogLevel } from '../../utils/logger.js'
import Photo from '#models/photo'
import PhotoManager from '../../managers/photo_manager.js'
import axios from 'axios'
import { detectImagePalette } from './metadataTask.js'

const logger = Logger.getInstance('AnalyzerProcess', 'PaletteMetadataTask')
logger.setLevel(LogLevel.DEBUG)

type PaletteMetadata = {
  palette: string[]
}

export class PaletteMetadataTask extends AnalyzerTask {
  declare data: Record<number, PaletteMetadata>

  async process(pendingPhotos: Photo[]): Promise<void> {
    if (!this.data) {
      this.data = {}
    }

    const batchSize = 12
    const batches = []

    for (let i = 0; i < pendingPhotos.length; i += batchSize) {
      batches.push(pendingPhotos.slice(i, i + batchSize))
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(async (photo) => {
          const palette = await this.extractPalette(photo)
          this.data[photo.id] = { palette }
          return photo
        })
      )

      const successfulPhotos = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => (result as PromiseFulfilledResult<Photo>).value)

      const failedPhotos = results.filter((result) => result.status === 'rejected')
      if (failedPhotos.length > 0) {
        logger.error(
          `Errores calculando palette en ${failedPhotos.length}/${batch.length} fotos del lote`
        )
      }

      if (successfulPhotos.length > 0) {
        await this.commit(successfulPhotos)
      }
    }
  }

  private async extractPalette(photo: Photo): Promise<string[]> {
    const imageUrl = photo.thumbnailName ? photo.thumbnailUrl : photo.originalUrl

    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30_000 })
      const buffer = Buffer.from(response.data)
      return await detectImagePalette(buffer)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Error extrayendo palette para foto ${photo.id}: ${message}`)
      return ['color']
    }
  }

  async commit(batch: Photo[]): Promise<void> {
    const photoManager = new PhotoManager()
    const photoIds = batch.map((photo) => photo.id)

    await Promise.all(
      photoIds.map((photoId) => {
        const metadata = this.data[photoId]
        if (!metadata) return Promise.resolve(null)

        return photoManager.updatePhotoDescriptions(photoId.toString(), {
          visual_aspects: { palette: metadata.palette },
        } as any)
      })
    )

    await this.analyzerProcess.markPhotosCompleted(this.name, photoIds)
    photoIds.forEach((id) => delete this.data[id])

    logger.debug(`Guardada palette para ${photoIds.length} fotos`)
  }
}
