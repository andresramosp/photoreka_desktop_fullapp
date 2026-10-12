import { parentPort, workerData } from 'node:worker_threads'
import { computeClusters, reduceEmbeddingsTo3d } from './reduction.js'

const { task, payload } = workerData
try {
  const result = task === 'clusters' ? computeClusters(payload) : reduceEmbeddingsTo3d(payload)
  parentPort!.postMessage({ result })
} catch (error) {
  parentPort!.postMessage({ error: (error as Error).message })
}
