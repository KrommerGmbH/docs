import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  streamText,
  generateText,
  createUIMessageStreamResponse,
} from 'ai';
import type { Logger } from '../core/logger.js';
import type { ChatServerConfig } from '../types/index.js';
import type { QueueManager } from '../queue/manager.js';
import type { ModelFactory } from '../provider/model-factory.js';
import type { RepositoryFactory } from '../data/repository-factory.js';
import type { Repository } from '../data/repository.js';
import { Criteria } from '../data/criteria.js';
import type { LlmProvider } from '../data/entity/llm/llm-provider.entity.js';
import type { ScheduledTask } from '../data/entity/scheduled-task/scheduled-task.entity.js';
import { ENTITY_CMH_LLM_PROVIDER, ENTITY_CMH_SCHEDULED_TASK } from '../data/seed.js';
import { getHealthStatus } from './health.js';
import { AttachmentService, createAttachmentRoutes } from '../attachment/index.js';
import { createAISdkModel } from '../provider/ai-sdk-factory.js';
import { buildDefaultGraph } from '../langchain/graph/builder.js';
import { createLangGraphStream } from '../langchain/graph/stream-bridge.js';
import { existsSync, promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { HumanMessage } from '@langchain/core/messages';
import { responseCache } from '../service/response-cache.service.js';
import { isUsableApiKey } from '../../shared/security/is-usable-api-key.js';
import {
  deleteProviderApiKey,
  getProviderApiKeyRotationMeta,
  migrateProviderApiKeyToKeychain,
  rotateProviderApiKey,
  resolveProviderApiKey,
  storeProviderApiKey,
} from '../security/provider-keychain.service.js';
import { registerChatAndGenerateRoutes } from './routes/chat-generate.route.js';
import { createProviderModelsCriteria, createProviderSearchCriteria } from './routes/criteria-factory.js';
import { createOpenApiDocument, createSwaggerUiHtml } from './routes/openapi.js';

export interface RouteContext {
  config: ChatServerConfig;
  /** llama-server base URL for OpenAI API calls */
  llamaServerUrl: string;
  logger: Logger;
  queue: QueueManager | null;
  /** Model factory for multi-provider support (DAL-powered) */
  modelFactory: ModelFactory;
  /** Shopware DAL-compatible repository factory */
  repositoryFactory: RepositoryFactory;
  startedAt: Date;
  /** 파일 첨부 서비스 (optional — 없으면 upload 라우트 미등록) */
  attachmentService?: AttachmentService;
  /** LangGraph orchestrator (optional — 없으면 /api/workflow 미지원) */
  orchestrator?: { runWorkflow(id: string, input: Record<string, unknown>): Promise<{ output?: unknown; stream?: { toUIMessageStreamResponse(): Response }; status?: string }> };
  /** Scheduler (optional — 없으면 /api/scheduler/timeline은 DB fallback만 제공) */
  scheduler?: { getTimelineData(options?: { limit?: number }): unknown };
}

/**
 * Build the Hono application with all routes.
 * Chat endpoint proxies llama-server SSE → Vercel AI SDK Data Stream Protocol.
 */
export function createRoutes(ctx: RouteContext): Hono {
  const app = new Hono();

  type LocalModelRow = { id: string; name: string; contextLength: number | null; mtime: number | null }
  let _localModelCache: LocalModelRow[] = []
  let _localModelScanned: Array<{ dir: string; ggufCount: number; fileCount: number }> = []
  let _localModelWatchers: FSWatcher[] = []
  let _localModelWatchDebounce: ReturnType<typeof setTimeout> | null = null
  let _localModelWatcherInitDone = false
  let _localModelLastScanAt: string | null = null
  let _localModelDebounceHitCount = 0

  const rateWindowMs = 60_000;
  const maxRequestsPerWindow = 60;
  const rateBucket = new Map<string, { count: number; windowStart: number }>();

  const getRateLimitKey = (c: { req: { header(name: string): string | undefined } }): string => {
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    const realIp = c.req.header('x-real-ip')?.trim();
    const cfConnectingIp = c.req.header('cf-connecting-ip')?.trim();
    return forwardedFor || realIp || cfConnectingIp || 'unknown-client';
  };

  const isRateLimited = (key: string, now: number): boolean => {
    const current = rateBucket.get(key);
    if (!current || now - current.windowStart >= rateWindowMs) {
      rateBucket.set(key, { count: 1, windowStart: now });
      return false;
    }

    current.count += 1;
    if (current.count > maxRequestsPerWindow) return true;
    rateBucket.set(key, current);
    return false;
  };

  const cleanupRateLimitBucket = (now: number): void => {
    if (rateBucket.size < 1000) return;
    for (const [k, v] of rateBucket.entries()) {
      if (now - v.windowStart >= rateWindowMs * 3) {
        rateBucket.delete(k);
      }
    }
  };

  // ---- Middleware ----
  app.use('*', cors({
    origin: ctx.config.cors?.origin ?? '*',
    exposeHeaders: ['x-model-name', 'x-provider-name'],
  }));
  app.use('/api/chat', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const now = Date.now();
    cleanupRateLimitBucket(now);
    const key = getRateLimitKey(c);
    if (isRateLimited(key, now)) {
      return c.json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: maxRequestsPerWindow,
        windowMs: rateWindowMs,
      }, 429);
    }

    await next();
  });
  app.use('/api/generate', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      await next();
      return;
    }

    const now = Date.now();
    cleanupRateLimitBucket(now);
    const key = getRateLimitKey(c);
    if (isRateLimited(key, now)) {
      return c.json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        limit: maxRequestsPerWindow,
        windowMs: rateWindowMs,
      }, 429);
    }

    await next();
  });

  // ---- Health ----
  app.get('/health', async (c) => {
    const status = await getHealthStatus(ctx.queue, ctx.startedAt);
    return c.json(status);
  });
  // Alias for Vite proxy (/api → port 4000, so /api/health → /api/health here)
  app.get('/api/health', async (c) => {
    const status = await getHealthStatus(ctx.queue, ctx.startedAt);
    return c.json(status);
  });

  // ---- API Docs (OpenAPI + Swagger UI) ----
  app.get('/api/openapi.json', (c) => {
    const origin = c.req.header('origin') ?? `${c.req.url.startsWith('https://') ? 'https' : 'http'}://${c.req.header('host') ?? '127.0.0.1:4000'}`;
    return c.json(createOpenApiDocument({ origin }));
  });

  app.get('/api/docs', (c) => {
    const html = createSwaggerUiHtml('/api/openapi.json');
    return c.html(html);
  });

  // ---- Provider / Model Repositories (DAL-powered) ----
  const providerRepo = ctx.repositoryFactory.create(ENTITY_CMH_LLM_PROVIDER) as Repository<LlmProvider>;

  const getScheduledTaskRepo = (): Repository<ScheduledTask> | null => {
    try {
      return ctx.repositoryFactory.create(ENTITY_CMH_SCHEDULED_TASK) as Repository<ScheduledTask>
    } catch {
      return null
    }
  }
  registerChatAndGenerateRoutes({ app, ctx, providerRepo });

  // ---- Cache admin endpoints (B-4) ----
  app.get('/api/cache/stats', (c) => c.json(responseCache.stats()));
  app.post('/api/cache/clear', (c) => { responseCache.clear(); return c.json({ ok: true }); });

  // ---- Metrics endpoint (B-6) ----
  app.get('/api/metrics', async (c) => {
    const { metrics } = await import('../service/metrics.service.js');
    c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return c.text(metrics.export());
  });

  app.get('/api/metrics/summary', async (c) => {
    const { metrics } = await import('../service/metrics.service.js');
    return c.json(metrics.snapshot());
  });

  app.get('/api/scheduler/timeline', async (c) => {
    const limit = Number(c.req.query('limit') ?? 200);
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 2000)) : 200;

    if (ctx.scheduler) {
      return c.json(ctx.scheduler.getTimelineData({ limit: safeLimit }));
    }

    const scheduledTaskRepo = getScheduledTaskRepo()
    if (!scheduledTaskRepo) {
      return c.json({
        tasks: [],
        runs: [],
        generatedAt: new Date().toISOString(),
        fallback: true,
        warning: 'scheduled task entity is not registered',
      })
    }

    const criteria = new Criteria().setLimit(safeLimit);
    const result = await scheduledTaskRepo.search(criteria);
    return c.json({
      tasks: result.data.map((task) => ({
        id: task.id,
        cronExpression: task.cronExpression,
        isActive: task.isActive,
        lastRunAt: task.lastRunAt ?? null,
      })),
      runs: [],
      generatedAt: new Date().toISOString(),
      fallback: true,
    });
  });

  // ---- Queue-based inference (if Redis available) ----
  app.post('/api/queue/infer', async (c) => {
    if (!ctx.queue) {
      return c.json({ error: 'Queue not available (Redis not configured)' }, 503);
    }

    const body = await c.req.json<{
      messages: Array<{ role: string; content: string }>;
      system?: string;
      priority?: number;
    }>();

    if (!body.messages || !Array.isArray(body.messages)) {
      return c.json({ error: 'messages array is required' }, 400);
    }

    try {
      const jobId = await ctx.queue.addJob(
        { messages: body.messages, system: body.system },
        { priority: body.priority },
      );
      return c.json({ jobId, status: 'queued' }, 202);
    } catch (error) {
      ctx.logger.error({ error }, 'queue:add-error');
      return c.json(
        { error: error instanceof Error ? error.message : 'Queue error' },
        500,
      );
    }
  });

  app.get('/api/queue/diagnostics', async (c) => {
    if (!ctx.queue) {
      return c.json({ error: 'Queue not available (Redis not configured)' }, 503);
    }

    try {
      const diagnostics = await ctx.queue.getDiagnostics();
      return c.json(diagnostics, 200);
    } catch (error) {
      ctx.logger.error({ error }, 'queue:diagnostics-error');
      return c.json({ error: error instanceof Error ? error.message : 'Queue diagnostics error' }, 500);
    }
  });

  // ---- Provider / Model CRUD endpoints (DAL-powered) ----

  app.get('/api/providers', async (c) => {
    try {
      const type = c.req.query('type');
      const isActive = c.req.query('isActive');

      const criteria = createProviderSearchCriteria({ type, isActive, limit: 100 });

      const result = await providerRepo.search(criteria);
      const providers = await Promise.all(result.data.map(async (p) => {
        const migratedApiKey = await migrateProviderApiKeyToKeychain(p);
        if (migratedApiKey && migratedApiKey !== p.apiKey) {
          await providerRepo.save({
            ...p,
            apiKey: migratedApiKey,
            updatedAt: new Date().toISOString(),
          } as LlmProvider);
          p.apiKey = migratedApiKey;
        }

        const resolvedApiKey = await resolveProviderApiKey(p);
        return {
          ...p,
          apiKey: null,
          hasApiKey: isUsableApiKey(resolvedApiKey),
        };
      }));
      return c.json({ providers, total: result.total });
    } catch (error) {
      ctx.logger.error({ error }, 'providers:list-error');
      return c.json({ providers: [], total: 0, warning: 'provider list unavailable' }, 200);
    }
  });

  app.post('/api/providers/secure-save', async (c) => {
    try {
      let body: Partial<LlmProvider> & { clearApiKey?: boolean; providerId?: string; rotateApiKey?: boolean }
      try {
        body = await c.req.json<Partial<LlmProvider> & { clearApiKey?: boolean; providerId?: string; rotateApiKey?: boolean }>()
      } catch (error) {
        return c.json({
          error: 'Invalid JSON body',
          detail: error instanceof Error ? error.message : String(error),
        }, 400)
      }
      const requestedProviderId = ((body.id ?? body.providerId ?? '') as string).trim();
      if (!requestedProviderId) {
        return c.json({ error: 'provider id is required' }, 400);
      }

      let providerId = requestedProviderId;
      let existing = await providerRepo.get(providerId);

      if (!existing) {
        const allProviders = await providerRepo.search(createProviderSearchCriteria({ limit: 200 }));
        const key = requestedProviderId.toLowerCase();
        const mapped = allProviders.data.find((p) => {
          const name = (p.name ?? '').toLowerCase();
          return p.id.toLowerCase() === key
            || name.includes(key)
            || (key === 'google' && (name.includes('google') || name.includes('gemini')))
            || (key === 'github' && (name.includes('github') || name.includes('copilot')))
            || (key === 'claude' && (name.includes('anthropic') || name.includes('claude')))
            || (key === 'openai' && name.includes('openai'));
        });

        if (mapped) {
          providerId = mapped.id;
          existing = mapped;
        }
      }

      const nowIso = new Date().toISOString();
      let nextApiKey = existing?.apiKey ?? null;
      let rotationMeta: { latestVersion: string; rotatedAt: string } | null = null

      if (body.clearApiKey) {
        await deleteProviderApiKey(providerId, { includeHistory: true });
        nextApiKey = null;
      } else if (typeof body.apiKey === 'string' && isUsableApiKey(body.apiKey)) {
        if (body.rotateApiKey ?? true) {
          const rotated = await rotateProviderApiKey(providerId, body.apiKey)
          nextApiKey = rotated.ref
          rotationMeta = { latestVersion: rotated.version, rotatedAt: rotated.rotatedAt }
        } else {
          nextApiKey = await storeProviderApiKey(providerId, body.apiKey);
        }
      } else if (typeof body.apiKey === 'string' && !isUsableApiKey(body.apiKey)) {
        const existingUsable = isUsableApiKey(existing?.apiKey);
        if (!existingUsable) {
          nextApiKey = null;
        }
      }

      const safeBody: Partial<LlmProvider> = {
        name: typeof body.name === 'string' ? body.name : existing?.name,
        description: typeof body.description === 'string' || body.description === null
          ? body.description ?? undefined
          : existing?.description,
        type: (body.type as LlmProvider['type']) ?? existing?.type,
        baseUrl: typeof body.baseUrl === 'string' || body.baseUrl === null
          ? body.baseUrl ?? null
          : existing?.baseUrl ?? null,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : (existing?.isActive ?? true),
        priority: typeof body.priority === 'number' ? body.priority : (existing?.priority ?? 0),
        metadata: (body.metadata as Record<string, unknown> | null | undefined) ?? existing?.metadata ?? null,
      };

      const payload: LlmProvider = {
        ...(existing ?? {} as LlmProvider),
        ...safeBody,
        id: providerId,
        apiKey: nextApiKey,
        createdAt: existing?.createdAt ?? body.createdAt ?? nowIso,
        updatedAt: nowIso,
      };

      const saved = await providerRepo.save(payload);
      const resolvedApiKey = await resolveProviderApiKey(saved);
      const persistedRotationMeta = rotationMeta ?? await getProviderApiKeyRotationMeta(providerId)

      return c.json({
        provider: {
          ...saved,
          apiKey: null,
          hasApiKey: isUsableApiKey(resolvedApiKey),
          keyRotation: persistedRotationMeta,
        },
      });
    } catch (error) {
      ctx.logger.error({ error }, 'providers:secure-save-error');
      return c.json({
        error: 'Failed to save provider securely',
        detail: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  });

  app.get('/api/providers/:providerId/models', async (c) => {
    try {
      const providerId = c.req.param('providerId');

      return c.json({ models: [], total: 0 });
    } catch (error) {
      ctx.logger.error({ error }, 'providers:models-list-error');
      return c.json({ models: [], total: 0, warning: 'provider model list unavailable' }, 200);
    }
  });

  app.post('/api/providers/:providerId/rotate-key', async (c) => {
    try {
      const providerId = c.req.param('providerId').trim();
      if (!providerId) {
        return c.json({ error: 'provider id is required' }, 400)
      }

      const body = await c.req.json<{ apiKey?: string }>()
      const apiKey = (body?.apiKey ?? '').trim()
      if (!isUsableApiKey(apiKey)) {
        return c.json({ error: 'usable apiKey is required' }, 400)
      }

      const rotated = await rotateProviderApiKey(providerId, apiKey)
      const existing = await providerRepo.get(providerId)
      if (existing) {
        await providerRepo.save({
          ...existing,
          apiKey: rotated.ref,
          updatedAt: new Date().toISOString(),
        })
      }

      return c.json({
        providerId,
        rotation: {
          latestVersion: rotated.version,
          rotatedAt: rotated.rotatedAt,
          ref: rotated.ref,
        },
      })
    } catch (error) {
      ctx.logger.error({ error }, 'providers:rotate-key-error')
      return c.json({ error: 'Failed to rotate provider api key' }, 500)
    }
  })

  app.get('/api/models/:modelId', async (c) => {
    return c.json({ error: 'Model not found' }, 404);
  });

  const parseContextLengthFromFileName = (fileName: string): number | null => {
    const lower = fileName.toLowerCase()
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

    return null
  }

  const getLocalModelCandidateDirs = (): string[] => {
    const cwd = process.cwd()
    const candidates = [
      path.resolve(cwd, 'models'),
      path.resolve(cwd, 'cmh-chatbot', 'models'),
      path.resolve(cwd, '..', 'cmh-chatbot', 'models'),
    ]
    return [...new Set(candidates)].filter((dir) => existsSync(dir))
  }

  const scanLocalModelCache = async (): Promise<void> => {
    const existingCandidates = getLocalModelCandidateDirs()
    const ggufMap = new Map<string, LocalModelRow>()
    const scanned: Array<{ dir: string; ggufCount: number; fileCount: number }> = []

    for (const dir of existingCandidates) {
      try {
        const files = await fs.readdir(dir)
        let ggufCount = 0

        for (const f of files) {
          if (!f.toLowerCase().endsWith('.gguf')) continue
          ggufCount += 1
          const fullPath = path.join(dir, f)
          let mtime: number | null = null
          try {
            const stat = await fs.stat(fullPath)
            mtime = Number(stat.mtimeMs)
          } catch {
            // noop
          }

          const existing = ggufMap.get(f)
          if (!existing || (mtime ?? 0) > (existing.mtime ?? 0)) {
            ggufMap.set(f, {
              id: f,
              name: f.replace(/\.gguf$/i, '').replace(/[-_]/g, ' '),
              contextLength: parseContextLengthFromFileName(f),
              mtime,
            })
          }
        }

        scanned.push({ dir, ggufCount, fileCount: files.length })
      } catch {
        scanned.push({ dir, ggufCount: 0, fileCount: 0 })
      }
    }

    _localModelCache = [...ggufMap.values()].sort((a, b) => a.id.localeCompare(b.id))
    _localModelScanned = scanned
    _localModelLastScanAt = new Date().toISOString()
  }

  const initLocalModelWatchers = (): void => {
    if (_localModelWatcherInitDone) return
    _localModelWatcherInitDone = true

    const dirs = getLocalModelCandidateDirs()
    for (const dir of dirs) {
      try {
        const watcher = watch(dir, { persistent: false }, () => {
          _localModelDebounceHitCount += 1
          if (_localModelWatchDebounce) clearTimeout(_localModelWatchDebounce)
          _localModelWatchDebounce = setTimeout(() => {
            void scanLocalModelCache()
          }, 400)
        })
        _localModelWatchers.push(watcher)
      } catch {
        // noop
      }
    }

    void scanLocalModelCache()
  }

  initLocalModelWatchers()

  // ---- Local Model Discovery ----
  app.get('/api/local-models', async (c) => {
    try {
      const debug = new URL(c.req.url).searchParams.get('debug') === '1';
      if (_localModelCache.length === 0) {
        await scanLocalModelCache()
      }

      const cwd = process.cwd();
      const candidates = [
        path.resolve(cwd, 'models'),
        path.resolve(cwd, 'cmh-chatbot', 'models'),
        path.resolve(cwd, '..', 'cmh-chatbot', 'models'),
      ]

      const models = _localModelCache

      if (debug) {
        return c.json({
          data: models,
          debug: {
            cwd,
            candidates,
            existingCandidates: getLocalModelCandidateDirs(),
            scanned: _localModelScanned,
            watcher: {
              activeWatchers: _localModelWatchers.length,
              lastScanAt: _localModelLastScanAt,
              debounceHitCount: _localModelDebounceHitCount,
            },
          },
        });
      }

      return c.json({ data: models });
    } catch (error) {
      const debug = new URL(c.req.url).searchParams.get('debug') === '1';
      if (debug) {
        return c.json({ data: [], error: error instanceof Error ? error.message : String(error) });
      }
      return c.json({ data: [] });
    }
  });

    // ---- Cloud Model Discovery (실시간 provider API 모델 목록 조회) ----
  app.get('/api/providers/:providerId/remote-models', async (c) => {
    const providerId = c.req.param('providerId');
    const provider = await providerRepo.get(providerId);
    if (!provider) return c.json({ error: 'Provider not found' }, 404);
    if (provider.type !== 'cloud-api') {
      return c.json({ error: 'Only cloud-api providers are supported' }, 400);
    }

    const providerName = (provider.name ?? '').toLowerCase();
    const providerKey = providerName.includes('google') || providerName.includes('gemini')
      ? 'google'
      : providerName.includes('anthropic') || providerName.includes('claude')
        ? 'anthropic'
      : providerName.includes('github') || providerName.includes('copilot')
        ? 'github'
        : 'openai';

    const migratedApiKey = await migrateProviderApiKeyToKeychain(provider);
    if (migratedApiKey && migratedApiKey !== provider.apiKey) {
      provider.apiKey = migratedApiKey;
      await providerRepo.save({ ...provider, updatedAt: new Date().toISOString() });
    }

    const providerApiKeyResolved = await resolveProviderApiKey(provider);

    // API key가 없어도 400을 내지 않고, UI가 렌더링 가능한 안전 기본 목록을 반환.
    if (!isUsableApiKey(providerApiKeyResolved)) {
      return c.json({
        models: [],
        provider: providerKey,
        requiresApiKey: true,
        warning: 'API key is missing. Add a real key in Provider settings to fetch remote model list.',
      }, 200);
    }

    const providerApiKey = providerApiKeyResolved as string;

    try {
      // Google Gemini — generativelanguage API
      if (providerName.includes('google') || providerName.includes('gemini')) {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${providerApiKey}`,
        );
        if (!resp.ok) {
          // UI 콘솔에 502 리소스 오류를 남기지 않도록 빈 목록으로 응답
          return c.json({
            models: [],
            provider: 'google',
            warning: `Google API error: ${resp.status}`,
          });
        }
        const data = await resp.json() as { models?: Array<{ name: string; displayName: string; description?: string; supportedGenerationMethods?: string[] }> };
        const models = (data.models ?? []).map((m) => ({
          modelId: m.name.replace('models/', ''),
          name: m.displayName,
          description: m.description ?? '',
          capabilities: m.supportedGenerationMethods ?? [],
        }));
        return c.json({ models, provider: 'google' });
      }

      // GitHub Copilot / GitHub Models — 공식 Catalog API
      if (providerName.includes('github') || providerName.includes('copilot')) {
        const resp = await fetch('https://models.github.ai/catalog/models', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${providerApiKey}`,
            'X-GitHub-Api-Version': '2026-03-10',
          },
        });
        if (!resp.ok) {
          return c.json({
            models: [],
            provider: 'github',
            warning: `GitHub Models API error: ${resp.status}`,
          });
        }
        const data = await resp.json() as Array<{
          id: string;
          name?: string;
          summary?: string;
          capabilities?: string[];
        }>;
        const models = (data ?? []).map((m) => ({
          modelId: m.id,
          name: m.name ?? m.id,
          description: m.summary ?? '',
          capabilities: m.capabilities ?? [],
        }));
        return c.json({ models, provider: 'github' });
      }

      // Anthropic Claude — /v1/models
      if (providerName.includes('anthropic') || providerName.includes('claude')) {
        const baseUrl = provider.baseUrl ?? 'https://api.anthropic.com';
        const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
          headers: {
            'x-api-key': providerApiKey,
            'anthropic-version': '2023-06-01',
            Accept: 'application/json',
          },
        });

        if (!resp.ok) {
          return c.json({
            models: [],
            provider: 'anthropic',
            warning: `Anthropic API error: ${resp.status}`,
          });
        }

        const data = await resp.json() as {
          data?: Array<{ id: string; display_name?: string; type?: string }>;
        };

        const models = (data.data ?? []).map((m) => ({
          modelId: m.id,
          name: m.display_name ?? m.id,
          description: m.type ?? '',
          capabilities: [],
        }));

        return c.json({ models, provider: 'anthropic' });
      }

      // OpenAI / OpenAI-compatible — /v1/models
      const baseUrl = provider.baseUrl ?? 'https://api.openai.com';
      const resp = await fetch(`${baseUrl.replace(/\/v1\/?$/, '')}/v1/models`, {
        headers: { Authorization: `Bearer ${providerApiKey}` },
      });
      if (!resp.ok) {
        return c.json({
          models: [],
          provider: 'openai',
          warning: `API error: ${resp.status}`,
        });
      }
      const data = await resp.json() as { data?: Array<{ id: string; object?: string }> };
      const models = (data.data ?? []).map((m) => ({
        modelId: m.id,
        name: m.id,
        description: '',
        capabilities: [],
      }));
      return c.json({ models, provider: 'openai' });
    } catch (error) {
      ctx.logger.error({ error, providerId }, 'remote-models:fetch-error');
      return c.json({ error: error instanceof Error ? error.message : 'Failed to fetch remote models' }, 500);
    }
  });

  // ---- Attachment (file upload / download) ----
  if (ctx.attachmentService) {
    app.route('/api', createAttachmentRoutes(ctx.attachmentService));
  }

  // ---- Workflow (LangGraph Multi-Agent) ----
  app.post('/api/workflow', async (c) => {
    const body = await c.req.json<{
      message: string;
      modelId?: string;
      conversationId?: string;
      userId?: string;
    }>();

    if (!body.message) {
      return c.json({ error: 'message is required' }, 400);
    }

    // Resolve model → LangChain BaseChatModel
    const chatModel = await ctx.modelFactory.resolveChatModel(body.modelId);
    if (!chatModel) {
      return c.json({ error: 'Model not available' }, 503);
    }

    // Build default graph
    const compiledGraph = buildDefaultGraph(chatModel) as unknown as Parameters<typeof createLangGraphStream>[0];

    // Create LangGraph → AI SDK Data Stream bridge
    const stream = createLangGraphStream(
      compiledGraph,
      {
        messages: [new HumanMessage(body.message)],
        conversationId: body.conversationId ?? null,
        userId: body.userId ?? null,
      },
      { logger: ctx.logger, sendNodeMetadata: true },
    );

    return createUIMessageStreamResponse({ stream });
  });

  // ---- RAG Query ----
  app.post('/api/rag', async (c) => {
    const body = await c.req.json<{
      query: string;
      modelId?: string;
      sources?: ('conversation' | 'document')[];
      topK?: number;
      maxTokens?: number;
    }>();

    if (!body.query) {
      return c.json({ error: 'query is required' }, 400);
    }

    // RAG pipeline은 host app에서 주입하므로 여기서는 간단한 skeleton
    // 실제 구현은 RAGPipeline.retrieve() + generateText()
    const resolved = await ctx.modelFactory.resolve(body.modelId);
    if (!resolved) {
      return c.json({ error: 'Model not available' }, 503);
    }

    const model = createAISdkModel(resolved);

    // TODO: 실제 RAG pipeline.retrieve() 연동 — 현재는 직접 응답
    const result = await generateText({
      model,
      system: 'Answer the question based on available knowledge. If you don\'t know, say so.',
      messages: [{ role: 'user' as const, content: body.query }],
      maxOutputTokens: body.maxTokens ?? 2048,
    });

    return c.json({
      answer: result.text,
      usage: result.usage,
      sources: [], // RAG pipeline 연동 시 검색된 소스 반환
    });
  });

  // ---- Webhook (External Trigger) ----
  app.post('/api/webhook/chat', async (c) => {
    const body = await c.req.json<{
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      modelId?: string;
      system?: string;
      maxTokens?: number;
      /** 응답 형식: 'stream' | 'json' (기본: 'json') */
      responseFormat?: 'stream' | 'json';
    }>();

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: 'messages array is required' }, 400);
    }

    const resolved = await ctx.modelFactory.resolve(body.modelId);
    if (!resolved) {
      return c.json({ error: 'Model not available' }, 503);
    }

    const model = createAISdkModel(resolved);
    const systemPrompt = body.system ?? 'You are a helpful AI assistant.';

    if (body.responseFormat === 'stream') {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: body.messages,
        maxOutputTokens: body.maxTokens ?? 2048,
      });
      return result.toUIMessageStreamResponse();
    }

    // Non-streaming JSON response
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: body.messages,
      maxOutputTokens: body.maxTokens ?? 2048,
    });

    return c.json({
      text: result.text,
      finishReason: result.finishReason,
      usage: result.usage,
    });
  });

  // ---- B-10: /api/workflow — Dedicated workflow endpoint ----
  app.post('/api/workflow', async (c) => {
    const body = await c.req.json<{
      workflowId: string;
      input: Record<string, unknown>;
      modelId?: string;
      stream?: boolean;
    }>();

    if (!body.workflowId) {
      return c.json({ error: 'workflowId is required' }, 400);
    }

    const resolved = body.modelId ? await ctx.modelFactory.resolve(body.modelId) : null;
    const model = resolved ? createAISdkModel(resolved) : null;

    // Delegate to orchestration layer if available
    if (ctx.orchestrator) {
      try {
        const result = await ctx.orchestrator.runWorkflow(body.workflowId, {
          ...body.input,
          model,
        });

        if (body.stream && result.stream) {
          return result.stream.toUIMessageStreamResponse();
        }

        return c.json({
          workflowId: body.workflowId,
          output: result.output,
          status: result.status ?? 'completed',
        });
      } catch (error) {
        ctx.logger.error({ error, workflowId: body.workflowId }, 'workflow:error');
        return c.json(
          { error: error instanceof Error ? error.message : 'Workflow execution failed' },
          500,
        );
      }
    }

    return c.json({ error: 'Orchestrator not configured' }, 503);
  });

  return app;
}

