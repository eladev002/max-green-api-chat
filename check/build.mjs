/**
 * Bundles the contract tests into a single plain-ESM file so they can run with
 * the built-in Node test runner.
 *
 * `import.meta.env` is Vite-specific, so `virtual:env` is mapped to a stub with
 * the same shape as vite.config.ts injects.
 */
import { writeFile } from 'node:fs/promises'

import { build } from 'esbuild'

await build({
  entryPoints: ['check/contract.test.ts'],
  outfile: '.check/contract.test.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
  alias: { '@': './src' },
  plugins: [
    {
      name: 'virtual-env',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /^virtual:env$/ }, () => ({
          path: 'virtual:env',
          namespace: 'virtual-env',
        }))
        pluginBuild.onLoad({ filter: /.*/, namespace: 'virtual-env' }, () => ({
          loader: 'js',
          contents: `
            export const env = {
              VITE_GREEN_API_BASE_URL: '/green-api',
              VITE_GREEN_API_RECEIVE_TIMEOUT: '20',
              VITE_GREEN_API_ACCESS_TOKEN: '',
              VITE_GREEN_API_ID_INSTANCE: '',
              VITE_GREEN_API_TOKEN_INSTANCE: '',
            }
          `,
        }))
      },
    },
  ],
})

await writeFile('.check/package.json', JSON.stringify({ type: 'module' }, null, 2))
console.log('[check] bundle ready: .check/contract.test.mjs')
