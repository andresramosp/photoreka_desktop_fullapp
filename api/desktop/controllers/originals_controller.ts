import type { HttpContext } from '@adonisjs/core/http'
import fs from 'node:fs/promises'
import db from '@adonisjs/lucid/services/db'
import { photoAssetUrl, photoThumbnailUrl } from '#models/photo'
import {
  isValidOriginalSignature,
  locateOriginals,
  originalStat,
  originalsSummary,
  relinkOriginal,
  viewableOriginal,
} from '../originals.js'

export default class OriginalsController {
  /**
   * La imagen de la foto para el visor: el original del disco, reducido. Si no está (se movió, el
   * disco no está conectado o la foto no tiene original), redirige a la main de R2 mientras exista
   * y, si ya se borró tras el análisis, a la miniatura local.
   */
  async file({ params, request, response }: HttpContext) {
    const photoId = Number(params.id)
    if (!Number.isInteger(photoId) || !isValidOriginalSignature(photoId, request.qs().s)) {
      return response.forbidden({ message: 'Invalid signature' })
    }
    const photo = await db
      .from('photos')
      .where('id', photoId)
      .whereNull('deleted_at')
      .select('name', 'thumbnail_name', 'original_path', 'main_deleted_at')
      .first()
    if (!photo) return response.notFound({ message: 'Photo not found' })

    const stat = await originalStat(photo.original_path)
    if (stat) {
      // El navegador vuelve a preguntar cada vez y, si el archivo no cambió, no se recalcula nada.
      const etag = `"${stat.size}-${Math.round(stat.mtimeMs)}"`
      response.header('Cache-Control', 'private, no-cache')
      response.header('ETag', etag)
      if (request.header('if-none-match') === etag) return response.notModified('')
      try {
        const image = await viewableOriginal(photo.original_path)
        response.header('Content-Type', 'image/jpeg')
        return response.send(image)
      } catch (error) {
        console.warn(`[Originals] No se pudo leer el original de la foto ${photoId}: ${(error as Error).message}`)
      }
    }

    response.header('Cache-Control', 'no-store')
    return response.redirect(photo.main_deleted_at ? photoThumbnailUrl(photo.thumbnail_name) : photoAssetUrl(photo.name))
  }

  /** Dónde está el original de una foto y si sigue ahí, para "Mostrar en el Explorador" y "Abrir". */
  async location({ auth, params, response }: HttpContext) {
    const photo = await db
      .from('photos')
      .where('id', Number(params.id))
      .where('user_id', auth.use('api').user!.id)
      .whereNull('deleted_at')
      .select('original_path')
      .first()
    if (!photo) return response.notFound({ message: 'Photo not found' })
    const exists = (await originalStat(photo.original_path)) !== null
    return response.ok({ path: photo.original_path ?? null, exists })
  }

  async summary({ auth, response }: HttpContext) {
    return response.ok(await originalsSummary(auth.use('api').user!.id))
  }

  /** Enlaza una foto con el archivo que elige el usuario, si es su mismo original. */
  async relink({ auth, params, request, response }: HttpContext) {
    const result = await relinkOriginal(auth.use('api').user!.id, Number(params.id), request.input('file'))
    if (result.status === 'not_found') return response.notFound({ message: 'Photo not found' })
    if (result.status === 'different_file') {
      return response.conflict({ code: 'DIFFERENT_FILE', message: "That file isn't the original of this photo" })
    }
    return response.ok({ alsoFound: result.alsoFound, missing: result.missing })
  }

  /** Busca en la carpeta que elige el usuario los originales que se movieron. */
  async locate({ auth, request, response }: HttpContext) {
    const folder = request.input('folder')
    const isFolder =
      typeof folder === 'string' && (await fs.stat(folder).then((s) => s.isDirectory()).catch(() => false))
    if (!isFolder) return response.badRequest({ message: 'Folder not found' })
    return response.ok(await locateOriginals(auth.use('api').user!.id, folder))
  }
}
