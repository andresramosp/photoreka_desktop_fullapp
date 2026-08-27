import { Worker } from 'node:worker_threads'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dhashCompare } from '../utils/dhash_compare.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_FILE = path.resolve(__dirname, '../workers/cpu_worker.js')

/**
 * Mismo registro que `app/workers/cpu_worker.ts`, para poder ejecutar la tarea en
 * línea cuando no hay worker que lanzar. Solo puede contener funciones puras: lo
 * que necesite base de datos o config de Adonis no vale aquí ni en el worker.
 */
const inlineTasks: Record<string, (payload: any) => unknown> = {
  dhash_compare: dhashCompare,
}

/**
 * En desarrollo el proceso corre desde los `.ts` y el worker apunta a un `.js`
 * compilado que solo existe en `build/`. Se comprueba una vez: si no está, todo
 * se ejecuta en línea (bloqueando, como antes) en vez de fallar.
 */
const WORKER_AVAILABLE = existsSync(WORKER_FILE)

/**
 * Generic CPU Worker Pool.
 *
 * Offloads CPU-intensive tasks to a worker thread so the main event loop
 * stays free to handle other HTTP requests (login, etc.).
 *
 * Usage:
 *   const result = await CpuWorkerPool.run('dhash_compare', { photoHashes, ... })
 *
 * To add a new task:
 *   1. Register a handler in app/workers/cpu_worker.ts
 *   2. Register the same pure function in `inlineTasks` (fallback de desarrollo)
 *   3. Call CpuWorkerPool.run('your_task_name', payload)
 */
export default class CpuWorkerPool {
  /** ¿Hay worker de verdad, o las tareas se ejecutan en el hilo principal? */
  static get isOffloading(): boolean {
    return WORKER_AVAILABLE
  }

  static run<T = unknown>(taskName: string, payload: unknown): Promise<T> {
    if (!WORKER_AVAILABLE) {
      const inline = inlineTasks[taskName]
      if (!inline) {
        return Promise.reject(new Error(`Unknown CPU worker task: ${taskName}`))
      }
      // `resolve` diferido para que el trabajo no arranque dentro del `then` del
      // llamante: quien espera esto ya cuenta con que es asíncrono.
      return new Promise((resolve, reject) => {
        setImmediate(() => {
          try {
            resolve(inline(payload) as T)
          } catch (error) {
            reject(error)
          }
        })
      })
    }

    return new Promise((resolve, reject) => {
      const worker = new Worker(WORKER_FILE, {
        workerData: { taskName, payload },
      })

      worker.on('message', (result: T) => {
        resolve(result)
      })

      worker.on('error', (err) => {
        reject(err)
      })

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`))
        }
      })
    })
  }
}
