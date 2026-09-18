# Project LOOP — Full Engineering Review

> **Scope update (2026-09-18):** This review predates the CSV-only product decision. Zendesk, Typeform, generic webhooks, connector credentials, polling, and their UI/API surfaces have been removed. References to those capabilities below are historical review context, not current product requirements.

*Reviewed 2026-09-18. Scope: `apps/web`, `apps/ai-service`, `packages/database`, `infra`, `docs`, CI. Repo has zero git commits at time of review (first, uncommitted build).*

## Summary

**6 critical · 9 high · 11 medium · 10 low/hygiene** findings.

Project LOOP is a multi-tenant B2B SaaS platform for customer-feedback intelligence. It pulls feedback in from CSV uploads, a Zendesk OAuth connector, and Typeform/generic signed webhooks; runs it through a Gemini-based pipeline for sentiment classification, embeddings, and topic clustering; and surfaces the result through a feedback inbox, an analytics dashboard, a citation-grounded "Ask LOOP" Q&A chat, and generated Voice-of-Customer reports. Target users are product managers, support leads, CX executives, and org admins — mostly non-technical business users.

The stack is a Next.js app (UI + API routes) backed by Postgres with row-level security for tenant isolation, Redis-backed background workers, and a separate FastAPI microservice for AI calls. Essentially every feature from the 17-sprint plan (`sprint.md`) exists in some form. The gap is between *exists* and *works correctly / is safe / is usable* — three tenant-isolation bugs undercut the RLS guarantee, an account-takeover path exists in the invite flow, and the two pages a new user sees first (the dashboard and Insights) are non-functional because they were left wired to a developer debug control instead of the real session.

**Verdict: pre-alpha, not a polish pass.**

| Area | Read |
| --- | --- |
| Security & tenant isolation | Mostly well-designed (RLS on every table, correct HMAC/AES usage, signed OAuth state) but three specific bugs each defeat isolation for a slice of data, plus one account-takeover bug in the invite flow. |
| Frontend / UX | Functional-but-developer-grade. Two of the app's most important pages don't work for a signed-in user at all. No design system beyond one Button component. No mobile navigation. |
| Data model | Complete relative to the documented feature set — no missing tables — but several constraints don't do what their names/comments claim. |
| Ops / CI / hygiene | CI checks the Node app only; the Python AI service has zero CI coverage. Deploy pipeline only covers the Vercel web app. Dead scaffold directories left in the tree. |

---

## Critical — fix before any real tenant's data goes near this

### 1. Invite acceptance mints a valid session for an existing user without checking their password
**`apps/web/app/api/invitations/accept/route.ts:17–25`, `apps/web/app/api/members/route.ts:4`**

When an Admin invites an email that already has an account, `accept` looks up that user's real `id`, attaches a new membership, and returns a valid access/refresh token pair for *that user* — the supplied invite password is never checked against the account's real `password_hash`. `POST /api/members` also returns the raw `inviteToken` straight back to the inviting Admin instead of only emailing it.

**Concrete exploit:** any Admin invites `victim@company.com`, reads the invite token back from the API response, calls `accept` with any password of their choosing, and receives a JWT with `sub` = the victim's real account — without knowing the victim's password or the victim doing anything. That's account impersonation, plus the ability to silently attach an unwilling real user to your tenant.

**Fix:** on accept for a pre-existing email, require re-authentication as that account (real password, or "log in, then accept while authenticated") — never mint tokens for an existing user id from an unauthenticated invite-acceptance call.

### 2. `memberships` RLS policy leaks a user's role/tenant across every org they belong to
**`packages/database/migrations/002_membership_auth_lookup.sql:3–8`**

```sql
USING (
  tenant_id = current_setting('app.current_tenant_id')::uuid
  OR user_id = current_setting('app.current_user_id')::uuid   -- the leak
)
```

