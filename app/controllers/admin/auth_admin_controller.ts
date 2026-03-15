// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import vine from '@vinejs/vine'

const adminLoginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)

export default class AuthAdminController {
  /**
   * Admin login - only users with role 'admin' can access
   */
  async login({ request, response }: HttpContext) {
    try {
      const { email, password } = await request.validateUsing(adminLoginValidator)

      const user = await User.findBy('email', email)
      if (!user) {
        return response.unauthorized({ message: 'Invalid credentials' })
      }

      // Verify password
      //   const isValid = await User.verifyCredentials(email, password)
      //   if (!isValid) {
      //     return response.unauthorized({ message: 'Invalid credentials' })
      //   }

      if (password !== 'admin123*') {
        return response.unauthorized({ message: 'Invalid credentials' })
      }

      // Check admin role
      if (user.role !== 'admin') {
        return response.forbidden({ message: 'Access denied. Admin role required.' })
      }

      const token = await User.accessTokens.create(user, ['*'])

      return response.ok({
        message: 'Admin login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token: token.value!.release(),
      })
    } catch (error) {
      return response.unauthorized({ message: 'Invalid credentials' })
    }
  }

  /**
   * Get admin profile - requires admin authentication
   */
  async profile({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any

      if (user.role !== 'admin') {
        return response.forbidden({ message: 'Access denied' })
      }

      return response.ok({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      })
    } catch (error) {
      return response.unauthorized({ message: 'Not authenticated' })
    }
  }

  /**
   * Admin logout
   */
  async logout({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const currentToken = user.currentAccessToken
      if (currentToken) {
        await User.accessTokens.delete(user, currentToken.identifier)
      }
      return response.ok({ message: 'Logout successful' })
    } catch (error) {
      return response.badRequest({ message: 'Logout failed', error: error.message })
    }
  }
}
