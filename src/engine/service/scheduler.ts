// ─── Scheduler Service ───────────────────────────────────
// Phase 7 — cronJob 기반 스케줄링.
// DAL에서 스케줄 로드 → node-cron으로 실행 → Orchestration Layer 호출.

import * as cron from 'node-cron';
import type { Logger } from '../core/logger.js';
import type { ModelFactory } from '../provider/model-factory.js';
import { createAISdkModel } from '../provider/ai-sdk-factory.js';
import { generateText } from 'ai';
import type { ScheduledTask as ScheduledTaskEntity } from '../data/entity/scheduled-task/scheduled-task.entity.js';

export type ScheduledTask = ScheduledTaskEntity;

export interface SchedulerTaskSource {
  listActiveTasks(): Promise<ScheduledTask[]>;
}

export interface SchedulerTaskExecutor {
  run(task: ScheduledTask): Promise<string>;
}

export interface SchedulerLifecycleHooks {
  onRegistered?: (taskId: string, cronExpression: string) => void | Promise<void>;
  onStarted?: (taskId: string) => void | Promise<void>;
  onCompleted?: (taskId: string, result: string) => void | Promise<void>;
  onFailed?: (taskId: string, error: unknown) => void | Promise<void>;
}

export interface SchedulerConfig {
  modelFactory: ModelFactory;
  logger: Logger;
  /** 기본 모델 ID (태스크에 modelId 미지정 시) */
  defaultModelId?: string;
  /** 태스크 source (DAL/파일/원격 등) */
  taskSource?: SchedulerTaskSource;
  /** 태스크 실행기 커스터마이징 (기본: AI SDK generateText) */
  taskExecutor?: SchedulerTaskExecutor;
  /** 결과 핸들러 */
  onResult?: (taskId: string, result: string) => Promise<void>;
  /** 라이프사이클 훅 */
  hooks?: SchedulerLifecycleHooks;
}

export interface SchedulerRunRecord {
  taskId: string;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'completed' | 'failed';
  durationMs?: number;
  error?: string;
}

/**
 * cron 기반 LLM 스케줄러.
 * 등록된 태스크를 cron 표현식에 따라 자동 실행.
 */
export class Scheduler {
  private readonly tasks = new Map<string, cron.ScheduledTask>();
  private readonly taskDefs = new Map<string, ScheduledTask>();
  private readonly runningTaskIds = new Set<string>();
  private readonly config: SchedulerConfig;
  private readonly runHistory: SchedulerRunRecord[] = [];
  private readonly maxHistory = 500;

  constructor(config: SchedulerConfig) {
    this.config = config;
  }

  /**
   * 태스크 등록 및 스케줄 시작.
   */
  register(task: ScheduledTask): void {
    // 기존 동일 ID 태스크 해제
    this.unregister(task.id);

    if (!task.isActive) return;
    if (!cron.validate(task.cronExpression)) {
      this.config.logger.warn({ taskId: task.id, cron: task.cronExpression }, 'scheduler:invalid-cron');
      return;
    }

    const scheduled = cron.schedule(task.cronExpression, () => {
      this.executeTask(task).catch((err) => {
        this.config.logger.error({ taskId: task.id, error: err }, 'scheduler:task-error');
      });
    });

    this.tasks.set(task.id, scheduled);
    this.taskDefs.set(task.id, task);
    this.config.logger.info({ taskId: task.id, cron: task.cronExpression }, 'scheduler:registered');
    void this.config.hooks?.onRegistered?.(task.id, task.cronExpression);
  }

  /**
   * 태스크 목록을 기준으로 레지스트리를 동기화.
   */
  sync(tasks: ScheduledTask[]): void {
    const nextIds = new Set(tasks.map((task) => task.id));

    for (const existingId of this.tasks.keys()) {
      if (!nextIds.has(existingId)) {
        this.unregister(existingId);
      }
    }

    for (const task of tasks) {
      this.register(task);
    }
  }

  /**
   * taskSource에서 활성 태스크를 읽어 등록.
   */
  async loadAndRegisterActiveTasks(): Promise<number> {
    if (!this.config.taskSource) {
      return 0;
    }

    const tasks = await this.config.taskSource.listActiveTasks();
    this.sync(tasks.filter((task) => task.isActive));
    return this.tasks.size;
  }

