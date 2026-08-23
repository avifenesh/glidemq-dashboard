export type Wrap = <T>(value: T) => (...args: unknown[]) => unknown;

export function defaultUsageSummary(queueName: string) {
  const usage = {
    jobCount: 1,
    tokens: { input: 100 },
    totalTokens: 100,
    costs: { total: 0.01 },
    totalCost: 0.01,
    costUnit: 'usd',
    models: { 'gpt-5.4': 1 },
  };
  return {
    startTime: 0,
    endTime: 60000,
    bucketSizeMs: 60000,
    queues: [queueName],
    ...usage,
    perQueue: { [queueName]: usage },
  };
}

export function mockJob(wrap: Wrap, id: string, overrides: Record<string, unknown> = {}) {
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
    remove: wrap(undefined),
    retry: wrap(undefined),
    promote: wrap(undefined),
    getState: wrap('waiting'),
    ...overrides,
  };
}

export function mockQueue(wrap: Wrap, name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    getJobCounts: wrap({ waiting: 5, active: 2, delayed: 1, completed: 10, failed: 3 }),
    isPaused: wrap(false),
    getJobs: wrap([]),
    getJob: wrap(null),
    getJobLogs: wrap({ logs: [], count: 0 }),
    pause: wrap(undefined),
    resume: wrap(undefined),
    obliterate: wrap(undefined),
    drain: wrap(undefined),
    retryJobs: wrap(5),
    clean: wrap(['1', '2']),
    getWorkers: wrap([]),
    getRepeatableJobs: wrap([]),
    getDeadLetterJobs: wrap([]),
    getMetrics: wrap({ count: 42, data: [], meta: { resolution: 'minute' } }),
    getFlowUsage: wrap({ tokens: {}, totalTokens: 0, costs: {}, totalCost: 0, jobCount: 0, models: {} }),
    getFlowBudget: wrap(null),
    getUsageSummary: wrap(defaultUsageSummary(name)),
    readStream: wrap([]),
    searchJobs: wrap([]),
    ...overrides,
  };
}
