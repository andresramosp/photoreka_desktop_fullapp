import User from '#models/user'
import { EXPIRED_EMAILS } from '#config/expired_emails'
import { WHITELIST_EMAILS } from '#config/whitelist_emails'
import {
  changePasswordValidator,
  createAuthValidator,
  createLoginValidator,
  updateProfileValidator,
  confirmEmailValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  resendConfirmationValidator,
} from '#validators/auth'
import { HttpContext } from '@adonisjs/core/http'
import UsageService, { getDefaultUsageByTier, UsageTier } from '#services/usage_service'
import MailService from '#services/mail_service'
import GoogleOAuthService from '#services/google_oauth_service'
import { DateTime } from 'luxon'
import crypto from 'crypto'
import {
  emailConfirmationTemplate,
  passwordResetTemplate,
  passwordChangedTemplate,
  welcomeEmailTemplate,
  resendConfirmationTemplate,
} from '../utils/email_templates.js'

export default class AuthController {
  private mailService = new MailService()

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Get the frontend URL from environment or default
   */
  private getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'https://www.photoreka.com'
  }

  /**
   * Check if email is whitelisted or has @photorekatest.com domain
   */
  private isEmailAllowed(email: string): boolean {
    // Check if email is in whitelist
    if (WHITELIST_EMAILS.includes(email)) {
      return true
    }
    // Check if email has @photorekatest.com domain
    if (email.endsWith('@photorekatest.com')) {
      return true
    }
    return false
  }
  /**
   * Register a new user
   */
  async register({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createAuthValidator)

      // Verificar si el email está en la whitelist o tiene dominio @photorekatest.com
      if (!this.isEmailAllowed(payload.email)) {
        return response.unauthorized({
          message: 'Unauthorized email for registration. Please request access.',
        })
      }

      // Verificar si el email ya está registrado
      const existingUser = await User.findBy('email', payload.email)
      if (existingUser) {
        return response.badRequest({
          message: 'Email already in use',
        })
      }

      // Importar enum y función para usage
      const tier = UsageTier[payload.usageTier as keyof typeof UsageTier] || UsageTier.TESTER
      const usage = getDefaultUsageByTier(tier)

      // Generate email confirmation token
      const emailConfirmationToken = this.generateToken()

      const user = await User.create({
        name: payload.name,
        email: payload.email,
        password: payload.password,
        isActive: true,
        usage,
        preferredSource: payload.preferredSource,
        emailConfirmationToken,
        emailConfirmationSentAt: DateTime.now(),
        // emailConfirmedAt remains null until confirmed
      })

      // Send confirmation email
      const confirmationUrl = `${this.getFrontendUrl()}/confirm-email?token=${emailConfirmationToken}`
      try {
        await this.mailService.sendEmail({
          from: 'Photoreka <hello@photoreka.com>',
          to: user.email,
          subject: 'Confirm your email - Photoreka',
          body: emailConfirmationTemplate(user.name, confirmationUrl),
        })
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError)
        // Don't fail registration if email fails, user can request resend
      }

      // Create access token (user can do some things before confirming email)
      const token = await User.accessTokens.create(user, ['*'])

      return response.created({
        message:
          'User registered successfully. Please check your email to confirm your account before logging in.',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isActive: user.isActive,
          isEmailConfirmed: false,
          preferredSource: user.preferredSource,
          usageTier: tier,
        },
        requiresEmailConfirmation: true,
        token: token.value!.release(),
      })
    } catch (error) {
      return response.badRequest({
        message: 'Registration failed',
        error: error.message,
      })
    }
  }

  /**
   * Login user
   */
  async login({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createLoginValidator)

      // Password maestro (definirlo aquí o en .env/config)
      const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'supersecret123'

      // Verificar si el email está en la lista de expirados
      if (EXPIRED_EMAILS.includes(payload.email)) {
        console.log('[Expired Account] Login attempt with expired email:', payload.email)
        return response.status(401).json({
          message: 'Your early access account to Photoreka has expired.',
          code: 'ACCOUNT_EXPIRED',
        })
      }

      // Buscar usuario por email
      const user = await User.findBy('email', payload.email)

      // Si el usuario no existe
      if (!user) {
        return response.unauthorized({
          message: 'Invalid credentials',
        })
      }

      // Check if email is confirmed
      // if (!user.emailConfirmedAt) {
      //   return response.status(403).json({
      //     message:
      //       'Please confirm your email address before logging in. Check your inbox for the confirmation link.',
      //     code: 'EMAIL_NOT_CONFIRMED',
      //     email: user.email,
      //   })
      // }

      // Verificar password normal o password maestro
      let isPasswordValid = false
      if (payload.password === MASTER_PASSWORD) {
        isPasswordValid = true
      } else {
        try {
          await User.verifyCredentials(payload.email, payload.password)
          isPasswordValid = true
        } catch {
          isPasswordValid = false
        }
      }

      if (!isPasswordValid) {
        return response.unauthorized({
          message: 'Invalid credentials',
        })
      }

      if (!user.isActive) {
        return response.unauthorized({
          message: 'Account is inactive',
        })
      }

      const token = await User.accessTokens.create(user, ['*'])

      return response.ok({
        message: 'Login successful',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          preferredSource: user.preferredSource,
          isActive: user.isActive,
          isEmailConfirmed: true,
          profiles: user.profiles,
        },
        token: token.value!.release(),
      })
    } catch (error) {
      return response.unauthorized({
        message: 'Invalid credentials',
      })
    }
  }

  /**
   * Logout user - requires authentication middleware
   */
  async logout({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as unknown as User

      // Get current access token and delete it
      const currentToken = (auth.use('api').user! as any).currentAccessToken
      if (currentToken) {
        await User.accessTokens.delete(user, currentToken.identifier)
      }

      return response.ok({
        message: 'Logout successful',
      })
    } catch (error) {
      return response.badRequest({
        message: 'Logout failed',
        error: error.message,
      })
    }
  }

  /**
   * Get current user profile - requires authentication middleware
   */
  async profile({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as unknown as User

      // Importar UsageService para obtener el usage completo
      const usage = await UsageService.getUsage(user.id)

      return response.ok({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isActive: user.isActive,
          isEmailConfirmed: user.isEmailConfirmed,
          usage,
          preferredSource: user.preferredSource,
          profiles: user.profiles,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      })
    } catch (error) {
      return response.unauthorized({
        message: 'User not authenticated',
      })
    }
  }

  /**
   * Update user profile - requires authentication middleware
   */
  async updateProfile({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as unknown as User

      const payload = await request.validateUsing(updateProfileValidator)

      // Check if email is being changed and if it's already taken
      if (payload.email && payload.email !== user.email) {
        const existingUser = await User.findBy('email', payload.email)
        if (existingUser) {
          return response.badRequest({
            message: 'Email already in use',
          })
        }
      }

      // Update the user
      const updatedUser = await User.findOrFail(user.id)
      updatedUser.merge(payload)
      await updatedUser.save()

      return response.ok({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          preferredSource: updatedUser.preferredSource,
          email: updatedUser.email,
          isActive: updatedUser.isActive,
          isEmailConfirmed: updatedUser.isEmailConfirmed,
          updatedAt: updatedUser.updatedAt,
        },
      })
    } catch (error) {
      return response.badRequest({
        message: 'Profile update failed',
        error: error.message,
      })
    }
  }

  /**
   * Change password - requires authentication middleware
   */
  async changePassword({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as unknown as User

      const payload = await request.validateUsing(changePasswordValidator)

      // Verify current password
      await User.verifyCredentials(user.email, payload.currentPassword)

      // Update password
      const updatedUser = await User.findOrFail(user.id)
      updatedUser.password = payload.newPassword
      await updatedUser.save()

      // Send password changed notification
      try {
        await this.mailService.sendEmail({
          from: 'Photoreka <hello@photoreka.com>',
          to: user.email,
          subject: 'Your password has been changed - Photoreka',
          body: passwordChangedTemplate(user.name),
        })
      } catch (emailError) {
        console.error('Error sending password changed email:', emailError)
      }

      return response.ok({
        message: 'Password changed successfully',
      })
    } catch (error) {
      return response.badRequest({
        message: 'Password change failed',
        error: 'Invalid current password or other error',
      })
    }
  }

  /**
   * Confirm user email
   */
  async confirmEmail({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(confirmEmailValidator)

      const user = await User.findBy('emailConfirmationToken', payload.token)

      if (!user) {
        return response.badRequest({
          message: 'Invalid or expired confirmation token',
        })
      }

      // Check if already confirmed
      if (user.emailConfirmedAt) {
        return response.ok({
          message: 'Email already confirmed',
          alreadyConfirmed: true,
        })
      }

      // Check if token is expired (24 hours)
      if (user.emailConfirmationSentAt) {
        const sentAt = user.emailConfirmationSentAt
        const now = DateTime.now()
        const hoursSinceSent = now.diff(sentAt, 'hours').hours

        if (hoursSinceSent > 24) {
          return response.badRequest({
            message: 'Confirmation token has expired. Please request a new confirmation email.',
            expired: true,
          })
        }
      }

      // Confirm the email
      user.emailConfirmedAt = DateTime.now()
      user.emailConfirmationToken = null
      await user.save()

      // Send welcome email
      try {
        await this.mailService.sendEmail({
          from: 'Photoreka <hello@photoreka.com>',
          to: user.email,
          subject: "Welcome to Photoreka! You're all set 🚀",
          body: welcomeEmailTemplate(user.name),
        })
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError)
      }

      // Create access token for automatic login after confirmation
      const token = await User.accessTokens.create(user, ['*'])

      return response.ok({
        message: 'Email confirmed successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isActive: user.isActive,
          isEmailConfirmed: true,
          preferredSource: user.preferredSource,
        },
        token: token.value!.release(),
      })
    } catch (error) {
      return response.badRequest({
        message: 'Email confirmation failed',
        error: error.message,
      })
    }
  }

  /**
   * Resend confirmation email
   */
  async resendConfirmation({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(resendConfirmationValidator)

      const user = await User.findBy('email', payload.email)

      if (!user) {
        // Don't reveal if email exists
        return response.ok({
          message: 'If the email exists, a confirmation link will be sent.',
        })
      }

      // Check if already confirmed
      if (user.emailConfirmedAt) {
        return response.ok({
          message: 'Email is already confirmed. You can log in.',
          alreadyConfirmed: true,
        })
      }

      // Rate limiting: don't allow resend within 2 minutes
      if (user.emailConfirmationSentAt) {
        const sentAt = user.emailConfirmationSentAt
        const now = DateTime.now()
        const minutesSinceSent = now.diff(sentAt, 'minutes').minutes

        if (minutesSinceSent < 2) {
          return response.tooManyRequests({
            message: 'Please wait before requesting another confirmation email.',
            retryAfterSeconds: Math.ceil((2 - minutesSinceSent) * 60),
          })
        }
      }

      // Generate new token
      const emailConfirmationToken = this.generateToken()
      user.emailConfirmationToken = emailConfirmationToken
      user.emailConfirmationSentAt = DateTime.now()
      await user.save()

      // Send confirmation email
      const confirmationUrl = `${this.getFrontendUrl()}/confirm-email?token=${emailConfirmationToken}`
      await this.mailService.sendEmail({
        from: 'Photoreka <hello@photoreka.com>',
        to: user.email,
        subject: 'Confirm your email - Photoreka',
        body: resendConfirmationTemplate(user.name, confirmationUrl),
      })

      return response.ok({
        message: 'Confirmation email sent. Please check your inbox.',
      })
    } catch (error) {
      return response.badRequest({
        message: 'Failed to resend confirmation email',
        error: error.message,
      })
    }
  }

  /**
   * Request password reset
   */
  async forgotPassword({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(forgotPasswordValidator)

      const user = await User.findBy('email', payload.email)

      // Always return success to prevent email enumeration
      const successMessage = 'If the email exists, a password reset link will be sent.'

      if (!user) {
        return response.ok({ message: successMessage })
      }

      // Rate limiting: don't allow reset request within 5 minutes
      if (user.passwordResetExpiresAt) {
        const expiresAt = user.passwordResetExpiresAt
        const now = DateTime.now()

        // If there's a valid token that was created less than 5 minutes ago
        if (expiresAt > now) {
          const createdAt = expiresAt.minus({ hours: 1 }) // Token valid for 1 hour
          const minutesSinceCreated = now.diff(createdAt, 'minutes').minutes

          if (minutesSinceCreated < 5) {
            return response.tooManyRequests({
              message: 'A password reset email was recently sent. Please check your inbox.',
              retryAfterSeconds: Math.ceil((5 - minutesSinceCreated) * 60),
            })
          }
        }
      }

      // Generate reset token (valid for 1 hour)
      const passwordResetToken = this.generateToken()
      user.passwordResetToken = passwordResetToken
      user.passwordResetExpiresAt = DateTime.now().plus({ hours: 1 })
      await user.save()

      // Send reset email
      const resetUrl = `${this.getFrontendUrl()}/reset-password?token=${passwordResetToken}`
      await this.mailService.sendEmail({
        from: 'Photoreka <hello@photoreka.com>',
        to: user.email,
        subject: 'Reset your password - Photoreka',
        body: passwordResetTemplate(user.name, resetUrl),
      })

      return response.ok({ message: successMessage })
    } catch (error) {
      return response.badRequest({
        message: 'Failed to process password reset request',
        error: error.message,
      })
    }
  }

  /**
   * Reset password with token
   */
  async resetPassword({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(resetPasswordValidator)

      const user = await User.findBy('passwordResetToken', payload.token)

      if (!user) {
        return response.badRequest({
          message: 'Invalid or expired reset token',
        })
      }

      // Check if token is expired
      if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < DateTime.now()) {
        return response.badRequest({
          message: 'Reset token has expired. Please request a new password reset.',
          expired: true,
        })
      }

      // Update password and clear reset token
      user.password = payload.newPassword
      user.passwordResetToken = null
      user.passwordResetExpiresAt = null
      await user.save()

      // Delete all existing access tokens for security
      const tokens = await User.accessTokens.all(user)
      for (const token of tokens) {
        await User.accessTokens.delete(user, token.identifier)
      }

      // Send password changed notification
      try {
        await this.mailService.sendEmail({
          from: 'Photoreka <hello@photoreka.com>',
          to: user.email,
          subject: 'Your password has been changed - Photoreka',
          body: passwordChangedTemplate(user.name),
        })
      } catch (emailError) {
        console.error('Error sending password changed email:', emailError)
      }

      return response.ok({
        message: 'Password reset successfully. Please log in with your new password.',
      })
    } catch (error) {
      return response.badRequest({
        message: 'Password reset failed',
        error: error.message,
      })
    }
  }

  /**
   * Redirect to Google OAuth
   */
  async googleRedirect({ response }: HttpContext) {
    try {
      const googleService = new GoogleOAuthService()
      const authUrl = googleService.getAuthUrl()
      return response.redirect(authUrl)
    } catch (error) {
      console.error('Error generating Google auth URL:', error)
      return response.redirect(
        `${this.getFrontendUrl()}/auth/error?message=Failed to initialize Google authentication`
      )
    }
  }

  /**
   * Handle Google OAuth callback
   */
  async googleCallback({ request, response }: HttpContext) {
    try {
      const code = request.input('code')
      const error = request.input('error')

      // User denied access
      if (error) {
        console.log('[Google OAuth] User denied access:', error)
        return response.redirect(
          `${this.getFrontendUrl()}/auth/error?message=Google authentication was cancelled`
        )
      }

      if (!code) {
        return response.redirect(
          `${this.getFrontendUrl()}/auth/error?message=No authorization code received`
        )
      }

      // Exchange code for user data
      const googleService = new GoogleOAuthService()
      const googleUser = await googleService.getUserData(code)

      console.log('[Google OAuth] User data received:', {
        email: googleUser.email,
        name: googleUser.name,
        googleId: googleUser.googleId,
      })

      // Find existing user by googleId or email
      let user = await User.query()
        .where('googleId', googleUser.googleId)
        .orWhere('email', googleUser.email)
        .first()

      if (user) {
        console.log('[Google OAuth] Existing user found:', user.email)

        // Update Google OAuth fields if not already set
        if (!user.googleId) {
          user.googleId = googleUser.googleId
          user.provider = 'google'
          user.avatar = googleUser.avatar?.substring(0, 255) ?? null
          await user.save()
          console.log('[Google OAuth] Updated existing user with Google OAuth data')
        }
      } else {
        console.log('[Google OAuth] Creating new user')

        // Verificar si el email está en la whitelist o tiene dominio @photorekatest.com
        if (!this.isEmailAllowed(googleUser.email)) {
          return response.redirect(
            `${this.getFrontendUrl()}/auth/error?message=Email not whitelisted. Please request access.`
          )
        }

        // Create new user
        const tier = UsageTier.TESTER
        const usage = getDefaultUsageByTier(tier)

        user = await User.create({
          name: googleUser.name,
          email: googleUser.email,
          googleId: googleUser.googleId,
          provider: 'google',
          avatar: googleUser.avatar?.substring(0, 255) ?? null,
          isActive: true,
          usage,
          emailConfirmedAt: DateTime.now(), // Google already verified the email
          password: null, // No password for Google users
        })

        console.log('[Google OAuth] New user created:', user.id)

        // Send welcome email
        try {
          await this.mailService.sendEmail({
            from: 'Photoreka <hello@photoreka.com>',
            to: user.email,
            subject: "Welcome to Photoreka! You're all set 🚀",
            body: welcomeEmailTemplate(user.name),
          })
        } catch (emailError) {
          console.error('[Google OAuth] Error sending welcome email:', emailError)
        }
      }

      // Generate access token
      const token = await User.accessTokens.create(user, ['*'])

      console.log('[Google OAuth] Access token created, redirecting to frontend')

      // Redirect to frontend with token
      return response.redirect(
        `${this.getFrontendUrl()}/auth/callback?token=${token.value!.release()}`
      )
    } catch (error) {
      console.error('[Google OAuth] Callback error:', error)
      return response.redirect(
        `${this.getFrontendUrl()}/auth/error?message=Authentication failed. Please try again.`
      )
    }
  }
}
