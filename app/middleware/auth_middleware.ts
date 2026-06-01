import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { errors } from '@adonisjs/auth'

/**
 * Auth middleware is used to authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    /**
     * Attempt authentication using the default guard (api)
     */
    const guard = ctx.auth.use('api')
    await guard.authenticate()

    /**
     * Deny access if the user account is inactive
     */
    if (!guard.user?.isActive) {
      throw new errors.E_UNAUTHORIZED_ACCESS('Account is inactive', {
        guardDriverName: 'api',
      })
    }

    /**
     * Continue with the request when authentication succeeds
     */
    return next()
  }
}
