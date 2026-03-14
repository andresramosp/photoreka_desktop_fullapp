import User from '#models/user'
import Invite from '#models/invite'
import { HttpContext } from '@adonisjs/core/http'
import MailService from '#services/mail_service'
import crypto from 'crypto'
import { inviteUserTemplate, grantUserTemplate } from '../utils/email_templates.js'
import { UsageTier, UsageTierLimits } from '#services/usage_service'
import vine from '@vinejs/vine'

export default class InvitesController {
  private mailService = new MailService()

  /**
   * Generate an invitation code
   */
  private generateInviteCode(): string {
    return crypto.randomBytes(6).toString('hex').toUpperCase()
  }

  /**
   * Get the frontend URL from environment or default
   */
  private getFrontendUrl(): string {
    return process.env.FRONTEND_URL || 'https://app.photoreka.com'
  }

  /**
   * Generate invitation codes (admin only)
   */
  async generateInvite({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as unknown as User

      // TODO: Add proper admin role check here
      // For now, just require authentication
      // if (!user.isAdmin) {
      //   return response.unauthorized({ message: 'Admin access required' })
      // }

      const generateInviteValidator = vine.compile(
        vine.object({
          maxUses: vine.number().min(1).optional(),
          tier: vine.enum(Object.values(UsageTier)).optional(),
        })
      )
      const payload = await request.validateUsing(generateInviteValidator)

      const code = this.generateInviteCode()
      const invite = await Invite.create({
        code,
        createdBy: user.id,
        maxUses: payload.maxUses ?? 1,
        tier: (payload.tier as UsageTier) ?? UsageTier.BASIC,
      })

      return response.created({
        message: 'Invitation code generated successfully',
        invite: {
          id: invite.id,
          code: invite.code,
          tier: invite.tier,
          maxUses: invite.maxUses,
          useCount: invite.useCount,
          createdAt: invite.createdAt,
        },
      })
    } catch (error) {
      return response.badRequest({
        message: 'Failed to generate invitation code',
        error: error.message,
      })
    }
  }

  /**
   * List all invitation codes (admin only)
   */
  async listInvites({ auth, response }: HttpContext) {
    try {
      await auth.use('api').check()
      // const user = auth.use('api').user! as unknown as User

      // TODO: Add proper admin role check here
      // if (!user.isAdmin) {
      //   return response.unauthorized({ message: 'Admin access required' })
      // }

      const invites = await Invite.query().orderBy('created_at', 'desc')

      return response.ok({
        invites: invites.map((invite) => ({
          id: invite.id,
          code: invite.code,
          isUsed: invite.isUsed,
          maxUses: invite.maxUses,
          useCount: invite.useCount,
          usedAt: invite.usedAt,
          createdBy: invite.createdBy,
          createdAt: invite.createdAt,
        })),
      })
    } catch (error) {
      return response.badRequest({
        message: 'Failed to list invitation codes',
        error: error.message,
      })
    }
  }

  /**
   * Send invitation email to a user
   */
  async sendInvite({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as unknown as User

      // const user = {
      //   id: 2,
      //   name: 'Photoreka',
      //   email: 'hello@photoreka.com',
      // } as unknown as User

      // Validate request payload
      const sendInviteValidator = vine.compile(
        vine.object({
          email: vine.string().email().normalizeEmail(),
          maxUses: vine.number().min(1).optional(),
        })
      )

      const payload = await request.validateUsing(sendInviteValidator)

      // Check if user is trying to invite themselves
      if (payload.email === user.email) {
        return response.badRequest({
          message: 'You cannot invite yourself',
        })
      }

      // Check if the email is already registered
      const existingUser = await User.findBy('email', payload.email)
      if (existingUser) {
        return response.badRequest({
          message: 'This email is already registered on Photoreka',
        })
      }

      // Generate invitation code (user-generated invites are always BASIC tier)
      const code = this.generateInviteCode()
      const invite = await Invite.create({
        code,
        createdBy: user.id,
        maxUses: payload.maxUses ?? 1,
        tier: UsageTier.PROMOTIONAL,
      })

      // Create registration URL with invite code
      const registerUrl = `${this.getFrontendUrl()}/auth?inviteCode=${code}`

      // Send invitation email
      try {
        await this.mailService.sendEmail({
          from: 'The Photoreka Team <hello@photoreka.com>',
          to: payload.email,
          subject: `${user.name} invited you to try Photoreka (Early Access) 🚀`,

          body: inviteUserTemplate(
            user.name,
            code,
            registerUrl,
            UsageTierLimits[UsageTier.PROMOTIONAL].analyzedPhotosLimit
          ),
        })
      } catch (emailError) {
        console.error('Error sending invitation email:', emailError)
        // Delete the invite if email fails
        await invite.delete()
        return response.status(500).json({
          message: 'Failed to send invitation email',
          error: 'Email service error',
        })
      }

      return response.created({
        message: `Invitation sent successfully to ${payload.email}`,
        invite: {
          id: invite.id,
          code: invite.code,
          maxUses: invite.maxUses,
          useCount: invite.useCount,
          sentTo: payload.email,
          createdAt: invite.createdAt,
        },
      })
    } catch (error) {
      return response.badRequest({
        message: 'Failed to send invitation',
        error: error.message,
      })
    }
  }

  /**
   * Send grant (early access) email to a user
   */
  async sendGrant({ auth, request, response }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as unknown as User

      // Validate request payload
      const sendGrantValidator = vine.compile(
        vine.object({
          email: vine.string().email().normalizeEmail(),
          maxUses: vine.number().min(1).optional(),
          tier: vine.enum(Object.values(UsageTier)).optional(),
        })
      )

      const payload = await request.validateUsing(sendGrantValidator)

      // Check if user is trying to grant themselves
      if (payload.email === user.email) {
        return response.badRequest({
          message: 'You cannot grant access to yourself',
        })
      }

      // Check if the email is already registered
      const existingUser = await User.findBy('email', payload.email)
      if (existingUser) {
        return response.badRequest({
          message: 'This email is already registered on Photoreka',
        })
      }

      // Generate invitation code
      const code = this.generateInviteCode()
      const grantTier = (payload.tier as UsageTier) ?? UsageTier.PROMOTIONAL
      const invite = await Invite.create({
        code,
        createdBy: user.id,
        maxUses: payload.maxUses ?? 1,
        tier: grantTier,
      })

      // Create registration URL with invite code
      const registerUrl = `${this.getFrontendUrl()}/auth?inviteCode=${code}`

      // Send grant email
      try {
        await this.mailService.sendEmail({
          from: 'The Photoreka Team <hello@photoreka.com>',
          to: payload.email,
          subject: 'Your Photoreka early access is ready 🚀',
          body: grantUserTemplate(
            user.name,
            code,
            registerUrl,
            UsageTierLimits[grantTier].analyzedPhotosLimit
          ),
        })
      } catch (emailError) {
        console.error('Error sending grant email:', emailError)
        // Delete the invite if email fails
        await invite.delete()
        return response.status(500).json({
          message: 'Failed to send grant email',
          error: 'Email service error',
        })
      }

      return response.created({
        message: `Grant email sent successfully to ${payload.email}`,
        invite: {
          id: invite.id,
          code: invite.code,
          maxUses: invite.maxUses,
          useCount: invite.useCount,
          sentTo: payload.email,
          createdAt: invite.createdAt,
        },
      })
    } catch (error) {
      return response.badRequest({
        message: 'Failed to send grant email',
        error: error.message,
      })
    }
  }
}
