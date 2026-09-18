-- Run once as the managed database administrator, after migrations have created
-- the public schema and its objects. Substitute passwords via your deployment
-- secret manager before execution; never place them in this repository.
--
-- The web application uses DATABASE_URL for loop_app. Queue consumers use only
-- DATABASE_WORKER_URL for loop_worker. Neither credential belongs in a browser.

CREATE ROLE loop_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD 'replace-from-secret-manager';
CREATE ROLE loop_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS PASSWORD 'replace-from-secret-manager';

GRANT USAGE ON SCHEMA public TO loop_app, loop_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loop_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loop_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO loop_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loop_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loop_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO loop_worker;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loop_app, loop_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO loop_app, loop_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO loop_app, loop_worker;

-- Verify before deployment. The application role must not bypass tenant RLS;
-- the worker role is intentionally privileged and must never be configured for
-- Next.js request handlers.
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('loop_app', 'loop_worker');

-- The analytics worker runs REFRESH MATERIALIZED VIEW, which only an owner may do. Transfer the views to
-- loop_worker (it needs CREATE on the schema only for the duration of the ownership change). loop_app keeps read access.
GRANT loop_worker TO CURRENT_USER;
GRANT CREATE ON SCHEMA public TO loop_worker;
ALTER MATERIALIZED VIEW analytics_sentiment_daily OWNER TO loop_worker;
ALTER MATERIALIZED VIEW analytics_theme_counts OWNER TO loop_worker;
ALTER MATERIALIZED VIEW analytics_channel_counts OWNER TO loop_worker;
REVOKE CREATE ON SCHEMA public FROM loop_worker;
GRANT SELECT ON analytics_sentiment_daily, analytics_theme_counts, analytics_channel_counts TO loop_app;
