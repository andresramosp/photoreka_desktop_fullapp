import sharp from 'sharp'
import Logger, { LogLevel } from '../utils/logger.js'
import Photo from '#models/photo'
import axios from 'axios'
import { isThumbKey, readLocalThumb } from '#desktop/thumbnails'

const logger = Logger.getInstance('PhotoImageService')
logger.setLevel(LogLevel.DEBUG)

export default class PhotoImageService {
  private static instance: PhotoImageService

  private constructor() {}

  public static getInstance(): PhotoImageService {
    if (!PhotoImageService.instance) {
      PhotoImageService.instance = new PhotoImageService()
    }
    return PhotoImageService.instance
  }

  private getWorkerImageUrl(filename: string): string {
    return `https://${process.env.IMAGES_WORKER}/${filename}`
  }

  private async downloadImageBuffer(filename: string): Promise<Buffer> {
    // Escritorio: la miniatura vive en el disco; R2 solo la tiene hasta que termina el análisis.
    if (isThumbKey(filename)) {
      const local = await readLocalThumb(filename)
      if (local) return local
    }
    const imageUrl = this.getWorkerImageUrl(filename)

    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30_000,
      })

      return Buffer.from(response.data)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.debug(`Error descargando imagen ${filename} desde worker: ${errorMessage}`)
      throw new Error(`No se encontró el archivo ${filename} en worker de imágenes`)
    }
  }

  // @withCache({ provider: 'redis', ttl: 60 * 5 })
  public async getImageBase64FromR2(
    filename: string,
    withGuideLines: boolean = false
  ): Promise<String> {
    const buffer = await this.downloadImageBuffer(filename)

    // Si no se necesitan líneas guía, devolver el buffer original
    if (!withGuideLines) {
      return buffer.toString('base64')
    }

    // Procesar imagen con líneas guía
    const resizedBuffer = await sharp(buffer).resize({ width: 1200, fit: 'inside' }).toBuffer()

    const resizedImage = sharp(resizedBuffer)
    const metadata = await resizedImage.metadata()
    const width = metadata.width || 0
    const height = metadata.height || 0
    const lineThickness = 5
    const leftLineX = Math.floor(0.375 * width)
    const rightLineX = Math.floor(0.625 * width)

    const svgOverlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${leftLineX}" y="0" width="${lineThickness}" height="${height}" fill="white"/>
      <rect x="${rightLineX}" y="0" width="${lineThickness}" height="${height}" fill="white"/>
    </svg>`

    const imageWithGuideBuffer = await resizedImage
      .composite([{ input: Buffer.from(svgOverlay) }])
      .toBuffer()

    return imageWithGuideBuffer.toString('base64')
  }

  public async getImageBufferFromR2(filename: string): Promise<Buffer> {
    return this.downloadImageBuffer(filename)
  }

  // public async getPhotoImages(
  //   process: AnalyzerProcess,
  //   useGuides: boolean = false
  // ): Promise<PhotoImage[]> {
  //   // if (process.mode == 'retry_process') {
  //   //   this.clearCache(process.id)
  //   // }
  //   const cacheKey = `${process.id}_${useGuides}`

  //   if (!this.imageCache.has(cacheKey)) {
  //     logger.debug(`Cargando imágenes para proceso ${process.id}`)
  //     await this.populatePhotoImages(process)
  //     this.imageCache.set(cacheKey, useGuides ? this.photoImagesWithGuides : this.photoImages)
  //   }

  //   return this.imageCache.get(cacheKey)!
  // }

  // public clearCache(processId: string) {
  //   logger.debug(`Limpiando caché para proceso ${processId}`)
  //   for (const key of this.imageCache.keys()) {
  //     if (key.startsWith(processId)) {
  //       this.imageCache.delete(key)
  //     }
  //   }
  // }

  // public async populatePhotoImages(process: AnalyzerProcess) {
  //   const localUploadPath = getLocalUploadPath()
  //   const withGuidesPath = path.join(localUploadPath, 'withGuides')
  //   await fs.mkdir(withGuidesPath, { recursive: true })

  //   // Imágenes originales desde R2
  //   const processes = await Promise.all(
  //     process.photos.map((photo) =>
  //       limit(async () => {
  //         try {
  //           const buffer = await this.getImageBase64FromR2(photo.name, false)
  //           // Obtener tamaño en MB
  //           // Obtener dimensiones con sharp
  //           let width = 0,
  //             height = 0
  //           try {
  //             const metadata = await sharp(buffer).metadata()
  //             width = metadata.width || 0
  //             height = metadata.height || 0
  //           } catch (err) {
  //             logger.warn(`No se pudo obtener metadata de la imagen ${photo.name}`, err)
  //           }
  //           // logger.info(
  //           //   `Imagen ${photo.name}: tamaño ${sizeMB} MB, dimensiones ${width}x${height} px`
  //           // )
  //           const base64Image = buffer.toString('base64')
  //           const pp = new PhotoImage()
  //           pp.photo = photo
  //           pp.base64 = base64Image
  //           return pp
  //         } catch (error) {
  //           console.warn(`No se pudo obtener la imagen ${photo.name} desde R2`, error)
  //           throw error // Re-throw to handle it in the calling function
  //         }
  //       })
  //     )
  //   )
  //   this.photoImages = processes.filter((pp) => pp !== null) as PhotoImage[]

  //   // Imágenes con guías: leer desde R2, procesar en memoria, opcionalmente guardar en local
  //   const processesWithGuides = await Promise.all(
  //     process.photos.map((photo) =>
  //       limit(async () => {
  //         try {
  //           const buffer = await this.getImageBase64FromR2(photo.name, true)
  //           const resizedBuffer = await sharp(buffer)
  //             .resize({ width: 1200, fit: 'inside' })
  //             .toBuffer()
  //           const resizedImage = sharp(resizedBuffer)
  //           const metadata = await resizedImage.metadata()
  //           const width = metadata.width || 0
  //           const height = metadata.height || 0
  //           const lineThickness = 5
  //           const leftLineX = Math.floor(0.375 * width)
  //           const rightLineX = Math.floor(0.625 * width)
  //           const svgOverlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  //             <rect x="${leftLineX}" y="0" width="${lineThickness}" height="${height}" fill="white"/>
  //             <rect x="${rightLineX}" y="0" width="${lineThickness}" height="${height}" fill="white"/>
  //           </svg>`
  //           const imageWithGuideBuffer = await resizedImage
  //             .composite([{ input: Buffer.from(svgOverlay) }])
  //             .toBuffer()

  //           const base64ImageWithGuide = imageWithGuideBuffer.toString('base64')
  //           const ppGuide = new PhotoImage()
  //           ppGuide.photo = photo
  //           ppGuide.base64 = base64ImageWithGuide
  //           return ppGuide
  //         } catch (error) {
  //           console.warn(`No se pudo procesar la imagen con guía ${photo.name}`, error)
  //           throw error // Re-throw to handle it in the calling function
  //         }
  //       })
  //     )
  //   )

  //   this.photoImagesWithGuides = processesWithGuides.filter((pp) => pp !== null) as PhotoImage[]
  // }

  /**
   * Obtiene imágenes válidas de R2, filtrando automáticamente las que no se pueden obtener
   * Retorna un array con las fotos que sí tienen imagen disponible
   */
  public async getValidPhotosWithImages(
    photos: Photo[],
    withGuideLines: boolean = false
  ): Promise<{ photo: Photo; base64: string }[]> {
    const validImages: { photo: Photo; base64: string }[] = []

    for (const photo of photos) {
      try {
        const base64 = await this.getImageBase64FromR2(photo.name, withGuideLines)
        validImages.push({
          photo,
          base64: base64 as string,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.debug(`No se pudo obtener la imagen ${photo.name} desde worker: ${errorMessage}`)
      }
    }

    return validImages
  }

  public async getValidPhotosWithImagesThumb(
    photos: Photo[],
    withGuideLines: boolean = false
  ): Promise<{ photo: Photo; base64: string }[]> {
    const validImages: { photo: Photo; base64: string }[] = []

    for (const photo of photos) {
      try {
        const base64 = await this.getImageBase64FromR2(photo.thumbnailName, withGuideLines)
        validImages.push({
          photo,
          base64: base64 as string,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.debug(
          `No se pudo obtener la imagen ${photo.thumbnailName} desde worker: ${errorMessage}`
        )
      }
    }

    return validImages
  }
}
