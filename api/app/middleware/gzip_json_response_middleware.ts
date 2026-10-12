import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { gzip as gzipCallback } from 'node:zlib'
import { promisify } from 'node:util'

const gzip = promisify(gzipCallback)

const DEFAULT_THRESHOLD_BYTES = 1024

function acceptsGzip(ctx: HttpContext): boolean {
  const header = ctx.request.header('accept-encoding')
  if (!header) return false
  return header.toLowerCase().includes('gzip')
}

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false
  return contentType.toLowerCase().includes('application/json')
}

function hasNoTransform(cacheControl: string | undefined): boolean {
  if (!cacheControl) return false
  return cacheControl.toLowerCase().includes('no-transform')
}

export default class GzipJsonResponseMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (ctx.request.method() === 'HEAD') {
      return next()
    }

    const originalSend = ctx.response.send.bind(ctx.response)
    const originalJson = (ctx.response as any).json?.bind(ctx.response)

    const trySendGzipped = async (body: unknown) => {
      if (!acceptsGzip(ctx)) return originalSend(body as any)

      const existingEncoding = ctx.response.getHeader('Content-Encoding')
      if (typeof existingEncoding === 'string' && existingEncoding.length > 0) {
        return originalSend(body as any)
      }

      const cacheControl = ctx.response.getHeader('Cache-Control')
      if (typeof cacheControl === 'string' && hasNoTransform(cacheControl)) {
        return originalSend(body as any)
      }

      if (Buffer.isBuffer(body)) return originalSend(body)
      if (body instanceof ArrayBuffer) return originalSend(Buffer.from(body))

      const currentContentType = ctx.response.getHeader('Content-Type')
      const contentTypeIsJson =
        typeof currentContentType === 'string' && isJsonContentType(currentContentType)

      let jsonString: string | null = null

      if (typeof body === 'string') {
        if (!contentTypeIsJson) {
          return originalSend(body)
        }
        jsonString = body
      } else {
        jsonString = JSON.stringify(body)
        if (!contentTypeIsJson) {
          ctx.response.header('Content-Type', 'application/json; charset=utf-8')
        }
      }

      const rawSize = Buffer.byteLength(jsonString)
      if (rawSize < DEFAULT_THRESHOLD_BYTES) {
        return originalSend(jsonString)
      }

      const compressed = await gzip(Buffer.from(jsonString, 'utf-8'))
      ctx.response.header('Content-Encoding', 'gzip')

      const vary = ctx.response.getHeader('Vary')
      if (typeof vary === 'string' && vary.length > 0) {
        if (!vary.toLowerCase().includes('accept-encoding')) {
          ctx.response.header('Vary', `${vary}, Accept-Encoding`)
        }
      } else {
        ctx.response.header('Vary', 'Accept-Encoding')
      }

      ctx.response.header('Content-Length', String(compressed.length))
      return originalSend(compressed)
    }

    ctx.response.send = (body: any) => {
      return trySendGzipped(body)
    }

    if (typeof originalJson === 'function') {
      ;(ctx.response as any).json = (body: any) => {
        return trySendGzipped(body)
      }
    }

    return next()
  }
}
