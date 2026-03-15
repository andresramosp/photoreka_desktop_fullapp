// @ts-nocheck

import AnalyzerProcess from '#models/analyzer/analyzerProcess'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import HealthPhotoService from '#services/health_photo_service'
import AnalyzerProcessRunner from '#services/analyzer_service'

export interface ProcessListItem {
  id: string
  packageId: string
  mode: string
  currentStage: string | null
  isFastMode: boolean
  userId: number | null
  userName: string | null
  userEmail: string | null
  photosTotal: number
  photosCompleted: number
  photosPending: number
  totalCostEur: number
  createdAt: string
  updatedAt: string
}

export interface ProcessDetail extends ProcessListItem {
  costReport: Record<string, any> | null
  processSheetSummary: TaskProgress[] | null
  hadRetry: boolean
}

export interface TaskProgress {
  taskName: string
  completed: number
  pending: number
  total: number
}

export default class AdminProcessesService {
  /**
   * List processes filtered to non-preprocess, mode adding/retry_process
   */
  static async list(filters?: {
    search?: string
    stage?: string
    sortBy?: string
    sortDir?: string
  }): Promise<ProcessListItem[]> {
    let query = AnalyzerProcess.query()
      .where('isPreprocess', false)
      .whereIn('mode', ['adding', 'retry_process', 'admin_retry'])
      .whereNotNull('user_id')
      .orderBy('created_at', 'desc')

    if (filters?.stage) {
      query = query.where('currentStage', filters.stage)
    }

    if (filters?.sortBy) {
      const dir = (filters.sortDir === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc'
      query = query.orderBy(filters.sortBy, dir)
    }

    const processes = await query

    // Gather unique user IDs for batch lookup
    const userIds = [...new Set(processes.map((p) => p.userId).filter(Boolean))] as number[]
    const usersMap = new Map<number, { name: string; email: string }>()
    if (userIds.length > 0) {
      const users = await User.query().whereIn('id', userIds).select('id', 'name', 'email')
      for (const u of users) {
        usersMap.set(u.id, { name: u.name, email: u.email })
      }
    }

    // Count photos per process in batch
    const photoCountsRaw = await db
      .from('photos')
      .select('analyzer_process_id')
      .count('* as photos_count')
      .whereIn(
        'analyzer_process_id',
        processes.map((p) => p.id)
      )
      .whereNull('deleted_at')
      .groupBy('analyzer_process_id')

    const photoCounts = new Map<string, number>()
    for (const row of photoCountsRaw) {
      photoCounts.set(String(row.analyzer_process_id), Number(row.photos_count))
    }

    // Filter by user search if needed
    let filteredProcesses = processes
    if (filters?.search) {
      const term = filters.search.toLowerCase()
      filteredProcesses = processes.filter((p) => {
        if (!p.userId) return false
        const user = usersMap.get(p.userId)
        if (!user) return false
        return user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term)
      })
    }

    return filteredProcesses.map((p) => {
      const user = p.userId ? usersMap.get(p.userId) : null
      const { completed, pending, total } = computeSheetTotals(p.processSheet)

      return {
        id: p.id,
        packageId: p.packageId,
        mode: p.mode,
        currentStage: p.currentStage,
        isFastMode: p.isFastMode,
        userId: p.userId,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        photosTotal: total || (photoCounts.get(String(p.id)) ?? 0),
        photosCompleted: completed,
        photosPending: pending,
        totalCostEur: p.costReport?.totalCostInEur ?? 0,
        createdAt: p.createdAt.toISO()!,
        updatedAt: p.updatedAt.toISO()!,
      }
    })
  }

