import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Virtual module that exposes the Vite environment to application code.
 * A dedicated module keeps `import.meta.env` out of the source tree, so the
 * same files can also be bundled by esbuild for the contract tests
 * (see check/build.mjs), which injects a stub with the same shape.
 *
 * Only variables prefixed with `VITE_` are exposed.
 */
function virtualEnv(env: Record<string, string>) {
  return {
    name: 'virtual-env',
    resolveId(id: string) {
      if (id === 'virtual:env') return '\0virtual:env'
      return null
    },
    load(id: string) {
      if (id !== '\0virtual:env') return null
      return `export const env = ${JSON.stringify({
        VITE_GREEN_API_BASE_URL: env.VITE_GREEN_API_BASE_URL,
        VITE_GREEN_API_ACCESS_TOKEN: env.VITE_GREEN_API_ACCESS_TOKEN,
        VITE_GREEN_API_RECEIVE_TIMEOUT: env.VITE_GREEN_API_RECEIVE_TIMEOUT,
        VITE_GREEN_API_ID_INSTANCE: env.VITE_GREEN_API_ID_INSTANCE,
        VITE_GREEN_API_TOKEN_INSTANCE: env.VITE_GREEN_API_TOKEN_INSTANCE,
      })}`
    },
  }
}

/**
 * Dev server config.
 *
 * Note the `/green-api` proxy: the public GREEN-API host does not send CORS
 * headers for browser requests, so a pure in-browser client is blocked by the
 * same-origin policy. Routing calls through a proxy keeps the app working in
 * dev. In production `server/proxy.mjs` does the same job; alternatively point
 * VITE_GREEN_API_BASE_URL directly at `https://api.green-api.com` when your
 * account allows direct calls.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.GREEN_API_PROXY_TARGET || 'https://api.green-api.com'

  return {
    // Relative asset URLs. The site then works both at a domain root and under
    // GitHub Pages' /<repo>/ sub-path, without knowing the repo name at build
    // time (and it keeps working if the repository is renamed).
    base: './',
    plugins: [virtualEnv(env), react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/green-api': {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/green-api/, ''),
        },
      },
    },
  }
})
