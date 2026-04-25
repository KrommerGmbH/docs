// ─── Token Counter Service ───────────────────────────────
// Phase 3 — 토큰 카운팅 + 히스토리 트리밍.
// 토크나이저 없이 문자열 길이 기반 추정 + llama-server /tokenize 폴백.

import type { Logger } from '../core/logger.js';

interface LangChainTokenCounter {
  count(text: string, modelId?: string): Promise<number | null>;
}

interface TokenCountOptions {
  modelId?: string;
  logger?: Logger;
  llamaServerUrl?: string;
}

let langChainCounterPromise: Promise<LangChainTokenCounter | null> | null = null;

function normalizeTokenizerModelId(modelId?: string): string {
  const raw = (modelId ?? '').trim().toLowerCase();
  if (!raw) return 'gpt-4o-mini';

  const withoutKnownPrefix = raw
    .replace(/^models\//, '')
    .replace(/^openai\//, '')
    .replace(/^google\//, '')
    .replace(/^anthropic\//, '');

  if (
    withoutKnownPrefix.startsWith('gpt-')
    || withoutKnownPrefix.startsWith('o1')
    || withoutKnownPrefix.startsWith('o3')
    || withoutKnownPrefix.startsWith('o4')
  ) {
    return withoutKnownPrefix;
  }

  // OpenAI 계열 토크나이저로 환산 가능한 기본값
  return 'gpt-4o-mini';
}

async function getLangChainTokenCounter(logger?: Logger): Promise<LangChainTokenCounter | null> {
  if (!langChainCounterPromise) {
    langChainCounterPromise = (async () => {
      try {
        const langChainOpenAI = await import('@langchain/openai');
        const ChatOpenAI = (langChainOpenAI as { ChatOpenAI?: new (fields: Record<string, unknown>) => unknown }).ChatOpenAI;

        if (!ChatOpenAI) {
          return null;
        }

        const modelCache = new Map<string, unknown>();

        return {
          async count(text: string, modelId?: string): Promise<number | null> {
            if (!text) return 0;

            const tokenizerModel = normalizeTokenizerModelId(modelId);
            let modelInstance = modelCache.get(tokenizerModel);

            if (!modelInstance) {
              modelInstance = new ChatOpenAI({
                model: tokenizerModel,
                apiKey: 'sk-cmh-chatbot-token-counter',
                maxRetries: 0,
              });
              modelCache.set(tokenizerModel, modelInstance);
            }

            const maybeCounter = modelInstance as { getNumTokens?: (input: string) => Promise<number> | number };
            if (typeof maybeCounter.getNumTokens !== 'function') {
              return null;
            }

            const value = await maybeCounter.getNumTokens(text);
            return Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : null;
          },
        };
      } catch (error) {
        logger?.debug({ error }, 'token-counter:langchain-counter-unavailable');
        return null;
      }
    })();
  }

  return langChainCounterPromise;
}

// ── 토큰 추정 ────────────────────────────────────────────

/**
 * 문자열의 토큰 수를 추정.
 * 영어: ~4 chars/token, CJK: ~2 chars/token, 혼합 평균 ~3 chars/token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // CJK 문자 비율에 따라 가중치 조정
  const cjkCount = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) ?? []).length;
  const ratio = text.length > 0 ? cjkCount / text.length : 0;
  const charsPerToken = 4 - ratio * 2; // CJK 100% → 2, ASCII 100% → 4
  return Math.ceil(text.length / charsPerToken);
}

/**
 * llama-server /tokenize 엔드포인트를 사용한 정확한 토큰 카운팅.
 * 타임아웃 시 estimateTokens 폴백.
 */
export async function countTokensExact(
  text: string,
  llamaServerUrl: string,
  timeoutMs = 2000,
): Promise<number> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${llamaServerUrl}/tokenize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json() as { tokens: number[] };
      return data.tokens?.length ?? estimateTokens(text);
    }
  } catch {
    // fallback to estimation
  }
  return estimateTokens(text);
}

export async function countTextTokens(
  text: string,
  options: TokenCountOptions = {},
): Promise<number> {
  if (!text) return 0;

  const langChainCounter = await getLangChainTokenCounter(options.logger);
  if (langChainCounter) {
    const langChainTokens = await langChainCounter.count(text, options.modelId);
    if (typeof langChainTokens === 'number' && Number.isFinite(langChainTokens) && langChainTokens >= 0) {
      return langChainTokens;
    }
  }

  // local/self-hosted 계열은 llama /tokenize 경로를 통한 exact count를 2차로 시도
  if (options.llamaServerUrl) {
    try {
      return await countTokensExact(text, options.llamaServerUrl, 1800);
    } catch (error) {
      options.logger?.debug({ error }, 'token-counter:llama-exact-counter-unavailable');
    }
  }

  return estimateTokens(text);
}

// ── 메시지 토큰 추정 ────────────────────────────────────

interface MessageLike {
  role: string;
  content: string | unknown;
}

function messageTokens(msg: MessageLike): number {
  const content = typeof msg.content === 'string'
    ? msg.content
    : JSON.stringify(msg.content ?? '');
  // role overhead ~4 tokens
  return estimateTokens(content) + 4;
}

// ── 히스토리 트리밍 ──────────────────────────────────────

export interface TrimOptions {
  /** 모델의 총 컨텍스트 길이 (tokens) */
  contextLength: number;
  /** 시스템 프롬프트 */
  systemPrompt?: string;
  /** 응답 예약 토큰 (기본: min(contextLength * 0.25, 4096)) */
  responseReserve?: number;
  /** 최소 유지할 메시지 수 (기본: 2 — 최소 1 user + 1 assistant) */
  minMessages?: number;
  /** 토큰 카운팅 모델 ID (LangChain tokenizer 힌트) */
  tokenModelId?: string;
  /** 선택 로거 */
  logger?: Logger;
  /** local/self-hosted exact count용 llama tokenize URL */
  llamaServerUrl?: string;
}

async function messageTokensAsync(msg: MessageLike, options: TokenCountOptions = {}): Promise<number> {
  const content = typeof msg.content === 'string'
    ? msg.content
    : JSON.stringify(msg.content ?? '');
  const contentTokens = await countTextTokens(content, options);
  return contentTokens + 4;
}

/**
 * 토큰 예산 내로 메시지 히스토리를 트리밍.
 *
 * 전략:
 * 1. 시스템 프롬프트 + 응답 예약 토큰을 뺀 나머지가 히스토리 예산.
 * 2. 최신 메시지부터 역순으로 추가, 예산 초과 시 중단.
 * 3. 결과는 원래 순서(시간순) 유지.
 */
export function trimHistory<T extends MessageLike>(
  messages: T[],
  options: TrimOptions,
): T[] {
  const { contextLength, systemPrompt, minMessages = 2 } = options;
  const responseReserve = options.responseReserve
    ?? Math.min(Math.floor(contextLength * 0.25), 4096);
  const systemTokens = systemPrompt ? estimateTokens(systemPrompt) + 4 : 0;
  const budget = contextLength - systemTokens - responseReserve;

  if (budget <= 0) {
    // 예산이 0 이하면 최소 메시지만 반환
    return messages.slice(-minMessages);
  }

  // 최신 메시지부터 역순으로 예산 소진
  let usedTokens = 0;
  let cutIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = messageTokens(messages[i]);
    if (usedTokens + tokens > budget && messages.length - i >= minMessages) {
      cutIndex = i + 1;
      break;
    }
    usedTokens += tokens;
    if (i === 0) cutIndex = 0;
  }

  return messages.slice(cutIndex);
}

