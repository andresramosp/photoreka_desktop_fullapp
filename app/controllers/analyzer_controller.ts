// @ts-nocheck

import type { HttpContext } from '@adonisjs/core/http'
import AnalyzerService from '#services/analyzer_service'
import Photo from '#models/photo'
import PhotoManager from '../managers/photo_manager.js'
import Logger from '../utils/logger.js'
import HealthPhotoService from '#services/health_photo_service'
import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import { packages } from '../analyzer_packages.js'
import UsageService from '#services/usage_service'
import AnalyzerPoolService from '#services/analyzer_pool_service'
import MailService from '#services/mail_service'
import User from '#models/user'
import { DateTime } from 'luxon'

const logger = Logger.getInstance('AnalyzerProcess')

export default class AnalyzerController {
  /**
   * ¿Es este el primer análisis real del usuario? Lo es cuando todavía no tiene
   * ningún proceso no-preprocess. Hay que consultarlo ANTES de crear el proceso
   * nuevo, o el propio análisis en curso cuenta como anterior.
   */
  private async isFirstAnalysis(userId: number): Promise<boolean> {
    const previous = await AnalyzerProcess.query()
      .where('user_id', userId)
      .where('is_preprocess', false)
      .select('id')
      .first()

    return !previous
  }

  /**
   * Avisa al admin la primera vez que un usuario lanza un análisis real.
   * El registro ya no notifica: la mayoría de altas nunca llegan a analizar nada.
   */
  private async notifyFirstAnalysis(userId: number, photoCount: number) {
    const user = await User.find(userId)
    if (!user) return

    await new MailService().sendEmail({
      from: 'Photoreka <hello@photoreka.com>',
      to: 'andreschennai@gmail.com',
      subject: 'Primer análisis de un usuario - Photoreka',
      body: [
        'Un usuario ha lanzado su primer análisis de fotos en Photoreka:',
        '',
        `Nombre: ${user.name}`,
        `Email: ${user.email}`,
        `ID: ${user.id}`,
        `Fotos en este análisis: ${photoCount}`,
        `Registrado: ${user.createdAt?.toISO() ?? '—'}`,
        `Fecha del análisis: ${DateTime.now().toISO()}`,
      ].join('\n'),
    })
  }

