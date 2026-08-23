import express from 'express';
import { createDashboard } from '../../src/index';

export function makeApp(queues: unknown[], opts?: Record<string, unknown>) {
  const app = express();
  app.use('/dash', createDashboard(queues as any, opts as any));
  return app;
}