  /**
   * Get process detail with cost breakdown and processSheet summary
   */
  static async getDetail(processId: string): Promise<ProcessDetail | null> {
    const p = await AnalyzerProcess.find(processId)
    if (!p) return null

    let user: { name: string; email: string } | null = null
    if (p.userId) {
      const u = await User.find(p.userId)
      if (u) user = { name: u.name, email: u.email }
    }

    const { completed, pending, total } = computeSheetTotals(p.processSheet)

    // Build per-task summary from processSheet
    let processSheetSummary: TaskProgress[] | null = null
    if (p.processSheet) {
      processSheetSummary = Object.entries(p.processSheet).map(([taskName, taskState]) => ({
        taskName,
        completed: taskState.completedPhotoIds?.length ?? 0,
        pending: taskState.pendingPhotoIds?.length ?? 0,
        total:
          (taskState.completedPhotoIds?.length ?? 0) + (taskState.pendingPhotoIds?.length ?? 0),
      }))
    }

    // Photo count from DB as fallback
    let photosTotal = total
    if (!photosTotal) {
      const countResult = await db
        .from('photos')
        .where('analyzer_process_id', p.id)
        .whereNull('deleted_at')
        .count('* as total')
      photosTotal = Number(countResult[0]?.total || 0)
    }

    return {
      id: p.id,
      packageId: p.packageId,
      mode: p.mode,
      currentStage: p.currentStage,
      isFastMode: p.isFastMode,
      userId: p.userId,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      photosTotal,
      photosCompleted: completed,
      photosPending: pending,
      totalCostEur: p.costReport?.totalCostInEur ?? 0,
      createdAt: p.createdAt.toISO()!,
      updatedAt: p.updatedAt.toISO()!,
      costReport: p.costReport ?? null,
      processSheetSummary,
      hadRetry: p.mode === 'retry_process',
    }
  }

  /**
   * Run health check on all photos of a process
   */
  static async healthCheck(processId: string) {
    const p = await AnalyzerProcess.find(processId)
    if (!p) return null

    await p.load('photos')
    const photoIds = (p.photos || []).map((photo: any) => photo.id)

    if (photoIds.length === 0) {
      return {
        processId: p.id,
        packageId: p.packageId,
        totalPhotos: 0,
        healthyPhotos: 0,
        unhealthyPhotos: 0,
        photos: [],
      }
    }

    const reports = await HealthPhotoService.healthForPhotoIdsBatch(photoIds)

    const photos = reports.map((r: any) => ({
      photoId: r.photoId,
      ok: r.ok,
      totalChecks: r.checks.length,
      passedChecks: r.checks.filter((c: any) => c.ok).length,
      failedChecks: r.checks.filter((c: any) => !c.ok).length,
      missing: r.missing,
      checks: r.checks,
    }))

    const healthyPhotos = photos.filter((p: any) => p.ok).length

    return {
      processId: p.id,
      packageId: p.packageId,
      totalPhotos: photos.length,
      healthyPhotos,
      unhealthyPhotos: photos.length - healthyPhotos,
      photos,
    }
  }

  /**
   * Launch an admin_retry for a process (no cost to user, no autoRetry)
   */
  static async adminRetry(
    processId: string
  ): Promise<{ processId: string; error?: string } | null> {
    const p = await AnalyzerProcess.find(processId)
    if (!p) return null

    // Only allow retry on non-active processes
    const terminalStages = ['finished', 'failed']
    const isStale =
      !terminalStages.includes(p.currentStage ?? '') && p.updatedAt.diffNow('minutes').minutes < -10
    const isTerminal = terminalStages.includes(p.currentStage ?? '')

    if (!isTerminal && !isStale) {
      return {
        processId: p.id,
        error: 'Process appears to still be running. Wait or check if the API restarted.',
      }
    }

    await p.load('photos')
    const photos = p.photos || []
    if (photos.length === 0) {
      return { processId: p.id, error: 'No photos associated with this process' }
    }

    const runner = new AnalyzerProcessRunner()
    await runner.initProcess(
      photos,
      p.packageId,
      'admin_retry',
      p.isFastMode,
      Number(p.id),
      String(p.userId)
    )

    // Fire and forget
    runner.runAll().catch(() => {})

    return { processId: p.id }
  }
}

/**
 * Compute aggregated photo counts from processSheet.
 * Uses the first task as reference for total (all tasks start with the same photo set).
 */
function computeSheetTotals(sheet: any): {
  completed: number
  pending: number
  total: number
} {
  if (!sheet || typeof sheet !== 'object') return { completed: 0, pending: 0, total: 0 }

  const tasks = Object.values(sheet) as any[]
  if (tasks.length === 0) return { completed: 0, pending: 0, total: 0 }

  // Use the first task to determine the total photo count
  const first = tasks[0]
  const total = (first.completedPhotoIds?.length ?? 0) + (first.pendingPhotoIds?.length ?? 0)

  // For overall progress, check if ALL tasks are completed for each photo
  // Simpler approach: use the task with the most pending as the "worst case"
  let maxPending = 0
  for (const t of tasks) {
    const p = t.pendingPhotoIds?.length ?? 0
    if (p > maxPending) maxPending = p
  }

  return {
    completed: total - maxPending,
    pending: maxPending,
    total,
  }
}
