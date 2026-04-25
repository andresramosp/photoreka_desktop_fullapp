import { AnalyzerTask } from './analyzerTask.js'
import Logger, { LogLevel } from '../../utils/logger.js'
import Photo from '#models/photo'
import PhotoManager from '../../managers/photo_manager.js'
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import axios from 'axios'
import { computeDHash } from '../../utils/dhash.js'

const logger = Logger.getInstance('AnalyzerProcess', 'MetadataTask')
logger.setLevel(LogLevel.DEBUG)

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  requestHandler: {
    requestTimeout: 30_000,
    httpsAgent: { maxSockets: 25 },
  } as any,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

interface PhotoMetadata {
  orientation: string[]
  temperature?: string[]
  palette?: string[]
  width?: number
  height?: number
  fileSize?: number
  format?: string
  exif?: any
  dhash?: string
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const detectImagePalette = async (buffer: Buffer): Promise<string[]> => {
  try {
    const metadata = await sharp(buffer).metadata()

    if (metadata.channels && metadata.channels <= 1) {
      return ['black and white']
    }

    // Trabajamos en raw RGB, tamaño moderado
    const { data } = await sharp(buffer)
      .resize(128, 128, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let validPixels = 0 // píxeles no demasiado oscuros ni demasiado claros
    let colorfulPixels = 0 // píxeles con saturación claramente no nula
    const hueBuckets = new Array(36).fill(0) // histograma de hue en bins de 10°
    let colorfulHueCount = 0

    const SAT_COLOR = 0.15 // saturación mínima para considerar un píxel "con color"
    const V_MIN = 0.12 // descartar sombras profundas
    const V_MAX = 0.97 // descartar altas luces quemadas

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] / 255
      const g = data[i + 1] / 255
      const b = data[i + 2] / 255

      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const v = max
      const s = max === 0 ? 0 : (max - min) / max

      if (v < V_MIN || v > V_MAX) continue
      validPixels++

      if (s < SAT_COLOR) continue
      colorfulPixels++

      // Calcular hue (0-360)
      const d = max - min
      let h = 0
      if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6
        else if (max === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h *= 60
        if (h < 0) h += 360
      }
      hueBuckets[Math.floor(h / 10) % 36]++
      colorfulHueCount++
    }

    if (validPixels === 0) return ['color'] // imagen rarísima, fallback seguro

    const colorfulRatio = colorfulPixels / validPixels

    // Umbrales ajustados por observación empírica
    const BW_MAX_RATIO = 0.03 // <3% de píxeles con color → B&W
    const COLOR_MIN_RATIO = 0.1 // >10% → hay color real
    // Monochrome real = un solo color dominante cubriendo casi toda la imagen.
    // Por eso exigimos:
    //  - que la gran mayoría de los píxeles válidos tengan color (no solo "algo de color")
    //  - que ese color esté extremadamente concentrado en un único hue
    //  - que el hue dominante por sí mismo cubra una fracción muy alta de la imagen entera
    const MONOCHROME_MIN_COLORFUL_RATIO = 0.7 // ≥70% de la imagen debe tener color saturado
    const MONOCHROME_HUE_CONCENTRATION = 0.95 // ≥95% de los píxeles con color en una ventana de 20°
    const MONOCHROME_DOMINANT_OVER_VALID = 0.6 // el hue dominante debe abarcar ≥60% de la imagen útil

    if (colorfulRatio < BW_MAX_RATIO) {
      return ['black and white']
    }

    // Detectar monochrome: ¿los píxeles con color están concentrados en un único hue
    // y ese hue domina la imagen completa?
    if (colorfulHueCount > 0) {
      // Ventana circular estrecha de 2 bins (20°) para exigir un solo color dominante
      let bestWindow = 0
      for (let start = 0; start < 36; start++) {
        let sum = 0
        for (let k = 0; k < 2; k++) sum += hueBuckets[(start + k) % 36]
        if (sum > bestWindow) bestWindow = sum
      }
      const hueConcentration = bestWindow / colorfulHueCount
      const dominantOverValid = bestWindow / validPixels

      if (
        colorfulRatio >= MONOCHROME_MIN_COLORFUL_RATIO &&
        hueConcentration >= MONOCHROME_HUE_CONCENTRATION &&
        dominantOverValid >= MONOCHROME_DOMINANT_OVER_VALID
      ) {
        return ['color', 'monochrome']
      }
    }

    if (colorfulRatio >= COLOR_MIN_RATIO) return ['color']

    // Zona intermedia (3%–10% píxeles con color, no concentrados): lo más honesto es 'color'
    // porque el B&W real cae muy por debajo del 3% en JPEGs normales.
    return ['color']
  } catch (error) {
    logger.error(`Error detectando palette de imagen: ${errorMessage(error)}`)
    return ['color']
  }
}

