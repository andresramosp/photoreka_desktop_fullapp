// @ts-nocheck

import Ws from '#services/ws'

export type RepairTaskType =
  | 'user-retry'
  | 'global-clip'
  | 'global-embeddings'
  | 'score-smoothing'
export type RepairTaskStatus = 'running' | 'completed' | 'failed'

export interface RepairTaskInfo {
  taskId: string
  type: RepairTaskType
  status: RepairTaskStatus
  current: number
  total: number
  message: string
  startedAt: string
}

class HealthRepairTracker {
  private tasks = new Map<string, RepairTaskInfo>()
  private counter = 0

  getActiveTasks(): RepairTaskInfo[] {
    return Array.from(this.tasks.values()).filter((t) => t.status === 'running')
  }

  getRecentTasks(): RepairTaskInfo[] {
    return Array.from(this.tasks.values())
  }

  start(type: RepairTaskType, total: number, message: string): string {
    const taskId = `repair-${++this.counter}-${Date.now()}`
    const task: RepairTaskInfo = {
      taskId,
      type,
      status: 'running',
      current: 0,
      total,
      message,
      startedAt: new Date().toISOString(),
    }
    this.tasks.set(taskId, task)
    this.emit('health:task:update', task)
    return taskId
  }

  progress(taskId: string, current: number, message?: string) {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.current = current
    if (message) task.message = message
    this.emit('health:task:update', task)
  }

  complete(taskId: string, message?: string) {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.status = 'completed'
    task.current = task.total
    if (message) task.message = message
    this.emit('health:task:update', task)
    setTimeout(() => this.tasks.delete(taskId), 120_000)
  }

  fail(taskId: string, error?: string) {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.status = 'failed'
    task.message = error || 'Task failed'
    this.emit('health:task:update', task)
    setTimeout(() => this.tasks.delete(taskId), 120_000)
  }

  private emit(event: string, task: RepairTaskInfo) {
    try {
      Ws.io?.to('admin-health').emit(event, {
        taskId: task.taskId,
        type: task.type,
        status: task.status,
        current: task.current,
        total: task.total,
        message: task.message,
      })
    } catch {
      // WS not available
    }
  }
}

export default new HealthRepairTracker()
