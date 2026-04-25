/**
 * OTel Bridge Service (optional)
 *
 * - @opentelemetry/* 미설치 환경에서도 안전하게 동작(no-op)
 * - 설치된 경우 API 요청 카운터/지연시간 메트릭과 span 이벤트를 기록
 */

type OTelApiLike = {
  metrics?: {
    getMeter(name: string): {
      createCounter(name: string, options?: { description?: string }): { add(value: number, attrs?: Record<string, string>): void };
      createHistogram(name: string, options?: { description?: string; unit?: string }): { record(value: number, attrs?: Record<string, string>): void };
    };
  };
  trace?: {
    getTracer(name: string): {
      startActiveSpan<T>(name: string, fn: (span: { recordException(err: unknown): void; setAttribute(k: string, v: string | number | boolean): void; end(): void }) => T): T;
    };
  };
};

let _apiPromise: Promise<OTelApiLike | null> | null = null;

async function loadOtelApi(): Promise<OTelApiLike | null> {
  if (_apiPromise) return _apiPromise;

  _apiPromise = (async () => {
    try {
      const importer = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      const mod = await importer('@opentelemetry/api');
      return mod as OTelApiLike;
    } catch {
      return null;
    }
  })();

  return _apiPromise;
}

export async function withOtelSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const api = await loadOtelApi();
  const tracer = api?.trace?.getTracer('cmh-chatbot');
  if (!tracer) return fn();

  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setAttribute('cmh.status', 'ok');
      return result;
    } catch (error) {
      span.recordException(error);
      span.setAttribute('cmh.status', 'error');
      throw error;
    } finally {
      span.end();
    }
  });
}

export async function recordApiMetric(params: {
  endpoint: '/api/chat' | '/api/generate';
  status: number;
  durationMs: number;
}): Promise<void> {
  const api = await loadOtelApi();
  const meter = api?.metrics?.getMeter('cmh-chatbot');
  if (!meter) return;

  const counter = meter.createCounter('cmh_api_requests_total', {
    description: 'Total API requests handled by cmh-chatbot engine',
  });
  const duration = meter.createHistogram('cmh_api_request_duration_ms', {
    description: 'API request duration in milliseconds',
    unit: 'ms',
  });

  const attrs = {
    endpoint: params.endpoint,
    status: String(params.status),
  };

  counter.add(1, attrs);
  duration.record(params.durationMs, attrs);
}
