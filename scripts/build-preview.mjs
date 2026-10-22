import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const app = await readFile('public/app.js', 'utf8');
const result = await build({
  stdin: {
    contents: `import { createPreview } from './preview/api';
const fetch = createPreview();
${app}
document.getElementById('sampleBtn').addEventListener('click', () => {
  inputEl.value = 'Synthetic incident: timeout errors appeared after deployment.';
  formEl.requestSubmit();
});
document.getElementById('failureBtn').addEventListener('click', () => {
  inputEl.value = '[simulate-provider-error]';
  formEl.requestSubmit();
});
document.getElementById('resetBtn').addEventListener('click', () => location.reload());`,
    resolveDir: process.cwd(), sourcefile: 'browser-preview.js',
  },
  bundle: true, platform: 'browser', format: 'iife', minify: true,
  write: false, metafile: true, target: 'es2022',
});
const allowed = /^(browser-preview\.js|preview\/api\.ts|src\/(api|contracts|prompts|store)\.ts|demo\/(store\.ts|fixture\.json)|node_modules\/zod\/)/;
for (const input of Object.keys(result.metafile.inputs)) {
  if (!allowed.test(input.replaceAll('\\', '/'))) throw new Error('Unexpected browser module: ' + input);
}
let html = await readFile('public/index.html', 'utf8');
html = html.replace('<title>Incident Triage Agent</title>', `<title>Incident Triage | Browser preview</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'">`)
  .replace('href="/styles.css"', 'href="./styles.css"')
  .replace('src="/app.js"', 'src="./app.js"')
  .replace('<header class="header">', `<header class="header">
<section aria-label="Browser preview information" class="preview-notice">
<h2>Browser preview</h2>
<p>Fixed example responses, not AI-generated findings. Synthetic data only. No backend or model calls. Entered text stays in this tab's memory; reload clears all sessions.</p>
<div class="controls"><button id="sampleBtn" type="button">Run sample</button><button id="failureBtn" type="button">Simulate failure</button><button id="resetBtn" type="button">Reset preview</button></div>
<p><a href="../../#projects">Portfolio</a> &middot; <a href="https://github.com/owanden/cf_ai_incident_triage_agent">Source</a> &middot; <a href="https://github.com/owanden/cf_ai_incident_triage_agent#run-the-fixture-demo">Local full-stack demo</a></p>
</section>`)
  .replace('Paste an incident description, logs, or errors.', 'Enter synthetic details, or run the fixed sample above.');
await mkdir('dist/preview', { recursive: true });
await writeFile('dist/preview/index.html', html);
await writeFile('dist/preview/app.js', result.outputFiles[0].contents);
await writeFile('dist/preview/styles.css', await readFile('public/styles.css', 'utf8') + `
.preview-notice { padding: 16px; border: 1px solid #64748b; border-radius: 12px; margin-bottom: 24px; }
.preview-notice a { color: #93c5fd; }
.preview-notice h2 { margin-top: 0; }
.controls input { min-width: 0; max-width: 100%; box-sizing: border-box; }
`);
console.log('Built browser preview: shared handler, fixed fixture, tab memory, no network adapter.');
