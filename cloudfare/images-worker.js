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

    return serveFromR2(url, env)
  },
}

async function serveFromR2(url, env) {
  const key = url.pathname.slice(1)
  if (!key) {
    return new Response('Not found', {
      status: 404,
      headers: corsHeaders(),
    })
  }

  const object = await env.IMAGES.get(key)
  if (!object) {
    return new Response('Not found', {
      status: 404,
      headers: corsHeaders(),
    })
  }

  return new Response(object.body, {
    headers: {
      ...corsHeaders(),
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
