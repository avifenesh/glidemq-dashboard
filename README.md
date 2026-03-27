# @glidemq/dashboard

[![npm](https://img.shields.io/npm/v/@glidemq/dashboard)](https://www.npmjs.com/package/@glidemq/dashboard)
[![license](https://img.shields.io/npm/l/@glidemq/dashboard)](https://github.com/avifenesh/glidemq-dashboard/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-glide--mq.dev-6366f1)](https://avifenesh.github.io/glide-mq.dev/)

Real-time web dashboard for [glide-mq](https://github.com/avifenesh/glide-mq) queues. Drop-in Express middleware -- no frontend build, no external dependencies.

> If glide-mq is useful to you, consider giving it a [star on GitHub](https://github.com/avifenesh/glide-mq). It helps others discover the project.

## Install

```bash
npm install @glidemq/dashboard glide-mq express
```

Requires **glide-mq 0.13+** and **Express 4 or 5**.

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

## Why @glidemq/dashboard

- Use this when you need visibility into queue health, job states, and worker activity without writing your own tooling.
- Use this when you want live updates pushed to the browser via SSE instead of polling a CLI or database.
- Use this when your ops team needs a point-and-click interface for retrying failed jobs, draining queues, or inspecting payloads.
- Use this when you need per-action authorization so developers can view queues but only admins can obliterate them.

## Features

- **Real-time event stream** -- SSE pushes completed, failed, active, waiting, stalled, progress, and removed events to the browser as they happen.
- **Job inspection** -- view payload, options, logs, progress, return value, and failure reason for any job.
- **Bulk actions** -- pause, resume, drain, retry all failed, and clean old jobs at the queue level.
- **Per-job actions** -- retry a failed job, remove a job, or promote a delayed job to waiting.
- **Workers panel** -- see connected workers and their current status.
- **Schedulers view** -- list repeatable job configurations attached to each queue.
- **Dead letter queue** -- dedicated panel for jobs that exhausted all retries.
- **Throughput metrics** -- completed and failed counts per queue.
- **Job search** -- filter by name, state, or data content.
- **Authorization** -- `readOnly` mode or fine-grained `authorize` callback with per-action control.
- **Dark theme, responsive layout** -- works on desktop and mobile out of the box.
- **Self-contained** -- the UI is a single bundled HTML file; no CDN calls, no build step, no frontend framework.

## AI-native features (glide-mq 0.13+)

glide-mq is now an AI-native orchestration queue. The dashboard surfaces these capabilities out of the box when paired with glide-mq 0.13+:

- **Token/cost tracking** -- jobs that call `reportUsage()` expose token counts and cost data in the job detail view. Flow-level aggregation via `getFlowUsage()` is visible on parent jobs.
- **Streaming status** -- workers using `job.stream()` and consumers reading via `readStream()` or SSE show live streaming state in the dashboard event stream.
- **Suspend/signal** -- jobs paused with `suspend()` for human-in-the-loop approval appear with a suspended badge. Signal events (`signal()`) are reflected in real time.
- **Budget monitoring** -- flows configured with budget caps display current spend vs. limit. Jobs rejected by budget middleware show the budget-exceeded reason.
- **Model failover** -- jobs processed through fallback chains show which model/provider handled them and how many fallback attempts occurred.
- **Rate limiting** -- workers configured with RPM + TPM dual-axis rate limiting surface throttle state in the workers panel.

## Configuration

```typescript
createDashboard(queues: Queue[], opts?: DashboardOptions): Router
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `queueEvents` | `QueueEvents[]` | `[]` | Instances to stream real-time SSE events from (one per queue) |
| `readOnly` | `boolean` | `false` | When `true`, all mutation routes return 403 |
| `authorize` | `(req, action) => boolean \| Promise<boolean>` | -- | Called before each mutation; return `false` to deny (403) |

## Authorization

Every mutation endpoint calls the `authorize` callback with the Express request and an action string. Return `false` to deny the request with a 403.

**Action strings:** `queue:pause`, `queue:resume`, `queue:obliterate`, `queue:drain`, `queue:retryAll`, `queue:clean`, `job:remove`, `job:retry`, `job:promote`

```typescript
app.use(
  "/dashboard",
  createDashboard(queues, {
    authorize: (req, action) => {
      const user = req.session?.user;
      if (!user) return false;
      if (action === "queue:obliterate") return user.role === "admin";
      return true;
    },
  })
);
```

## API endpoints

### Read

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Dashboard HTML UI |
| GET | `/api/queues` | All queues with job counts and pause state |
| GET | `/api/queues/:name/jobs` | Jobs by state (`?state=`, `?start=`, `?end=`) |
| GET | `/api/queues/:name/job/:id` | Single job with logs and current state |
| GET | `/api/queues/:name/workers` | Connected workers |
| GET | `/api/queues/:name/schedulers` | Repeatable job configurations |
| GET | `/api/queues/:name/dlq` | Dead letter queue jobs |
| GET | `/api/queues/:name/metrics` | Completed/failed throughput counts |
| GET | `/api/queues/:name/search` | Search jobs (`?name=`, `?state=`, `?data=`, `?limit=`) |

### Mutations (guarded by `readOnly` / `authorize`)

| Method | Path | Action | Description |
|--------|------|--------|-------------|
| POST | `/api/queues/:name/pause` | `queue:pause` | Pause a queue |
| POST | `/api/queues/:name/resume` | `queue:resume` | Resume a paused queue |
| POST | `/api/queues/:name/obliterate` | `queue:obliterate` | Destroy a queue and all its data |
| POST | `/api/queues/:name/drain` | `queue:drain` | Remove all waiting jobs |
| POST | `/api/queues/:name/retry-all` | `queue:retryAll` | Bulk retry failed jobs |
| POST | `/api/queues/:name/clean` | `queue:clean` | Clean old completed/failed jobs |
| DELETE | `/api/queues/:name/jobs/:id` | `job:remove` | Remove a single job |
| POST | `/api/queues/:name/jobs/:id/retry` | `job:retry` | Retry a failed job |
| POST | `/api/queues/:name/jobs/:id/promote` | `job:promote` | Promote a delayed job to waiting |

SSE stream: `GET /api/events` -- server-sent events for real-time updates (requires `queueEvents` option).

## Limitations

- Express only. There is no built-in adapter for Koa, Fastify, or Hono (see [@glidemq/hono](https://github.com/avifenesh/glidemq-hono) for Hono).
- This is middleware, not a standalone server. You mount it on an existing Express app.
- Requires `glide-mq` Queue instances. It does not connect to Valkey/Redis directly.

## Ecosystem

| Package | Description |
|---------|-------------|
| [glide-mq](https://github.com/avifenesh/glide-mq) | AI-native queue library -- orchestration, streaming, failover, budget caps |
| **@glidemq/dashboard** | Express web dashboard (you are here) |
| [@glidemq/nestjs](https://github.com/avifenesh/glidemq-nestjs) | NestJS module -- decorators, DI, lifecycle management |
| [@glidemq/hono](https://github.com/avifenesh/glidemq-hono) | Hono REST API + SSE middleware |
| [@glidemq/fastify](https://github.com/avifenesh/glidemq-fastify) | Fastify plugin for queue APIs |
| [examples](https://github.com/avifenesh/glidemq-examples) | Framework integrations and use-case demos |

> If glide-mq is useful to you, consider giving it a [star on GitHub](https://github.com/avifenesh/glide-mq). It helps the project grow.

## Contributing

Contributions, issues, and feature requests are welcome. Please open an issue on [GitHub](https://github.com/avifenesh/glidemq-dashboard/issues) before submitting large changes.

## License

[Apache-2.0](./LICENSE)
