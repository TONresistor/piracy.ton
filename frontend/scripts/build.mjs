import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'dist');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });
await cp(join(root, 'public'), out, { recursive: true });
const locales = {};
for (const lang of ['en', 'fr', 'ru', 'zh', 'es', 'ar']) {
    const bytes = await readFile(join(root, 'src/i18n/locales', lang + '.json'));
    const name = 'assets/lang-' + lang + '-' + hash(bytes).slice(0, 12) + '.json';
    locales[lang] = '/' + name;
    await writeFile(join(out, name), bytes);
}
const order = JSON.parse(await readFile(join(root, 'styles/order.json'), 'utf8'));
const css = (await Promise.all(order.map(file => readFile(join(root, 'styles', file), 'utf8')))).join('');
const stylesheet = 'assets/site-' + hash(css).slice(0, 12) + '.css';
await writeFile(join(out, stylesheet), css);
const entries = ['catalog', 'add-bag', 'bag-detail', 'faq'];
const result = await build({
    absWorkingDir: root,
    entryPoints: Object.fromEntries(entries.map(name => [name, join(root, 'src/pages', name + '.js')])),
    outdir: join(out, 'assets'), entryNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]',
    bundle: true, splitting: true, format: 'esm', platform: 'browser', target: ['es2020'],
    inject: [join(root, '../shared/contract-sdk/buffer-shim.js')], minify: true, legalComments: 'eof', metafile: true,
    plugins: [{ name: 'fingerprinted-locales', setup(plugin) {
        plugin.onLoad({ filter: /[/\\]i18n[/\\]locale-files\.js$/ }, () => ({ contents: 'export default ' + JSON.stringify(locales), loader: 'js' }));
    } }]
});
const manifest = { stylesheet, locales, entries: {}, cssHash: hash(css) };
for (const [page, entry] of [['index.html','catalog'],['add.html','add-bag'],['bag.html','bag-detail'],['faq.html','faq']]) {
    const output = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint?.replaceAll('\\','/').endsWith('/' + entry + '.js'));
    if (!output) throw new Error('missing_entry:' + entry);
    const script = relative(out, join(root, output[0])).replaceAll('\\', '/');
    manifest.entries[page] = script;
    const html = (await readFile(join(root, page), 'utf8')).replace('__STYLE__', stylesheet).replace('__ENTRY_' + entry + '__', script);
    if (/__(?:STYLE|ENTRY_)/.test(html)) throw new Error('unresolved_html_entry');
    await writeFile(join(out, page), html);
}
manifest.files = {};
for (const file of await readdir(out, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    manifest.files[relative(out, path).replaceAll('\\', '/')] = hash(await readFile(path));
}
await writeFile(join(out, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Golden v2 serialization remains testable without shipping its codec on every page.
await build({ entryPoints: [join(root, 'src/legacy/contract.js')], outfile: join(root, '.cache/legacy-browser.js'), bundle: true, format: 'esm', platform: 'browser', target: ['es2020'], inject: [join(root, '../shared/contract-sdk/buffer-shim.js')], alias: { '@ton/core': join(root, 'node_modules/@ton/core/dist/index.js') }, minify: true });
