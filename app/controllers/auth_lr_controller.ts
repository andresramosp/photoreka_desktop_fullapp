import crypto from 'crypto'
import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import redis from '@adonisjs/redis/services/main'

export default class AuthLrController {
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  /**
   * Lightroom → Backend
   * Creates a one-time login handoff token
   */
  async createHandoff({ auth, response }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user as User

    const token = this.generateToken()
    const redisKey = `lr:handoff:${token}`

    await redis.set(
      redisKey,
      JSON.stringify({
        userId: user.id,
        origin: 'lightroom',
      }),
      'EX',
      120 // seconds
    )

    return response.ok({
      handoffToken: token,
      expiresInSeconds: 120,
    })
  }

  /**
   * Web → Backend
   * Consumes the handoff token and creates a normal session
   */
  async consumeHandoff({ request, response }: HttpContext) {
    const { handoffToken } = request.only(['handoffToken'])

    if (!handoffToken) {
      return response.badRequest({ message: 'Missing handoff token' })
    }

    const redisKey = `lr:handoff:${handoffToken}`

    /**
     * Atomic consume: GET + DEL
     */
    const pipeline = redis.multi()
    pipeline.get(redisKey)
    pipeline.del(redisKey)

    const results = (await pipeline.exec()) as any[]
    const data = results[0]

    if (!data) {
      return response.unauthorized({
        message: 'Invalid, expired or already used token',
      })
    }

    let payload: { userId: number; origin: string }
    try {
      payload = JSON.parse(data[1])
    } catch {
      return response.unauthorized({ message: 'Invalid token payload' })
    }

    const user = await User.find(payload.userId)
    if (!user || !user.isActive) {
      return response.unauthorized({ message: 'Invalid user' })
    }

    const accessToken = await User.accessTokens.create(user, ['*'])

    return response.ok({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        preferredSource: user.preferredSource,
        isActive: user.isActive,
        isEmailConfirmed: user.isEmailConfirmed,
      },
      token: accessToken.value!.release(),
    })
  }
}
