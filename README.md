# @glidemq/dashboard

[![npm](https://img.shields.io/npm/v/@glidemq/dashboard)](https://www.npmjs.com/package/@glidemq/dashboard)
[![CI](https://github.com/avifenesh/glidemq-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/avifenesh/glidemq-dashboard/actions)
[![license](https://img.shields.io/npm/l/@glidemq/dashboard)](https://github.com/avifenesh/glidemq-dashboard/blob/main/LICENSE)

Web dashboard for monitoring and managing [glide-mq](https://github.com/avifenesh/glide-mq) queues. Express middleware that serves a real-time UI and REST API.

Drop-in Express middleware - one function call gives you a full queue monitoring UI with real-time SSE updates, job inspection, bulk actions, and per-queue authorization. Zero frontend build step, zero external dependencies.

Part of the **glide-mq** ecosystem:

| Package | Purpose |
|---------|---------|
| [glide-mq](https://github.com/avifenesh/glide-mq) | Core queue library - producers, workers, schedulers, workflows |
| [@glidemq/hono](https://github.com/avifenesh/glidemq-hono) | Hono REST API + SSE middleware |
| **@glidemq/dashboard** | Express web UI for monitoring and managing queues (you are here) |
| [@glidemq/nestjs](https://github.com/avifenesh/glidemq-nestjs) | NestJS module - decorators, DI, lifecycle management |
| [examples](https://github.com/avifenesh/glidemq-examples) | Framework integrations and use-case examples |

## Installation

```bash
npm install @glidemq/dashboard
```

**Peer dependencies:** `glide-mq >= 0.8.0`, `express ^4 || ^5`

## Quick Start

```typescript
import express from 'express';
import { Queue } from 'glide-mq';
import { createDashboard } from '@glidemq/dashboard';

const app = express();
const queue = new Queue('payments', { connection: { addresses: [{ host: 'localhost', port: 6379 }] } });

app.use('/dashboard', createDashboard([queue]));
app.listen(3000);
// Open http://localhost:3000/dashboard
```

## Options

```typescript
createDashboard(queues: Queue[], opts?: DashboardOptions): Router
```

| Option | Type | Description |
|--------|------|-------------|
| `queueEvents` | `QueueEvents[]` | Instances to stream real-time SSE events from |
| `readOnly` | `boolean` | When `true`, all mutation routes return 403 |
| `authorize` | `(req, action) => boolean \| Promise<boolean>` | Custom auth callback for mutation routes |

### Authorization

Every mutation endpoint (POST/DELETE) calls the `authorize` callback with the Express request and an action string before executing. Return `false` to deny (403).

**Action strings:** `queue:pause`, `queue:resume`, `queue:obliterate`, `queue:drain`, `queue:retryAll`, `queue:clean`, `job:remove`, `job:retry`, `job:promote`, `job:changePriority`, `job:changeDelay`, `scheduler:upsert`, `scheduler:remove`

```typescript
// Read-only mode - no mutations allowed
app.use('/dashboard', createDashboard(queues, { readOnly: true }));

// Custom auth - check session cookie
app.use('/dashboard', createDashboard(queues, {
  authorize: (req, action) => {
    const user = req.session?.user;
    if (!user) return false;
    // Only admins can obliterate
    if (action === 'queue:obliterate') return user.role === 'admin';
    return true;
  },
}));
```

## API Endpoints

### Read

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Dashboard UI |
| GET | `/api/queues` | All queues with job counts |
| GET | `/api/queues/:name/jobs` | Jobs by state (query: `state`, `start`, `end`, `excludeData`) |
| GET | `/api/queues/:name/job/:id` | Single job with logs, state, and extended fields |
| GET | `/api/queues/:name/workers` | Connected workers |
| GET | `/api/queues/:name/schedulers` | Job schedulers (repeatable jobs) |
| GET | `/api/queues/:name/dlq` | Dead letter queue jobs |
| GET | `/api/queues/:name/metrics` | Time-series metrics with per-minute completed/failed data |
| GET | `/api/queues/:name/search` | Search jobs (query: `name`, `state`, `data`, `limit`) |
| GET | `/api/events` | SSE event stream (real-time) |

#### Jobs endpoint query parameters

| Param | Type | Description |
|-------|------|-------------|
| `state` | string | Filter by job state (`waiting`, `active`, `delayed`, `completed`, `failed`) |
| `start` | number | Pagination start index (default `0`) |
| `end` | number | Pagination end index (default `20`, max `start + 200`) |
| `excludeData` | `"true"` | When set, omits `data` field from returned jobs for faster responses |

#### Metrics response format

The metrics endpoint returns time-series data with per-minute buckets:

```json
{
  "completed": {
    "count": 1234,
    "data": [
      { "timestamp": 1709800800000, "count": 42, "avgDuration": 150 }
    ]
  },
  "failed": {
    "count": 5,
    "data": [
      { "timestamp": 1709800800000, "count": 1, "avgDuration": 3200 }
    ]
  }
}
```

#### Job serialization

Job responses include standard fields plus extended fields when present:

| Field | Description |
|-------|-------------|
| `parentId` | Parent job ID (if job is a child in a flow) |
| `parentQueue` | Parent job's queue name |
| `orderingKey` | Ordering key for FIFO grouping |
| `cost` | Job cost for rate-limited queues |
| `schedulerName` | Name of the scheduler that created this job |

### Mutations (guarded by `readOnly` / `authorize`)

| Method | Path | Body | Action | Description |
|--------|------|------|--------|-------------|
| POST | `/api/queues/:name/pause` | - | `queue:pause` | Pause queue |
| POST | `/api/queues/:name/resume` | - | `queue:resume` | Resume queue |
| POST | `/api/queues/:name/obliterate` | - | `queue:obliterate` | Destroy queue and all data |
| POST | `/api/queues/:name/drain` | `{ delayed?: boolean }` | `queue:drain` | Remove all waiting jobs |
| POST | `/api/queues/:name/retry-all` | `{ count?: number }` | `queue:retryAll` | Bulk retry failed jobs |
| POST | `/api/queues/:name/clean` | `{ grace, limit, type }` | `queue:clean` | Clean old completed/failed jobs |
| DELETE | `/api/queues/:name/jobs/:id` | - | `job:remove` | Remove a job |
| POST | `/api/queues/:name/jobs/:id/retry` | - | `job:retry` | Retry a failed job |
| POST | `/api/queues/:name/jobs/:id/promote` | - | `job:promote` | Promote a delayed job |
| POST | `/api/queues/:name/jobs/:id/priority` | `{ priority: number }` | `job:changePriority` | Change job priority |
| POST | `/api/queues/:name/jobs/:id/delay` | `{ delay: number }` | `job:changeDelay` | Change job delay (ms) |
| POST | `/api/queues/:name/schedulers` | `{ name, schedule, template? }` | `scheduler:upsert` | Create or update a scheduler |
| DELETE | `/api/queues/:name/schedulers/:schedulerName` | - | `scheduler:remove` | Remove a scheduler |

#### Scheduler upsert body

```json
{
  "name": "my-scheduler",
  "schedule": {
    "pattern": "*/5 * * * *",
    "every": 60000,
    "repeatAfterComplete": 30000,
    "tz": "America/New_York",
    "startDate": "2025-01-01",
    "endDate": "2025-12-31",
    "limit": 1000
  },
  "template": {
    "name": "my-job",
    "data": { "key": "value" },
    "opts": { "priority": 5 }
  }
}
```

Provide exactly one of `pattern` (cron), `every` (interval ms), or `repeatAfterComplete` (ms) in the schedule object.

## Features

- Queue overview with aggregated job counts
- Job inspector with data, logs, and details tabs
- **Time-series metrics** with per-minute bar charts for completed and failed jobs
- Real-time event stream via SSE
- Workers monitoring panel
- **Scheduler management** - view, create, and delete job schedulers from the UI
- Dead letter queue panel
- Job search by name, state, and data
- Bulk actions: drain, retry all, clean
- Per-job actions: retry, remove, promote, **change priority**, **change delay**
- **Enhanced job details** - parent links, ordering key, cost, LIFO badge, custom job ID
- **excludeData support** for lightweight job listing
- Authorization with per-action granularity
- Dark theme, responsive layout
- Express 4 and 5 compatible
- Self-contained - no frontend build, no external CDN

## License

Apache-2.0
