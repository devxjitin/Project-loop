# Project LOOP

## Run locally

Prerequisites: Docker Desktop (or Docker Engine with Compose) and Node.js 20+.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Open `http://localhost:3000`. Health checks are available at:

- Vercel-compatible API: `http://localhost:3000/api/health`
- AI service: private to the Compose network (`docker compose exec ai-service wget -qO- http://localhost:8000/health`)

For host-based development, run `npm install` at the repository root, then `npm run dev`. Database migrations run with `npm run migrate`. The AI service can be run separately with `pip install -r apps/ai-service/requirements.txt` and `uvicorn app.main:app --app-dir apps/ai-service --reload`.

## Zendesk connector

Sprint 3 adds a Zendesk OAuth connector. Set `ZENDESK_CLIENT_ID`, `ZENDESK_CLIENT_SECRET`, `ZENDESK_OAUTH_CALLBACK_URL`, `CONNECTOR_STATE_SECRET`, `CONNECTOR_ENCRYPTION_KEY`, and `CRON_SECRET` from `.env.example`. Zendesk access tokens are encrypted with AES-256-GCM before being stored in the connector row in Postgres.

Schedule `POST /api/internal/connectors/poll` every 15 minutes with `Authorization: Bearer <CRON_SECRET>`. Configure `DATABASE_WORKER_URL` with a worker-only Postgres role that has `BYPASSRLS`; it is deliberately used only by this scheduled endpoint. Admins can copy the signed webhook URL and secret from the connector settings page after connecting Zendesk.

## Typeform and generic webhooks

Create a Typeform or generic webhook connector from the settings page. Each connector gets a tenant-bound URL and an independent signing secret. Configure Typeform with that URL and secret; LOOP verifies its `Typeform-Signature` (`sha256=<base64 HMAC of raw body>`) and writes one feedback item for each text, email, or URL response in a submission. Replays are idempotent using the Typeform response token and field ID.

Generic producers send `POST` requests to the issued URL with `X-Loop-Signature: sha256=<base64 HMAC of raw body>` and JSON such as `{"text":"The export is too slow","externalId":"evt-123","author":"Sam","occurredAt":"2026-09-17T10:00:00Z"}`. `externalId` is recommended for explicit idempotency. The URL's tenant and connector IDs are both verified under RLS before payload processing.

## Sentiment classification

The `sentiment-worker` scans newly ingested feedback every 30 seconds, batches up to 100 unique messages, and sends them to the Compose-private AI service. Set `GEMINI_API_KEY` and the shared `AI_SERVICE_TOKEN`; the worker retries failures, including provider rate limits, up to five times with exponential backoff. Classifications are cached by normalized SHA-256 text hash before any Gemini request.

## Embeddings

Sprint 6 uses Gemini Embedding (`gemini-embedding-001`) at 1536 dimensions through the same private AI service and stores the vectors in pgvector with an HNSW cosine index. `embedding-worker` scans for new or changed feedback every 30 seconds; `POST /api/internal/embeddings/backfill` queues an immediate scan. Both paths are idempotent because each feedback item has exactly one upserted embedding. Set `GEMINI_API_KEY` server-side only. The vector search helper applies both the transaction RLS context and explicit `tenant_id` predicates before returning a match.

## Themes

`theme-worker` reclusters each tenant's embedded feedback weekly using HDBSCAN, labels the clusters through Gemini, and writes reusable `themes` and many-to-many `feedback_item_themes` records. It reuses a prior theme when its centroid cosine similarity is at least 0.90, avoiding renaming or fragmenting stable themes across runs. An operator can trigger an immediate job using `POST /api/internal/themes/recluster` with the existing scheduler bearer token.

## Analytics

`analytics-worker` refreshes the daily sentiment trend, theme counts, and channel-volume materialized views every 15 minutes. The tenant-scoped APIs are available at `/api/analytics/trend?from=YYYY-MM-DD&to=YYYY-MM-DD`, `/api/analytics/themes`, and `/api/analytics/channels` for the dashboard UI.

## Q&A retrieval

`POST /api/qa/retrieve` accepts a question and optional `sessionId`, embeds it with Gemini's retrieval-query task, persists the user message, and returns only tenant-scoped feedback whose cosine similarity is at least `0.62`. Results include a small recency boost to favor current evidence without allowing an irrelevant recent item into context. The response's `grounded` field is false when no qualifying evidence exists. Use `GET /api/qa/sessions/:sessionId` to restore the persisted message history.

## Grounded Q&A

`POST /api/qa/answer` retrieves tenant-scoped feedback, sends only qualifying sources to Gemini, and saves both the question and answer to the Q&A session. Gemini must attach a valid source marker to every factual claim; LOOP rejects an answer whose citations do not reference the retrieved evidence. When retrieval returns no evidence, the endpoint returns “I don't know based on the available feedback.” rather than generating an unsupported answer. The Ask LOOP panel renders those citations as links to the matching inbox detail.

## Voice-of-Customer reports

Admins can generate an on-demand report with `POST /api/reports` and an inclusive `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }` body. LOOP snapshots the same sentiment and theme aggregates used by the dashboard, adds period-specific customer quotes, stores that immutable payload with the generated prose, and rate-limits each tenant to one generation every five minutes. `GET /api/reports` restores prior reports without re-querying the raw feedback corpus.

Sprint 15 adds `PUT /api/report-schedule` for an Admin's weekly or monthly preference. Schedule `POST /api/internal/reports/schedule` once daily using `Authorization: Bearer <CRON_SECRET>`; weekly reports run only on Mondays and monthly reports only on the first day of a month. Admins create an expiring public link with `POST /api/reports/:reportId/share`; `GET /api/public/reports/:token` exposes only that one ready report. Authenticated workspace members can download the same report from `GET /api/reports/:reportId/pdf`; set `CHROME_PATH` on the deployment host to its headless Chrome binary.

## Staging

The deployment workflow is intentionally a manual GitHub Actions dispatch. Configure the Vercel repository secrets named in `.github/workflows/deploy-staging.yml`, then add a managed Postgres integration and its `DATABASE_URL` to Vercel.

## Launch readiness

The automated tenant-boundary regression checks run with `npm run test --workspace=@loop/web`. See [PII-LLM-POLICY.md](docs/PII-LLM-POLICY.md) for the documented pre-LLM redaction and residual-risk policy, and [OPERATIONS.md](docs/OPERATIONS.md) for production monitoring, uptime, and load-test requirements.
