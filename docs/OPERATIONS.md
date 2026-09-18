# Launch operations

## Monitoring and uptime

Set `SENTRY_DSN` in production and configure the Next.js Sentry integration before launch. Alert the on-call rotation on new production errors and failed uptime checks with a five-minute escalation target. Check `/api/health` every minute from an external monitor.

## Load-test baseline

Before launch, run the staging workload below against an anonymized tenant with at least 100,000 feedback items: 20 concurrent inbox searches, 10 dashboard refreshes, and 5 ingestion-job creations for 15 minutes. Record p50/p95/p99, database CPU, pool saturation, and queue lag in the release ticket. Launch targets: dashboard p95 under 1.5 seconds, inbox p95 under 1.5 seconds, and ingestion-job creation p95 under 500 ms.

## Scheduled jobs

Call the internal connector poll and report schedule endpoints with `CRON_SECRET`. Investigate any nonzero failed count immediately.

## Database credentials and roles

Run [`infra/database-roles.sql`](../infra/database-roles.sql) as the managed-database administrator after applying migrations. Store the resulting credentials only in the platform secret manager:

- `DATABASE_URL` is the unprivileged `loop_app` connection and is the only database URL supplied to the Vercel web application.
- `DATABASE_WORKER_URL` is the `loop_worker` connection, which has `BYPASSRLS`; provide it only to the four queue-consumer services.

Before each release, query `pg_roles` as shown in the provisioning script and confirm `loop_app.rolbypassrls` is false, `loop_worker.rolbypassrls` is true, and no Vercel environment contains `DATABASE_WORKER_URL`.

## Transactional email

Invitations are delivered only through the configured Resend transactional-email account. Set `RESEND_API_KEY`, `EMAIL_FROM`, and the public `APP_URL` in every deployed environment. Invitation URLs are secrets: do not copy them into logs, tickets, or API responses. Monitor provider delivery failures and retry the invitation from the Team page after correcting configuration.