The `OR user_id = ...` branch means once a session has the current user set, a query against `memberships` returns that user's rows in *every* tenant they belong to, not just the active one — leaking tenant IDs and roles across organizations. Writes are correctly scoped (`WITH CHECK` has no such `OR`); only reads leak. The tenant-isolation test suite doesn't catch this because it only checks that a policy named `*_tenant_isolation` exists, not what it does.

**Fix:** drop the `OR` branch, or split it into a separate, narrower policy for "list my own memberships" that doesn't also broaden the tenant-scoped read policy.

### 3. Analytics materialized views carry every tenant's data with no RLS at all
**`packages/database/migrations/010_analytics_aggregates.sql:1–23`**

Postgres cannot put row-level security on a materialized view. `analytics_sentiment_daily`, `analytics_theme_counts`, and `analytics_channel_counts` pre-aggregate `feedback_items` across **all** tenants with nothing stopping a query from reading every org's numbers — the app's own tenant-isolation test doesn't even list these three views. The dashboard's tenant scoping is currently 100% dependent on every consuming query remembering to add `WHERE tenant_id = $1` — the exact class of bug RLS exists to catch when someone forgets.

**Fix:** wrap each matview in a thin view/function with explicit tenant filtering plus a regression test that tries an unscoped read and expects zero/blocked results — don't rely on every call site remembering.

### 4. Public report-share endpoint only works by routing through the internal-only bypass-RLS database role
**`apps/web/app/api/public/reports/[token]/route.ts:3,5`, `apps/web/lib/server/db.ts:12`, `packages/database/migrations/014_report_delivery.sql:12–23`**

`share_tokens`/`reports` RLS policies require a tenant context that an anonymous, token-only public request can't set — so the handler for a public report link uses `workerDb`, the pool whose own doc-comment says it's reserved for scheduled workers and should *never* be used in a request handler. Today's query is narrow enough that it isn't an active leak, but the schema as written cannot support the documented "public share link" feature without this bypass, and it's one careless copy-paste away from becoming one.

**Fix:** give `share_tokens`/`reports` a real anonymous-access path — a `SECURITY DEFINER` lookup function scoped to a token hash, not a shared bypass-RLS connection pool.

### 5. `users` and `tenants` tables have zero row-level security
**`packages/database/migrations/001_tenants_users_memberships.sql:1–14`**

Neither table enables RLS. Under the app's own shared database role, an unscoped query against `tenants` returns every customer's org name; against `users` it returns every user's email and password hash platform-wide. The whole point of RLS-as-backstop is to survive an app-layer mistake (bad join, missing predicate, a future endpoint someone forgets to scope) — the two most sensitive tables in the system are the ones left unguarded by that backstop.

