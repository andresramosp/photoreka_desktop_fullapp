import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * ReadOnly middleware is used to block write operations for demo users.
 * It checks if the access token has readOnly metadata and blocks
 * POST, PUT, DELETE, and PATCH requests except for allowed routes.
 */
export default class ReadOnlyMiddleware {
  /**
   * Routes that are allowed even in read-only mode
   * These are typically non-destructive operations
   */
  private allowedRoutes = [
    '/api/auth/logout',
    '/api/auth/profile', // GET profile is allowed
    '/api/search/semantic/stream',
    '/api/search/semantic/sync',
    '/api/search/tags/sync',
    '/api/search/byPhotos',
    '/api/warmUp',
    '/api/3d/photos',
    '/api/catalog/photoInsightSpecific', //  Allow photo insights as they are read operations
    // Series routes allowed for demo users
    '/api/series',
    '/api/series/:id',
    '/api/series/:id/photos',
    '/api/series/:id/order',
    '/api/series/:id/move',
  ]

  /**
   * HTTP methods that are considered "read-only"
   */
  private readOnlyMethods = ['GET', 'HEAD', 'OPTIONS']

  async handle(ctx: HttpContext, next: NextFn) {
    // Get the current user
    const user = ctx.auth.use('api').user
    if (!user) {
      return ctx.response.unauthorized({
        message: 'User not authenticated',
      })
    }

    // Check if this is the demo user by comparing email with env variable
    const demoEmail = process.env.DEMO_USER_EMAIL
    const isDemoUser = demoEmail && (user as any).email === demoEmail

    if (!isDemoUser) {
      // Not a demo user, allow all operations
      return next()
    }

    // Check if the request method is read-only
    if (this.readOnlyMethods.includes(ctx.request.method())) {
      // Read-only methods are always allowed
      return next()
    }

    // Check if the current route is in the allowed list
    const currentPath = ctx.request.url()
    const isAllowedRoute = this.allowedRoutes.some((route) => {
      // Exact match or starts with (for routes with parameters)
      return currentPath === route || currentPath.startsWith(route)
    })

    if (isAllowedRoute) {
      // Route is explicitly allowed even for write operations
      return next()
    }

    // Block the request - this is a write operation on a read-only token
    return ctx.response.forbidden({
      message:
        'This is a demo account with read-only access. You cannot perform this operation. Please create your own account to access full functionality.',
      code: 'READ_ONLY_ACCESS',
      isDemoMode: true,
    })
  }
}
