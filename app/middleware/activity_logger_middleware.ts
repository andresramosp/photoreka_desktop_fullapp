import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { ActivityType } from '#models/user_activity'
import UserActivity from '#models/user_activity'

/**
 * Route descriptor: maps an endpoint pattern to an activity type
 * and an optional metadata extractor that pulls business-relevant
 * data from the request body / params / response body.
 */
interface RouteDescriptor {
  method: string
  pattern: RegExp
  type: ActivityType
  meta?: (body: any, params: Record<string, any>, resBody: any) => Record<string, any> | null
}

function truncate(str: any, max: number): string | null {
  if (typeof str !== 'string') return null
  return str.length > max ? str.slice(0, max) + '…' : str
}

/** Count photos from the search response's `data.results` map of iterations → photo arrays */
function countSearchResults(r: any): number | null {
  const results = r?.data?.results
  if (!results || typeof results !== 'object') return null
  return Object.values(results).reduce(
    (sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0),
    0
  ) as number
}

/**
 * Declarative route map — the single place where we decide
 * WHAT gets logged and WHICH metadata is captured.
 */
const ROUTE_MAP: RouteDescriptor[] = [
  // ─── Auth ───
  {
    method: 'POST',
    pattern: /\/auth\/login$/,
    type: 'login',
    meta: (b) => ({ provider: b?.provider || 'email' }),
  },
  {
    method: 'POST',
    pattern: /\/auth\/register$/,
    type: 'register',
    meta: (b) => ({ provider: b?.provider || 'email' }),
  },
  {
    method: 'POST',
    pattern: /\/auth\/demo-login$/,
    type: 'login',
    meta: () => ({ provider: 'demo' }),
  },

  // ─── Search ───
  {
    method: 'POST',
    pattern: /\/search\/semantic\/(stream|sync)$/,
    type: 'search_semantic',
    meta: (b, _p, r) => ({
      query: truncate(b?.description, 200),
      searchMode: b?.options?.searchMode,
      resultCount: countSearchResults(r),
    }),
  },
  {
    method: 'POST',
    pattern: /\/search\/tags\/(sync|direct)$/,
    type: 'search_tags',
    meta: (b, _p, r) => ({
      includedTags: b?.included,
      excludedTags: b?.excluded,
      searchMode: b?.searchMode,
      semantic: b?.semantic ?? false,
      resultCount: countSearchResults(r) ?? (Array.isArray(r) ? r.length : null),
    }),
  },
  {
    method: 'POST',
    pattern: /\/search\/byPhotos$/,
    type: 'search_visual',
    meta: (b, _p, r) => ({
      sourcePhotoIds: b?.photoIds ?? b?.queryPhotoId,
      resultCount: Array.isArray(r) ? r.length : null,
    }),
  },

  // ─── Chat ───
  {
    method: 'POST',
    pattern: /\/chat$/,
    type: 'chat_message',
    meta: (b, _p, r) => ({
      question: truncate(b?.message, 300),
      answer: truncate(r?.output, 500),
      toolsUsed: r?.toolsUsed ?? null,
      conversationId: r?.conversationId ?? b?.conversationId ?? null,
      isEphemeral: b?.ephemeral ?? false,
      costEur: r?.cost?.total?.costEur ?? null,
    }),
  },

  // ─── Photo operations ───
  {
    method: 'POST',
    pattern: /\/catalog\/uploadFinished$/,
    type: 'photos_uploaded',
    meta: (b) => ({
      count: typeof b?.count === 'number' ? b.count : 0,
      source: b?.source ?? null,
    }),
  },
  {
    method: 'POST',
    pattern: /\/analyzer\/?$/,
    type: 'photo_analyze',
    meta: (b, _p, r) => ({
      photoCount: Array.isArray(b?.photoIds) ? b.photoIds.length : null,
      processId: r?.processId ?? r?.id ?? null,
    }),
  },
  {
    method: 'POST',
    pattern: /\/catalog\/delete$/,
    type: 'photo_delete',
    meta: (b) => ({
      count: Array.isArray(b?.ids) ? b.ids.length : 0,
    }),
  },
  {
    method: 'POST',
    pattern: /\/download-photo$/,
    type: 'photo_download',
    meta: (b) => ({
      count: Array.isArray(b?.ids) ? b.ids.length : 0,
      format: Array.isArray(b?.ids) && b.ids.length > 1 ? 'zip' : 'single',
    }),
  },
  {
    method: 'POST',
    pattern: /\/catalog\/check(Exact)?Duplicates$/,
    type: 'photo_duplicates',
    meta: (b, _p, r) => ({
      scope: b?.scope ?? null,
      checkedCount: Array.isArray(b?.newPhotoIds) ? b.newPhotoIds.length : null,
      matchCount: r ? Object.keys(r).length : null,
    }),
  },
  {
    method: 'GET',
    pattern: /\/catalog\/photoInsight\//,
    type: 'photo_insight',
    meta: (_b, p) => ({ photoId: p?.id ?? null }),
  },
  {
    method: 'POST',
    pattern: /\/catalog\/photoInsightSpecific\//,
    type: 'photo_insight',
    meta: (b, p, r) => ({
      photoId: p?.id ?? null,
      insightType: b?.type ?? null,
      provider: b?.provider ?? null,
      costEur: r?.cost?.costEur ?? null,
    }),
  },
  {
    method: 'POST',
    pattern: /\/catalog\/swapPhotos$/,
    type: 'photo_swap',
    meta: (b) => ({
      newPhotoId: b?.newPhotoId,
      targetCount: Array.isArray(b?.targetPhotoIds) ? b.targetPhotoIds.length : 0,
    }),
  },
  {
    method: 'POST',
    pattern: /\/catalog\/\d+\/note$/,
    type: 'photo_note',
    meta: (b, p) => ({
      photoId: p?.id ?? null,
      noteLength: b?.note?.length ?? 0,
    }),
  },

  // ─── Collections ───
  {
    method: 'POST',
    pattern: /\/collections$/,
    type: 'collection_create',
    meta: (b) => ({
      name: b?.name,
      initialPhotos: Array.isArray(b?.photoIds) ? b.photoIds.length : 0,
    }),
  },
  {
    method: 'PUT',
    pattern: /\/collections\/\d+$/,
    type: 'collection_update',
    meta: (b, p) => ({ collectionId: p?.id, name: b?.name }),
  },
  {
    method: 'DELETE',
    pattern: /\/collections\/\d+$/,
    type: 'collection_delete',
    meta: (_b, p) => ({ collectionId: p?.id }),
  },
  {
    method: 'POST',
    pattern: /\/collections\/\d+\/photos$/,
    type: 'collection_add_photos',
    meta: (b, p) => ({
      collectionId: p?.id,
      photoCount: Array.isArray(b?.photoIds) ? b.photoIds.length : 0,
    }),
  },
  {
    method: 'DELETE',
    pattern: /\/collections\/\d+\/photos$/,
    type: 'collection_remove_photos',
    meta: (b, p) => ({
      collectionId: p?.id,
      photoCount: Array.isArray(b?.photoIds) ? b.photoIds.length : 0,
    }),
  },

  // ─── Series ───
  {
    method: 'POST',
    pattern: /\/series$/,
    type: 'series_create',
    meta: (b) => ({
      name: b?.name,
      initialPhotos: Array.isArray(b?.photoIds) ? b.photoIds.length : 0,
    }),
  },
  {
    method: 'PUT',
    pattern: /\/series\/\d+$/,
    type: 'series_update',
    meta: (b, p) => ({ seriesId: p?.id, name: b?.name }),
  },
  {
    method: 'DELETE',
    pattern: /\/series\/\d+$/,
    type: 'series_delete',
    meta: (_b, p) => ({ seriesId: p?.id }),
  },
  {
    method: 'POST',
    pattern: /\/series\/\d+\/photos$/,
    type: 'series_add_photos',
    meta: (b, p) => ({
      seriesId: p?.id,
      photoCount: Array.isArray(b?.photoIds) ? b.photoIds.length : 0,
    }),
  },
  {
    method: 'DELETE',
    pattern: /\/series\/\d+\/photos$/,
    type: 'series_remove_photos',
    meta: (b, p) => ({
      seriesId: p?.id,
      photoCount: Array.isArray(b?.photoIds) ? b.photoIds.length : 0,
    }),
  },

  // ─── Portfolio & 3D ───
  {
    method: 'GET',
    pattern: /\/report-review\/should-build$/,
    type: 'report_build',
    meta: (_b, _p, r) => {
      const action = r?.action ?? null
      if (action !== 'BUILDING' && action !== 'RE-BUILDING') return null
      return {
        action,
        currentPhotos: r?.stats?.currentPhotos ?? null,
      }
    },
  },
  {
    method: 'POST',
    pattern: /\/portfolio-build\/start$/,
    type: 'portfolio_build',
    meta: (b, _p, r) => ({
      buildId: r?.buildId ?? null,
      targetSize: b?.targetSize ?? null,
      coherenceMode: b?.coherenceMode ?? null,
      isManual: false,
    }),
  },
  {
    method: 'POST',
    pattern: /\/portfolio-build\/manual$/,
    type: 'portfolio_build',
    meta: (b, _p, r) => ({
      buildId: r?.buildId ?? null,
      photoCount: Array.isArray(b?.photos) ? b.photos.length : null,
      isManual: true,
    }),
  },
  {
    method: 'POST',
    pattern: /\/3d\/photos$/,
    type: 'view_3d',
    meta: (b, _p, r) => ({
      chunkCategory: b?.chunkName ?? null,
      outputDims: b?.outputDims ?? 3,
      photoCount: r?.photos?.length ?? null,
    }),
  },

  // ─── Embeddings ───
  {
    method: 'POST',
    pattern: /\/embeddings\/?$/,
    type: 'generate_embeddings',
    meta: (b) => ({
      photoCount: Array.isArray(b?.photos) ? b.photos.length : null,
    }),
  },

  // ─── Canvas ───
  {
    method: 'POST',
    pattern: /\/canvas$/,
    type: 'canvas_create',
    meta: (b) => ({ name: b?.name }),
  },
  {
    method: 'DELETE',
    pattern: /\/canvas\/\d+$/,
    type: 'canvas_delete',
    meta: (_b, p) => ({ canvasId: p?.id }),
  },
]

