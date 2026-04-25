// ─── Default seed data ──────────────────────────────────
// Shopware translation 패턴 적용 — entity별 _translation 테이블 seed 포함.

import type { LlmProvider } from './entity/llm/llm-provider.entity.js';

import type { LanguageEntity, LanguageTranslation } from './entity/language/language.entity.js';
import type { UserEntity } from './entity/user/user.entity.js';
import type { AgentType } from './entity/agent/agent-type.entity.js';
import type { Agent } from './entity/agent/agent.entity.js';
import type { Conversation } from './entity/conversation/conversation.entity.js';
import type { Message } from './entity/conversation/message.entity.js';
import type { InMemoryDataAdapter } from './data-adapter.js';
import type { SqliteDataAdapter } from './sqlite-adapter.js';
import type { Entity, SupportedLocale } from './types.js';

// ─── Entity names ───────────────────────────────────────

export const ENTITY_CMH_LANGUAGE = 'cmh_language';
export const ENTITY_CMH_LANGUAGE_TRANSLATION = 'cmh_language_translation';
export const ENTITY_CMH_USER = 'cmh_user';
export const ENTITY_CMH_LLM_PROVIDER = 'cmh_llm_provider';
export const ENTITY_CMH_LLM_PROVIDER_TRANSLATION = 'cmh_llm_provider_translation';
export const ENTITY_CMH_AGENT_TYPE = 'cmh_agent_type';
export const ENTITY_CMH_AGENT_TYPE_TRANSLATION = 'cmh_agent_type_translation';
export const ENTITY_CMH_AGENT = 'cmh_agent';
export const ENTITY_CMH_CONVERSATION = 'cmh_conversation';
export const ENTITY_CMH_MESSAGE = 'cmh_message';
export const ENTITY_CMH_MEDIA = 'cmh_media';
export const ENTITY_CMH_MEDIA_FOLDER = 'cmh_media_folder';
export const ENTITY_CMH_RAG_DOCUMENT = 'cmh_rag_document';
export const ENTITY_CMH_SCHEDULED_TASK = 'cmh_scheduled_task';

// ─── Helper ─────────────────────────────────────────────

const now = () => new Date().toISOString();

/** 5개 locale 번역 생성 헬퍼 */
function makeTranslations(
  entityFkField: string,
  entityId: string,
  names: Record<SupportedLocale, string>,
  descriptions?: Record<SupportedLocale, string>,
): Array<Record<string, unknown>> {
  const locales: SupportedLocale[] = ['ko-KR', 'en-GB', 'de-DE', 'zh-CN', 'ja-JP'];
  return locales.map((locale) => ({
    id: crypto.randomUUID(),
    entityId,
    [entityFkField]: entityId,
    locale,
    name: names[locale] ?? names['en-GB'],
    description: descriptions?.[locale] ?? descriptions?.['en-GB'] ?? '',
    createdAt: now(),
    updatedAt: now(),
  }));
}

// ─── Default Providers ──────────────────────────────────

export const DEFAULT_PROVIDERS: LlmProvider[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Local (llama.cpp)',
    type: 'local-gguf',
    isActive: true,
    priority: 1,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'OpenAI',
    type: 'cloud-api',
    apiKey: null,
    baseUrl: 'https://api.openai.com/v1',
    isActive: true,
    priority: 2,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Anthropic',
    type: 'cloud-api',
    apiKey: null,
    baseUrl: 'https://api.anthropic.com',
    isActive: true,
    priority: 3,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Ollama (Self-hosted)',
    type: 'self-hosted',
    baseUrl: 'http://localhost:11434',
    isActive: false,
    priority: 10,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'HuggingFace (Transformers.js)',
    description: 'Browser-side ONNX/WASM inference via @huggingface/transformers',
    type: 'local-gguf',
    isActive: true,
    priority: 5,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0000-000000000006',
    name: 'Google AI (Gemini)',
    type: 'cloud-api',
    apiKey: null,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    isActive: true,
    priority: 4,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0000-000000000007',
    name: 'GitHub Copilot (Models)',
    type: 'cloud-api',
    apiKey: null,
    baseUrl: 'https://models.github.ai/inference',
    isActive: true,
    priority: 6,
    createdAt: now(),
    updatedAt: now(),
  },
];

// ─── Default Agent Types ────────────────────────────────

export const DEFAULT_AGENT_TYPES: AgentType[] = [
  {
    id: '00000000-0000-0000-0002-000000000001',
    name: 'Orchestrator',
    technicalName: 'orchestrator',
    description: 'Top-level coordinator that routes user requests to the appropriate manager agents',
    maxConcurrentTasks: 0,
    canHaveChildren: true,
    isActive: true,
    priority: 1,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0002-000000000002',
    name: 'Manager',
    technicalName: 'manager',
    description: 'Mid-level coordinator that decomposes tasks and delegates to worker agents',
    maxConcurrentTasks: 0,
    canHaveChildren: true,
    isActive: true,
    priority: 2,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0002-000000000003',
    name: 'Worker',
    technicalName: 'worker',
    description: 'Leaf-level executor that handles atomic, indivisible tasks',
    maxConcurrentTasks: 3,
    canHaveChildren: false,
    isActive: true,
    priority: 3,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0002-000000000004',
    name: 'Profiler',
    technicalName: 'profiler',
    description: 'Post-chat analysis agent that hooks into LangChain save callbacks',
    maxConcurrentTasks: 1,
    canHaveChildren: false,
    isActive: true,
    priority: 4,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0002-000000000005',
    name: 'Supporter',
    technicalName: 'supporter',
    description: 'Utility agent providing supporting capabilities: web search, RAG retrieval',
    maxConcurrentTasks: 5,
    canHaveChildren: false,
    isActive: true,
    priority: 5,
    createdAt: now(),
    updatedAt: now(),
  },
];

