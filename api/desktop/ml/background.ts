import { Worker } from 'node:worker_threads'

/**
 * UMAP y los clusters tardan de segundos a un minuto con catálogos grandes: se calculan en un
 * hilo aparte para no bloquear la API mientras tanto.
 */
export function inBackground(task: 'reduce' | 'clusters', payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reduction_worker.js', import.meta.url), { workerData: { task, payload } })
    worker.once('message', (message) => (message.error ? reject(new Error(message.error)) : resolve(message.result)))
    worker.once('error', reject)
    worker.once('exit', (code) => code !== 0 && reject(new Error(`El cálculo terminó con código ${code}`)))
  })
}
