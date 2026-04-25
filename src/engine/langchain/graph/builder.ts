// ─── Dynamic Graph Builder ───────────────────────────────
// Phase 5.6 — Workflow JSON → StateGraph 변환.
// Vue Flow 에디터에서 저장한 JSON 워크플로우를 실행 가능한 LangGraph로 빌드.

import { StateGraph, START, END } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { createHash } from 'node:crypto';
import { AgentStateAnnotation, type AgentState } from './state-schema.js';
import { createSupervisorNode } from './supervisor.node.js';
import { createManagerNode } from './manager.node.js';
import { createWorkerNode } from './worker.node.js';
import { createProfilerNode } from './profiler.node.js';
import { createSupporterNode } from './supporter.node.js';
import { humanGateNode } from './human-gate.node.js';

// ── Workflow JSON 스키마 ────────────────────────────────

export interface WorkflowNodeDef {
  id: string;
  type: 'supervisor' | 'manager' | 'worker' | 'profiler' | 'supporter' | 'human_gate' | 'custom';
  /** 이 노드에서 이동 가능한 대상 노드 ID 목록 */
  ends?: string[];
}

export interface WorkflowEdgeDef {
  source: string;
  target: string;
  /** 조건부 엣지일 경우 조건 키 */
  condition?: string;
}

export interface WorkflowDef {
  id: string;
  name: string;
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
  /** 그래프 시작 노드 ID */
  entryNode: string;
  /** 선택적 버전 태그(미지정 시 해시 기반 버전 사용) */
  version?: string;
}

export interface WorkflowVersionInfo {
  workflowId: string;
  version: string;
  hash: string;
}

export interface WorkflowCompileRecord extends WorkflowVersionInfo {
  compiledAt: number;
}

export interface WorkflowBackendAdapter {
  getById(workflowId: string): Promise<WorkflowDef | null>;
  list?(): Promise<WorkflowDef[]>;
  save?(workflow: WorkflowDef): Promise<void>;
}

export interface WorkflowCompilerContext {
  chatModel: BaseChatModel;
  checkpointer?: BaseCheckpointSaver;
}

export interface WorkflowCompiler {
  compile(workflow: WorkflowDef, context: WorkflowCompilerContext): ReturnType<typeof buildGraphFromWorkflow>;
  compileById(workflowId: string, context: WorkflowCompilerContext): Promise<ReturnType<typeof buildGraphFromWorkflow>>;
  getCompileHistory(workflowId?: string): WorkflowCompileRecord[];
  getLatestVersion(workflowId: string): WorkflowCompileRecord | null;
}

function toStableWorkflowPayload(workflow: WorkflowDef): string {
  const normalized = {
    id: workflow.id,
    name: workflow.name,
    entryNode: workflow.entryNode,
    nodes: [...workflow.nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...workflow.edges].sort((a, b) => {
      const left = `${a.source}->${a.target}:${a.condition ?? ''}`;
      const right = `${b.source}->${b.target}:${b.condition ?? ''}`;
      return left.localeCompare(right);
    }),
  }

  return JSON.stringify(normalized)
}

function resolveWorkflowVersion(workflow: WorkflowDef): WorkflowVersionInfo {
  const payload = toStableWorkflowPayload(workflow)
  const hash = createHash('sha256').update(payload).digest('hex')
  const version = workflow.version ?? `hash-${hash.slice(0, 12)}`

  return {
    workflowId: workflow.id,
    version,
    hash,
  }
}

function validateWorkflowDef(workflow: WorkflowDef): void {
  if (!workflow.id || !workflow.name) {
    throw new Error('Workflow must include id and name');
  }
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    throw new Error(`Workflow "${workflow.id}" has no nodes`);
  }

  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  if (!nodeIds.has(workflow.entryNode)) {
    throw new Error(`Workflow "${workflow.id}" entryNode not found: ${workflow.entryNode}`);
  }

  for (const edge of workflow.edges) {
    if (edge.source !== '__start__' && !nodeIds.has(edge.source)) {
      throw new Error(`Workflow "${workflow.id}" edge source not found: ${edge.source}`);
    }
    if (edge.target !== '__end__' && !nodeIds.has(edge.target)) {
      throw new Error(`Workflow "${workflow.id}" edge target not found: ${edge.target}`);
    }
  }
}