// ─── Default Agents (initial system agents) ─────────────

export const DEFAULT_AGENTS: Agent[] = [
  {
    id: '00000000-0000-0000-0003-000000000001',
    agentTypeId: '00000000-0000-0000-0002-000000000001',
    name: 'Main Orchestrator',
    status: 'idle',
    isActive: true,
    systemPrompt: 'You are the main orchestrator...',
    capabilities: ['routing', 'response-assembly', 'conversation-management'],
    createdAt: now(),
    updatedAt: now(),
  },
  // ── 매니저 에이전트 ───────────────────────────────────
  {
    id: '00000000-0000-0000-0003-000000000010',
    agentTypeId: '00000000-0000-0000-0002-000000000002',
    parentAgentId: '00000000-0000-0000-0003-000000000001',
    name: 'Shopping Manager',
    status: 'idle',
    isActive: true,
    systemPrompt: 'You are the Shopping Manager. Help users with product search, price comparison, shopping recommendations, and purchase decisions.',
    capabilities: ['product-search', 'price-comparison', 'shopping-recommendation'],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0003-000000000011',
    agentTypeId: '00000000-0000-0000-0002-000000000002',
    parentAgentId: '00000000-0000-0000-0003-000000000001',
    name: 'Finance Manager',
    status: 'idle',
    isActive: true,
    systemPrompt: 'You are the Finance Manager. Help users with budgeting, expense tracking, investment insights, exchange rates, and financial planning.',
    capabilities: ['budgeting', 'expense-tracking', 'exchange-rate', 'financial-planning'],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0003-000000000012',
    agentTypeId: '00000000-0000-0000-0002-000000000002',
    parentAgentId: '00000000-0000-0000-0003-000000000001',
    name: 'Health Manager',
    status: 'idle',
    isActive: true,
    systemPrompt: 'You are the Health Manager. Help users with health tracking, nutrition advice, exercise plans, and wellness tips.',
    capabilities: ['health-tracking', 'nutrition', 'exercise-planning', 'wellness'],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0003-000000000013',
    agentTypeId: '00000000-0000-0000-0002-000000000002',
    parentAgentId: '00000000-0000-0000-0003-000000000001',
    name: 'Knowledge Manager',
    status: 'idle',
    isActive: true,
    systemPrompt: 'You are the Knowledge Manager. Help users with research, learning, document analysis, summarization, and knowledge management.',
    capabilities: ['research', 'document-analysis', 'summarization', 'learning'],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0003-000000000014',
    agentTypeId: '00000000-0000-0000-0002-000000000002',
    parentAgentId: '00000000-0000-0000-0003-000000000001',
    name: 'Career Manager',
    status: 'idle',
    isActive: true,
    systemPrompt: 'You are the Career Manager. Help users with job search, resume writing, interview preparation, and career development.',
    capabilities: ['job-search', 'resume-writing', 'interview-prep', 'career-planning'],
    createdAt: now(),
    updatedAt: now(),
  },
  // ── 유틸리티 에이전트 ─────────────────────────────────
  {
    id: '00000000-0000-0000-0003-000000000002',
    agentTypeId: '00000000-0000-0000-0002-000000000004',
    name: 'User Profiler',
    status: 'idle',
    isActive: true,
    systemPrompt: 'Analyze chat history to build user profiles...',
    capabilities: ['langchain-hook', 'profile-analysis', 'file-export'],
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: '00000000-0000-0000-0003-000000000003',
    agentTypeId: '00000000-0000-0000-0002-000000000005',
    name: 'Web Search Supporter',
    status: 'idle',
    isActive: true,
    systemPrompt: 'Perform web searches, RAG retrieval...',
    capabilities: ['web-search', 'rag-retrieval', 'api-calls'],
    createdAt: now(),
    updatedAt: now(),
  },
];

// ─── Default Languages ──────────────────────────────────

const LANG_KO = '00000000-0000-0000-0200-000000000001';
const LANG_EN = '00000000-0000-0000-0200-000000000002';
const LANG_DE = '00000000-0000-0000-0200-000000000003';
const LANG_ZH = '00000000-0000-0000-0200-000000000004';
const LANG_JA = '00000000-0000-0000-0200-000000000005';
const LANG_FR = '00000000-0000-0000-0200-000000000006';

