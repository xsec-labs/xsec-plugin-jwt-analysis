import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({absWorkingDir:root, entryPoints:['frontend-src/core.ts'], bundle:true,
  platform:'node', format:'esm', write:false});
const core = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const bridge = await build({absWorkingDir:root, entryPoints:['frontend-src/host-api.ts'], bundle:true,
  platform:'node', format:'esm', write:false});
const {mcpResult} = await import('data:text/javascript;base64,' + Buffer.from(bridge.outputFiles[0].text).toString('base64'));
const data = JSON.parse(execFileSync(process.env.XSEC_JWT_TEST_PYTHON || 'python3', ['tests/frontend_contract_data.py'],
  {cwd:root, encoding:'utf8', timeout:60_000, maxBuffer:4 * 1024 * 1024}));
assert.equal(core.parseJobs(data.jobs).length,4);
assert.deepEqual(core.parseJobs(data.emptyJobs),[]);
assert.equal(core.parseJob(data.job,data.projectId,data.jobId).status,'completed');
assert.deepEqual(data.otherJobs.map(job=>core.parseJob(job,data.projectId,job.job_id).status),['error','cancelled','error']);
assert.ok(core.parseEvents(data.events).length>0);
assert.equal(core.parseEvidence(data.evidence,data.evidence.evidence_id,data.jobId).evidence.secret,'[REDACTED]');
assert.ok(core.parseReport(data.report).includes(data.jobId));
assert.equal(core.parseDiagnostics(data.diagnostics).sidecar,'ready');
assert.throws(()=>core.parseDiagnostics(data.mcpDiagnostics),/字典状态无效/);
assert.deepEqual(core.parseDiagnostics(mcpResult(data.mcpDiagnostics)),data.diagnostics);
assert.throws(()=>mcpResult(data.mcpUnknownTool),/unknown JWT analysis tool/);
assert.throws(()=>mcpResult({...data.mcpDiagnostics,isError:undefined}),/响应格式无效/);
assert.throws(()=>mcpResult({...data.mcpDiagnostics,content:[]}),/响应格式无效/);
assert.throws(()=>mcpResult({...data.mcpDiagnostics,content:[{...data.mcpDiagnostics.content[0],text:'not-json'}]}),SyntaxError);
assert.deepEqual(core.DEFAULTS,data.settings);
assert.deepEqual(core.parseSettings({found:false}),data.settings);
assert.deepEqual(core.parseSettings({found:true,value:{rate_limit:60}}),data.partialSettings);
assert.throws(()=>core.parseJob(data.job,'other-project',data.jobId),/归属无效/);
assert.throws(()=>core.parseEvidence(data.evidence,data.evidence.evidence_id,'other-job'),/归属无效/);
assert.throws(()=>core.parseJobs({items:[data.jobs.items[0],data.jobs.items[0]]}),/重复标识/);
assert.throws(()=>core.parseSettings({found:true,value:{tls_verify:'true'}}),/布尔值/);
assert.throws(()=>core.parseSettings({found:true,value:{listener_enabled:true}}),/外部监听配置无效/);
assert.throws(()=>core.parseEvents({...data.events,next_cursor:0}),/游标无效/);
assert.deepEqual(core.contextKey({workspace:{binding:{projectId:data.projectId}},surface:{bindingRevision:'revision-1'}}),
  {projectId:data.projectId,key:JSON.stringify([data.projectId,'revision-1'])});
assert.throws(()=>core.contextKey({workspace:{binding:{projectId:data.projectId}}}),/绑定版本/);
console.log('JWT frontend contracts passed: real SQLite, engine, evidence, reports, settings and rejected boundaries');
