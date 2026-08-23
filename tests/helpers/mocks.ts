import { vi } from 'vitest';
import { mockJob as createJob, mockQueue as createQueue } from './queue-fixtures';

function wrap<T>(value: T) {
  return vi.fn().mockResolvedValue(value);
}

export function mockJob(id: string, overrides: Record<string, unknown> = {}) {
  return createJob(wrap, id, overrides);
}

export function mockQueue(name: string, overrides: Record<string, unknown> = {}) {
  return createQueue(wrap, name, overrides);
}
