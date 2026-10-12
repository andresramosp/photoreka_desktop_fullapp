import { parentPort, workerData } from 'node:worker_threads'
import { dhashCompare } from '../utils/dhash_compare.js'

/**
 * CPU Worker entry point.
 *
 * Receives { taskName, payload } via workerData and dispatches
 * to the appropriate handler. Add new CPU-heavy tasks here.
 *
 * Task implementations live in pure modules (app/utils/*) so they can also be
 * called in-process by background jobs, which cannot spawn this worker in dev
 * (it resolves a compiled .js that only exists in build/).
 */

// ── Task registry ───────────────────────────────────────────────────
// Add new CPU-heavy tasks here as functions and register them below.

const tasks: Record<string, (payload: any) => unknown> = {
  dhash_compare: dhashCompare,
}

// ── Dispatch ────────────────────────────────────────────────────────

const { taskName, payload } = workerData as { taskName: string; payload: unknown }

const handler = tasks[taskName]
if (!handler) {
  throw new Error(`Unknown CPU worker task: ${taskName}`)
}

const result = handler(payload)
parentPort?.postMessage(result)
