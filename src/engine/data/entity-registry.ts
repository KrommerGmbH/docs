// ─── Entity Registry ─────────────────────────────────────
// Mirrors AideWorks src/core/data/entity-registry.ts

import type { DataEntityDefinition } from './types.js';
import { EntityDefinition } from './entity.definition.js';

const registry = new Map<string, DataEntityDefinition>();
let registryRevision = 0;
const listeners = new Set<(event: { type: 'register' | 'replace' | 'unregister'; entity: string; revision: number }) => void>();

function notify(type: 'register' | 'replace' | 'unregister', entity: string): void {
  registryRevision += 1;
  const event = { type, entity, revision: registryRevision } as const;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // noop
    }
  }
}

/**
 * Register an entity definition.
 *
 * Accepts either:
 * - An `EntityDefinition` subclass instance → converted via `toDataDefinition()`
 * - A plain `DataEntityDefinition` object (legacy/manual)
 */
export function registerEntityDefinition(
  definition: DataEntityDefinition | EntityDefinition,
): void {
  if (definition instanceof EntityDefinition) {
    const data = definition.toDataDefinition();
    const prev = registry.get(data.entity);
    registry.set(data.entity, data);
    notify(prev ? 'replace' : 'register', data.entity);
  } else {
    const prev = registry.get(definition.entity);
    registry.set(definition.entity, definition);
    notify(prev ? 'replace' : 'register', definition.entity);
  }
}

export function unregisterEntityDefinition(entityName: string): boolean {
  const existed = registry.delete(entityName);
  if (existed) {
    notify('unregister', entityName);
  }
  return existed;
}

export function replaceEntityDefinitions(definitions: Array<DataEntityDefinition | EntityDefinition>): void {
  const next = new Map<string, DataEntityDefinition>();

  for (const definition of definitions) {
    const data = definition instanceof EntityDefinition ? definition.toDataDefinition() : definition;
    next.set(data.entity, data);
  }

  const prevKeys = new Set(registry.keys());
  registry.clear();
  for (const [entity, def] of next.entries()) {
    registry.set(entity, def);
    notify(prevKeys.has(entity) ? 'replace' : 'register', entity);
    prevKeys.delete(entity);
  }

  for (const removed of prevKeys) {
    notify('unregister', removed);
  }
}

export function getEntityDefinition(entityName: string): DataEntityDefinition | undefined {
  return registry.get(entityName);
}

export function getAllEntityDefinitions(): DataEntityDefinition[] {
  return Array.from(registry.values());
}

export function getEntityRegistryRevision(): number {
  return registryRevision;
}

export function subscribeEntityRegistry(
  listener: (event: { type: 'register' | 'replace' | 'unregister'; entity: string; revision: number }) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * EntityRegistry — convenience namespace (AideWorks-compatible).
 *
 * @example
 * ```ts
 * EntityRegistry.register(new LlmProviderDefinition());
 * const def = EntityRegistry.get('cmh_llm_provider');
 * ```
 */
export const EntityRegistry = {
  register: registerEntityDefinition,
  unregister: unregisterEntityDefinition,
  replaceAll: replaceEntityDefinitions,
  get: getEntityDefinition,
  getAll: getAllEntityDefinitions,
  getRevision: getEntityRegistryRevision,
  subscribe: subscribeEntityRegistry,
};
