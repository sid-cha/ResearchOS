import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=async p=>readFile(new URL(p,import.meta.url),'utf8');
test('Docker image excludes secrets and private journal while retaining nonroot health probe',async()=>{
 const [file,ignore]=await Promise.all([read('../Dockerfile'),read('../.dockerignore')]);
 assert.match(file,/FROM node:22/);
 assert.match(file,/USER node/);
 assert.match(file,/HEALTHCHECK/);
 assert.match(file,/api\/health/);
 assert.match(ignore,/^\.env$/m);
 assert.match(ignore,/^\.env\.\*$/m);
 assert.match(ignore,/^\.local-data\/$/m);
 assert.match(ignore,/^node_modules\/$/m);
 assert(!file.includes('APCA_API_SECRET_KEY'));
});
test('Compose publishes only host loopback, persists local data and forces capture disabled',async()=>{
 const compose=await read('../../../compose.tradescope.yml');
 assert.match(compose,/127\.0\.0\.1:8000:8000/);
 assert.match(compose,/read_only: true/);
 assert.match(compose,/no-new-privileges:true/);
 assert.match(compose,/tradescope_local_data:\/app\/\.local-data/);
 assert.match(compose,/MARKET_CAPTURE_ENABLED: "false"/);
 assert.match(compose,/MARKET_CAPTURE_RIGHTS_CONFIRMED: "false"/);
 assert.match(compose,/required: false/);
 assert(!compose.includes('RpBNMLBRJt6wn'));
});
test('local capture release remains explicit opt-in in documentation and sample environment',async()=>{
 const [env,guide]=await Promise.all([read('../.env.example'),read('../docs/V030_V031_CAPTURE_DOCKER.md')]);
 assert.match(env,/# MARKET_CAPTURE_ENABLED=true/);
 assert.match(env,/# MARKET_CAPTURE_RIGHTS_CONFIRMED=true/);
 assert.match(guide,/provider retention-rights acknowledgement|provider retention rights|provider permits retaining/i);
 assert.match(guide,/INCOMPLETE|INTERRUPTED_UNSEALED/);
});
