import { build } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const ASSETS = join(DIST, 'assets');

function contentHash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

async function buildJS() {
  const result = await build({
    entryPoints: [join(ROOT, 'main.js')],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    target: ['es2020'],
    outdir: ASSETS
  });

  const code = result.outputFiles[0].contents;
  const hash = contentHash(code);
  const filename = `main-${hash}.js`;
  await writeFile(join(ASSETS, filename), code);
  return filename;
}

async function buildCSS() {
  const result = await build({
    entryPoints: [join(ROOT, 'styles.css')],
    bundle: true,
    minify: true,
    write: false,
    outdir: ASSETS
  });

  const code = result.outputFiles[0].contents;
  const hash = contentHash(code);
  const filename = `styles-${hash}.css`;
  await writeFile(join(ASSETS, filename), code);
  return filename;
}

async function buildHTML(jsFilename, cssFilename) {
  let html = await readFile(join(ROOT, 'index.html'), 'utf-8');

  html = html.replace(
    '<link rel="stylesheet" href="styles.css">',
    `<link rel="stylesheet" href="/assets/${cssFilename}">`
  );

  html = html.replace(
    '<script type="module" src="main.js"></script>',
    `<script type="module" src="/assets/${jsFilename}"></script>`
  );

  const minified = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true
  });

  await writeFile(join(DIST, 'index.html'), minified);
}

async function writeHeaders() {
  const content = [
    '/index.html',
    '  Cache-Control: public, max-age=0, must-revalidate',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    ''
  ].join('\n');

  await writeFile(join(DIST, '_headers'), content);
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(ASSETS, { recursive: true });

  const [jsFilename, cssFilename] = await Promise.all([
    buildJS(),
    buildCSS()
  ]);

  await buildHTML(jsFilename, cssFilename);
  await writeHeaders();
  await copyFile(join(ROOT, 'favicon.svg'), join(DIST, 'favicon.svg'));

  console.log(`dist/index.html`);
  console.log(`dist/assets/${jsFilename}`);
  console.log(`dist/assets/${cssFilename}`);
  console.log(`dist/favicon.svg`);
  console.log(`dist/_headers`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
