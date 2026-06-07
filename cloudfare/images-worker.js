function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  }
}

export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      })
    }

    const url = new URL(request.url)

    const referer = request.headers.get('Referer') || ''
    const secFetchMode = request.headers.get('Sec-Fetch-Mode')
    const isBrowser = !!secFetchMode

    if (
      isBrowser &&
      !(
        referer.startsWith('https://www.photoreka.com') ||
        referer.startsWith('https://photoreka.com') ||
        referer.startsWith('https://app.photoreka.com') ||
        referer.startsWith('http://localhost:5173')
      )
    ) {
      return new Response('Forbidden', {
        status: 403,
        headers: corsHeaders(),
      })
    }

    return serveFromR2(request, url, env)
  },
}

async function serveFromR2(request, url, env) {
  const key = url.pathname.slice(1)
  if (!key) {
    return new Response('Not found', {
      status: 404,
      headers: corsHeaders(),
    })
  }

  const bypassCache =
    url.searchParams.get('nocache') === '1' || request.headers.get('x-photoreka-health-check') === '1'

  const rangeHeader = request.headers.get('Range') || ''
  const rangeMatch = rangeHeader.match(/^bytes=(\d+)-(\d+)?$/)
  const getOptions = {}

  if (rangeMatch) {
    const start = Number(rangeMatch[1])
    const end = rangeMatch[2] ? Number(rangeMatch[2]) : start
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      getOptions.range = {
        offset: start,
        length: end - start + 1,
      }
    }
  }

  const object = await env.IMAGES.get(key, getOptions)
  if (!object) {
    return new Response('Not found', {
      status: 404,
      headers: corsHeaders(),
    })
  }

  const baseHeaders = {
    ...corsHeaders(),
    'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
  }

  if (bypassCache) {
    baseHeaders['Cache-Control'] = 'private, no-store, no-cache, must-revalidate'
    baseHeaders['CDN-Cache-Control'] = 'no-store'
    baseHeaders['Cloudflare-CDN-Cache-Control'] = 'no-store'
    baseHeaders['Pragma'] = 'no-cache'
    baseHeaders['Expires'] = '0'
    baseHeaders['X-Photoreka-Bypass-Cache'] = '1'
  } else {
    baseHeaders['Cache-Control'] = 'public, max-age=31536000, immutable'
  }

  return new Response(object.body, {
    status: rangeMatch ? 206 : 200,
    headers: {
      ...baseHeaders,
    },
  })
}
