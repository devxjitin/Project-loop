# Project LOOP — Sprint Plan (MVP)

Assumes a small team: 1 frontend dev, 2 backend/AI devs, shared DevOps. 1 sprint = 1 week, ~4.5 productive days/person after standups/review. Complex features get 2 sprints instead of being crammed into 1. Total: **17 sprints (~4 months)** to a real, demoable MVP — not a prototype.

Each task has an estimate in dev-days and an acceptance criterion (how you know it's actually done, not "started"). Dependencies are called out so you don't sequence something before its prerequisite exists.

---

## Sprint 0 — Repo, Environments, CI

**Goal:** anyone can pull the repo and run the full stack locally in under 10 minutes.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Monorepo layout (`apps/web`, `apps/api`, `apps/ai-service`, `packages/shared-types`) | DevOps | 0.5d | `npm install` at root bootstraps all three apps |
| Docker-compose: Postgres, Redis, ai-service, web/API | DevOps | 1d | `docker-compose up` gives a working local stack |
| GitHub Actions: lint + typecheck + test on PR | DevOps | 1d | A failing test blocks merge |
| Preview/staging environment on Vercel + managed Postgres | DevOps | 1.5d | A manual deploy from `main` reaches a public preview URL |
| Next.js scaffold + Tailwind + shadcn/ui | Frontend | 0.5d | Blank app renders at localhost:3000 with a themed button |
| Next.js Route Handler scaffold + environment validation + health endpoint | Backend | 0.5d | `GET /api/health` returns 200 in every environment |

---

## Sprint 1 — Auth, Tenants, RBAC Skeleton

**Goal:** a user can sign up, land inside their own org, and role checks exist (even if only one role is used yet).

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| `tenants`, `users`, `memberships(role)` tables + migration | DB | 1d | Migration runs clean on empty DB and on staging |
| Row-level security policy scoping every table to `tenant_id` | DB | 1d | A query without a tenant context returns zero rows, not an error leak |
| Signup/login API (email+password, bcrypt) | Backend | 1.5d | Wrong password returns 401, not a stack trace |
| Google OAuth login | Backend | Deferred | Phase 2: implement only with production identity-provider configuration and an account-linking policy |
| JWT issuing + refresh, RBAC guard decorator (`@Roles('admin')`) | Backend | 1.5d | Hitting an admin-only route as Viewer returns 403 |
| Login/signup pages + auth context/provider | Frontend | 1.5d | Refreshing the page keeps the session; logout clears it |
| Empty app shell (nav, org switcher stub) | Frontend | 0.5d | Logged-in user sees their org name in the header |

*Dependency: Sprint 0 environments.*

---

## Sprint 2 — Ingestion: CSV Upload

**Goal:** a tenant can upload a CSV of past feedback and see it land as structured rows.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| `feedback_items` table (source, raw_text, author, external_id, timestamps) | DB | 0.5d | Nullable AI columns (sentiment, themes) added but unused this sprint |
| `ingestion_jobs` table (status, row_count, error_count, error_log) | DB | 0.5d | A failed row doesn't fail the whole job |
| CSV upload endpoint → S3 raw store | Backend | 1d | 50MB file uploads without timing out |
| CSV parsing worker (streams, doesn't load whole file in memory) | Backend | 1.5d | A 100k-row CSV parses without OOM |
| Ingestion queue (Redis + BullMQ) wired end to end | Backend | 1d | Retries a failed parse job 3x before marking it failed |
| Upload UI: file picker, column-mapping step, submit | Frontend | 1.5d | User maps "Comment" column to "feedback text" without engineering help |
| Ingestion status page (queued/processing/done/failed + row counts) | Frontend | 1d | User can tell a stuck job from a finished one without asking support |

*Dependency: Sprint 1 tenants/RLS (every row needs a `tenant_id`).*

---

## Sprint 3 — Ingestion: Live Connector #1 (Zendesk or Intercom)

**Goal:** new support tickets show up in LOOP automatically, no CSV needed.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| `connectors` table (type, tenant, encrypted credentials ref, status, last_synced_at) | DB | 0.5d | Credentials are never stored in plaintext in the DB |
| OAuth connect flow (redirect, callback, token storage in Secrets Manager) | Backend | 1.5d | Revoking access in Zendesk is detected on next sync (not silently retried forever) |
| Webhook receiver + signature verification | Backend | 1d | A forged webhook payload is rejected |
| Polling fallback job (for tenants who don't set up webhooks) | Backend | 1d | Missed webhook events are caught within 15 minutes by polling |
| Map external ticket schema → `feedback_items`, dedupe on `external_id` | Backend | 1d | Re-running a sync doesn't create duplicate rows |
| Connector settings page (connect, status, last sync, disconnect) | Frontend | 1d | A broken connector shows an error state, not a silent gap |

*Dependency: Sprint 2's ingestion pipeline (queue, `feedback_items`).*

---

## Sprint 4 — Ingestion: Live Connector #2 (Typeform / generic webhook)

**Goal:** survey responses flow in the same way tickets do — proves the connector pattern generalizes.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Generic inbound webhook endpoint + per-tenant secret | Backend | 1d | Two tenants' webhook URLs can't be swapped to inject data cross-tenant |
| Typeform payload → `feedback_items` mapping | Backend | 1d | A multi-question response maps to one feedback item per free-text answer |
| Webhook setup UI (URL + secret to paste into Typeform) | Frontend | 1d | A non-technical user can wire it up from the settings page alone |
| Connector error/retry dashboard entry reused from Sprint 3 | Frontend | 0.5d | Same status UI works for both connector types |

*Dependency: Sprint 3 connector pattern.*

---

## Sprint 5 — AI Sentiment Classification

**Goal:** every ingested item gets a sentiment label automatically, cheaply, at volume.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| FastAPI `ai-service` scaffold + auth between services | AI/Backend | 1d | Core API can call ai-service over the internal network only, not publicly |
| Gemini API sentiment classification prompt + parsing | AI | 1.5d | 20-item hand-labeled test set scores ≥85% agreement |
| Batching + caching (don't re-classify identical text) | AI | 1d | Duplicate feedback text isn't billed twice |
| Queue consumer: `feedback_items` → ai-service → write back sentiment | Backend | 1d | Sentiment appears within 1 minute of ingest for a single item |
| Rate-limit/backoff handling for Gemini API | Backend | 0.5d | A burst of 10k items doesn't crash the pipeline on 429s |
| Sentiment badge on feedback item rows (Frontend, stubbed since inbox doesn't exist yet — build the reusable component) | Frontend | 0.5d | Component renders positive/neutral/negative with color + icon |

*Dependency: Sprint 2 ingestion pipeline populating `feedback_items`.*

---

## Sprint 6 — AI Theme/Topic Tagging (Part 1: Infrastructure)

**Goal:** every feedback item has an embedding; infrastructure exists to search and cluster them.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Enable pgvector extension, `feedback_embeddings` table | DB | 0.5d | Vector column indexed with ivfflat/HNSW for reasonable query speed |
| Embedding generation job (Gemini Embedding) | AI | 1d | Every new feedback item gets an embedding within the same pipeline as sentiment |
| Backfill job for existing items | AI/Backend | 0.5d | Running it twice doesn't double-embed |
| Per-tenant namespace isolation in vector queries | Backend | 1d | A cross-tenant vector search test proves zero leakage |

*Dependency: Sprint 5 pipeline pattern (queue → AI service → write back).*

## Sprint 7 — AI Theme/Topic Tagging (Part 2: Clustering & Labels)

**Goal:** themes are surfaced automatically, not just embedded.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Clustering job (e.g. HDBSCAN over embeddings, per tenant) | AI | 2d | Re-clustering weekly doesn't fragment the same theme into different names each time |
| Gemini call to generate a human-readable label per cluster | AI | 1d | Labels read like "Slow onboarding flow", not "Cluster 3" |
| `themes`, `feedback_item_themes` tables + assignment write-back | DB/Backend | 1d | An item can belong to more than one theme |
| Theme tags on feedback items + theme filter chip (reusable component) | Frontend | 0.5d | Clicking a theme chip filters to just that theme (wired up fully in Sprint 8's inbox) |

*Dependency: Sprint 6 embeddings.*

---

## Sprint 8 — Centralized Feedback Inbox

**Goal:** a real, fast, filterable list view — the page users will live in daily.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Indexes on `tenant_id`, `sentiment`, `created_at`, theme join table | DB | 0.5d | A filtered query on 500k rows returns in <300ms |
| Paginated/filtered list endpoint (channel, sentiment, date range, theme, keyword) | Backend | 1.5d | Combining all filters at once still returns correct results |
| Full-text search (Postgres `tsvector` or equivalent) | Backend | 1d | Searching "refund" surfaces relevant items ranked by relevance, not insert order |
| Inbox UI: table/list, filter bar, search box, pagination | Frontend | 2d | A support lead can go from "show me negative billing feedback this week" to results in 3 clicks |
| Item detail view (full text, sentiment, themes, source link) | Frontend | 1d | Clicking a row shows the original ticket/survey source |

*Dependency: Sprints 5 (sentiment) and 7 (themes) populated data.*

---

## Sprint 9 — Analytics Dashboard (Part 1: Data)

**Goal:** the numbers behind the dashboard are correct and fast before any chart is built.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Aggregation tables/materialized views (sentiment by day, theme counts, channel counts) | DB | 1.5d | Refresh job completes in seconds even at 1M rows |
| Scheduled refresh job (cron, incremental where possible) | Backend | 1d | Dashboard data is never more than 15 minutes stale |
| Aggregation query endpoints (trend, top themes, volume by channel) | Backend | 1d | Each endpoint has a date-range parameter and tenant scoping |

## Sprint 10 — Analytics Dashboard (Part 2: UI)

**Goal:** leadership can look at one screen and understand sentiment direction.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Sentiment trend line chart (Recharts) | Frontend | 1d | Hovering a point shows date + exact counts |
| Top themes bar chart, ranked by volume with sentiment split | Frontend | 1d | Clicking a bar deep-links into the inbox filtered to that theme |
| Volume-by-channel chart | Frontend | 0.5d | Matches manual count from the inbox filters (sanity check) |
| Date range picker shared across all charts | Frontend | 1d | Changing the range updates all three charts together |

*Dependency: Sprint 9 aggregation layer; Sprint 8 inbox for deep-links.*

---

## Sprint 11 — RBAC & User Management (Full)

**Goal:** Admin/Editor/Viewer is enforced everywhere, not just at login.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Audit every existing endpoint for role enforcement | Backend | 1.5d | A Viewer hitting any write endpoint gets 403, verified by an automated test per endpoint |
| Invite flow (email invite, pending membership state) | Backend | 1d | An invited user who hasn't accepted can't log in yet |
| User management page (list members, change role, revoke) | Frontend | 1.5d | An Admin can demote another Admin (with a confirmation guard) |
| Role-based UI hiding (Viewers don't see "Connect" or "Invite" buttons) | Frontend | 1d | Verified by logging in as each role, not just Admin |

*Dependency: Sprint 1 RBAC skeleton, plus every feature built since needs auditing against it.*

---

## Sprint 12 — AI Q&A (Part 1: Retrieval)

**Goal:** the retrieval half of RAG works and is provably grounded before any chat UI exists.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Query embedding + vector similarity search endpoint | AI/Backend | 1d | Returns top-k feedback items relevant to a test question, manually verified |
| Relevance tuning (similarity threshold, recency weighting) | AI | 1d | Irrelevant items don't get pulled into context just because the corpus is small |
| `qa_sessions`, `qa_messages` tables | DB | 0.5d | A session's message history survives a page refresh |

## Sprint 13 — AI Q&A (Part 2: Answering & UI)

**Goal:** a user can ask a real question and trust the answer because they can check its sources.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Gemini call with retrieved context + citation formatting | AI | 1.5d | Every claim in the answer links to at least one source feedback item |
| "I don't know" handling when retrieval returns nothing relevant | AI | 0.5d | The model doesn't hallucinate an answer from no evidence |
| Q&A API endpoint (question in, answer + citations out) | Backend | 1d | Answers a question in under 5 seconds p95 |
| Chat UI (message list, input box, citation links back to inbox items) | Frontend | 2d | Clicking a citation opens that feedback item's detail view |

*Dependency: Sprint 6 embeddings, Sprint 12 retrieval, Sprint 8 inbox (for citation links).*

---

## Sprint 14 — Voice-of-Customer Reports (Part 1: Generation)

**Goal:** a correct report can be generated on demand before scheduling or sharing exists.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| `reports` table (period, status, content, generated_at) | DB | 0.5d | A report stores enough to re-render without re-querying raw data |
| Report generation job: pull period's aggregates + notable quotes | Backend | 1.5d | A manually triggered report for last week matches the dashboard's numbers for that week |
| Gemini summarization prompt (sentiment shift, top themes, quotes) | AI | 1.5d | Summary reads as prose a non-technical exec would understand, not a data dump |
| "Generate now" trigger (Admin-only) | Backend | 0.5d | Rate-limited so it can't be spammed |

## Sprint 15 — Voice-of-Customer Reports (Part 2: Scheduling, Sharing, Export)

**Goal:** reports run themselves and can leave the product.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Scheduled cron (weekly/monthly per tenant preference) | Backend | 1d | A tenant set to monthly doesn't get a report mid-month |
| `share_tokens` table + public read-only report view | DB/Backend | 1d | A shared link works without login but can't list other reports |
| Report viewer page | Frontend | 1d | Matches the styling/branding a non-logged-in recipient would trust |
| PDF export (headless Chrome render of the report page) | DevOps/Backend | 1.5d | Exported PDF matches the on-screen report, no broken chart images |

*Dependency: Sprint 14 generation, Sprint 9/10 aggregation and charts to reuse.*

---

## Sprint 16 — Hardening & Launch Readiness

**Goal:** the gap between "features exist" and "safe to put a real customer's data into it" is closed.

| Task | Discipline | Est | Acceptance criteria |
| --- | --- | --- | --- |
| Cross-tenant isolation test suite (every table, every endpoint) | Backend | 1.5d | Automated suite fails loudly if RLS or a query ever leaks across tenants |
| PII handling review before text is sent to any LLM (redaction or documented acceptance) | Backend/Legal | 1d | Written policy exists, not just "we assume it's fine" |
| Load test ingestion + dashboard queries at realistic volume | DevOps | 1d | p95 latency numbers documented, not guessed |
| Error monitoring wired everywhere (Sentry) + uptime alerting | DevOps | 0.5d | A production error pages someone within 5 minutes |
| Onboarding flow polish (empty states, first-connector prompt) | Frontend | 1d | A brand-new tenant with zero data isn't shown a blank, confusing screen |

*Dependency: everything above — this sprint exists specifically because features built fast accumulate exactly these gaps.*

---

## Why 17 sprints, not 11

The earlier draft gave one sprint to things that are actually two: theme clustering (embeddings infra is a separate problem from clustering + labeling), the dashboard (data correctness is separate from chart-building), AI Q&A (retrieval quality has to be verified before you build a chat UI on top of bad retrieval), and VoC reports (generation logic is separate from scheduling/sharing/export). It also had no dedicated hardening sprint, which is where multi-tenant data-leak bugs and PII/LLM policy gaps actually get caught before a real customer's data goes in. See [pm.md](pm.md) for the feature list and architecture this plan builds toward.