  public async analyze({ request, response, auth }: HttpContext) {
    const analyzerService = new AnalyzerService()
    const photoManager = new PhotoManager()

    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      if (!user) {
        return response.unauthorized({
          message: 'Credenciales inválidas',
        })
      }

      const {
        userId,
        packageId,
        processId,
        mode,
        fastMode,
        inmediate = true,
        photoIds,
        isGlobal = false,
        tasks,
      } = request.body()

      // `userId` del body solo se honra para admins: de lo contrario cualquiera podría
      // apuntar el análisis a otra cuenta y arrastrar sus fotos a su propio proceso.
      const targetUserId = user.role === 'admin' && userId ? userId : user.id

      // Obtener isPreprocess del package configuration
      const selectedPackage = packages.find((p) => p.id === packageId)
      if (!selectedPackage) {
        return response.badRequest({ message: `Package with id ${packageId} not found` })
      }
      const isPreprocess = selectedPackage.isPreprocess || false

      // TODO: decidir si en Lr lo permitimos o bloqueamos como en web

      // const runningProcess = await AnalyzerService.findRunningAddingProcess(mode, targetUserId)

      // if (runningProcess) {
      //   return response.conflict({
      //     message: 'You already have an analysis in progress.',
      //     processId: runningProcess.id,
      //   })
      // }

      logger.info(
        `Iniciando análisis - Paquete: ${packageId} - Modo: ${mode} - Inmediato: ${inmediate}` +
          (mode == 'retry_process' ? ` Process ID: ${processId}` : '')
      )

      // Si photoIds está presente y es un array, usar getPhotosByIds, si no, getPhotosForAnalysis
      let photos = []
      if (Array.isArray(photoIds) && photoIds.length > 0) {
        photos = await photoManager.getPhotosByIds(photoIds, targetUserId)
        if (photos.length !== photoIds.length) {
          logger.warn(
            `Se pidieron ${photoIds.length} fotos y solo ${photos.length} son del usuario ${targetUserId}`
          )
        }
      } else if (!isGlobal) {
        photos = await photoManager.getPhotosForAnalysis(
          mode,
          processId,
          targetUserId,
          isPreprocess
        )
      }

      // En modo 'adding' no reprocesamos fotos que ya están procesadas.
      // Misma regla que PhotoManager.onlyProcessed / Photo.status === 'processed'
      // (analyzerProcess viene precargado en ambos caminos de obtención de fotos).
      if (mode === 'adding') {
        photos = photos.filter((p) => p.status !== 'processed')
      }

      // Verificar si el usuario tiene capacidad suficiente para analizar estas fotos
      if (photos.length > 0) {
        const hasCapacity = await UsageService.hasCapacityToAnalyze(targetUserId, photos.length)
        if (!hasCapacity) {
          return response.forbidden({
            message: 'You have reached your analysis limit.',
          })
        }
      }

      if (photos.length || isGlobal) {
        // Solo los análisis reales cuentan: el preprocess se dispara al subir al
        // lightbox y no significa que el usuario haya llegado a analizar nada.
        // Los retries/remakes tampoco: operan sobre procesos que ya existían.
        const notifyAdmin =
          !isPreprocess && !isGlobal && mode === 'adding'
            ? await this.isFirstAnalysis(Number(targetUserId)).catch(() => false)
            : false

        await analyzerService.initProcess(
          photos,
          packageId,
          mode,
          fastMode,
          processId,
          targetUserId,
          tasks
        )

        if (notifyAdmin) {
          this.notifyFirstAnalysis(Number(targetUserId), photos.length).catch((err) =>
            logger.error('Error notificando el primer análisis del usuario:', err)
          )
        }

        if (inmediate) {
          if (isPreprocess) {
            logger.info(
              `Ejecutando análisis de forma síncrona (preprocess) para usuario ${targetUserId}`
            )
            await analyzerService.runAll()
          } else {
            if (!isGlobal) {
              const newProcessId = analyzerService.getProcessId()
              const acquired = await AnalyzerPoolService.tryAcquire(newProcessId!)
              if (acquired) {
                analyzerService.runAllAndReleasePool()
                logger.info(`Análisis ejecutado inmediatamente para usuario ${targetUserId}`)
              } else {
                await analyzerService.markQueued()
                logger.info(
                  `Pool lleno: proceso ${newProcessId} encolado (queued) para usuario ${targetUserId}`
                )
                AnalyzerPoolService.notifyQueued({
                  processId: newProcessId!,
                  userId: Number(targetUserId),
                  photoCount: photos.length,
                }).catch(() => {})
                return response.ok({
                  message: 'Analysis queued',
                  userId: targetUserId,
                  queued: true,
                })
              }
            } else {
              analyzerService.runGlobal()
              logger.info(`Análisis ejecutado inmediatamente para usuario ${targetUserId}`)
            }
          }
        } else {
          logger.info(`Análisis inicializado pero diferido para usuario ${targetUserId}`)
        }

        return response.ok({
          message: inmediate ? 'Analysis started' : 'Analysis initialized',
          userId: targetUserId,
        })
      }

      logger.info(`No hay fotos para analizar para el usuario ${targetUserId}`)
      return response.ok({ message: 'Nothing to analyze', userId: targetUserId })
    } catch (error) {
      logger.error('Error en el proceso de análisis:', error)
      return response.internalServerError({ message: 'Something went wrong', error: error.message })
    }
  }

  /**
   * Devuelve el health de una foto por su ID
   * GET /api/analyzer/health/photo?photoId=123
   */
  public async healthForPhoto({ request, response, auth }: HttpContext) {
    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const photoId = Number(request.qs().photoId)
      if (!photoId) return response.badRequest({ message: 'Missing photoId' })

      // Opcional: validar que la foto pertenezca al usuario autenticado
      // const photo = await Photo.query().where('id', photoId).where('user_id', user.id).first()
      // if (!photo) return response.notFound({ message: 'Photo not found or not owned by user' })

      const report = await HealthPhotoService.photoHealth(photoId)
      return response.ok({ photoId, ...report })
    } catch (error) {
      logger.error('Error obteniendo health de foto:', error)
      return response.internalServerError({ message: 'Something went wrong', error: error.message })
    }
  }
  public async healthForUser({ request, response, auth }: HttpContext) {
    try {
      const queryUserId = request.qs().userId
      const userId = Number(queryUserId)

      if (!userId) return response.badRequest({ message: 'Missing userId' })

      const reports = await HealthPhotoService.healthForUserRaw(userId)

      // Filtrar reports y checks por ok: false
      const filteredReports = reports
        .filter((r) => !r.ok)
        .map((r) => ({
          ...r,
          checks: Array.isArray(r.checks) ? r.checks.filter((c) => c && c.ok === false) : r.checks,
        }))

      return response.ok({
        userId,
        ok: reports.every((r) => r.ok),
        reports: filteredReports,
      })
    } catch (error) {
      logger.error('Error obteniendo health:', error)
      return response.internalServerError({ message: 'Something went wrong', error: error.message })
    }
  }

  public async healthForProcess({ request, response, auth }: HttpContext) {
    const processId = Number(request.qs().processId)
    if (!processId) return response.badRequest({ message: 'Missing processId' })

    try {
      await auth.use('api').check()
      const user = auth.use('api').user! as any
      const userId = user.id

      const process = await AnalyzerProcess.query()
        .where('id', processId)
        .where('user_id', userId)
        .first()

      if (!process) {
        return response.notFound({ message: 'AnalyzerProcess not found' })
      }

      // healthForProcess ahora maneja el preload internamente
      const reports = await HealthPhotoService.updateSheetWithHealth(process)

      // Aquí puedes devolver los datos que necesites
      // return response.ok(process?.processSheet)
    } catch (error) {
      logger.error('Error obteniendo health:', error)
      return response.internalServerError({ message: 'Something went wrong', error: error.message })
    }
  }
}