export class MetadataTask extends AnalyzerTask {
  declare data: Record<number, PhotoMetadata>

  async process(pendingPhotos: Photo[]): Promise<void> {
    if (!this.data) {
      this.data = {}
    }

    // Si onlyIfNeeded es true, filtrar fotos que ya tienen orientation
    let photosToProcess = pendingPhotos
    if (this.onlyIfNeeded) {
      const HealthPhotoService = (await import('../../services/health_photo_service.js')).default
      const photosWithoutOrientation = []

      for (const photo of pendingPhotos) {
        const health = await HealthPhotoService.photoHealth(photo.id)
        const hasOrientation =
          health.checks.find((c) => c.label === 'descriptions.visual_aspects.orientation')?.ok ||
          false

        if (!hasOrientation) {
          photosWithoutOrientation.push(photo)
        }
      }

      photosToProcess = photosWithoutOrientation
      logger.debug(
        `onlyIfNeeded=true: procesando ${photosToProcess.length}/${pendingPhotos.length} fotos`
      )
    }

    logger.debug(`Procesando metadatos para ${photosToProcess.length} fotos`)

    // Procesar fotos en lotes de 5 en paralelo para optimizar I/O
    const BATCH_SIZE = 5
    const batches = []

    for (let i = 0; i < photosToProcess.length; i += BATCH_SIZE) {
      batches.push(photosToProcess.slice(i, i + BATCH_SIZE))
    }

    for (const batch of batches) {
      try {
        // Procesar el lote en paralelo
        const results = await Promise.allSettled(
          batch.map(async (photo) => {
            try {
              const metadata = await this.extractPhotoMetadata(photo)
              this.data[photo.id] = metadata
              return { photo, success: true }
            } catch (error) {
              logger.error(
                `Error procesando metadatos para foto ${photo.id} (${photo.name}): ${errorMessage(error)}`
              )
              return { photo, success: false, error }
            }
          })
        )

        // Filtrar solo las fotos procesadas exitosamente para el commit
        const successfulPhotos = results
          .filter((result) => result.status === 'fulfilled' && result.value.success)
          .map((result) => (result as PromiseFulfilledResult<any>).value.photo)

        if (successfulPhotos.length > 0) {
          // Commit del lote completo para liberar memoria progresivamente
          await this.commit(successfulPhotos)
        }

        logger.debug(`Lote procesado: ${successfulPhotos.length}/${batch.length} fotos exitosas`)
      } catch (error) {
        logger.error(`Error procesando lote de ${batch.length} fotos: ${errorMessage(error)}`)
        // Continuar con el siguiente lote en caso de error
      }
    }
  }

  private async extractPhotoMetadata(photo: Photo): Promise<PhotoMetadata> {
    try {
      // Obtener información básica del archivo desde S3
      const headCommand = new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: photo.name,
      })

      const s3Head = await s3.send(headCommand)
      const fileSize = s3Head.ContentLength || 0