export function createWorkflowCompiler(adapter: WorkflowBackendAdapter): WorkflowCompiler {
  const compileHistory: WorkflowCompileRecord[] = []
  const maxHistory = 50

  const pushHistory = (workflow: WorkflowDef) => {
    const version = resolveWorkflowVersion(workflow)
    compileHistory.push({
      ...version,
      compiledAt: Date.now(),
    })
    if (compileHistory.length > maxHistory) {
      compileHistory.splice(0, compileHistory.length - maxHistory)
    }
  }

  return {
    compile(workflow: WorkflowDef, context: WorkflowCompilerContext) {
      const compiled = buildGraphFromWorkflow(workflow, context.chatModel, context.checkpointer)
      pushHistory(workflow)
      return compiled
    },
    async compileById(workflowId: string, context: WorkflowCompilerContext) {
      const workflow = await adapter.getById(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      const compiled = buildGraphFromWorkflow(workflow, context.chatModel, context.checkpointer)
      pushHistory(workflow)
      return compiled
    },
    getCompileHistory(workflowId?: string) {
      if (!workflowId) {
        return [...compileHistory]
      }

      return compileHistory.filter((record) => record.workflowId === workflowId)
    },
    getLatestVersion(workflowId: string) {
      for (let i = compileHistory.length - 1; i >= 0; i -= 1) {
        const record = compileHistory[i]
        if (record.workflowId === workflowId) {
          return record
        }
      }

      return null
    },
  };
}

// ── 노드 팩토리 매핑 ───────────────────────────────────

type NodeFactory = (chatModel: BaseChatModel) => (state: AgentState) => Promise<any>;

const NODE_FACTORIES: Record<string, NodeFactory | ((state: AgentState) => Promise<any>)> = {
  supervisor: createSupervisorNode,
  manager: createManagerNode,
  worker: createWorkerNode,
  profiler: createProfilerNode,
  supporter: createSupporterNode,
  human_gate: humanGateNode as any,
};

/**
 * Workflow JSON 정의를 컴파일된 StateGraph로 변환.
 */
export function buildGraphFromWorkflow(
  workflow: WorkflowDef,
  chatModel: BaseChatModel,
  checkpointer?: BaseCheckpointSaver,
) {
  validateWorkflowDef(workflow);
  const builder = new StateGraph(AgentStateAnnotation);

  // 노드 등록
  for (const nodeDef of workflow.nodes) {
    const factory = NODE_FACTORIES[nodeDef.type];
    if (!factory) {
      throw new Error(`Unknown node type: ${nodeDef.type}`);
    }

    const nodeFunction = typeof factory === 'function' && nodeDef.type !== 'human_gate'
      ? (factory as NodeFactory)(chatModel)
      : factory;

    const opts = nodeDef.ends ? { ends: nodeDef.ends } : undefined;
    builder.addNode(nodeDef.id, nodeFunction as any, opts as any);
  }

  // 엣지 등록
  for (const edge of workflow.edges) {
    const source = edge.source === '__start__' ? START : edge.source;
    const target = edge.target === '__end__' ? END : edge.target;

    if (!edge.condition) {
      builder.addEdge(source as any, target as any);
    }
    // 조건부 엣지는 노드의 Command 반환으로 처리되므로 별도 등록 불필요
  }

  // 시작 엣지
  if (!workflow.edges.some((e) => e.source === '__start__')) {
    builder.addEdge(START, workflow.entryNode as any);
  }

  return builder.compile({ checkpointer });
}

/**
 * 기본 5-노드 워크플로우 생성 (PLAN.md §14.3.1 기준).
 */
export function buildDefaultGraph(
  chatModel: BaseChatModel,
  checkpointer?: BaseCheckpointSaver,
) {
  const defaultWorkflow: WorkflowDef = {
    id: 'default',
    name: 'Default Multi-Agent',
    entryNode: 'supervisor',
    nodes: [
      { id: 'supervisor', type: 'supervisor', ends: ['manager', 'profiler', '__end__'] },
      { id: 'manager', type: 'manager', ends: ['worker', 'supervisor'] },
      { id: 'worker', type: 'worker', ends: ['supervisor', 'human_gate'] },
      { id: 'profiler', type: 'profiler', ends: ['__end__'] },
      { id: 'supporter', type: 'supporter', ends: ['supervisor'] },
      { id: 'human_gate', type: 'human_gate', ends: ['worker', '__end__'] },
    ],
    edges: [
      { source: '__start__', target: 'supervisor' },
    ],
  };

  return buildGraphFromWorkflow(defaultWorkflow, chatModel, checkpointer);
}
