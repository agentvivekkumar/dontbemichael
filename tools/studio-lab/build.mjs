#!/usr/bin/env node
/**
 * Builds the studio lab (tools/studio-lab/lab.tsx) into ONE self-contained HTML
 * file: script, styles, fonts and images all inlined, so it opens offline by
 * double-click, can be shared as a file, and records cleanly for demo videos.
 *
 *   npm run lab              writes docs/demo/studio-lab.html
 *   node tools/studio-lab/build.mjs <out.html>
 *
 * It is built from the app's real studio components, so rebuilding after a
 * change shows the office as the app now draws it.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const DEFAULT_OUT = path.join(root, 'docs/demo/studio-lab.html');

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };

/** `foo.svg?url` imports (the brand kit) become data URLs, like Vite's ?url does in the app. */
const urlAsDataUrl = {
  name: 'url-as-data-url',
  setup(b) {
    b.onResolve({ filter: /\?url$/ }, (args) => {
      const bare = args.path.replace(/\?url$/, '').replace(/^@brandkit/, path.join(root, 'branding'));
      return { path: path.resolve(args.resolveDir, bare), namespace: 'data-url' };
    });
    b.onLoad({ filter: /.*/, namespace: 'data-url' }, (args) => {
      const mime = MIME[path.extname(args.path)] ?? 'application/octet-stream';
      const data = fs.readFileSync(args.path).toString('base64');
      return { contents: `export default ${JSON.stringify(`data:${mime};base64,${data}`)};`, loader: 'js' };
    });
  }
};

/** Build the lab; returns the HTML. Writes it to `out` unless `out` is null.
 *  `entry` builds another page the same way (reference.tsx, for `npm run shoot`). */
export async function buildLab(out = DEFAULT_OUT, { entry = 'lab.tsx', title = 'Studio lab', minify = true } = {}) {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const res = await build({
    entryPoints: [path.join(here, entry)],
    bundle: true,
    write: false,
    outdir: path.join(here, '.out'),
    format: 'iife',
    jsx: 'automatic',
    minify,
    target: 'chrome120',
    nodePaths: [path.join(root, 'node_modules')],
    alias: {
      '@': path.join(root, 'src/renderer/src'),
      '@shared': path.join(root, 'src/shared'),
      '@brandkit': path.join(root, 'branding')
    },
    loader: { '.woff2': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: JSON.stringify(version), 'import.meta.env.DEV': 'false' },
    plugins: [urlAsDataUrl],
    logLevel: 'error'
  });
  const js = res.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '';
  const css = res.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Don't Be Michael · ${title}</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
  }
  return html;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT;
  buildLab(out).then((html) => {
    console.log(`studio lab: ${path.relative(process.cwd(), out)} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
  }).catch((e) => { console.error(e); process.exit(1); });
}
