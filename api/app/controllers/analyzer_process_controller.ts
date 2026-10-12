// app/controllers/analyzer_process_controller.ts
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import type { HttpContext } from '@adonisjs/core/http'

export default class AnalyzerProcessController {
  public async getAll({ response, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any
    const userId = user.id

    const processes = await AnalyzerProcess.query()
      .where('user_id', userId)
      .whereHas('photos', (query) => {
        query.whereNull('deleted_at')
      })
      .preload('photos', (query) => {
        query.select('id', 'thumbnailName', 'name')
      })
      .orderBy('created_at', 'desc')

    const slimProcesses = processes.map((process) => ({
      id: process.id,
      createdAt: process.createdAt,
      currentStage: process.currentStage,
      mode: process.mode,
      isPreprocess: process.isPreprocess,
      photos: process.photos.map((photo) => ({
        id: photo.id,
        name: photo.name,
        thumbnailUrl: photo.thumbnailUrl,
      })),
    }))

    return response.ok(slimProcesses)
  }

  public async getById({ params, response, auth }: HttpContext) {
    await auth.use('api').check()
    const user = auth.use('api').user! as any
    const userId = user.id

    const process = await AnalyzerProcess.query()
      .where('id', params.id)
      .where('user_id', userId)
      .whereHas('photos', (query) => {
        query.whereNull('deleted_at')
      })
      .preload('photos', (query) => {
        query.select('id', 'thumbnailUrl')
      })
      .first()

    if (!process) {
      return response.notFound({ message: 'AnalyzerProcess not found' })
    }

    // Excluir processSheet de la respuesta
    const { processSheet, ...rest } = process.toJSON()
    return response.ok(rest)
  }
}
