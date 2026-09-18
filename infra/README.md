# Vercel deployment

LOOP's web application and core API deploy together on Vercel. Next.js route handlers under `apps/web/app/api` are Node.js Vercel Functions; they should run in the region nearest the database.

Before deploying:

1. Import the repository as a Vercel project, setting its root directory to `apps/web` (or configure the monorepo build command at the project root).
2. Add a managed external Postgres integration—such as Neon—and set `DATABASE_URL` for Preview and Production.
3. Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` to the GitHub `preview` environment if using the manual workflow. Git-connected projects can instead use Vercel's automatic Preview and Production deployments.
4. Keep Redis and the Python AI worker on a worker-friendly platform; Vercel Functions should orchestrate work rather than host long-running queue consumers.

Vercel provides Preview deployments for branches and Production for the configured production branch. Set database credentials separately in each environment; never commit them to `.env` files.
