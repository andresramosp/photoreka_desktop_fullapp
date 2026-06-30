import User from '#models/user'
import type { WeightPreset } from '#models/user'
import { HttpContext } from '@adonisjs/core/http'

export default class WeightPresetsController {
  async index({ auth, response }: HttpContext) {
    try {
      const user = await User.findOrFail((auth.use('api').user! as unknown as User).id)
      return response.ok({ presets: user.customWeightPresets ?? [] })
    } catch (error: any) {
      return response.internalServerError({
        message: 'Failed to load presets',
        error: error?.message,
      })
    }
  }

  async store({ auth, request, response }: HttpContext) {
    try {
      const user = await User.findOrFail((auth.use('api').user! as unknown as User).id)

      const { name, weights } = request.only(['name', 'weights'])

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return response.badRequest({ message: 'Preset name is required' })
      }
      if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
        return response.badRequest({ message: 'Weights must be an object' })
      }

      const trimmedName = name.trim().slice(0, 80)
      const presets = user.customWeightPresets ?? []

      if (presets.length >= 20) {
        return response.badRequest({ message: 'Maximum of 20 custom presets allowed' })
      }

      const newPreset: WeightPreset = {
        id: crypto.randomUUID(),
        name: trimmedName,
        weights: weights as Record<string, number>,
        createdAt: new Date().toISOString(),
      }

      user.customWeightPresets = [...presets, newPreset]
      await user.save()

      return response.created({ preset: newPreset })
    } catch (error: any) {
      return response.internalServerError({
        message: 'Failed to save preset',
        error: error?.message,
      })
    }
  }

  async destroy({ auth, params, response }: HttpContext) {
    try {
      const user = await User.findOrFail((auth.use('api').user! as unknown as User).id)

      const presets = user.customWeightPresets ?? []
      const filtered = presets.filter((p) => p.id !== params.id)

      if (filtered.length === presets.length) {
        return response.notFound({ message: 'Preset not found' })
      }

      user.customWeightPresets = filtered
      await user.save()

      return response.ok({ message: 'Preset deleted' })
    } catch (error: any) {
      return response.internalServerError({
        message: 'Failed to delete preset',
        error: error?.message,
      })
    }
  }
}
