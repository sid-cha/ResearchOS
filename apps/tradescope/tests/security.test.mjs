import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = ['index.html','styles.css','app.js','live-adapter.js','event-workspace.js','intelligence.css','case-workspace.js','cases.css','assistant-workspace.js','theme-controls.js','terminal-theme.css','workspace-nav.js','research-workspace.js','research.css','research-operations.js','research-operations.css','discovery-workspace.js','discovery-workspace.css','monitor-candles.js','monitor-candles.css','crisis-workspace.js','crisis-workspace.css','commodity.html','commodity.js','commodity.css','market-hub.html','market-hub.js','market-hub.css','source-control.html','source-control.js','source-control.css','transmission-lab.html','transmission-lab.js','transmission-lab.css','fred-research.html','fred-research.js','fred-research.css','evidence-ledger.html','evidence-ledger.js','evidence-ledger.css','geo-exposure.html','geo-exposure.js','geo-exposure.css','exposure-review.html','exposure-review.js','exposure-review.css','event-portal.html','event-portal.js','event-portal.css'];
test('static preview packages only public files and never .env or server code', async () => {
  execFileSync(process.execPath, [join(ROOT,'scripts/build-static.mjs')], {cwd:ROOT, stdio:'pipe'});
  const files=(await readdir(join(ROOT,'dist'))).sort();
  assert.deepEqual(files,[...PUBLIC].sort());
  assert(!files.some(f => f.startsWith('.env') || f.includes('server') || f.includes('secret')));
});
test('local and Vercel ignore rules exclude private environment files', async () => {
  const git=await readFile(join(ROOT,'.gitignore'),'utf8');
  const vercel=await readFile(join(ROOT,'.vercelignore'),'utf8');
  assert.match(git,/^\.env$/m);assert.match(git,/^\.env\.\*$/m);
  assert.match(vercel,/^\.env$/m);assert.match(vercel,/^\.env\.\*$/m);
});
