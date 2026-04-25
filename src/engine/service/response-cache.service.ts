/**
 * B-4 LLM Response Cache
 *
 * 동일 프롬프트+모델 조합에 대한 응답을 인메모리 LRU 캐시로 관리.
 * 스트리밍 응답은 캐시하지 않고, non-streaming generateChat 결과만 캐시.
 *
 * 캐시 키: SHA-256(JSON.stringify({ modelId, messages, system, temperature }))
 */

import { createHash } from 'crypto'

export interface CacheEntry {
  content: string
  reasoning?: string
  createdAt: number
  expiresAt?: number
  hitCount?: number
  lastHitAt?: number
  /** 원본 응답 토큰 수 (추정) */
  tokens?: number
  modelId?: string
}

export type CacheLookupStatus = 'hit' | 'stale-hit' | 'miss'

export interface CacheLookupResult {
  status: CacheLookupStatus
  entry: CacheEntry | null
}

export interface ResponseCacheConfig {
  /** 최대 캐시 항목 수 (기본: 200) */
  maxEntries?: number
  /** 항목 TTL (ms, 기본: 10분) */
  ttlMs?: number
  /** adaptive TTL 최대치 (ms, 기본: 40분) */
  maxTtlMs?: number
  /** hot item 판별 hit 수 (기본: 3) */
  hotHitThreshold?: number
  /** 캐시 활성화 여부 (기본: true) */
  enabled?: boolean
  /** 만료 항목 stale 허용 윈도우(ms, 기본: 5분) */
  staleWindowMs?: number
  /** 모델별 TTL 배수 정책 */
  modelTtlMultiplier?: Record<string, number>
}

export class ResponseCacheService {
  private cache = new Map<string, CacheEntry>()
  private readonly maxEntries: number
  private readonly ttlMs: number
  private readonly maxTtlMs: number
  private readonly hotHitThreshold: number
  private readonly enabled: boolean
  private readonly staleWindowMs: number
  private readonly modelTtlMultiplier: Record<string, number>
  private hits = 0
  private misses = 0
  private staleHits = 0

  constructor(config: ResponseCacheConfig = {}) {
    this.maxEntries = config.maxEntries ?? 200
    this.ttlMs = config.ttlMs ?? 10 * 60 * 1000 // 10 min
    this.maxTtlMs = config.maxTtlMs ?? 40 * 60 * 1000 // 40 min
    this.hotHitThreshold = config.hotHitThreshold ?? 3
    this.enabled = config.enabled ?? true
    this.staleWindowMs = config.staleWindowMs ?? 5 * 60 * 1000
    this.modelTtlMultiplier = config.modelTtlMultiplier ?? {}
  }

  private computeAdaptiveTtlMs(entry: Pick<CacheEntry, 'tokens' | 'content' | 'hitCount'>): number {
    const tokenBoost = Math.min(1.0, (entry.tokens ?? 0) / 4000) // 0 ~ 1
    const sizeBoost = Math.min(0.6, (entry.content?.length ?? 0) / 12000) // 0 ~ 0.6
    const hitBoost = Math.min(2.0, ((entry.hitCount ?? 0) / 3) * 0.5) // 0 ~ 2.0
    const multiplier = 1 + tokenBoost + sizeBoost + hitBoost
    return Math.min(this.maxTtlMs, Math.floor(this.ttlMs * multiplier))
  }

  private applyModelTtlMultiplier(ttlMs: number, modelId?: string): number {
    const key = (modelId ?? '').toLowerCase()
    if (!key) return ttlMs
    const multiplier = this.modelTtlMultiplier[key]
    if (!multiplier || !Number.isFinite(multiplier)) return ttlMs
    return Math.max(1_000, Math.floor(ttlMs * multiplier))
  }

  /**
   * 캐시 키 생성
   */
  buildKey(params: {
    modelId: string
    messages: Array<{ role: string; content: unknown }>
    system?: string
    temperature?: number
  }): string {
    const payload = JSON.stringify({
      m: params.modelId,
      msgs: params.messages.map((msg) => ({
        r: msg.role,
        c: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      })),
      s: params.system ?? '',
      t: params.temperature ?? 0.7,
    })
    return createHash('sha256').update(payload).digest('hex')
  }

  /**
   * 캐시에서 조회
   */
  get(key: string): CacheEntry | null {
    const result = this.getWithMeta(key, { allowStale: false })
    return result.entry
  }

  getWithMeta(key: string, options: { allowStale?: boolean } = {}): CacheLookupResult {
    if (!this.enabled) {
      return { status: 'miss', entry: null }
    }
    const entry = this.cache.get(key)
    if (!entry) {
      this.misses += 1
      return { status: 'miss', entry: null }
    }

    // TTL 만료 확인
    const now = Date.now()
    const effectiveExpireAt = entry.expiresAt ?? (entry.createdAt + this.ttlMs)
    if (now > effectiveExpireAt) {
      const staleCutoff = effectiveExpireAt + this.staleWindowMs
      if (options.allowStale && now <= staleCutoff) {
        this.staleHits += 1
        entry.hitCount = (entry.hitCount ?? 0) + 1
        entry.lastHitAt = now
        return { status: 'stale-hit', entry }
      }

      this.cache.delete(key)
      this.misses += 1
      return { status: 'miss', entry: null }
    }

    this.hits += 1
    entry.hitCount = (entry.hitCount ?? 0) + 1
    entry.lastHitAt = now
    // hot item은 만료를 점진적으로 연장
    entry.expiresAt = now + this.applyModelTtlMultiplier(this.computeAdaptiveTtlMs(entry), entry.modelId)

    // LRU: 접근 시 맨 뒤로 이동
    this.cache.delete(key)
    this.cache.set(key, entry)
    return { status: 'hit', entry }
  }

  /**
   * 캐시에 저장
   */
  set(key: string, entry: Omit<CacheEntry, 'createdAt'>): void {
    if (!this.enabled) return
    if (!entry.content?.trim()) return // 빈 응답은 캐시하지 않음

    // LRU eviction
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) this.cache.delete(firstKey)
    }

    const now = Date.now()
    const seedEntry: CacheEntry = {
      ...entry,
      createdAt: now,
      hitCount: 0,
      lastHitAt: now,
    }
    seedEntry.expiresAt = now + this.applyModelTtlMultiplier(this.computeAdaptiveTtlMs(seedEntry), seedEntry.modelId)
    this.cache.set(key, seedEntry)
  }

  pruneExpired(): number {
    const now = Date.now()
    let removed = 0
    for (const [key, entry] of this.cache.entries()) {
      const expireAt = entry.expiresAt ?? (entry.createdAt + this.ttlMs)
      if (now > expireAt + this.staleWindowMs) {
        this.cache.delete(key)
        removed += 1
      }
    }
    return removed
  }

  /**
   * 캐시 통계
   */
  stats(): {
    size: number
    maxEntries: number
    enabled: boolean
    hits: number
    misses: number
    hitRate: number
    hotItems: number
    staleHits: number
  } {
    const hotItems = [...this.cache.values()].filter((e) => (e.hitCount ?? 0) >= this.hotHitThreshold).length
    const total = this.hits + this.misses
    const hitRate = total > 0 ? this.hits / total : 0
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      enabled: this.enabled,
      hits: this.hits,
      misses: this.misses,
      staleHits: this.staleHits,
      hitRate,
      hotItems,
    }
  }

  /**
   * 캐시 초기화
   */
  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
    this.staleHits = 0
  }
}

/** 싱글톤 인스턴스 */
export const responseCache = new ResponseCacheService()