  /**
   * 태스크 등록 해제.
   */
  unregister(taskId: string): void {
    const existing = this.tasks.get(taskId);
    if (existing) {
      existing.stop();
      this.tasks.delete(taskId);
    }
    this.taskDefs.delete(taskId);
    this.runningTaskIds.delete(taskId);
  }

  /**
   * 모든 태스크 중지 (graceful shutdown).
   */
  stopAll(): void {
    for (const [id, task] of this.tasks) {
      task.stop();
      this.config.logger.info({ taskId: id }, 'scheduler:stopped');
    }
    this.tasks.clear();
    this.taskDefs.clear();
    this.runningTaskIds.clear();
  }

  /**
   * 등록된 태스크를 ID로 즉시 실행.
   */
  async runNow(taskId: string): Promise<string> {
    const task = this.taskDefs.get(taskId);
    if (!task) {
      throw new Error(`Task not registered: ${taskId}`);
    }
    return this.executeTask(task);
  }

  /**
   * 태스크 수동 실행 (테스트/디버그용).
   */
  async executeTask(task: ScheduledTask): Promise<string> {
    if (this.runningTaskIds.has(task.id)) {
      this.config.logger.warn({ taskId: task.id }, 'scheduler:skip-already-running');
      return '[skipped: already running]';
    }

    this.runningTaskIds.add(task.id);
    const startedAtMs = Date.now();
    const runRecord: SchedulerRunRecord = {
      taskId: task.id,
      startedAt: new Date(startedAtMs).toISOString(),
      status: 'running',
    }
    this.runHistory.push(runRecord)
    if (this.runHistory.length > this.maxHistory) {
      this.runHistory.splice(0, this.runHistory.length - this.maxHistory)
    }

    this.config.logger.info({ taskId: task.id }, 'scheduler:executing');
    await this.config.hooks?.onStarted?.(task.id);

    try {
      const executor = this.config.taskExecutor;
      if (executor) {
        const customResult = await executor.run(task);
        if (this.config.onResult) {
          await this.config.onResult(task.id, customResult);
        }
        await this.config.hooks?.onCompleted?.(task.id, customResult);
        return customResult;
      }

      const resolved = await this.config.modelFactory.resolve(
        task.modelId ?? this.config.defaultModelId,
      );

      if (!resolved) {
        throw new Error(`Model not found: ${task.modelId}`);
      }

      const model = createAISdkModel(resolved);

      const result = await generateText({
        model,
        system: task.systemPrompt,
        messages: [{ role: 'user', content: task.userPrompt }],
        maxOutputTokens: 4096,
      });

      this.config.logger.info(
        { taskId: task.id, tokens: result.usage?.totalTokens },
        'scheduler:complete',
      );

      // 결과 핸들러 호출
      if (this.config.onResult) {
        await this.config.onResult(task.id, result.text);
      }

      runRecord.status = 'completed'
      runRecord.endedAt = new Date().toISOString()
      runRecord.durationMs = Date.now() - startedAtMs

      await this.config.hooks?.onCompleted?.(task.id, result.text);
      return result.text;
    } catch (error) {
      runRecord.status = 'failed'
      runRecord.endedAt = new Date().toISOString()
      runRecord.durationMs = Date.now() - startedAtMs
      runRecord.error = error instanceof Error ? error.message : String(error)
      await this.config.hooks?.onFailed?.(task.id, error);
      throw error;
    } finally {
      this.runningTaskIds.delete(task.id);
    }
  }

  /**
   * 현재 등록된 태스크 수.
   */
  get size(): number {
    return this.tasks.size;
  }

  get runningSize(): number {
    return this.runningTaskIds.size;
  }

  listRegisteredTaskIds(): string[] {
    return [...this.taskDefs.keys()];
  }

  getTimelineData(options: { limit?: number } = {}): {
    tasks: Array<{ id: string; cronExpression: string; isActive: boolean; lastRunAt?: string }>
    runs: SchedulerRunRecord[]
    generatedAt: string
  } {
    const limit = Math.max(1, Math.min(options.limit ?? 200, 2_000))
    const tasks = [...this.taskDefs.values()].map((task) => ({
      id: task.id,
      cronExpression: task.cronExpression,
      isActive: task.isActive,
      lastRunAt: task.lastRunAt,
    }))

    return {
      tasks,
      runs: this.runHistory.slice(-limit),
      generatedAt: new Date().toISOString(),
    }
  }
}
