// Same-origin proxy: kaliabe-flare-web.pages.dev/api/* -> kaliabe-flare Worker.
// Keeps the Worker URL out of the markup and makes /api/digest.csv a real
// download on the Pages origin (it previously fell through to the SPA HTML).
const WORKER_ORIGIN = 'https://kaliabe-flare.menashiconsulting.workers.dev';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    return new Response('Method not allowed', { status: 405 });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.WORKER_ORIGIN || WORKER_ORIGIN);
  const upstream = await fetch(target.toString(), {
    method: request.method,
    headers: { accept: request.headers.get('accept') || '*/*' },
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  const headers = new Headers(upstream.headers);
  headers.delete('access-control-allow-origin');
  headers.set('x-kaliabe-proxy', 'pages');
  return new Response(upstream.body, { status: upstream.status, headers });
}
