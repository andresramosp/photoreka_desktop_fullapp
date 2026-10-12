/**
 * GracefulShutdownService
 *
 * Tracks in-flight fire-and-forget jobs (Analyzer, AiLocationInference, etc.)
 * so that the process can wait for them to finish before terminating on SIGTERM.
 *
 * Usage:
 *   // Register a job when it is launched fire-and-forget:
 *   GracefulShutdownService.register(someService.runLongJob())
 *
 *   // In the SIGTERM handler, drain before calling app.terminate():
 *   await GracefulShutdownService.drain(60_000)
 */

const activeJobs = new Set<Promise<unknown>>()

const GracefulShutdownService = {
  /**
   * Register a promise so it is tracked until it settles.
   * The promise is automatically removed from the set on completion.
   */
  register(promise: Promise<unknown>): void {
    activeJobs.add(promise)
    promise.finally(() => activeJobs.delete(promise))
  },

  /**
   * Returns how many jobs are currently in flight.
   */
  get size(): number {
    return activeJobs.size
  },

  /**
   * Wait for all registered jobs to settle, or until `timeoutMs` elapses
   * (whichever comes first). Never throws.
   */
  async drain(timeoutMs: number = 600_000): Promise<void> {
    if (activeJobs.size === 0) return

    console.log(`[GracefulShutdown] Waiting for ${activeJobs.size} active job(s) to finish...`)

    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    await Promise.race([Promise.allSettled([...activeJobs]), timeout])

    if (activeJobs.size > 0) {
      console.warn(
        `[GracefulShutdown] Timeout reached. ${activeJobs.size} job(s) were still running and will be interrupted.`
      )
    } else {
      console.log('[GracefulShutdown] All jobs finished cleanly.')
    }
  },
}

export default GracefulShutdownService
