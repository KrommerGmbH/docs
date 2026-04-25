import type { AgentDefinition, SecurityAction, LlamaModelConfig } from '../types/index.js';
import type { Logger } from '../core/logger.js';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { SecurityGate } from './security-gate.js';
import { PromptRenderer } from './prompt-renderer.js';

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentRunOptions {
  messages: AgentMessage[];
  systemPromptVars?: Record<string, string>;
  maxTurns?: number;
  retry?: Partial<AgentRetryPolicy>;
}

export interface AgentRunResult {
  agentId: string;
  response: string;
  thinking?: string;
  turns: number;
  attempts?: number;
}

export interface AgentRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

const DEFAULT_RETRY_POLICY: AgentRetryPolicy = {
  maxAttempts: 2,
  baseDelayMs: 250,
  maxDelayMs: 2500,
  jitterRatio: 0.2,
};

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lowered = message.toLowerCase();

  if (
    lowered.includes('timeout')
    || lowered.includes('timed out')
    || lowered.includes('econnreset')
    || lowered.includes('econnrefused')
    || lowered.includes('etimedout')
    || lowered.includes('network')
    || lowered.includes('rate limit')
    || lowered.includes('429')
    || lowered.includes('503')
    || lowered.includes('502')
    || lowered.includes('504')
  ) {
    return true;
  }

  return false;
}

function computeBackoffMs(attempt: number, policy: AgentRetryPolicy): number {
  const expDelay = Math.min(policy.maxDelayMs, policy.baseDelayMs * (2 ** (attempt - 1)));
  const jitter = expDelay * policy.jitterRatio * Math.random();
  return Math.max(0, Math.floor(expDelay + jitter));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Agent Harness — wraps a single agent definition,
 * resolves its prompt, enforces security, and runs inference.
 *
 * Phase 3.4 — LangChain BaseChatModel.invoke() 기반으로 전환.
 * 더 이상 llama-server에 직접 fetch 하지 않고, 주입받은 chatModel을 사용.
 */
export class AgentHarness {
  constructor(
    private readonly definition: AgentDefinition,
    private readonly chatModel: BaseChatModel,
    private readonly modelConfig: LlamaModelConfig,
    private readonly promptRenderer: PromptRenderer | null,
    private readonly securityGate: SecurityGate | null,
    private readonly logger: Logger,
  ) {}

  get id(): string {
    return this.definition.id;
  }

  get name(): string {
    return this.definition.name;
  }

  get role(): string {
    return this.definition.role;
  }

  /**
   * Run the agent with given messages — LangChain invoke() 기반.
   */
  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const { messages, systemPromptVars = {}, retry } = options;
    const retryPolicy: AgentRetryPolicy = {
      ...DEFAULT_RETRY_POLICY,
      ...(retry ?? {}),
    };

    // Resolve system prompt
    let systemPrompt: string | undefined;
    if (this.promptRenderer && this.definition.promptTemplateId) {
      systemPrompt = await this.promptRenderer.render(
        this.definition.promptTemplateId,
        {
          agentName: this.definition.name,
          agentRole: this.definition.role,
          ...systemPromptVars,
        },
      );
    }

    // Security check
    if (this.securityGate) {
      const action: SecurityAction = {
        type: 'inference',
        agentId: this.definition.id,
        agentName: this.definition.name,
        action: 'run',
        description: `Agent ${this.definition.name} processing ${messages.length} messages`,
        securityLevel: this.definition.securityLevel,
      };

      const approved = await this.securityGate.validate(action);
      if (!approved) {
        return {
          agentId: this.definition.id,
          response: '[Action denied by security gate]',
          turns: 0,
        };
      }
    }

    // Build LangChain message list
    const langchainMessages = [];
    if (systemPrompt) {
      langchainMessages.push(new SystemMessage(systemPrompt));
    } else if (this.modelConfig.systemPrompt) {
      langchainMessages.push(new SystemMessage(this.modelConfig.systemPrompt));
    }
    for (const msg of messages) {
      if (msg.role === 'user') langchainMessages.push(new HumanMessage(msg.content));
      else if (msg.role === 'assistant') langchainMessages.push(new AIMessage(msg.content));
      else if (msg.role === 'system') langchainMessages.push(new SystemMessage(msg.content));
    }

    // LangChain invoke — BaseChatModel 호출 + retry/backoff 휴리스틱
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= Math.max(1, retryPolicy.maxAttempts); attempt++) {
      try {
        const response = await this.chatModel.invoke(langchainMessages);
        const text = typeof response.content === 'string'
          ? response.content
          : '';

        this.logger.info({ agentId: this.definition.id, attempt }, 'agent:run-complete');

        return {
          agentId: this.definition.id,
          response: text,
          turns: 1,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error;
        const retryable = isRetryableError(error);
        const canRetry = retryable && attempt < retryPolicy.maxAttempts;

        this.logger.warn(
          {
            agentId: this.definition.id,
            attempt,
            retryable,
            error,
          },
          'agent:run-attempt-failed',
        );

        if (!canRetry) {
          break;
        }

        const delayMs = computeBackoffMs(attempt, retryPolicy);
        await sleep(delayMs);
      }
    }

    this.logger.error({ agentId: this.definition.id, error: lastError }, 'agent:run-failed');
    throw (lastError instanceof Error ? lastError : new Error(String(lastError ?? 'agent run failed')));
  }
}