**Fix:** add policies keyed through `memberships` (a user/tenant is visible only if the current session's tenant has a membership row connecting them).

### 6. The dashboard home page and Insights page cannot show data to a real signed-in user
**`apps/web/components/analytics-dashboard.tsx:9,15`, `apps/web/app/(dashboard)/page.tsx`, `apps/web/app/(dashboard)/insights/page.tsx`**

`AnalyticsDashboard` keeps its own local `token` state instead of reading the real session from `useSession()`, and renders a literal "Paste access token" password field that must be filled before any chart loads. There is no screen anywhere in the product that ever shows a user their raw JWT. A Product Manager or Exec who just signed in lands on this exact page (it's both the Overview and the Insights route) and sees permanently empty chart frames with no legitimate way to populate them.

**Fix:** call `useSession()` like every other component does; delete the manual token input entirely.

---

## High — fix before onboarding a real customer

### 7. Login has no rate limiting; signup enforces only a 5-character password minimum
**`apps/web/app/api/auth/login/route.ts`, `apps/web/app/api/auth/signup/route.ts:14`**

No lockout, backoff, or CAPTCHA anywhere on `POST /api/auth/login` — a practical credential-stuffing target. The only strength check is `password.length <= 4`, i.e. 5 characters passes, directly contradicting the documented "12 character minimum" policy in `report.md:121`.
**Fix:** enforce the documented 12-char minimum server-side; add IP/account-based throttling on login.

### 8. Feedback Inbox has the same "paste your token" pattern as the dashboard
**`apps/web/components/feedback-inbox.tsx:11,17`**

Reads `localStorage` directly and renders a second password-styled "Paste access token" field, inconsistent with every other component in the app that correctly calls `useSession()`.
**Fix:** same as Critical #6.

### 9. No session refresh — users get silently kicked out every 15 minutes
**`apps/web/lib/server/auth.ts:20–21`, `apps/web/components/auth-form.tsx:41–43`**

A 7-day refresh token is issued on login but never used by the frontend — only the 15-minute access token is kept. There's no refresh call and no global 401 handler, so mid-session every fetch starts silently returning a raw error string with no "please sign in again" affordance.
**Fix:** implement silent refresh on 401 using the existing refresh token; redirect to `/login` with a clear message only when refresh itself fails.

### 10. No responsive navigation — app is unusable under 1024px width
**`apps/web/components/dashboard-shell.tsx:25`**

The entire nav sidebar is `hidden lg:flex` with no hamburger/drawer fallback. The account-menu chevron next to it has no `onClick`. Logout only lives inside the hidden sidebar. On any tablet or narrow laptop — plausible for the exec/CX personas this targets — there is no way to navigate to another page or log out.
**Fix:** add a mobile nav drawer; wire the account menu; never let logout be reachable only from a breakpoint-hidden element.

### 11. Two fully-built backend features — report sharing and PDF export — have no UI at all
**`apps/web/app/api/reports/[reportId]/share/route.ts`, `.../pdf/route.ts`, `apps/web/components/report-generator.tsx`**

Both endpoints work server-side. The Reports page has a "Generate now" button and a read-only report list — no "Share" or "Download PDF" action anywhere. The public share viewer page exists and works, but nothing in the product can ever produce that URL for a non-technical exec without using curl/Postman.
**Fix:** add Share-link and Download-PDF buttons to the report detail view — highest value-to-effort item in the whole review.

### 12. Advertised chart drill-through navigates to the wrong page and does nothing
**`apps/web/components/analytics-dashboard.tsx:14–15`**

The "Top themes" tooltip says "Click a bar to open the filtered inbox," but the click handler navigates to `/?themeId=...` — the Overview route, which never reads a `themeId` param — instead of `/feedback`, the only page that does.
**Fix:** point at `/feedback?themeId=...`; audit other click handlers for the same pattern.

### 13. Report-generation rate limit has a check-then-insert race
**`apps/web/app/api/reports/route.ts:8`**

The documented "1 report per 5 minutes" limit is a plain `SELECT` then `INSERT` in one transaction with no unique constraint or advisory lock — a double-click or client retry can pass the check twice and produce two reports (and two billed Gemini calls).
**Fix:** add a partial unique index or take a per-tenant advisory lock before the check.

### 14. Google OAuth login is documented as MVP scope but doesn't exist
**`pm.md:41` vs. `apps/web/app/api/auth/*`**

Only email/password auth is implemented. No OAuth code exists anywhere in the app.

### 15. The "tenant-isolation regression test" doesn't test tenant isolation
**`apps/web/test/tenant-isolation.test.mjs`**

It never connects to a database or performs a real cross-tenant read. It greps migration SQL text for the literal strings `ENABLE ROW LEVEL SECURITY` and a policy name pattern, and greps route source for the literal substring `setTenantContext(`. It would pass even if a policy's logic were wrong (as with the `memberships` bug above), even if `setTenantContext` ran against the wrong connection, and it doesn't cover `ingestions/*`, `members/*`, `qa/*`, `report-schedule`, or either webhook route at all.
**Fix:** replace with a real integration test that seeds two tenants and asserts a cross-tenant read returns zero rows against a live database.

### 16. Read endpoints trust a JWT that can outlive a revoked membership by up to 15 minutes
**`apps/web/app/api/connectors/route.ts:16` (and other read routes using `requireAuth` vs. `requireActiveAuth`)**

Write endpoints correctly re-check live membership status; several read endpoints don't, including one that returns a connector's live `webhookSecret` — a credential capable of forging inbound webhook data — to a user whose access may have just been revoked.

---

## Medium

| Issue | Where | Why it matters |
| --- | --- | --- |
| CSV import breaks after the first row with no external ID | `packages/database/migrations/003_ingestion.sql:33` | `UNIQUE NULLS NOT DISTINCT (tenant_id, source, external_id)` treats every null `external_id` as a duplicate of every other — the opposite of the intended dedup. Needs a partial unique index that only applies when `external_id IS NOT NULL`. |
| Sentiment enum migration has no data cleanup step | `packages/database/migrations/006_sentiment_pipeline.sql:3–4` | Safe on an empty DB only; will abort on any environment where the column ever held an unexpected value. |
| Denormalized `tenant_id` not cross-checked against parent row's tenant | `007_embeddings.sql`, `008_themes.sql`, `012_qa_retrieval.sql` | A referenced foreign row could structurally belong to a different tenant while still passing RLS's own-row check. |
| docker-compose hardcodes DB credentials in 4 services instead of reusing the postgres service's own vars | `docker-compose.yml:35,49,62,74,86` | Changing `POSTGRES_PASSWORD` silently breaks every consumer except `postgres` itself. |
| No healthcheck on `web`/`ai-service`; workers start on `service_started` not `service_healthy` | `docker-compose.yml` | Workers can start hitting an AI service container that hasn't finished booting. |
| CI never runs a production build, and has zero coverage of the Python AI service | `.github/workflows/ci.yml` | A build-only failure or any ai-service bug ships straight through green CI. |
| No dependency or secret scanning in CI | `.github/workflows/ci.yml` | No Dependabot, no `npm audit`, no gitleaks — for a repo about to hold real API tokens. |
| Deploy pipeline only ships the Vercel web app | `.github/workflows/deploy-staging.yml` | Nothing deploys ai-service, Redis, or the four workers; no migration step — "staging" today is web-app-only. |
| Timing-unsafe string comparison on internal cron secrets | `app/api/internal/*/route.ts`, `apps/ai-service/app/main.py:88–91` | Inconsistent with the correct `timingSafeEqual` usage elsewhere in the same codebase. |
| Destructive actions use unstyled native `window.confirm` | `member-management.tsx:45,52`, `csv-import.tsx:61` | Only unbranded confirmation dialogs in an otherwise-crafted UI. |
| No shared design system — one `Button` primitive, everything else hand-rolled Tailwind | `apps/web/components/ui/`, `tailwind.config.ts:2` | Two different "primary" blues in active use (indigo-600 vs. blue-600); any visual change means editing 6+ files by hand. |

---

## Low & hygiene

- **`apps/api/`** is dead scaffold from an abandoned NestJS attempt — empty `src/`, `migrations/`, `scripts/`, not in the npm workspaces list, referenced nowhere. Delete it.
- **`packages/shared-types`** exports one interface (`HealthResponse`) that nothing imports. Delete it or actually wire it into apps/web and apps/ai-service.
- **`tmp-web.log`** at the repo root is leftover terminal output from a dev run; not covered by `.gitignore` (no `*.log` rule) — would get committed on a naive `git add -A`.
- No loading skeletons — six data-fetching components pop content in with no spinner, while three other places in the app use three different loading patterns.
- `// @ts-nocheck` at the top of `analytics-dashboard.tsx` — type-checking disabled on the file customers' data flows through.
- Nested interactive controls: a theme-tag `<button>` renders inside a feedback-row `<button>` (invalid HTML, unpredictable click bubbling, breaks screen readers).
- No "Forgot password" flow or API route exists at all.
- No first-run empty states — a brand-new tenant with zero data sees blank chart frames and empty lists with no "connect a source" prompt anywhere.
- PDF export's `CHROME_PATH` default is a hardcoded Windows path — silently fails on any Linux production host that forgets to set it.
- PII redaction is regex-only (self-disclosed as a residual risk in `docs/PII-LLM-POLICY.md`) — misses names, addresses, and account numbers; the card-number pattern both over- and under-matches.

---

## Feature coverage vs. the product plan

Cross-checking `pm.md`'s MVP scope against what's actually implemented:

| Planned feature | Status |
| --- | --- |
| CSV + Zendesk + Typeform/webhook ingestion | Built — dedup bug on null external_id (see Medium) |
| AI sentiment classification | Built |
| AI theme/topic clustering | Built |
| Feedback inbox (search/filter) | Built, unusable — session-wiring bug |
| Analytics dashboard | Built, unusable — session-wiring bug, no RLS on source views |
| Multi-tenant isolation | Built, has bugs — 3 RLS gaps above |
| RBAC (Admin/Editor/Viewer) | Built — mostly enforced, some read routes lag on revocation |
| Auth: email/password + Google OAuth | Half built — no OAuth |
| AI Q&A with citations | Built — minor gap on partial-evidence refusal |
| Automated VoC reports (generate/schedule/share/export) | Built, mostly hidden — share & PDF export have no UI |

---

## Redesign brief

"Redesign the full app" for genuine user-friendliness (non-technical PMs, support leads, execs) breaks into three layers, not just a visual refresh:

### 1. Make it work
No amount of visual redesign matters while the dashboard and inbox can't load data for a real user. This has to land before or alongside anything else.

### 2. Give it a real design system
- One color system (pick one primary, not indigo *and* blue), defined as Tailwind theme tokens, not hardcoded per component.
- A proper `components/ui` kit: Input, Select, Card, Table, Modal/Dialog, Toast, Skeleton, Badge — replacing six files' worth of copy-pasted Tailwind card/table markup.
- One loading pattern, one empty-state pattern, one error pattern — used everywhere, not invented per page.
- A responsive nav (drawer/bottom nav below 1024px) with a working account menu and a logout that's always reachable.

### 3. Design the actual first-run experience
- Post-signup checklist: connect a source → see feedback arrive → view first insights — the product's core value never gets demonstrated to a new admin otherwise.
- Real empty states with a specific call to action on every page (Overview, Insights, Feedback, Connectors, Reports).
- Surface the two hidden power features — report share links and PDF export — as visible buttons; this alone makes the "executive-ready report" pitch in `pm.md` actually deliverable.

---

## Recommended order of work

### Now — stop the bleeding (security + broken core pages)
- Fix the `memberships` RLS policy, add RLS-equivalent protection to the analytics matviews, add RLS to `users`/`tenants`, and replace the public-report bypass-RLS path.
- Close the invite-accept account-takeover path.
- Wire `analytics-dashboard.tsx` and `feedback-inbox.tsx` to `useSession()` and delete the token-paste inputs.

### Next — redesign the frontend
- Build the design system (tokens + component kit) before touching individual pages, so every page adopts it once instead of getting redesigned twice.
- Responsive nav, session refresh, surfaced share/PDF actions, real empty states, onboarding checklist.

### Then — harden
- Real cross-tenant integration test suite (replace the string-grep one).
- CI for the AI service, a build step, dependency/secret scanning, and a deploy path for the whole stack, not just the web app.
- Login rate limiting, enforced 12-char password minimum, session-refresh 401 handling.

---

*Compiled from a four-part audit (frontend, backend/API, database/migrations, ops & CI) of the working tree at `W:\Project-loop` as of 2026-09-18.*
