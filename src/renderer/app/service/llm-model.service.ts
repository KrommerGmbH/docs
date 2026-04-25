/**
 * LLM Model Service
 *
 * 모델 DAL이 제거됨에 따라, 프로바이더 API에서 실시간으로 모델 목록을 조회하여
 * UI(chat.store)용 ModelOption 배열을 동적으로 생성한다.
 */
import { Criteria } from '@engine/data/criteria'
import {
  DEFAULT_PROVIDERS,
  ENTITY_CMH_LLM_PROVIDER,
} from '@engine/data/seed'
import { useRepositoryFactory } from '../composables/useRepositoryFactory'
import type { LlmProvider } from '@engine/data/entity/llm/llm-provider.entity'
import { isUsableApiKey } from '../../../shared/security/is-usable-api-key'

import '@engine/data/entity/llm/llm-provider.definition'
import type { ModelOption } from '../store/chat.store'

const { repositoryFactory } = useRepositoryFactory()
const _providerRepo = repositoryFactory.create(ENTITY_CMH_LLM_PROVIDER)

const _providerNameCache = new Map<string, string>()
const _providerCache = new Map<string, LlmProvider>()
const _cloudModelsCache = new Map<string, ModelOption[]>()
let _cloudRefreshInFlight: Promise<void> | null = null
let _localModelsSnapshot: ModelOption[] = []

async function _refreshProviderCaches(): Promise<void> {
  let provResult = await _providerRepo.search(new Criteria())
  await _ensureBridgeDefaultProviders(provResult.data as LlmProvider[])
  provResult = await _providerRepo.search(new Criteria())

  _providerNameCache.clear()
  _providerCache.clear()
  for (const p of provResult.data as LlmProvider[]) {
    _providerNameCache.set(p.id, p.name)
    _providerCache.set(p.id, p)
  }
}

export function getProviderCache(): Map<string, LlmProvider> {
  return _providerCache
}

export function getProviderName(providerId: string): string {
  return _providerNameCache.get(providerId) ?? 'Unknown'
}

export async function loadLocalModelsFromDAL(): Promise<ModelOption[]> {
  await _refreshProviderCaches()
  const localProvider = [..._providerCache.values()].find((p) => p.type === 'local-gguf' && p.isActive)
  return await _loadLocalModelsFast(localProvider)
}

export async function loadCloudModelsFromDAL(): Promise<ModelOption[]> {
  await _refreshProviderCaches()
  const cloudProviders = [..._providerCache.values()].filter(
    (p) => p.type === 'cloud-api' && p.isActive
  )

  // cloud는 캐시 우선 표시 + 백그라운드 최신화 (렌더 블로킹 금지)
  const cachedCloudModels = _collectCachedCloudModels(cloudProviders)
  _triggerCloudModelsRefresh(cloudProviders)

  const withCloudFallback = await _injectCloudFallbackModels(cachedCloudModels)
  return withCloudFallback
}

export async function loadModelsFromDAL(): Promise<ModelOption[]> {
  const localModels = await loadLocalModelsFromDAL()
  const cloudModels = await loadCloudModelsFromDAL()

  const models: ModelOption[] = []
  models.push(...localModels, ...cloudModels)

  return models
}

async function _loadLocalModelsFast(localProvider: LlmProvider | undefined): Promise<ModelOption[]> {
  if (!localProvider) return []

  // snapshot이 있으면 즉시 후보로 사용하고, 빠른 timeout 내 최신화 시도
  const snapshot = [..._localModelsSnapshot]
  try {
    const res = await fetch('/api/local-models', {
      cache: 'no-store',
      signal: AbortSignal.timeout(1800),
    })
    if (!res.ok) return snapshot

    const data = await res.json() as { data?: Array<{ id: string; name?: string; contextLength?: number | null }> }
    const parsed = _mapLocalModels(localProvider, data.data ?? [])
    _localModelsSnapshot = parsed
    return parsed
  } catch {
    return snapshot
  }
}

