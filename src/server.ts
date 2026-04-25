// ─── Server entry: @krommergmbh/cmh-chatbot/server ──────
export { createChatServer, type ChatServer } from './engine/server/factory.js';
export { createRoutes, type RouteContext } from './engine/server/routes.js';
export { attachWebSocket } from './engine/server/websocket.js';
export { getHealthStatus } from './engine/server/health.js';

// Re-export DAL essentials for server-side usage
export {
  Criteria,
  Repository,
  RepositoryFactory,
  InMemoryDataAdapter,
  seedDefaultData,
  ENTITY_CMH_LLM_PROVIDER,
} from './engine/data/index.js';

export type { DataAdapter, LlmProvider } from './engine/data/index.js';
