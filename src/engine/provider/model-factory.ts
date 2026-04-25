import type { LlmProvider } from '../data/entity/llm/llm-provider.entity.js';
type LlmModel = {
  id: string;
  providerId: string;
  modelId: string;
  name: string;
  isDefault?: boolean;
};
import type { Repository } from '../data/repository.js';
import { Criteria } from '../data/criteria.js';
import type { Logger } from '../core/logger.js';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  migrateProviderApiKeyToKeychain,
  resolveProviderApiKey,
} from '../security/provider-keychain.service.js';

export interface ResolvedModel {
  provider: LlmProvider;
  model: LlmModel;
  /** Effective base URL for inference (cloud API / self-hosted / llama-server) */
  baseUrl: string;
  /** API key if required */
  apiKey?: string;
}

type ProviderRuntimeKey = 'google' | 'anthropic' | 'github' | 'openai' | 'local' | 'self-hosted';

interface ProviderRuntime {
  key: ProviderRuntimeKey;
  matchesProvider(provider: LlmProvider): boolean;
  matchesModelId(modelId: string): boolean;
  normalizeModelId(providerName: string, modelId: string): string;
  defaultModelId(provider: LlmProvider): string | null;
}

const PROVIDER_RUNTIMES: ProviderRuntime[] = [
  {
    key: 'google',
    matchesProvider: (provider) => {
      const name = (provider.name ?? '').toLowerCase();
      return name.includes('google') || name.includes('gemini');
    },
    matchesModelId: (modelId) => {
      const lower = modelId.toLowerCase();
      return lower.startsWith('gemini') || lower.startsWith('google/') || lower.startsWith('models/gemini');
    },
    normalizeModelId: (_providerName, modelId) => modelId.replace(/^models\//i, '').replace(/^google\//i, ''),
    defaultModelId: () => 'gemini-2.5-pro',
  },
  {
    key: 'anthropic',
    matchesProvider: (provider) => {
      const name = (provider.name ?? '').toLowerCase();
      return name.includes('anthropic') || name.includes('claude');
    },
    matchesModelId: (modelId) => {
      const lower = modelId.toLowerCase();
      return lower.startsWith('claude') || lower.startsWith('anthropic/');
    },
    normalizeModelId: (_providerName, modelId) => modelId.replace(/^anthropic\//i, ''),
    defaultModelId: () => 'claude-sonnet-4-0',
  },
  {
    key: 'github',
    matchesProvider: (provider) => {
      const name = (provider.name ?? '').toLowerCase();
      return name.includes('github') || name.includes('copilot');
    },
    matchesModelId: (modelId) => modelId.includes('/'),
    normalizeModelId: (_providerName, modelId) => (modelId.includes('/') ? modelId : `openai/${modelId}`),
    defaultModelId: () => 'openai/gpt-4o',
  },
  {
    key: 'openai',
    matchesProvider: (provider) => {
      const name = (provider.name ?? '').toLowerCase();
      return name.includes('openai');
    },
    matchesModelId: (modelId) => {
      const lower = modelId.toLowerCase();
      return lower.startsWith('gpt-') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4');
    },
    normalizeModelId: (_providerName, modelId) => modelId.replace(/^openai\//i, ''),
    defaultModelId: () => 'gpt-4o',
  },
  {
    key: 'local',
    matchesProvider: (provider) => provider.type === 'local-gguf',
    matchesModelId: (_modelId) => false,
    normalizeModelId: (_providerName, modelId) => modelId.replace(/\.gguf$/i, ''),
    defaultModelId: () => null,
  },
  {
    key: 'self-hosted',
    matchesProvider: (provider) => provider.type === 'self-hosted',
    matchesModelId: (_modelId) => false,
    normalizeModelId: (_providerName, modelId) => modelId,
    defaultModelId: () => null,
  },
];

function parseCompositeModelId(input: string): { providerId?: string; modelId: string } {
  const normalized = (input ?? '').trim();
  const composite = /^(?:local|cloud|fallback)-([0-9a-f-]{36})-(.+)$/i.exec(normalized);
  if (composite) {
    return {
      providerId: composite[1],
      modelId: composite[2],
    };
  }
  return { modelId: normalized };
}

function getRuntimeByProvider(provider: LlmProvider): ProviderRuntime {
  return PROVIDER_RUNTIMES.find((runtime) => runtime.matchesProvider(provider))
    ?? PROVIDER_RUNTIMES.find((runtime) => runtime.key === 'self-hosted')!;
}

function getRuntimeByModelId(modelId: string): ProviderRuntime | null {
  return PROVIDER_RUNTIMES.find((runtime) => runtime.matchesModelId(modelId)) ?? null;
}

/**
 * B-5: Model Instance Pool — reuses ChatOpenAI instances for identical configs.
 * Key = baseUrl + modelId + temperature + maxTokens + streaming
 */
const modelPool = new Map<string, { instance: BaseChatModel; lastUsed: number }>();
const MODEL_POOL_MAX = 32;
const MODEL_POOL_TTL_MS = 10 * 60 * 1000; // 10 min

function normalizeModelIdForProvider(providerNameRaw: string, modelIdRaw: string): string {
  const providerName = (providerNameRaw ?? '').toLowerCase();
  const modelId = (modelIdRaw ?? '').trim();
  if (!modelId) return modelId;

  if (providerName.includes('google') || providerName.includes('gemini')) {
    return modelId.replace(/^models\//i, '').replace(/^google\//i, '');
  }
  if (providerName.includes('anthropic') || providerName.includes('claude')) {
    return modelId.replace(/^anthropic\//i, '');
  }
  if (providerName.includes('openai')) {
    return modelId.replace(/^openai\//i, '');
  }
  if (providerName.includes('github') || providerName.includes('copilot')) {
    return modelId.includes('/') ? modelId : `openai/${modelId}`;
  }
  return modelId;
}

function getPoolKey(baseUrl: string, modelId: string, opts?: { temperature?: number; maxTokens?: number; streaming?: boolean }): string {
  return `${baseUrl}|${modelId}|${opts?.temperature ?? 0.7}|${opts?.maxTokens ?? 2048}|${opts?.streaming ?? true}`;
}

function evictStalePoolEntries(): void {
  if (modelPool.size <= MODEL_POOL_MAX) return;
  const now = Date.now();
  for (const [key, entry] of modelPool) {
    if (now - entry.lastUsed > MODEL_POOL_TTL_MS) {
      modelPool.delete(key);
    }
  }
  // If still over limit, remove oldest
  if (modelPool.size > MODEL_POOL_MAX) {
    const sorted = [...modelPool.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (let i = 0; i < sorted.length - MODEL_POOL_MAX; i++) {
      modelPool.delete(sorted[i][0]);
    }
  }
}

/**
 * Phase 3.2 — ResolvedModel을 LangChain BaseChatModel로 변환하는 헬퍼.
 *
 * 현재 모든 provider가 OpenAI-compatible API를 사용하므로 ChatOpenAI로 통합.
 * (llama-server, vLLM, Ollama 등 모두 /v1/chat/completions 호환)
 *
 * B-5: Pooled — 동일 설정 인스턴스 재사용.
 */
export function createChatModel(
  resolved: ResolvedModel,
  options?: {
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
  },
): BaseChatModel {
  const { provider, model, baseUrl, apiKey } = resolved;
  const effectiveBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
  const effectiveModelId = normalizeModelIdForProvider(provider.name ?? '', model.modelId ?? model.name);
  const poolKey = getPoolKey(effectiveBaseUrl, effectiveModelId, options);

  const cached = modelPool.get(poolKey);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.instance;
  }

  const chatModel = new ChatOpenAI({
    model: effectiveModelId,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.maxTokens ?? 2048,
    streaming: options?.streaming ?? true,
    configuration: {
      baseURL: effectiveBaseUrl,
      apiKey: apiKey || 'not-needed',
    },
    openAIApiKey: apiKey || 'not-needed',
  });

  evictStalePoolEntries();
  modelPool.set(poolKey, { instance: chatModel, lastUsed: Date.now() });

  return chatModel;
}

/**
 * Model Factory — resolves a modelId to a fully-configured inference target.
 *
 * Now powered by Shopware DAL Repositories instead of ProviderRegistry interface.
 *
 * For local-gguf models, the base URL is the llama-server URL.
 * For cloud-api models, the base URL is the provider's API endpoint.
 * For self-hosted models, the base URL is the provider's custom endpoint.
 */
export class ModelFactory {
  private providerCache: { at: number; providers: LlmProvider[] } = { at: 0, providers: [] };

  constructor(
    private readonly providerRepo: Repository<LlmProvider>,
    private readonly llamaServerUrl: string,
    private readonly logger: Logger,
  ) {}

  private async getActiveProviders(): Promise<LlmProvider[]> {
    const now = Date.now();
    if (now - this.providerCache.at < 10_000 && this.providerCache.providers.length > 0) {
      return this.providerCache.providers;
    }

    const criteria = new Criteria();
    criteria
      .addFilter(Criteria.equals('isActive', true))
      .addSorting(Criteria.sort('priority', 'ASC'))
      .setLimit(200);

    const result = await this.providerRepo.search(criteria);
    const providers = (result.data as LlmProvider[]).filter((provider) => provider.isActive);
    this.providerCache = { at: now, providers };
    return providers;
  }

  private buildModelRef(providerId: string, modelIdRaw: string, isDefault = false): LlmModel {
    const clean = (modelIdRaw ?? '').trim();
    return {
      id: clean,
      providerId,
      modelId: clean,
      name: clean,
      isDefault,
    };
  }

  private async resolveProviderForModel(modelId: string, providerId?: string): Promise<LlmProvider | null> {
    if (providerId) {
      const provider = await this.providerRepo.get(providerId);
      if (provider?.isActive) {
        return provider;
      }
      return null;
    }

    const activeProviders = await this.getActiveProviders();
    const runtime = getRuntimeByModelId(modelId);

    if (runtime) {
      const byRuntime = activeProviders.find((provider) => getRuntimeByProvider(provider).key === runtime.key);
      if (byRuntime) {
        return byRuntime;
      }
    }

    const localProvider = activeProviders.find((provider) => provider.type === 'local-gguf');
    if (localProvider && !modelId.includes('/')) {
      return localProvider;
    }

    return activeProviders[0] ?? null;
  }

  /**
   * Resolve a model ID to a fully-configured inference target.
   * Falls back to llama-server if no modelId is provided.
   */
  async resolve(modelId?: string): Promise<ResolvedModel | null> {
    if (!modelId) {
      return null; // Caller should use default llama-server
    }

    const parsed = parseCompositeModelId(modelId);
    if (!parsed.modelId) {
      return null;
    }

    const provider = await this.resolveProviderForModel(parsed.modelId, parsed.providerId);
    if (!provider) {
      this.logger.debug({ modelId }, 'model-factory:provider-not-found-for-model');
      return null;
    }

    const runtime = getRuntimeByProvider(provider);
    const normalizedModelId = runtime.normalizeModelId(provider.name ?? '', parsed.modelId);
    const model = this.buildModelRef(provider.id, normalizedModelId);

    return this.buildResolved(provider, model);
  }

  /**
   * Resolve the default model for a given provider.
   */
  async resolveDefault(providerId: string): Promise<ResolvedModel | null> {
    const provider = await this.providerRepo.get(providerId);
    if (!provider?.isActive) return null;

    const runtime = getRuntimeByProvider(provider);
    const defaultModelId = runtime.defaultModelId(provider);

    if (!defaultModelId) {
      if (provider.type === 'local-gguf') {
        return this.buildResolved(provider, this.buildModelRef(provider.id, 'default', true));
      }
      return null;
    }

    return this.buildResolved(provider, this.buildModelRef(provider.id, defaultModelId, true));
  }

  /**
   * Phase 3.2 — Resolve a model ID directly to a LangChain BaseChatModel instance.
   * Convenience method combining resolve() + createChatModel().
   */
  async resolveChatModel(
    modelId?: string,
    options?: { temperature?: number; maxTokens?: number; streaming?: boolean },
  ): Promise<BaseChatModel | null> {
    const resolved = await this.resolve(modelId);
    if (!resolved) {
      // Fallback: llama-server 기본 모델 → ChatOpenAI
      return new ChatOpenAI({
        model: 'default',
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? 2048,
        streaming: options?.streaming ?? true,
        configuration: {
          baseURL: this.llamaServerUrl.endsWith('/v1')
            ? this.llamaServerUrl
            : `${this.llamaServerUrl}/v1`,
          apiKey: 'not-needed',
        },
        openAIApiKey: 'not-needed',
      });
    }
    return createChatModel(resolved, options);
  }

  private async buildResolved(provider: LlmProvider, model: LlmModel): Promise<ResolvedModel> {
    let baseUrl: string;

    switch (provider.type) {
      case 'local-gguf':
        // Local models use the llama-server URL
        baseUrl = this.llamaServerUrl;
        break;
      case 'cloud-api':
        baseUrl = provider.baseUrl ?? '';
        break;
      case 'self-hosted':
        baseUrl = provider.baseUrl ?? '';
        break;
      default:
        baseUrl = this.llamaServerUrl;
    }

    const migratedApiKey = await migrateProviderApiKeyToKeychain(provider);
    if (migratedApiKey && migratedApiKey !== provider.apiKey) {
      provider.apiKey = migratedApiKey;
      await this.providerRepo.save({
        ...provider,
        apiKey: migratedApiKey,
        updatedAt: new Date().toISOString(),
      });
    }

    const resolvedApiKey = await resolveProviderApiKey(provider);

    return {
      provider,
      model,
      baseUrl,
      apiKey: resolvedApiKey ?? undefined,
    };
  }
}