export default class ActivityLoggerMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    await next()

    // Fire-and-forget: log in background, never block the response
    this.tryLog(ctx).catch(() => {})
  }

  private async tryLog(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const method = request.method()
    const url = request.url()

    // Find matching route descriptor
    const descriptor = ROUTE_MAP.find((r) => r.method === method && r.pattern.test(url))
    if (!descriptor) return

    // Only log successful responses (2xx/3xx)
    const status = response.getStatus()
    if (status >= 400) return

    // Get authenticated user
    let userId: number | null = null
    try {
      await auth.use('api').check()
      userId = auth.use('api').user?.id ?? null
    } catch {
      // For login/register, extract userId from response body
      const resBody = response.getBody()
      if (resBody?.user?.id) userId = resBody.user.id
    }
    if (!userId) return

    // Extract metadata
    const body = request.body()
    const params = request.params()
    const resBodyRaw = response.getBody()
    // AdonisJS 6 serialises the body to JSON string before storing it —
    // parse it back so extractors can access properties normally.
    const resBody =
      typeof resBodyRaw === 'string'
        ? (() => {
            try {
              return JSON.parse(resBodyRaw)
            } catch {
              return {}
            }
          })()
        : (resBodyRaw ?? {})

    // DEBUG: log response shape for chat to diagnose missing answer
    if (descriptor.type === 'chat_message') {
      console.log('[ActivityLogger] chat resBody type:', typeof resBodyRaw)
      console.log('[ActivityLogger] chat resBody keys:', resBody ? Object.keys(resBody) : 'null')
      console.log(
        '[ActivityLogger] chat output:',
        typeof resBody?.output,
        resBody?.output ? resBody.output.slice(0, 80) : 'null'
      )
      console.log('[ActivityLogger] chat toolsUsed:', resBody?.toolsUsed)
    }

    const metadata = descriptor.meta ? descriptor.meta(body, params, resBody) : null

    if (descriptor.meta && metadata === null) return

    await UserActivity.create({
      userId,
      type: descriptor.type,
      action: `${method} ${url}`,
      metadata,
    })
  }
}
