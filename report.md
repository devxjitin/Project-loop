# Project LOOP - Product and Technical Report

## 1. What this project is

Project LOOP is a multi-tenant Voice-of-Customer platform for B2B SaaS teams. It brings customer feedback from support and form channels into one workspace, classifies sentiment, groups recurring themes, exposes analytics, answers evidence-backed questions, and produces executive-ready reports.

The intended users are product managers, support leads, CX leaders, and organization administrators. Its core purpose is to turn scattered feedback into a reliable signal for prioritization and customer-experience decisions.

## 2. Main capabilities

| Area | What it does |
| --- | --- |
| Feedback ingestion | Imports tenant-scoped CSV feedback uploaded by workspace admins. |
| Feedback inbox | Searches and filters feedback by text, channel, date, sentiment, and theme. |
| AI enrichment | Classifies sentiment, creates embeddings, and clusters recurring product themes. |
| Analytics | Shows sentiment trends, top themes, and volume by feedback channel. |
| Access control | Supports Admin, Editor, and Viewer memberships with tenant isolation. |
| Ask LOOP | Answers questions from retrieved feedback only, with source links. |
| VoC reports | Generates, stores, schedules, shares, and exports executive summaries. |

## 3. How it works

```text
Feedback source
  -> CSV ingestion
  -> PostgreSQL feedback_items (tenant-scoped)
  -> workers: sentiment + embedding + theme clustering
  -> analytics materialized views and feedback inbox
  -> Q&A retrieval or VoC report generation
  -> web dashboard, cited answer, or report
```

### Data ingestion

- CSV uploads create an ingestion job and use object storage for the file.
- External connector credentials and inbound webhook endpoints are intentionally not part of the CSV-only launch.
- Ingestion is idempotent where sources provide an external identifier.

### AI pipeline

Workers run against the feedback corpus:

1. The sentiment worker labels feedback as positive, neutral, or negative.
2. The embedding worker creates 1,536-dimensional Gemini embeddings and stores them with pgvector.
3. The theme worker clusters similar embeddings and creates reusable named themes.
4. The analytics worker refreshes daily sentiment, theme, and channel aggregates.

Before text is sent to an LLM, LOOP applies the built-in redaction layer for email addresses, phone-like numbers, payment-card-like values, and common API-key patterns. See [docs/PII-LLM-POLICY.md](docs/PII-LLM-POLICY.md) for the full policy and residual-risk statement.

### Q&A and citations

When a user asks a question, LOOP embeds the question with Gemini's retrieval-query mode. It searches only feedback belonging to the current tenant and enforces a similarity threshold of `0.62`, with a small recency preference. If no source qualifies, the system replies that it does not know based on available feedback. Otherwise, Gemini receives only the retrieved, redacted evidence and must return source markers. Invalid citations are rejected before the answer is returned or saved.

### Reports

A report first stores a snapshot of the requested period's dashboard aggregates, top themes, and notable feedback quotes. Gemini turns that snapshot into executive prose. Because the snapshot is stored with the report, historical reports can be displayed again without re-querying or changing the original period's data.

## 4. Access model

| Role | Permissions |
| --- | --- |
| Admin | Manages members, roles, invitations, CSV uploads, report generation, report schedules, and sharing. |
| Editor | Reads the workspace and can view feedback and insights; CSV uploads are admin-only. |
| Viewer | Reads feedback, analytics, Q&A, and reports; cannot use write endpoints or see management controls. |

Every tenant-owned table uses PostgreSQL Row-Level Security. Application queries bind the authenticated tenant ID into the transaction, and API queries also use explicit tenant predicates. Revoking or changing a member role is checked against the database on protected write paths so that changes take effect immediately.

## 5. How to run it locally

### Requirements

- Docker Desktop or Docker Engine with Compose
- Node.js 20 or later
- Python 3.11 only if running the AI service outside Docker
- A Gemini API key for live AI classification, embeddings, Q&A, and report generation

### Full Compose stack

```powershell
Copy-Item .env.example .env
# Fill JWT_SECRET, AI_SERVICE_TOKEN, and GEMINI_API_KEY in .env.
docker compose up --build
```

Services are exposed at:

- Web app: `http://localhost:3000`
- Web health check: `http://localhost:3000/api/health`
- AI service health check: `http://localhost:8000/health`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Apply migrations after PostgreSQL is ready:

```powershell
npm install
npm run migrate
```

### Host-based development

Start only PostgreSQL and Redis in Docker, then run the services on the host:

