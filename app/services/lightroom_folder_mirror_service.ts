import Photo from '#models/photo'
import Collection from '#models/collection'
import Logger from '../utils/logger.js'

const logger = Logger.getInstance('LightroomFolderMirror')

interface FolderSource {
  folderPath: string[]
  folderFullPath?: string[]
}

function extractFolderSource(photo: Photo): FolderSource | null {
  const source = (photo.descriptions as any)?.source
  if (!source || typeof source !== 'object') return null
  // Accept any truthy value (true, 1, "true") — Lua JSON libs sometimes drop booleans.
  // If folderPath is present, mirroring was explicitly requested.
  const folderPath = source.folderPath
  if (!Array.isArray(folderPath) || folderPath.length === 0) return null
  // Sanitize: only keep non-empty strings, trim
  const sanitize = (arr: any[]): string[] =>
    arr
      .filter((p: any) => typeof p === 'string')
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0)
  const cleaned = sanitize(folderPath)
  if (cleaned.length === 0) return null
  const fullPath = Array.isArray(source.folderFullPath) ? sanitize(source.folderFullPath) : null
  return {
    folderPath: cleaned,
    ...(fullPath && fullPath.length > 0 ? { folderFullPath: fullPath } : {}),
  }
}

function buildPathKey(folderPath: string[]): string {
  return folderPath.join('\u0000')
}

function buildDescription(folderPath: string[]): string {
  return folderPath.join(' / ')
}

export default class LightroomFolderMirrorService {
  /**
   * Materializes Photoreka collections from the Lightroom folder hierarchy
   * captured for each photo (`descriptions.source.folderPath`).
   *
   * - Creates a collection per unique folder path (per user)
   * - Reuses existing collection when `sourceFolderPath` matches
   * - Attaches photos to their corresponding collection (idempotent)
   */
  public static async materializeForPhotos(userId: number, photoIds: number[]): Promise<void> {
    if (!userId || !photoIds || photoIds.length === 0) return

    try {
      const photos = await Photo.query().whereIn('id', photoIds).where('user_id', userId)

      // Group photo ids by folder path key
      const groups = new Map<
        string,
        { folderPath: string[]; folderFullPath?: string[]; photoIds: number[] }
      >()
      for (const photo of photos) {
        const src = extractFolderSource(photo)
        if (!src) continue
        const key = buildPathKey(src.folderPath)
        let group = groups.get(key)
        if (!group) {
          group = { folderPath: src.folderPath, folderFullPath: src.folderFullPath, photoIds: [] }
          groups.set(key, group)
        }
        group.photoIds.push(photo.id)
      }

      if (groups.size === 0) {
        logger.info(`No photos with mirrorFolders flag found for user ${userId}`)
        return
      }

      logger.info(
        `Materializing ${groups.size} folder collection(s) for user ${userId} (photos: ${photos.length})`
      )

      // Load all existing user collections that already have a sourceFolderPath
      const existingCollections = await Collection.query()
        .where('user_id', userId)
        .whereNotNull('source_folder_path')

      const collectionByKey = new Map<string, Collection>()
      for (const collection of existingCollections) {
        if (collection.sourceFolderPath && collection.sourceFolderPath.length > 0) {
          collectionByKey.set(buildPathKey(collection.sourceFolderPath), collection)
        }
      }

      for (const [key, group] of groups) {
        let collection = collectionByKey.get(key)

        if (!collection) {
          const collectionName = group.folderPath.join('/')
          const descPath = group.folderFullPath ?? group.folderPath
          collection = await Collection.create({
            userId,
            name: collectionName,
            description: buildDescription(descPath),
            sourceFolderPath: group.folderPath,
          })
          collectionByKey.set(key, collection)
          logger.info(
            `Created mirrored collection "${collection.name}" (id=${collection.id}) for path "${buildDescription(descPath)}"`
          )
        }

        // Attach only photos that are not yet linked (avoid duplicate pivot rows)
        await collection.load('photos')
        const existingPhotoIds = new Set(collection.photos.map((p) => p.id))
        const newPhotoIds = group.photoIds.filter((id) => !existingPhotoIds.has(id))

        if (newPhotoIds.length > 0) {
          await collection.related('photos').attach(newPhotoIds)
          logger.info(
            `Attached ${newPhotoIds.length} photo(s) to collection ${collection.id} ("${collection.name}")`
          )
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`Error materializing folder mirror for user ${userId}: ${msg}`)
    }
  }

  /**
   * Materializes folder mirrors for every photo associated with an analyzer process.
   */
  public static async materializeForProcess(processId: number, userId: number): Promise<void> {
    if (!processId || !userId) return
    const photos = await Photo.query()
      .where('analyzer_process_id', processId)
      .where('user_id', userId)
      .select('id')
    if (photos.length === 0) return
    await this.materializeForPhotos(
      userId,
      photos.map((p) => p.id)
    )
  }
}
