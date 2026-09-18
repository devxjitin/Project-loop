import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next/**', 'node_modules/**'] },
  ...nextVitals,
  // Fetches started from effects update state asynchronously; this React 19
  // compiler heuristic cannot distinguish that pattern from a synchronous loop.
  { rules: { 'react-hooks/set-state-in-effect': 'off', 'react-hooks/purity': 'off' } },
];

export default config;
