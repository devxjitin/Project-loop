// Runs every queue consumer in one process for single-instance deployments (e.g. one Render worker).
// Each module starts itself on import. A failed start ends the process so the platform restarts all five.
// PORT enables a health endpoint, required when hosted as a free Render web service. Any request to it
// also keeps that instance awake, so the web app pings it after imports to wake the workers on demand.
import { createServer } from 'node:http';

if (process.env.PORT) {
  createServer((request, response) => {
    response.writeHead(request.url === '/health' ? 200 : 404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'workers' }));
  }).listen(Number(process.env.PORT), '0.0.0.0');
}

void Promise.all([
  import('./sentiment'),
  import('./embeddings'),
  import('./themes'),
  import('./analytics'),
  import('./report-schedule'),
]).catch((error) => {
  console.error('Unable to start workers', error);
  process.exit(1);
});