function _mapLocalModels(localProvider: LlmProvider, rows: Array<{ id: string; name?: string; contextLength?: number | null }>): ModelOption[] {
  const _autoRegisterBlocklist = [/gemma-3-4b/i, /gemma-3-1b/i]
  const next: ModelOption[] = []

  const inferContextLength = (modelId: string, fromApi?: number | null): number => {
    if (Number.isFinite(fromApi) && (fromApi as number) >= 1024) return Number(fromApi)
    const lower = modelId.toLowerCase()
    const direct = /(?:context[\s._-]*length|ctx)[\s._-]*(\d{3,7})(?:\D|$)/i.exec(lower)
    if (direct) {
      const n = Number(direct[1])
      if (Number.isFinite(n) && n >= 1024 && n <= 4_194_304) return n
    }
    const withUnit = /(?:context[\s._-]*length|ctx)[\s._-]*(\d{1,4})([km])(?:\D|$)/i.exec(lower)
    if (withUnit) {
      const base = Number(withUnit[1])
      const unit = withUnit[2].toLowerCase()
      const n = unit === 'm' ? base * 1_048_576 : base * 1024
      if (Number.isFinite(n) && n >= 1024 && n <= 4_194_304) return n
    }
    return 4096
  }

  for (const m of rows) {
    const fileName = m.id
    const modelId = (fileName ?? '').replace(/\.gguf$/i, '')
    if (!modelId || _autoRegisterBlocklist.some((rx) => rx.test(modelId))) continue
    const contextLength = inferContextLength(modelId, m.contextLength)
    next.push({
      id: `local-${localProvider.id}-${modelId}`,
      provider: localProvider.name ?? 'Local GGUF',
      name: (m.name ?? modelId).replace(/\.gguf$/i, '').trim(),
      modelId,
      type: _inferLocalModelType(modelId),
      filePath: fileName,
      description: `${fileName || modelId}  Local GGUF  ${Math.round(contextLength / 1024)}K ctx`,
      providerType: 'local-gguf',
      hasApiKey: true,
      isDefault: false,
      contextLength,
    })
  }

  return next
}

function _collectCachedCloudModels(cloudProviders: LlmProvider[]): ModelOption[] {
  const next: ModelOption[] = []
  for (const provider of cloudProviders) {
    const cached = _cloudModelsCache.get(provider.id)
    if (!cached || cached.length === 0) continue
    next.push(...cached)
  }
  return next
}

function _triggerCloudModelsRefresh(cloudProviders: LlmProvider[]): void {
  if (_cloudRefreshInFlight || cloudProviders.length === 0) return

  _cloudRefreshInFlight = (async () => {
    const fetchPromises = cloudProviders.map(async (provider) => {
      const collected: ModelOption[] = []
      try {
        const res = await fetch(`/api/providers/${provider.id}/remote-models`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) {
          _cloudModelsCache.set(provider.id, [])
          return
        }

        const data = await res.json() as { models?: Array<{ modelId: string, name?: string, capabilities?: string[] }>; requiresApiKey?: boolean }
        const isGoogle = (provider.name ?? '').toLowerCase().includes('google')
        const hasApiKey = !data.requiresApiKey

        for (const r of data.models ?? []) {
          if (!r.modelId) continue
          const caps = (r.capabilities ?? []).map((c) => c.toLowerCase())
          if (isGoogle && caps.length > 0 && !caps.some((c) => c.includes('generatecontent') || c.includes('streamgeneratecontent'))) {
            continue
          }

          const isDefaultCandidate = r.modelId === 'openai/gpt-4o' || r.modelId === 'gemini-2.5-pro'
          collected.push({
            id: `cloud-${provider.id}-${r.modelId}`,
            provider: provider.name ?? 'Cloud API',
            name: r.name?.trim() || r.modelId,
            modelId: r.modelId,
            type: _inferCloudModelType(r.modelId, provider.name ?? '', 'chat'),
            filePath: null,
            description: r.modelId + '  ' + (isGoogle ? '1M ctx' : '128K ctx'),
            providerType: 'cloud-api',
            hasApiKey,
            isDefault: isDefaultCandidate,
            contextLength: isGoogle ? 1_048_576 : 128_000,
          })
        }
      } catch {
        // noop
      }

      _cloudModelsCache.set(provider.id, collected)
    })

    await Promise.all(fetchPromises)
  })().finally(() => {
    _cloudRefreshInFlight = null
  })
}