      // Obtener el buffer de la imagen para analizar metadatos
      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: photo.name,
      })

      const s3Response = await s3.send(command)

      if (!s3Response.Body) {
        throw new Error(`No se encontró el archivo ${photo.name} en R2`)
      }

      // Convertir stream a buffer de forma eficiente
      const chunks: Buffer[] = []
      for await (const chunk of s3Response.Body as any) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const buffer = Buffer.concat(chunks)

      // Usar sharp para obtener metadatos de la imagen
      const sharpMetadata = await sharp(buffer).metadata()

      // Obtener estadísticas de color para calcular temperature y detectar color/B&W
      const imageStats = await sharp(buffer).stats()

      // Calcular temperature basada en los canales RGB promedio
      const rAvg = imageStats.channels[0].mean
      const bAvg = imageStats.channels[2].mean

      let temperature: string
      const warmCoolDiff = rAvg - bAvg
      const threshold = 10 // Umbral para considerar neutral

      if (warmCoolDiff > threshold) {
        temperature = 'warm'
      } else if (warmCoolDiff < -threshold) {
        temperature = 'cold'
      } else {
        temperature = 'neutral'
      }

      // Detectar si es color o blanco y negro
      const paletteTypes = await detectImagePalette(buffer)

      // Determinar orientación basada en dimensiones
      const width = sharpMetadata.width || 0
      const height = sharpMetadata.height || 0
      let orientation: string

      if (width > height) {
        orientation = 'horizontal'
      } else if (height > width) {
        orientation = 'vertical'
      } else {
        orientation = 'square'
      }

      // Limpiar buffer para liberar memoria
      chunks.length = 0

      // Generar dHash a partir del thumbnail público (solo si no existe ya)
      let dhash: string | undefined = photo.dhash ?? undefined
      if (!dhash) {
        try {
          const thumbRes = await axios.get(photo.thumbnailUrl, { responseType: 'arraybuffer' })
          const thumbBuffer = Buffer.from(thumbRes.data)
          dhash = await computeDHash(thumbBuffer)
        } catch (err) {
          logger.error(`Error generando dHash para foto ${photo.id}: ${errorMessage(err)}`)
        }
      }

      return {
        orientation: [orientation],
        temperature: [temperature],
        palette: paletteTypes,
        width,
        height,
        fileSize,
        format: sharpMetadata.format,
        exif: sharpMetadata.exif ? this.parseExifData(sharpMetadata.exif) : null,
        dhash,
      }
    } catch (error) {
      logger.error(`Error extrayendo metadatos para ${photo.name}: ${errorMessage(error)}`)
      // Retornar datos mínimos en caso de error
      return {
        orientation: ['unknown'],
        temperature: ['neutral'],
        palette: ['color'], // Asumir color por defecto en caso de error
      }
    }
  }

  private parseExifData(exifBuffer: Buffer): any {
    try {
      // Parseo básico de EXIF - se puede expandir según necesidades
      return {
        // Por ahora solo guardamos que existe EXIF
        hasExif: true,
        size: exifBuffer.length,
      }
    } catch (error) {
      logger.error(`Error parseando datos EXIF: ${errorMessage(error)}`)
      return null
    }
  }

  async commit(batch: Photo[]): Promise<void> {
    try {
      const photoManager = new PhotoManager()
      const photoIds = batch.map((p) => p.id)

      await Promise.all(
        photoIds.map(async (photoId: number) => {
          const metadata = this.data[photoId]
          if (!metadata) return null

          // Guardar dHash directamente en la foto si se generó
          if (metadata.dhash) {
            const photo = batch.find((p) => p.id === photoId)
            if (photo && !photo.dhash) {
              photo.dhash = metadata.dhash
              await photo.save()
            }
          }

          // Estructurar los datos como visual_aspects siguiendo el patrón de visionDescriptionTask
          const visualAspectsData = {
            orientation: metadata.orientation,
            ...(metadata.temperature && { temperature: metadata.temperature }),
            ...(metadata.palette && { palette: metadata.palette }),
            // Se pueden agregar más campos aquí en el futuro
            ...(metadata.width &&
              metadata.height && {
                dimensions: [`${metadata.width}x${metadata.height}`],
              }),
            ...(metadata.format && {
              format: [metadata.format],
            }),
          }

          // El PhotoManager ahora se encarga del merge automáticamente
          const descriptions = { visual_aspects: visualAspectsData } as any
          return photoManager.updatePhotoDescriptions(photoId.toString(), descriptions)
        })
      )

      // Marcar fotos como completadas
      const photoIdsArray = batch.map((photo) => photo.id)
      await this.analyzerProcess.markPhotosCompleted(this.name, photoIdsArray)

      // Limpiar los datos del batch después del commit
      photoIds.forEach((id) => delete this.data[id])

      logger.debug(`Guardados metadatos para ${photoIds.length} fotos`)
    } catch (err) {
      logger.error(`Error guardando metadatos: ${errorMessage(err)}`)
    }
  }
}
