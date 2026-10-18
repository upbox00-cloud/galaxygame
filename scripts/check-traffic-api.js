const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['netlify/functions/traffic-catalog.js', 'netlify/functions/_traffic-catalog.js', 'scripts/traffic-availability.js', 'scripts/build-traffic-api.js']) {
  const result = spawnSync(process.execPath, ['--check', path.resolve(__dirname, '..', file)], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('New private API JavaScript syntax checks passed. No TypeScript/linter is configured in this static store project.');
