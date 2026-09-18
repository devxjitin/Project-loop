// Runs every queue consumer in one process for single-instance deployments (e.g. one Render worker).
// Each module starts itself on import. A failed start ends the process so the platform restarts all five.
export {};

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
