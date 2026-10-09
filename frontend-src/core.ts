export interface Context {
  kind?: string;
  settings?: { id?: string; page?: string };
  surface?: { bindingRevision?: string };
  workspace?: { binding?: { projectId?: string; sessionId?: string; assignmentId?: string; runId?: string }; [key: string]: unknown };
}
export interface Api {
  context: Context;
  onTheme(callback: (theme: Record<string, string>) => void): { dispose(): void };
  diagnostics(): Promise<unknown>;
  list(): Promise<unknown>;
  get(jobId: string): Promise<unknown>;
  events(jobId: string): Promise<unknown>;
  evidence(id: string): Promise<unknown>;
  report(jobId: string): Promise<unknown>;
  download(jobId: string): Promise<unknown>;
  readSettings(): Promise<unknown>;
  writeSettings(value: Settings): Promise<unknown>;
}
export type Tone = 'neutral' | 'success' | 'warning' | 'danger';
export const RESULTS: Record<string, [string, Tone]> = {
  vulnerable: ['确认风险', 'danger'], candidate: ['候选', 'warning'],
  not_vulnerable: ['未发现', 'success'], not_applicable: ['不适用', 'neutral'],
  not_run: ['未运行', 'neutral'], blocked: ['已阻断', 'warning'], error: ['错误', 'danger'],
};
export const JOB_STATUS: Record<string, string> = {
  queued: '排队中', running: '运行中', completed: '已完成', cancelled: '已取消', error: '错误',
};
export const SEVERITIES: Record<string, string> = {
  critical: '严重', high: '高', medium: '中', low: '低', informational: '信息',
};
export interface JobRow {
  job_id: string; status: string; profile: string; created_at: string;
  started_at: string | null; finished_at: string | null;
}
export interface Token {
  token_fingerprint: string; header: Record<string, unknown>; payload: Record<string, unknown>;
  signature: string; algorithm: string | null; key_id: string | null;
}
export interface TestResult {
  token_fingerprint: string; test_id: string; category: string; cve: string | null;
  status: string; severity: string; confidence: string;
  details: Record<string, unknown>; evidence_id: string | null;
}
export interface WordlistRun {
  token_fingerprint: string; wordlist_id: string; candidates: number; matched: 0 | 1; invalid_utf8: number;
}
export interface Job extends JobRow {
  project_id: string; tokens: Token[]; tests: TestResult[]; wordlist_runs: WordlistRun[];
}
export interface EventRow { sequence: number; stage: string; status: string; message: string; created_at: string }
export interface Diagnostics { sidecar: string; jwt_tool_version: string; rockyou_available: boolean; rockyou_archive_bytes: number }
export interface UiError { message: string; operationId: string }
export interface Filters { status: string; severity: string; algorithm: string; cve: string }
export const emptyFilters = (): Filters => ({ status: 'all', severity: 'all', algorithm: 'all', cve: '' });
export interface Settings extends Record<string, unknown> {
  wordlists: string[]; rockyou_enabled: boolean; custom_wordlists: string[];
  max_concurrent_jobs: number; max_requests_per_job: number; rate_limit: number;
  request_timeout_seconds: number; redirect_policy: 'disabled' | 'same-origin';
  tls_verify: boolean; evidence_redaction: 'strict' | 'standard' | 'none';
  retention: 'permanent'; jwks_allowlist: string[]; listener_enabled: false; public_key: string;
}
// These defaults are the account's first-use contract from settings.py.
export const DEFAULTS: Settings = {
  wordlists: ['jwt-common', 'rockyou', 'custom'], rockyou_enabled: true, custom_wordlists: [],
  max_concurrent_jobs: 2, max_requests_per_job: 100, rate_limit: 10, request_timeout_seconds: 10,
  redirect_policy: 'disabled', tls_verify: true, evidence_redaction: 'standard', retention: 'permanent',
  jwks_allowlist: [], listener_enabled: false, public_key: '',
};
export interface Draft {
  common: boolean; rockyou: boolean; paths: string; rate: string; timeout: string;
  concurrency: string; limit: string; redirect: string; tls: boolean; redaction: string; publicKey: string;
}
export const operation = () => crypto.randomUUID();
export function failure(event: string, error: unknown, operationId: string): UiError {
  console.error(event, { operation_id: operationId, outcome: 'failed' });
  return { message: error instanceof Error ? error.message : String(error), operationId };
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function object(value: unknown, label: string) {
  if (!record(value)) throw new Error(`${label}格式无效`);
  return value;
}
function string(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && !value)) throw new Error(`${label}格式无效`);
  return value;
}
function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}
function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`${label}格式无效`);
  return Number(value);
}
function list<T>(value: unknown, label: string, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`${label}格式无效`);
  return value.map(parse);
}
function row(value: unknown): JobRow {
  const v = object(value, '任务');
  return {
    job_id: string(v.job_id, '任务标识', true), status: string(v.status, '任务状态', true),
    profile: string(v.profile, '任务模式', true), created_at: string(v.created_at, '创建时间', true),
    started_at: nullableString(v.started_at, '开始时间'), finished_at: nullableString(v.finished_at, '完成时间'),
  };
}
export function parseJobs(value: unknown) {
  const items = list(object(value, '任务列表').items, '任务列表', row);
  if (new Set(items.map(item => item.job_id)).size !== items.length) throw new Error('任务列表包含重复标识');
  return items;
}
export function parseJob(value: unknown, projectId: string, jobId: string): Job {
  const v = object(value, '任务详情');
  if (v.project_id !== projectId || v.job_id !== jobId) throw new Error('任务详情的项目或任务归属无效');
  return { ...row(v), project_id: projectId,
    tokens: list(v.tokens, 'JWT 解析', item => {
      const t = object(item, 'JWT 解析');
      return { token_fingerprint: string(t.token_fingerprint, 'JWT 指纹', true), header: object(t.header, 'JWT Header'),
        payload: object(t.payload, 'JWT Payload'), signature: string(t.signature, 'JWT 签名'),
        algorithm: nullableString(t.algorithm, 'JWT 算法'), key_id: nullableString(t.key_id, 'JWT Key ID') };
    }),
    tests: list(v.tests, '测试结果', item => {
      const t = object(item, '测试结果');
      return { token_fingerprint: string(t.token_fingerprint, '测试 JWT 指纹'), test_id: string(t.test_id, '测试标识', true),
        category: string(t.category, '测试类别'), cve: nullableString(t.cve, 'CVE'), status: string(t.status, '测试状态', true),
        severity: string(t.severity, '测试级别', true), confidence: string(t.confidence, '测试置信度'),
        details: object(t.details, '测试说明'), evidence_id: nullableString(t.evidence_id, '证据标识') };
    }),
    wordlist_runs: list(v.wordlist_runs, '字典记录', item => {
      const t = object(item, '字典记录');
      return { token_fingerprint: string(t.token_fingerprint, '字典 JWT 指纹'), wordlist_id: string(t.wordlist_id, '字典标识', true),
        candidates: integer(t.candidates, '候选数'), matched: integer(t.matched, '匹配状态', 0, 1) as 0 | 1,
        invalid_utf8: integer(t.invalid_utf8, '无效编码数') };
    }),
  };
}
export function parseEvents(value: unknown): EventRow[] {
  const v = object(value, '任务阶段');
  let previous = 0;
  const items = list(v.items, '任务阶段', item => {
    const t = object(item, '任务阶段');
    const sequence = integer(t.sequence, '阶段顺序', 1);
    if (sequence <= previous) throw new Error('任务阶段顺序无效');
    previous = sequence;
    return { sequence, stage: string(t.stage, '任务阶段'), status: string(t.status, '阶段状态'),
      message: string(t.message, '阶段说明'), created_at: string(t.created_at, '阶段时间', true) };
  });
  if (v.next_cursor !== previous) throw new Error('任务阶段游标无效');
  return items;
}
export function parseDiagnostics(value: unknown): Diagnostics {
  const v = object(value, '运行状态');
  if (typeof v.rockyou_available !== 'boolean') throw new Error('字典状态无效');
  return { sidecar: string(v.sidecar, 'Sidecar 状态', true), jwt_tool_version: string(v.jwt_tool_version, 'jwt_tool 版本', true),
    rockyou_available: v.rockyou_available, rockyou_archive_bytes: integer(v.rockyou_archive_bytes, '字典大小') };
}
export function parseEvidence(value: unknown, id: string, jobId: string) {
  const v = object(value, '证据');
  if (v.evidence_id !== id || v.job_id !== jobId || typeof v.test_id !== 'string' || !record(v.evidence))
    throw new Error('证据格式或任务归属无效');
  return v;
}
export function parseReport(value: unknown) {
  const v = object(value, '报告');
  if (v.format !== 'markdown' || typeof v.report !== 'string') throw new Error('Markdown 报告格式无效');
  return v.report;
}
export function contextKey(context: Context) {
  const id = context.workspace?.binding?.projectId, revision = context.surface?.bindingRevision;
  if (typeof id !== 'string' || !id.trim()) throw new Error('JWT 分析需要有效的项目上下文');
  if (typeof revision !== 'string' || !revision.trim()) throw new Error('JWT 分析需要有效的 Host 绑定版本');
  return { projectId: id, key: JSON.stringify([id, revision]) };
}
export function parseSettings(value: unknown): Settings {
  const response = object(value, '账号设置');
  if (typeof response.found !== 'boolean') throw new Error('账号设置读取状态无效');
  const stored = response.found ? object(response.value, '账号设置') : {};
  const settings = { ...DEFAULTS, ...stored };
  const s = settings as Record<string, unknown>;
  for (const key of ['rockyou_enabled', 'tls_verify', 'listener_enabled']) {
    if (typeof s[key] !== 'boolean') throw new Error(`${key} 必须是布尔值`);
  }
  for (const key of ['wordlists', 'custom_wordlists', 'jwks_allowlist']) {
    list(s[key], key, item => string(item, key));
  }
  if (settings.wordlists.some(item => !['jwt-common', 'rockyou', 'custom'].includes(item))) throw new Error('字典选择无效');
  integer(s.max_concurrent_jobs, '最大并发任务', 1, 8);
  integer(s.max_requests_per_job, '主动请求上限', 1, 100);
  integer(s.rate_limit, '主动请求速率', 1, 60);
  integer(s.request_timeout_seconds, '请求超时', 1, 60);
  if (!['disabled', 'same-origin'].includes(settings.redirect_policy)) throw new Error('重定向策略无效');
  if (!['strict', 'standard', 'none'].includes(settings.evidence_redaction)) throw new Error('证据脱敏策略无效');
  if (settings.retention !== 'permanent' || settings.listener_enabled || settings.jwks_allowlist.length)
    throw new Error('数据保留或外部监听配置无效');
  if (typeof settings.public_key !== 'string' || settings.public_key.length > 65536) throw new Error('公钥必须是最多 64 KiB 的 PEM 文本');
  return settings;
}
export function settingsDraft(s: Settings): Draft {
  return { common: s.wordlists.includes('jwt-common'), rockyou: s.rockyou_enabled, paths: s.custom_wordlists.join('\n'),
    rate: String(s.rate_limit), timeout: String(s.request_timeout_seconds), concurrency: String(s.max_concurrent_jobs),
    limit: String(s.max_requests_per_job), redirect: s.redirect_policy, tls: s.tls_verify, redaction: s.evidence_redaction, publicKey: s.public_key };
}
export function draftErrors(d: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const bounds: Array<[keyof Draft, number, number]> = [['rate', 1, 60], ['timeout', 1, 60], ['concurrency', 1, 8], ['limit', 1, 100]];
  for (const [key, min, max] of bounds) {
    const raw = String(d[key]).trim(), n = Number(raw);
    if (!raw || !Number.isSafeInteger(n) || n < min || n > max) errors[key] = `请输入 ${min} 到 ${max} 的整数。`;
  }
  if (!['disabled', 'same-origin'].includes(d.redirect)) errors.redirect = '请选择有效的重定向策略。';
  if (!['strict', 'standard', 'none'].includes(d.redaction)) errors.redaction = '请选择有效的脱敏策略。';
  if (d.publicKey.length > 65536) errors.publicKey = '公钥最多为 64 KiB。';
  return errors;
}
export function saveSettings(previous: Settings, d: Draft): Settings {
  if (Object.keys(draftErrors(d)).length) throw new Error('请修正标出的设置字段。');
  const paths = d.paths.split('\n').map(path => path.trim()).filter(Boolean);
  const wordlists = [d.common ? 'jwt-common' : null, d.rockyou ? 'rockyou' : null, paths.length ? 'custom' : null]
    .filter((item): item is string => item !== null);
  return { ...previous, wordlists, rockyou_enabled: d.rockyou, custom_wordlists: paths,
    rate_limit: Number(d.rate), request_timeout_seconds: Number(d.timeout), max_concurrent_jobs: Number(d.concurrency),
    max_requests_per_job: Number(d.limit), redirect_policy: d.redirect as Settings['redirect_policy'],
    tls_verify: d.tls, evidence_redaction: d.redaction as Settings['evidence_redaction'], public_key: d.publicKey,
    retention: 'permanent', listener_enabled: false };
}
export function resultInfo(status: string): [string, Tone] { return RESULTS[status] ?? [status, 'neutral']; }
export function display(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : typeof value === 'string' ? value : JSON.stringify(value);
}
export function time(value: string) { return new Date(value).toLocaleString('zh-CN'); }
