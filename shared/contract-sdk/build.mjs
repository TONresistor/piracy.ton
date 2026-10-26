import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const entryPoints = [join(root, 'src/v3.ts')];
await build({ entryPoints, outfile: join(root, 'dist/browser.js'), bundle: true, format: 'esm', platform: 'browser', target: ['es2020'], inject: [join(root, 'buffer-shim.js')], alias: { '@ton/core': join(root, 'node_modules/@ton/core/dist/index.js') }, minify: true, legalComments: 'eof' });
await build({ entryPoints, outfile: join(root, '../../backend/v3-sdk.cjs'), bundle: true, format: 'cjs', platform: 'node', target: ['node22'], external: ['@ton/core'], minify: true, legalComments: 'eof' });
