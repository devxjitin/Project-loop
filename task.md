# Project LOOP — Engineering Task Checklist

Status is based on the 2026-09-18 engineering review and the work completed in this workspace. A checked item is implemented; validation notes are recorded where relevant.

## Now — security and broken core flows

- [x] Restrict `memberships` tenant reads to the active tenant.
- [x] Add a narrowly scoped self-membership policy for authentication lookups.
- [x] Enable and force RLS for `users` and `tenants`.
- [x] Add tenant/member-based read policies for `users` and `tenants`.
- [x] Replace direct application reads of analytics materialized views with tenant-filtered views.
- [x] Move the public report endpoint off `workerDb` / the request-path BYPASSRLS connection.
- [x] Add the narrow token-hash public-report database function.
- [x] Replace unrestricted pre-session `users` lookups with a fixed-shape authentication lookup function.
- [x] Require an existing account's real password before an invitation can attach a membership and mint tokens.
- [x] Wire the analytics dashboard to the shared session provider.
- [x] Wire the feedback inbox to the shared session provider.
- [x] Remove both access-token paste controls.
- [x] Remove `@ts-nocheck` from the analytics dashboard.
- [x] Correct analytics theme drill-through to `/feedback?themeId=…`.
- [x] Apply migration `015_tenant_security_hardening.sql` to the local PostgreSQL database.
- [x] Verify typecheck and existing web tests after the above changes.

## Next — frontend redesign and user experience

### Navigation and account controls

- [x] Add a responsive mobile navigation drawer.
- [x] Ensure navigation drawer closes after route changes.
- [x] Make sign-out reachable at every breakpoint.
- [x] Wire the account-menu dropdown and sign-out action.
- [x] Decide whether mobile navigation should remain a drawer or also include a bottom navigation bar. The responsive drawer remains the single mobile navigation pattern; a bottom bar would duplicate the seven-route navigation and create inconsistent admin-only access.

### Reports

- [x] Surface PDF export for ready reports.
- [x] Surface 30-day public-share link creation for admins.
- [x] Copy created share links to the clipboard when supported and display the link in the page.
- [x] Add share-link management: list active links, revoke links, and set an expiry.
- [x] Add progress/polling feedback while a report is being generated.

### Design system

- [x] Define a baseline brand/surface token set in Tailwind. Remaining page-by-page mixed-color cleanup is still required.
- [x] Add reusable `Input` primitive.
- [x] Add reusable `Select` primitive.
- [x] Add reusable `Card` primitive.
- [x] Add reusable `Table` primitive.
- [x] Add reusable `Dialog` / modal primitive.
- [x] Add reusable toast/notification system.
- [x] Add reusable `Skeleton` loading primitive.
- [x] Add reusable badge/status primitive.
- [x] Refactor hand-built page controls to use the component kit.

### First-run and empty states

- [x] Add onboarding checklist after signup: upload feedback → view insights.
- [x] Add actionable empty state to Overview.
- [x] Add actionable empty state to Insights.
- [x] Add actionable empty state to Feedback inbox.
- [x] Add actionable empty state to Reports.
- [x] Standardize loading, empty, and error states across data-fetching components.

### Session experience

- [x] Add refresh-token endpoint with live membership validation.
- [x] Store and use the existing refresh token in the frontend session flow.
- [x] Refresh the access token proactively before expiry; clear the session if refresh fails.
- [x] Add a global 401 handler that refreshes silently once.
- [x] Redirect to login with a clear session-expired message only when refresh fails.

## Then — hardening, reliability, and operations

### Authentication and authorization

- [x] Enforce a 12-character password minimum on signup and invitation acceptance.
- [x] Add Redis-backed IP- and account-based login throttling (10 attempts per 15 minutes).
- [x] Implement a password-reset / forgot-password flow.
- [x] Implement Google OAuth login, or revise product scope to remove the promise.
- [x] Update all read endpoints to re-check active membership status.
- [x] Stop returning raw invitation tokens to the inviting admin; deliver invitations through a secure email flow.

### Tenant-isolation tests

- [x] Replace the string-grep tenant-isolation test with a live-database integration suite.
- [x] Seed two tenants and assert cross-tenant reads return no rows.
- [x] Cover membership, ingestion, members, Q&A, and report schedule routes.
- [x] Assert analytics views cannot return data without an active tenant context.
- [x] Assert public reports are readable only through a valid, unexpired, non-revoked token.

### Database integrity and migrations

- [x] Fix CSV deduplication: use a partial unique index only when `external_id IS NOT NULL`.
- [x] Add cleanup/validation before the sentiment enum migration changes data.
- [x] Add tenant-consistency checks between denormalized `tenant_id` values and parent rows in embeddings, themes, and Q&A retrieval.
- [x] Add a transactional lock or database constraint for the one-report-per-five-minutes limit.
- [ ] Document and provision distinct unprivileged application and privileged worker database roles in deployed environments.

### CI/CD and operations

- [x] Run a production web build in CI.
- [x] Add lint/type/test coverage for the Python AI service.
- [x] Add dependency scanning and secret scanning to CI.
- [x] Add healthchecks for web and AI service containers.
- [x] Start workers only after the AI service is healthy.
- [x] Replace duplicated hard-coded Docker database credentials with shared environment variables.
- [ ] Deploy the AI service, Redis, workers, and database migrations alongside the Vercel web deployment.
- [x] Use timing-safe comparison for every internal cron secret check.
- [ ] Make PDF browser configuration portable across Linux production hosts.

## Product and accessibility improvements

- [x] Replace native destructive `window.confirm` prompts with branded confirmation dialogs.
- [x] Fix nested interactive controls in feedback rows and theme tags.
- [x] Add accessible labels, focus handling, and keyboard behavior to all new dialogs and menus.
- [x] Add loading skeletons to the six data-fetching pages.
- [x] Add a consistent error/retry UI for failed data loads.
- [x] Improve PII redaction beyond regex-only matching; document remaining residual risk.

## Repository hygiene

- [x] Remove the unused `apps/api/` scaffold after confirming it has no consumers.
- [x] Remove or use `packages/shared-types`.
- [x] Delete `tmp-web.log` and ignore `*.log` files.
- [x] Establish the initial Git commit once the desired baseline is reviewed.

## Verification log

- [x] Local migration applied: `015_tenant_security_hardening.sql`.
- [x] Tenant analytics view returns zero rows without tenant context.
- [x] Public-report token lookup returns zero rows for an invalid token.
- [x] Local migration applied: `016_reliability_hardening.sql` (CSV deduplication, tenant-consistency triggers).
- [x] `npm run typecheck -w @loop/web` passes.
- [x] `npm run lint -w @loop/web` passes.
- [x] `npm run test -w @loop/web` passes.
