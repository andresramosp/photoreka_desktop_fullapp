import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    const err = error as any
    // Always log the full cause chain so module-load and unexpected errors
    // leave a readable trace regardless of environment or AdonisJS error formatting.
    const isExpected = err?.status && err.status < 500
    if (!isExpected) {
      console.error(
        `[ExceptionHandler] ${ctx.request.method()} ${ctx.request.url()} → ${err?.status ?? '???'} ${err?.code ?? ''}`
      )
      console.error(`[ExceptionHandler] Message: ${err?.message ?? String(error)}`)
      if (err?.cause) console.error(`[ExceptionHandler] Cause:`, err.cause)
      if (err?.stack) console.error(`[ExceptionHandler] Stack:\n${err.stack}`)
    }
    return super.report(error, ctx)
  }
}
