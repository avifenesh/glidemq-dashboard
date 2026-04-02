# @glidemq/dashboard

[![npm](https://img.shields.io/npm/v/@glidemq/dashboard)](https://www.npmjs.com/package/@glidemq/dashboard)
[![license](https://img.shields.io/npm/l/@glidemq/dashboard)](https://github.com/avifenesh/glidemq-dashboard/blob/main/LICENSE)

Real-time dashboard for [glide-mq](https://github.com/avifenesh/glide-mq) - queue monitoring with AI observability. Drop-in Express middleware, no frontend build required.

## Why

- **Instant visibility** - see job counts, states, workers, and throughput without writing tooling
- **Live updates** - SSE pushes job events to the browser as they happen, no polling
- **Operational control** - pause, resume, drain, retry, and clean queues from a point-and-click UI

## Install

```bash
npm install @glidemq/dashboard glide-mq express
```

Requires **glide-mq >= 0.14.0** and **Express 4 or 5**.

## Quick start

```typescript
import express from "express";
import { Queue } from "glide-mq";
import { createDashboard } from "@glidemq/dashboard";

const app = express();
const queue = new Queue("payments", {
  connection: { addresses: [{ host: "localhost", port: 6379 }] },
});

app.use("/dashboard", createDashboard([queue]));
app.listen(3000);
// Open http://localhost:3000/dashboard
```

## AI-native features

Job detail views include AI fields when present: `usage` (record-based token/cost breakdown), `signals`, `budgetKey`, `fallbackIndex`, and `tpmTokens`.

Three dedicated endpoints expose AI orchestration state:

- **`GET /api/queues/:name/flows/:id/usage`** - Aggregated token/cost usage across all jobs in a flow. Returns the combined usage record.
- **`GET /api/queues/:name/flows/:id/budget`** - Budget state for a flow - current spend, per-category caps, remaining budget. Returns 404 if no budget is set.
- **`GET /api/usage/summary`** - Rolling usage totals across all mounted queues or a `?queues=` subset. Supports `start`, `end`, `window`, and `windowMs`.
- **`GET /api/queues/:name/jobs/:id/stream`** - SSE endpoint for streaming job output chunks. Supports `?lastId=` for resumption. Returns `event: chunk` messages with entry fields as data.

SSE event stream (`/api/events`) now includes `usage`, `suspended`, and `budget-exceeded` events alongside the standard queue lifecycle events.

## API

```typescript
createDashboard(queues: Queue[], opts?: DashboardOptions): Router
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queueEvents` | `QueueEvents[]` | `[]` | Instances for real-time SSE events |
| `readOnly` | `boolean` | `false` | Block all mutation routes with 403 |
| `authorize` | `(req, action) => boolean \| Promise<boolean>` | - | Per-action authorization callback |

**Action strings:** `queue:pause`, `queue:resume`, `queue:obliterate`, `queue:drain`, `queue:retryAll`, `queue:clean`, `job:remove`, `job:retry`, `job:promote`, `job:changePriority`, `job:changeDelay`, `scheduler:upsert`, `scheduler:remove`

```typescript
app.use(
  "/dashboard",
  createDashboard(queues, {
    authorize: (req, action) => {
      if (action === "queue:obliterate") return req.session?.user?.role === "admin";
      return true;
    },
  })
);
```

## Limitations

- Express only. No built-in adapter for Fastify, Hono, or Koa.
- Middleware, not a standalone server - mount it on an existing Express app.
- Requires glide-mq `Queue` instances. Does not connect to Valkey/Redis directly.

## Links

- [glide-mq](https://github.com/avifenesh/glide-mq) - core library
- [Full documentation](https://glidemq.dev/integrations/dashboard)
- [Issues](https://github.com/avifenesh/glidemq-dashboard/issues)
- [@glidemq/nestjs](https://github.com/avifenesh/glidemq-nestjs) | [@glidemq/hono](https://github.com/avifenesh/glidemq-hono) | [@glidemq/fastify](https://github.com/avifenesh/glidemq-fastify) | [@glidemq/hapi](https://github.com/avifenesh/glidemq-hapi)

## License

[Apache-2.0](./LICENSE)