export const DEFAULT_LANGUAGES: LanguageEntity[] = [
  { id: LANG_KO, code: 'ko-KR', nativeName: '한국어', icon: '🇰🇷', position: 1, isDefault: true, isActive: true, createdAt: now(), updatedAt: now() },
  { id: LANG_EN, code: 'en-GB', nativeName: 'English', icon: '🇬🇧', position: 2, isDefault: false, isActive: true, createdAt: now(), updatedAt: now() },
  { id: LANG_DE, code: 'de-DE', nativeName: 'Deutsch', icon: '🇩🇪', position: 3, isDefault: false, isActive: true, createdAt: now(), updatedAt: now() },
  { id: LANG_ZH, code: 'zh-CN', nativeName: '中文', icon: '🇨🇳', position: 4, isDefault: false, isActive: true, createdAt: now(), updatedAt: now() },
  { id: LANG_JA, code: 'ja-JP', nativeName: '日本語', icon: '🇯🇵', position: 5, isDefault: false, isActive: true, createdAt: now(), updatedAt: now() },
  { id: LANG_FR, code: 'fr-FR', nativeName: 'Français', icon: '🇫🇷', position: 6, isDefault: false, isActive: true, createdAt: now(), updatedAt: now() },
];

export const DEFAULT_LANGUAGE_TRANSLATIONS = [
  ...makeTranslations('languageId', LANG_KO,
    { 'ko-KR': '한국어', 'en-GB': 'Korean', 'de-DE': 'Koreanisch', 'zh-CN': '韩语', 'ja-JP': '韓国語' }),
  ...makeTranslations('languageId', LANG_EN,
    { 'ko-KR': '영어', 'en-GB': 'English', 'de-DE': 'Englisch', 'zh-CN': '英语', 'ja-JP': '英語' }),
  ...makeTranslations('languageId', LANG_DE,
    { 'ko-KR': '독일어', 'en-GB': 'German', 'de-DE': 'Deutsch', 'zh-CN': '德语', 'ja-JP': 'ドイツ語' }),
  ...makeTranslations('languageId', LANG_ZH,
    { 'ko-KR': '중국어', 'en-GB': 'Chinese', 'de-DE': 'Chinesisch', 'zh-CN': '中文', 'ja-JP': '中国語' }),
  ...makeTranslations('languageId', LANG_JA,
    { 'ko-KR': '일본어', 'en-GB': 'Japanese', 'de-DE': 'Japanisch', 'zh-CN': '日语', 'ja-JP': '日本語' }),
  ...makeTranslations('languageId', LANG_FR,
    { 'ko-KR': '프랑스어', 'en-GB': 'French', 'de-DE': 'Französisch', 'zh-CN': '法语', 'ja-JP': 'フランス語' }),
] as LanguageTranslation[];

// ─── Default Users ──────────────────────────────────────

export const DEFAULT_USERS: UserEntity[] = [
  {
    id: '00000000-0000-0000-0300-000000000001',
    name: 'Default User',
    languageId: LANG_KO,
    avatarIcon: 'ph:cat-light',
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
  },
];

// ─── Seed function ──────────────────────────────────────

/**
 * Seed the InMemoryDataAdapter with all default entity data.
 *
 * Order: ModelTypes → Providers → Models → AgentTypes → Agents
 * (translation tables seeded alongside parent entities)
 */
export function seedDefaultData(adapter: InMemoryDataAdapter | SqliteDataAdapter): void {
  // Languages + Translations
  adapter.seed<LanguageEntity>(ENTITY_CMH_LANGUAGE, DEFAULT_LANGUAGES);
  adapter.seed(ENTITY_CMH_LANGUAGE_TRANSLATION, DEFAULT_LANGUAGE_TRANSLATIONS as unknown as Entity[]);

  // Users
  adapter.seed<UserEntity>(ENTITY_CMH_USER, DEFAULT_USERS);

  // Providers + Translations
  adapter.seed<LlmProvider>(ENTITY_CMH_LLM_PROVIDER, DEFAULT_PROVIDERS);
  adapter.seed(ENTITY_CMH_LLM_PROVIDER_TRANSLATION, [] as Entity[]);

  // Agent Types + Translations + Agents
  adapter.seed<AgentType>(ENTITY_CMH_AGENT_TYPE, DEFAULT_AGENT_TYPES);
  adapter.seed(ENTITY_CMH_AGENT_TYPE_TRANSLATION, [] as Entity[]);
  adapter.seed<Agent>(ENTITY_CMH_AGENT, DEFAULT_AGENTS);

  // Conversations + Messages (empty — created at runtime)
  adapter.seed<Conversation>(ENTITY_CMH_CONVERSATION, []);
  adapter.seed<Message>(ENTITY_CMH_MESSAGE, []);

  // Media, RAG, Scheduled Tasks (empty — created at runtime)
  adapter.seed(ENTITY_CMH_MEDIA, [] as Entity[]);
  adapter.seed(ENTITY_CMH_MEDIA_FOLDER, [] as Entity[]);
  adapter.seed(ENTITY_CMH_RAG_DOCUMENT, [] as Entity[]);
  adapter.seed(ENTITY_CMH_SCHEDULED_TASK, [] as Entity[]);
}




