#!/usr/bin/env node
/**
 * Standalone reverse proxy + static file server.
 *
 * Why this exists
 * ---------------
 * `api.green-api.com` does not send CORS headers, so a browser cannot call it
 * cross-origin. This server serves the built SPA from `dist/` and forwards
 * every `/green-api/*` request to the provider on the same origin, which
 * removes the CORS problem entirely.
 *
 * The GREEN-API instance token still travels through the browser in the URL
 * path, exactly as the provider's own HTTP interface requires. For anything
 * beyond a demo, add authentication in front of this proxy.
 *
 * Usage:
 *   npm run build && npm start
 *   PORT=8081 GREEN_API_PROXY_TARGET=https://api.green-api.com node server/proxy.mjs
 */

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const PORT = Number(process.env.PORT ?? 8081)
const PUBLIC_DIR = resolve(process.env.PUBLIC_DIR ?? 'dist')
const API_TARGET = (
  process.env.GREEN_API_PROXY_TARGET ?? 'https://api.green-api.com'
).replace(/\/+$/, '')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/**
 * Build a lookup table of every built asset. Doing this once at startup means
 * a request path is never concatenated into a filesystem path, which removes
 * any path-traversal risk.
 */
async function indexPublicDir() {
  const files = new Map()

  async function walk(dir, prefix = '') {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute, relative)
      } else if (entry.isFile()) {
        files.set(`/${relative}`, absolute)
      }
    }
  }

  await walk(PUBLIC_DIR)
  return files
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers)
  res.end(body)
}

async function serveStatic(req, res, files) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const requested = decodeURIComponent(url.pathname)

  const candidate =
    files.get(requested) ??
    files.get(requested.replace(/\/$/, '/index.html')) ??
    files.get('/index.html')

  if (!candidate || !candidate.startsWith(PUBLIC_DIR + sep)) {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
    return
  }

  const info = await stat(candidate)
  const isHtml = candidate.endsWith('.html')

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(candidate)] ?? 'application/octet-stream',
    'Content-Length': info.size,
    // Hashed assets are immutable; HTML must always be revalidated.
    'Cache-Control': isHtml
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  })

  if (req.method === 'HEAD') {
    res.end()
    return
  }

  createReadStream(candidate).pipe(res)
}

async function proxy(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const targetPath = url.pathname.replace(/^\/green-api/, '')

  // Only GREEN-API method endpoints may be proxied. Without this check the
  // route would work as an open relay for any path on the upstream host.
  if (!/^\/waInstance[A-Za-z0-9]+\/[A-Za-z]+\//.test(targetPath)) {
    send(res, 403, JSON.stringify({ message: 'Forbidden path' }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
    return
  }

  const targetUrl = `${API_TARGET}${targetPath}${url.search}`

  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length ? Buffer.concat(chunks) : undefined

  // The long-poll may legitimately block for up to 60 seconds.
  const receiveTimeout = Number(url.searchParams.get('receiveTimeout') ?? 0)
  const timeoutMs = receiveTimeout > 0 ? (receiveTimeout + 20) * 1000 : 30_000

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        Accept: 'application/json',
        ...(req.headers['content-type']
          ? { 'Content-Type': String(req.headers['content-type']) }
          : {}),
        ...(req.headers.authorization
          ? { Authorization: String(req.headers.authorization) }
          : {}),
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(timeoutMs),
    })

    const text = await upstream.text()

    console.log(
      `${req.method} /green-api${targetPath} -> ${upstream.status} (${text.length} B)`,
    )

    res.writeHead(upstream.status, {
      'Content-Type':
        upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(text)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    console.error(`${req.method} /green-api${targetPath} -> proxy error: ${reason}`)
    send(res, 502, JSON.stringify({ message: `Proxy error: ${reason}` }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  }
}

const files = await indexPublicDir()

if (files.size === 0) {
  console.warn(
    `[proxy] "${PUBLIC_DIR}" is empty or missing — run "npm run build" first.\n` +
      '[proxy] Only the /green-api proxy will work until then.',
  )
}

createServer((req, res) => {
  const url = req.url ?? '/'

  // Same-origin API calls from the SPA.
  if (url.startsWith('/green-api')) {
    void proxy(req, res)
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed', {
      'Content-Type': 'text/plain; charset=utf-8',
    })
    return
  }

  void serveStatic(req, res, files)
}).listen(PORT, () => {
  console.log(`[proxy] MAX Chat  ->  http://localhost:${PORT}`)
  console.log(`[proxy] /green-api/*  ->  ${API_TARGET}`)
  console.log(`[proxy] static root   ->  ${PUBLIC_DIR}`)
})
