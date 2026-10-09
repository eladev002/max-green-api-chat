/// <reference types="vite/client" />

/**
 * Environment access is funnelled through a single virtual module so the same
 * source files can be bundled by Vite (which injects the real values) and by
 * esbuild for the contract tests (which injects a stub).
 *
 * Vite itself maps every `import.meta.env.*` usage; the virtual module is
 * declared in vite.config.ts.
 */
declare module 'virtual:env' {
  export const env: {
    VITE_GREEN_API_BASE_URL?: string
    VITE_GREEN_API_ACCESS_TOKEN?: string
    VITE_GREEN_API_RECEIVE_TIMEOUT?: string
    VITE_GREEN_API_ID_INSTANCE?: string
    VITE_GREEN_API_TOKEN_INSTANCE?: string
  }
}
