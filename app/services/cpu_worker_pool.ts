import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_FILE = path.resolve(__dirname, '../workers/cpu_worker.js')

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
 *   2. Call CpuWorkerPool.run('your_task_name', payload)
 */
export default class CpuWorkerPool {
  static run<T = unknown>(taskName: string, payload: unknown): Promise<T> {
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