async function _ensureBridgeDefaultProviders(existingProviders: LlmProvider[]): Promise<void> {
  const existingIds = new Set(existingProviders.map((p) => p.id))
  for (const p of DEFAULT_PROVIDERS) {
    if (existingIds.has(p.id)) continue
    try { await _providerRepo.save({ ...p } as LlmProvider) } catch {}
  }
}

async function _injectCloudFallbackModels(models: ModelOption[]): Promise<ModelOption[]> {
  const fallbackTargets = [
    { key: 'google', modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', type: 'multimodal' as const, description: 'gemini-2.5-pro  1M ctx', contextLength: 1_048_576 },
    { key: 'openai', modelId: 'gpt-4o', name: 'GPT-4o', type: 'multimodal' as const, description: 'gpt-4o  128K ctx', contextLength: 128_000 },
    { key: 'github', modelId: 'openai/gpt-4o', name: 'openai/gpt-4o', type: 'multimodal' as const, description: 'openai/gpt-4o  128K ctx', contextLength: 128_000 },
    { key: 'anthropic', modelId: 'claude-sonnet-4-0', name: 'Claude Sonnet 4', type: 'multimodal' as const, description: 'claude-sonnet-4-0  200K ctx', contextLength: 200_000 },
  ]

  const existingModelKeys = new Set(models.map((m) => `${m.provider}:${m.modelId}`.toLowerCase()))
  const appended: ModelOption[] = []

  for (const provider of _providerCache.values()) {
    if (provider.type !== 'cloud-api' || !provider.isActive) continue

    const providerName = provider.name ?? 'Cloud API'
    const lowerName = providerName.toLowerCase()

    const providerKey = lowerName.includes('google') || lowerName.includes('gemini')
      ? 'google'
      : lowerName.includes('github') || lowerName.includes('copilot')
        ? 'github'
        : lowerName.includes('anthropic') || lowerName.includes('claude')
          ? 'anthropic'
          : 'openai'

    const target = fallbackTargets.find((t) => t.key === providerKey)
    if (!target) continue

    const duplicate = models.some(
      (m) => (m.provider ?? '').toLowerCase() === providerName.toLowerCase() && m.modelId.toLowerCase() === target.modelId.toLowerCase(),
    ) || appended.some(
      (m) => (m.provider ?? '').toLowerCase() === providerName.toLowerCase() && m.modelId.toLowerCase() === target.modelId.toLowerCase(),
    ) || existingModelKeys.has(`${providerName}:${target.modelId}`.toLowerCase())

    if (duplicate) continue

    appended.push({
      id: `fallback-${provider.id}-${target.modelId}`,
      provider: providerName,
      name: target.name,
      modelId: target.modelId,
      type: target.type,
      filePath: null,
      description: target.description,
      providerType: 'cloud-api',
      hasApiKey: isUsableApiKey(provider.apiKey),
      isDefault: true,
      contextLength: target.contextLength,
    })
  }

  if (appended.length === 0) return models
  return [...models, ...appended]
}

function _inferLocalModelType(modelId: string): ModelOption['type'] {
  const id = modelId.toLowerCase()
  if (/\b(vl|vision|multimodal|llava)\b/.test(id) || id.includes('gemma-4') || id.includes('qwen2.5-vl')) return 'multimodal'
  return 'chat'
}

function _inferCloudModelType(modelId: string, providerName: string, fallbackType: ModelOption['type']): ModelOption['type'] {
  const id = (modelId ?? '').toLowerCase()
  const provider = (providerName ?? '').toLowerCase()
  if (id.includes('embedding') || id.includes('text-embedding')) return 'embedding'
  if (/gemini|claude|gpt-4o|o1|o3|vision|multimodal/i.test(id) || /google|gemini|anthropic|claude/i.test(provider)) return 'multimodal'
  return fallbackType
}
