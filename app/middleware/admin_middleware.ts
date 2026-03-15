import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Admin middleware checks that the authenticated user has the 'admin' role.
 * Must be used AFTER auth middleware.
 */
export default class AdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.use('api').user as any

    if (!user || user.role !== 'admin') {
      return ctx.response.forbidden({ message: 'Access denied. Admin role required.' })
    }

    return next()
  }
}