```powershell
docker compose up -d postgres redis
npm install
npm run migrate
npm run dev --workspace=@loop/web

pip install -r apps/ai-service/requirements.txt
uvicorn app.main:app --app-dir apps/ai-service --reload --port 8000
```

For host mode, configure `apps/web/.env.local` with a localhost `DATABASE_URL`, `REDIS_URL`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN`, and a JWT secret. If port 3000 is occupied, Next.js selects another available port and prints it in the console.

## 6. How to use the product

### First administrator

1. Call `POST /api/auth/signup` with an organization name, email, display name, and password of at least 12 characters.
2. Save the returned access token.
3. Paste the token into the Workspace session field in the web app.

### Bring in feedback

1. As a workspace Admin, open **Upload CSV**.
2. Choose a CSV export, give the dataset a clear name, and select the column containing customer feedback.
3. Upload the file and review its status in **Recent uploads**.
4. Wait for the background workers to enrich new feedback, or invoke the configured internal backfill endpoint as an operator.

### Explore feedback and analytics

- Open **Feedback inbox** to search by text, channel, date, sentiment, or theme.
- Open **Analytics dashboard** to compare period trends, top themes, and feedback volume by channel.
- Click theme controls or Q&A citations to navigate to the underlying feedback detail.

### Ask evidence-backed questions

1. Open **Ask LOOP**.
2. Ask a question such as “What are customers saying about onboarding?”
3. Review the returned answer and citation chips.
4. Click a citation to inspect the specific feedback item that supports the answer.

### Create and deliver reports

1. An Admin opens **Voice-of-Customer reports**.
2. Select a date range and choose **Generate now**.
3. Review the stored report and, through the API, optionally create an expiring share URL or download a PDF.
4. Set a weekly or monthly report preference with `PUT /api/report-schedule`.
5. Configure an external scheduler to call `POST /api/internal/reports/schedule` daily with the `CRON_SECRET` bearer token.

## 7. Important APIs

All private APIs require `Authorization: Bearer <access-token>` unless marked otherwise.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/signup` | Creates an organization, user, Admin membership, and tokens. |
| `POST /api/auth/login` | Returns tokens for an active membership. |
| `GET, POST /api/members` | Admin member list and invitation creation. |
| `PATCH, DELETE /api/members/:membershipId` | Admin role change and revocation. |
| `GET /api/feedback` | Paginated, tenant-scoped feedback search. |
| `GET /api/analytics/*` | Trend, theme, and channel aggregates. |
| `POST /api/qa/retrieve` | Retrieves relevant feedback without generating an answer. |
| `POST /api/qa/answer` | Returns a grounded answer with citations. |
| `POST, GET /api/reports` | Generates and lists reports. |
| `POST /api/reports/:reportId/share` | Creates a 30-day public report link. |
| `GET /api/reports/:reportId/pdf` | Downloads a ready report as a headless-Chrome PDF. |
| `POST /api/internal/reports/schedule` | Daily protected scheduler trigger. |
| `GET /api/health` | Application health check. |

## 8. Security and operations checklist

- Use long, unique production values for `JWT_SECRET`, `AI_SERVICE_TOKEN`, `CRON_SECRET`, and `CONNECTOR_STATE_SECRET`.
- Never expose Gemini, database, or Vercel Blob credentials to the browser.
- Use a separate worker database role with `BYPASSRLS` only for trusted scheduled workers.
- Set `SENTRY_DSN`, configure an external one-minute uptime check for `/api/health`, and route alerts to an on-call rotation.
- Run `npm run test --workspace=@loop/web` before release; it includes RLS and tenant-context regression checks.
- Use the staging load-test plan and latency targets in [docs/OPERATIONS.md](docs/OPERATIONS.md).
- Configure `CHROME_PATH` on a deployment host if PDF export is enabled.

## 9. Current limitations and production follow-ups

- A real production rollout needs a configured Gemini API key and approved provider data-processing terms.
- PII redaction is defense in depth, not formal anonymization; Legal approval and provider retention settings are required before production data is enabled.
- Sentry and external uptime-monitor account configuration must be completed in the deployment environment.
- The initial member invitation API returns a one-time invite URL/token; production email delivery should be connected to an approved email provider.
- The database migration command must be part of the deployment release process.

## 10. Repository map

```text
apps/web/                 Next.js application, API routes, UI, and workers
apps/ai-service/          FastAPI service for Gemini and HDBSCAN operations
packages/database/        PostgreSQL migrations and migration command
packages/shared-types/    Shared TypeScript types
infra/                    Infrastructure notes
docs/                     PII policy and operational runbook
docker-compose.yml        Local database, Redis, web, AI, and worker services
```