/**
 * LangChain tokenizer 우선 경로를 사용하는 비동기 히스토리 트리머.
 * - `@langchain/openai` getNumTokens 가능 시 사용
 * - 실패 시 기존 estimateTokens 폴백
 */
export async function trimHistoryWithCounter<T extends MessageLike>(
  messages: T[],
  options: TrimOptions,
): Promise<T[]> {
  const { contextLength, systemPrompt, minMessages = 2, tokenModelId, logger, llamaServerUrl } = options;
  const responseReserve = options.responseReserve
    ?? Math.min(Math.floor(contextLength * 0.25), 4096);

  const systemTokens = systemPrompt
    ? (await countTextTokens(systemPrompt, { modelId: tokenModelId, logger, llamaServerUrl })) + 4
    : 0;

  const budget = contextLength - systemTokens - responseReserve;

  if (budget <= 0) {
    return messages.slice(-minMessages);
  }

  const tokenPerMessage = await Promise.all(
    messages.map((msg) => messageTokensAsync(msg, { modelId: tokenModelId, logger, llamaServerUrl })),
  );

  let usedTokens = 0;
  let cutIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = tokenPerMessage[i] ?? 0;
    if (usedTokens + tokens > budget && messages.length - i >= minMessages) {
      cutIndex = i + 1;
      break;
    }
    usedTokens += tokens;
    if (i === 0) cutIndex = 0;
  }

  return messages.slice(cutIndex);
}

export async function countPromptTokens<T extends MessageLike>(
  messages: T[],
  systemPrompt?: string,
  options: TokenCountOptions = {},
): Promise<number> {
  const messageTokensList = await Promise.all(messages.map((msg) => messageTokensAsync(msg, options)));
  const messagesTotal = messageTokensList.reduce((sum, current) => sum + current, 0);
  const systemTotal = systemPrompt
    ? (await countTextTokens(systemPrompt, options)) + 4
    : 0;

  return messagesTotal + systemTotal;
}

/**
 * max_tokens (응답 길이) 동적 계산.
 * contextLength의 25%를 기본으로, 최소 256, 최대 4096.
 */
export function calcMaxTokens(contextLength: number, promptTokens: number): number {
  const available = contextLength - promptTokens;
  const target = Math.min(Math.floor(contextLength * 0.25), 4096);
  return Math.max(256, Math.min(target, available));
}
