import type { HttpContext } from '@adonisjs/core/http'
import CloudAccountService from '../services/cloud_account_service.js'

export default class DesktopAuthController {
  async start({ response }: HttpContext) {
    try {
      return response.ok(await CloudAccountService.startLogin())
    } catch (error) {
      return response.serviceUnavailable({ message: 'Could not reach Photoreka. Check your connection and try again.' })
    }
  }

  async poll({ request, response }: HttpContext) {
    const sessionId = request.input('sessionId')
    if (!sessionId) return response.badRequest({ message: 'Missing sessionId' })
    try {
      return response.ok(await CloudAccountService.pollLogin(sessionId))
    } catch (error) {
      return response.serviceUnavailable({ message: 'Could not reach Photoreka. Check your connection and try again.' })
    }
  }

  async logout({ auth, response }: HttpContext) {
    const user = await auth.use('api').authenticate()
    await CloudAccountService.logout(user.id)
    return response.ok({ message: 'Logged out' })
  }
}
