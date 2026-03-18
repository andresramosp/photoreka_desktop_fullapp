import type { HttpContext } from '@adonisjs/core/http'
import ShareLink from '#models/share_link'
import type { ShareResourceType } from '#models/share_link'
import User from '#models/user'
import { inject } from '@adonisjs/core'

@inject()
export default class ShareController {
  /**
   * Generate a URL-safe slug from a resource name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100)
  }

  /**
   * Generate a unique slug for a user, appending numeric suffix if needed
   */
  private async ensureUniqueSlug(
    userId: number,
    baseSlug: string,
    excludeId?: number
  ): Promise<string> {
    let slug = baseSlug
    let suffix = 2

    while (true) {
      const query = ShareLink.query().where('userId', userId).where('slug', slug)

      if (excludeId) {
        query.whereNot('id', excludeId)
      }

      const existing = await query.first()
      if (!existing) break

      slug = `${baseSlug.substring(0, 95)}-${suffix}`
      suffix++
    }

    return slug
  }

  /**
   * Get share status for a resource.
   * GET /api/share/:resourceType/:resourceId?
   */
  async show({ auth, params, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { resourceType, resourceId } = params

      const validTypes: ShareResourceType[] = ['series', 'collection', 'atlas_3d', 'atlas_2d']
      if (!validTypes.includes(resourceType)) {
        return response.badRequest({ message: 'Invalid resource type' })
      }

      const query = ShareLink.query().where('userId', user.id).where('resourceType', resourceType)

      if (resourceId) {
        query.where('resourceId', resourceId)
      } else {
        query.whereNull('resourceId')
      }

      const shareLink = await query.first()

      if (!shareLink) {
        return response.ok({
          isActive: false,
          shareLink: null,
        })
      }

      return response.ok({
        isActive: shareLink.isActive,
        shareLink: {
          id: shareLink.id,
          slug: shareLink.slug,
          resourceType: shareLink.resourceType,
          resourceId: shareLink.resourceId,
          isActive: shareLink.isActive,
          createdAt: shareLink.createdAt,
          updatedAt: shareLink.updatedAt,
        },
      })
    } catch (error) {
      return response.badRequest({ message: 'Error fetching share status' })
    }
  }

  /**
   * Toggle sharing on/off for a resource. Creates share link if it doesn't exist.
   * PUT /api/share/:resourceType/:resourceId?
   * Body: { name?: string } — used to generate slug when creating for first time
   */
  async toggle({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { resourceType, resourceId } = params
      const { name } = request.body()

      const validTypes: ShareResourceType[] = ['series', 'collection', 'atlas_3d', 'atlas_2d']
      if (!validTypes.includes(resourceType)) {
        return response.badRequest({ message: 'Invalid resource type' })
      }

      const query = ShareLink.query().where('userId', user.id).where('resourceType', resourceType)

      if (resourceId) {
        query.where('resourceId', resourceId)
      } else {
        query.whereNull('resourceId')
      }

      let shareLink = await query.first()

      if (shareLink) {
        // Toggle existing
        shareLink.isActive = !shareLink.isActive
        await shareLink.save()
      } else {
        // Create new share link
        let slug: string

        if (resourceType === 'atlas_3d') {
          slug = '3d'
        } else if (resourceType === 'atlas_2d') {
          slug = '2d'
        } else {
          // For series/collections, generate slug from name
          const baseName = name || `${resourceType}-${resourceId}`
          slug = this.generateSlug(baseName)
        }

        slug = await this.ensureUniqueSlug(user.id, slug)

        shareLink = await ShareLink.create({
          userId: user.id,
          resourceType,
          resourceId: resourceId ? Number(resourceId) : null,
          slug,
          isActive: true,
        })
      }

      return response.ok({
        isActive: shareLink.isActive,
        shareLink: {
          id: shareLink.id,
          slug: shareLink.slug,
          resourceType: shareLink.resourceType,
          resourceId: shareLink.resourceId,
          isActive: shareLink.isActive,
          createdAt: shareLink.createdAt,
          updatedAt: shareLink.updatedAt,
        },
      })
    } catch (error) {
      return response.badRequest({ message: 'Error toggling share status' })
    }
  }

