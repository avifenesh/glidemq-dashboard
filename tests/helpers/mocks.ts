import { vi } from 'vitest';

export function mockJob(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'test-job',
    data: { key: 'value' },
    opts: {},
    progress: 0,
    attemptsMade: 0,
    failedReason: undefined,
    returnvalue: undefined,
    timestamp: Date.now(),
    processedOn: undefined,
    finishedOn: undefined,
    remove: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    promote: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue('waiting'),
    ...overrides,
  };
}

export function mockQueue(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 5, active: 2, delayed: 1, completed: 10, failed: 3 }),
    isPaused: vi.fn().mockResolvedValue(false),
    getJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn().mockResolvedValue(null),
    getJobLogs: vi.fn().mockResolvedValue({ logs: [], count: 0 }),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    obliterate: vi.fn().mockResolvedValue(undefined),
    drain: vi.fn().mockResolvedValue(undefined),
    retryJobs: vi.fn().mockResolvedValue(5),
    clean: vi.fn().mockResolvedValue(['1', '2']),
    getWorkers: vi.fn().mockResolvedValue([]),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
    getDeadLetterJobs: vi.fn().mockResolvedValue([]),
    getMetrics: vi.fn().mockResolvedValue({ count: 42, data: [], meta: { resolution: 'minute' } }),
    getFlowUsage: vi.fn().mockResolvedValue({ tokens: {}, totalTokens: 0, costs: {}, totalCost: 0, jobCount: 0, models: {} }),
    getFlowBudget: vi.fn().mockResolvedValue(null),
    getUsageSummary: vi.fn().mockResolvedValue({
      startTime: 0,
      endTime: 60000,
      bucketSizeMs: 60000,
      queues: [name],
      jobCount: 1,
      tokens: { input: 100 },
      totalTokens: 100,
      costs: { total: 0.01 },
      totalCost: 0.01,
      costUnit: 'usd',
      models: { 'gpt-5.4': 1 },
      perQueue: {
        [name]: {
          jobCount: 1,
          tokens: { input: 100 },
          totalTokens: 100,
          costs: { total: 0.01 },
          totalCost: 0.01,
          costUnit: 'usd',
          models: { 'gpt-5.4': 1 },
        },
      },
    }),
    readStream: vi.fn().mockResolvedValue([]),
    searchJobs: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}
