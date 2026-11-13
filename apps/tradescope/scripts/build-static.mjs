/** Build a static-only preview using an explicit public-file allowlist.
 * This intentionally does not copy .env, backend source, tests, or package metadata.
 * A separate, secured API deployment is required for live data.
 */
import {copyFile, mkdir, rm, readdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEST = join(ROOT, 'dist');
export const PUBLIC_ASSETS = Object.freeze([
  'index.html', 'styles.css', 'app.js', 'live-adapter.js',
  'event-workspace.js', 'intelligence.css', 'case-workspace.js', 'cases.css',
  'assistant-workspace.js', 'theme-controls.js', 'terminal-theme.css', 'workspace-nav.js',
  'research-workspace.js','research.css','research-operations.js','research-operations.css','discovery-workspace.js','discovery-workspace.css','monitor-candles.js','monitor-candles.css','crisis-workspace.js','crisis-workspace.css','commodity.html','commodity.js','commodity.css','market-hub.html','market-hub.js','market-hub.css','source-control.html','source-control.js','source-control.css','transmission-lab.html','transmission-lab.js','transmission-lab.css'
]);
await rm(DEST, {recursive: true, force: true});
await mkdir(DEST, {recursive: true});
for (const name of PUBLIC_ASSETS) await copyFile(join(ROOT,name), join(DEST,name));
const actual = await readdir(DEST);
if (actual.length !== PUBLIC_ASSETS.length || actual.some(name => !PUBLIC_ASSETS.includes(name))) {
  throw new Error('Static build contains an unexpected file');
}
console.log(`Static preview ready: ${DEST} (${actual.length} public files, no credentials)`);