  /**
   * Update the slug for a share link.
   * PATCH /api/share/:resourceType/:resourceId?/slug
   * Body: { slug: string }
   */
  async updateSlug({ auth, params, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const { resourceType, resourceId } = params
      const { slug: newSlug } = request.body()

      if (!newSlug || typeof newSlug !== 'string') {
        return response.badRequest({ message: 'Slug is required' })
      }

      // Validate slug format
      const sanitized = newSlug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 100)

      if (sanitized.length < 2) {
        return response.badRequest({ message: 'Slug must be at least 2 characters' })
      }

      const query = ShareLink.query().where('userId', user.id).where('resourceType', resourceType)

      if (resourceId) {
        query.where('resourceId', resourceId)
      } else {
        query.whereNull('resourceId')
      }

      const shareLink = await query.first()

      if (!shareLink) {
        return response.notFound({ message: 'Share link not found' })
      }

      // Ensure unique
      const uniqueSlug = await this.ensureUniqueSlug(user.id, sanitized, shareLink.id)

      shareLink.slug = uniqueSlug
      await shareLink.save()

      return response.ok({
        shareLink: {
          id: shareLink.id,
          slug: shareLink.slug,
          resourceType: shareLink.resourceType,
          resourceId: shareLink.resourceId,
          isActive: shareLink.isActive,
        },
      })
    } catch (error) {
      return response.badRequest({ message: 'Error updating slug' })
    }
  }

  /**
   * Resolve a public share link and return the resource data.
   * GET /api/shared/:username/:resourceType/:slug?
   *
   * For atlas_3d and atlas_2d, slug is not needed.
   * For series and collections, slug identifies the specific resource.
   */
  async resolve({ params, response }: HttpContext) {
    try {
      const { username, resourceType, slug } = params

      const validTypes = ['series', 'collection', '3d', '2d']
      if (!validTypes.includes(resourceType)) {
        return response.notFound({ message: 'Resource not found' })
      }

      // Map URL resource type to DB resource type
      const dbResourceType: ShareResourceType =
        resourceType === '3d'
          ? 'atlas_3d'
          : resourceType === '2d'
            ? 'atlas_2d'
            : (resourceType as ShareResourceType)

      // Find user by username
      const user = await User.query().where('username', username.toLowerCase()).first()

      if (!user) {
        return response.notFound({ message: 'User not found' })
      }

      // Find share link
      const query = ShareLink.query()
        .where('userId', user.id)
        .where('resourceType', dbResourceType)
        .where('isActive', true)

      if (slug && (dbResourceType === 'series' || dbResourceType === 'collection')) {
        query.where('slug', slug.toLowerCase())
      } else if (dbResourceType === 'series' || dbResourceType === 'collection') {
        return response.notFound({ message: 'Resource not found' })
      }

      const shareLink = await query.first()

      if (!shareLink) {
        return response.notFound({ message: 'This content is not publicly shared' })
      }

      // Load the actual resource data based on type
      if (dbResourceType === 'series') {
        const Series = (await import('#models/series')).default
        const series = await Series.query()
          .where('id', shareLink.resourceId!)
          .where('userId', user.id)
          .preload('photos', (q) => {
            q.orderBy('series_photos.order', 'asc')
          })
          .first()

        if (!series) {
          return response.notFound({ message: 'Series not found' })
        }

        return response.ok({
          type: 'series',
          resource: {
            id: series.id,
            name: series.name,
            description: series.description,
            createdAt: series.createdAt,
            updatedAt: series.updatedAt,
            photos: series.photos.map((photo) => ({
              id: photo.id,
              name: photo.name,
              originalFileName: photo.originalFileName,
              thumbnailUrl: photo.thumbnailUrl,
              originalUrl: photo.originalUrl,
              title: photo.title,
              order: photo.$extras.pivot_order,
              descriptions: photo.descriptions,
            })),
          },
          owner: { username: user.username, name: user.name },
        })
      }

      if (dbResourceType === 'collection') {
        const Collection = (await import('#models/collection')).default
        const collection = await Collection.query()
          .where('id', shareLink.resourceId!)
          .where('userId', user.id)
          .preload('photos')
          .first()

        if (!collection) {
          return response.notFound({ message: 'Collection not found' })
        }

        return response.ok({
          type: 'collection',
          resource: {
            id: collection.id,
            name: collection.name,
            description: collection.description,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt,
            photos: collection.photos.map((photo) => ({
              id: photo.id,
              name: photo.name,
              originalFileName: photo.originalFileName,
              thumbnailUrl: photo.thumbnailUrl,
              originalUrl: photo.originalUrl,
              title: photo.title,
              descriptions: {
                visual_aspects: photo.descriptions?.visual_aspects || [],
                artistic_scores: photo.descriptions?.artistic_scores || [],
              },
            })),
          },
          owner: { username: user.username, name: user.name },
        })
      }

      // For atlas_3d and atlas_2d, just confirm sharing is active and return userId
      // The actual 3D/2D data loading is done by their dedicated endpoints
      return response.ok({
        type: resourceType === '3d' ? 'atlas_3d' : 'atlas_2d',
        userId: user.id,
        owner: { username: user.username, name: user.name },
      })
    } catch (error) {
      return response.badRequest({ message: 'Error resolving shared resource' })
    }
  }
}
