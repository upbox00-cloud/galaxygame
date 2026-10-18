// Compile in memory: never runs the site's data regeneration or deployment.
const path = require('node:path');
const esbuild = require('esbuild');

esbuild.build({
  absWorkingDir: path.resolve(__dirname, '..'),
  entryPoints: ['netlify/functions/traffic-catalog.js'],
  platform: 'node', target: 'node22', format: 'cjs', bundle: true,
  write: false, metafile: true, logLevel: 'silent'
}).then(result => {
  const inputs = Object.keys(result.metafile.inputs);
  if (!inputs.some(file => file.endsWith('_data/traffic-availability.json'))) throw new Error('Private confirmation document not bundled');
  if (inputs.some(file => /(?:_commercial-catalog|_orders|catalogo-comercial)/.test(file))) throw new Error('Forbidden private commerce dependency');
  console.log('Private API bundle compiled in memory; confirmation metadata included; no checkout/orders/commercial catalog dependencies.');
}).catch(() => { console.error('Private API bundle validation failed.'); process.exitCode = 1; });
