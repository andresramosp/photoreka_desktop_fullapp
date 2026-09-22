/**
 * Which host serves Jev (TypeSafe AI's System One model). Every provider speaks the
 * same `/v1/systemone` contract (model + state + questions → answers + usage), so
 * switching is a matter of base URL, model id spelling and which API key to send.
 *
 * Selected with JEV_PROVIDER:
 *   typesafe   — the official API, api.typesafe.ai, key in TYPESAFE_API_KEY (default)
 *   openrouter — OpenRouter's hosted listing, key in OPENROUTER_API_KEY
 */

export type JevProviderName = 'typesafe' | 'openrouter'

export interface JevProvider {
  name: JevProviderName
  /** Full URL of the systemone endpoint. */
  url: string
  /** Header(s) to send besides Authorization. */
  headers: Record<string, string>
  /** The API key to send as Bearer, or null when unset. */
  apiKey: string | null
  /**
   * Provider-specific spelling of a logical model id ('jev-latest'). JEV_MODEL, when
   * set, wins over the mapping so a concrete release can be pinned from the env.
   */
  modelId: (logicalModel: string) => string
}

/**
 * OpenRouter lists concrete releases as `typesafe/jev-1.13` and the moving alias as
 * `~typesafe/jev-latest` (tilde-prefixed router, per its TypeSafe SDK guide). A bare
 * `typesafe/jev-latest` does not exist there.
 */
function openRouterModelId(logicalModel: string): string {
  if (logicalModel.includes('/')) return logicalModel
  if (logicalModel === 'jev-latest') return '~typesafe/jev-latest'
  return `typesafe/${logicalModel}`
}

const PROVIDERS: Record<JevProviderName, (env: NodeJS.ProcessEnv) => JevProvider> = {
  typesafe: (env) => ({
    name: 'typesafe',
    url: 'https://api.typesafe.ai/v1/systemone',
    headers: {},
    apiKey: env.TYPESAFE_API_KEY?.trim() || null,
    modelId: (m) => m,
  }),
  openrouter: (env) => ({
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/systemone',
    // Optional attribution headers OpenRouter uses for its rankings page.
    headers: { 'HTTP-Referer': 'https://photoreka.com', 'X-Title': 'Photoreka' },
    apiKey: env.OPENROUTER_API_KEY?.trim() || null,
    modelId: openRouterModelId,
  }),
}

export function resolveJevProvider(env: NodeJS.ProcessEnv = process.env): JevProvider {
  const raw = (env.JEV_PROVIDER ?? '').trim().toLowerCase()
  const provider = (PROVIDERS[raw as JevProviderName] ?? PROVIDERS.typesafe)(env)
  const pinned = env.JEV_MODEL?.trim()
  return pinned ? { ...provider, modelId: () => pinned } : provider
}

export function isJevConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveJevProvider(env).apiKey !== null
}
