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

    // Handoff goes plugin → web browser: the browser is what ends up holding
    // this token, so it gets a normal expiring one.
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

  // ─── Device Authorization Flow (for Google / browser-based login from LR) ───

  /**
   * Step 1 — Plugin calls this (no auth) to create a pending session.
   * Returns a sessionId that the plugin will poll.
   */
  async createDeviceSession({ response }: HttpContext) {
    const sessionId = this.generateToken()
    const redisKey = `lr:device:${sessionId}`

    await redis.set(
      redisKey,
      JSON.stringify({ status: 'pending' }),
      'EX',
      600 // 10 minutes
    )

    return response.ok({
      sessionId,
      expiresInSeconds: 600,
    })
  }

  /**
   * Step 2 — Web app calls this (requires auth) after the user logs in via browser.
   * Associates the logged-in user's token with the pending session.
   */
  async completeDeviceSession({ auth, request, response }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user as User

    const { sessionId } = request.only(['sessionId'])

    if (!sessionId) {
      return response.badRequest({ message: 'Missing sessionId' })
    }

    const redisKey = `lr:device:${sessionId}`
    const raw = await redis.get(redisKey)

    if (!raw) {
      return response.notFound({ message: 'Session not found or expired' })
    }

    let data: { status: string }
    try {
      data = JSON.parse(raw)
    } catch {
      return response.badRequest({ message: 'Invalid session data' })
    }

    if (data.status !== 'pending') {
      return response.badRequest({ message: 'Session already completed' })
    }

    // The token row lives in Postgres (auth_access_tokens); its plaintext value
    // is then parked briefly in Redis below so the Lightroom plugin can poll and
    // pick it up (browser-based Google login flow). The plugin runs unattended
    // and can't silently re-authenticate, so this token must never expire.
    const accessToken = await User.accessTokensEternal.create(user, ['*'])
    const tokenValue = accessToken.value!.release()

    await redis.set(
      redisKey,
      JSON.stringify({
        status: 'completed',
        token: tokenValue,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          preferredSource: user.preferredSource,
          isActive: user.isActive,
          isEmailConfirmed: user.isEmailConfirmed,
        },
      }),
      'EX',
      300 // 5 more minutes for the plugin to consume it
    )

    return response.ok({ message: 'Session completed' })
  }

  /**
   * Step 3 — Plugin polls this (no auth) to check if the session is ready.
   * When status is 'completed', returns the token and deletes the session atomically.
   */
  async pollDeviceSession({ request, response }: HttpContext) {
    const sessionId = request.input('sessionId')

    if (!sessionId) {
      return response.badRequest({ message: 'Missing sessionId' })
    }

    const redisKey = `lr:device:${sessionId}`

    const pipeline = redis.multi()
    pipeline.get(redisKey)

    const peeked = await redis.get(redisKey)

    if (!peeked) {
      return response.ok({ status: 'expired' })
    }

    let data: { status: string; token?: string; user?: object }
    try {
      data = JSON.parse(peeked)
    } catch {
      return response.ok({ status: 'expired' })
    }

    if (data.status === 'completed') {
      // Consume atomically
      await redis.del(redisKey)
      return response.ok({
        status: 'completed',
        token: data.token,
        user: data.user,
      })
    }

    return response.ok({ status: 'pending' })
  }
}
