import { useSyncExternalStore, type ReactNode } from 'react';
import { Badge, Checkbox, ControlButton, Drawer, EmptyState, ErrorState, Field, Input, PageHeader, Section, Select,
  Spinner, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea, Toolbar } from '@xsec/ui-react';
import { Download, FileText, RefreshCw } from 'lucide-react';
import { display, JOB_STATUS, RESULTS, resultInfo, SEVERITIES, time, type Draft, type UiError } from './core';
import type { SettingsController } from './settings';
import type { WorkspaceController } from './workspace';

function Failure({ error, title, action }: { error: UiError; title: string; action?: ReactNode }) {
  return <ErrorState title={title} description={error.message} errorId={error.operationId} action={action}/>;
}
function Json({ value, label }: { value: unknown; label: string }) {
  return <pre className="jwt-json" aria-label={label} tabIndex={0}>{JSON.stringify(value, null, 2)}</pre>;
}
export function WorkspaceView({ controller }: { controller: WorkspaceController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.snapshot), job = s.job;
  const refresh = <ControlButton onClick={() => void controller.refresh()} disabled={s.loading}><RefreshCw size={16} aria-hidden="true"/>刷新</ControlButton>;
  const jobOptions = s.jobs.map(item => ({ value: item.job_id, label: `${item.job_id} · ${JOB_STATUS[item.status] ?? item.status}` }));
  if (job && !jobOptions.some(item => item.value === job.job_id)) jobOptions.unshift({ value: job.job_id, label: `${job.job_id} · ${JOB_STATUS[job.status] ?? job.status}` });
  const algorithms = new Map(job?.tokens.map(token => [token.token_fingerprint, token.algorithm]));
  const algorithmValues = new Set(job?.tokens.map(token => token.algorithm).filter((value): value is string => typeof value === 'string' && value.length > 0));
  if (s.filters.algorithm !== 'all') algorithmValues.add(s.filters.algorithm);
  const tests = job?.tests.filter(test => (s.filters.status === 'all' || test.status === s.filters.status) &&
    (s.filters.severity === 'all' || test.severity === s.filters.severity) &&
    (s.filters.algorithm === 'all' || algorithms.get(test.token_fingerprint) === s.filters.algorithm) &&
    (!s.filters.cve || (test.cve !== null && test.cve.toLowerCase().includes(s.filters.cve.toLowerCase()))));
  const counts = new Map<string, number>();
  for (const test of job?.tests ?? []) counts.set(test.status, (counts.get(test.status) ?? 0) + 1);
  const candidates = job?.tests.filter(test => ['candidate', 'vulnerable'].includes(test.status));
  const detail = s.detail;
  return <main className="jwt-page">
    <PageHeader title="JWT 分析" description="查看项目任务、解析结果与安全测试证据。" actions={refresh}/>
    {s.diagnostics ? <div className="jwt-runtime" aria-label="运行环境"><Badge tone={s.diagnostics.sidecar === 'ready' ? 'success' : 'warning'}>Sidecar {s.diagnostics.sidecar}</Badge>
      <span>jwt_tool {s.diagnostics.jwt_tool_version}</span><Badge tone={s.diagnostics.rockyou_available ? 'neutral' : 'warning'}>RockYou {s.diagnostics.rockyou_available ? '已就绪' : '缺失'}</Badge></div> : null}
    <Toolbar className="jwt-job-toolbar"><Field label="分析任务">{props => <Select {...props} placeholder="选择任务" options={jobOptions} value={s.selected || null}
      disabled={jobOptions.length === 0} onValueChange={value => { if (value !== null) controller.select(value); }}/>}</Field>
      <ControlButton disabled={!job} onClick={event => { if (job) void controller.openDetail('report', job.job_id, event.currentTarget); }}><FileText size={16} aria-hidden="true"/>报告预览 / 下载</ControlButton>
    </Toolbar>
    {s.error ? <Failure error={s.error} title="JWT 任务读取失败" action={refresh}/> : !job && s.loading ? <Spinner label="正在读取 JWT 分析任务…"/> : !job ?
      <EmptyState title="当前项目还没有 JWT 分析任务" description="将 JWT、抓包引用或项目文件交给 Agent 创建分析任务。"/> : <div aria-busy={s.loading}>
      <div className="jwt-job-meta"><Badge tone={job.status === 'error' ? 'danger' : job.status === 'completed' ? 'success' : 'neutral'}>{JOB_STATUS[job.status] ?? job.status}</Badge>
        <span>{job.profile === 'passive' ? '被动分析' : job.profile === 'full' ? '完整分析' : job.profile}</span><time dateTime={job.created_at}>创建于 {time(job.created_at)}</time>
        {s.loading ? <span role="status">正在更新…</span> : null}</div>
      <section className="jwt-summary" aria-label="测试结果统计">{['vulnerable', 'candidate', 'not_vulnerable', 'not_run', 'blocked', 'error'].map(status =>
        <div className="jwt-stat" key={status}><Badge tone={resultInfo(status)[1]}>{resultInfo(status)[0]}</Badge><strong>{counts.get(status) ?? 0}</strong></div>)}</section>
      <div className="jwt-severity-counts" aria-label="确认风险级别">{Object.entries(SEVERITIES).map(([value, label]) => <span key={value}>{label} {job.tests.filter(test => test.status === 'vulnerable' && test.severity === value).length}</span>)}</div>
      <Section title="JWT 解析">{job.tokens.length ? job.tokens.map(token => <article className="jwt-token" key={token.token_fingerprint}>
        <p className="jwt-fingerprint">{token.token_fingerprint}</p><div className="jwt-token-columns">
          <div><h3>Header</h3><Json value={token.header} label="JWT Header"/></div>
          <div><h3>Payload</h3><Json value={token.payload} label="JWT Payload"/></div>
          <div><h3>签名与算法</h3><Json value={{ signature: token.signature, algorithm: token.algorithm, key_id: token.key_id }} label="JWT 签名与算法"/></div>
        </div></article>) : <EmptyState title="暂无已解析的 JWT"/>}</Section>
      <Section title="弱密钥 / 空密钥"><Json value={{ findings: job.tests.filter(test => test.test_id === 'weak-secret'), wordlist_runs: job.wordlist_runs }} label="弱密钥与字典运行记录"/></Section>
      <Section title="候选发现"><p className="jwt-note">候选结果需要结合请求差异和 canary 证据复核，确认后再写入正式发现。</p>
        {candidates?.length ? <Json value={candidates.map(test => ({ test_id: test.test_id, cve: test.cve, status: test.status, severity: test.severity, confidence: test.confidence, evidence_id: test.evidence_id }))} label="候选发现"/> : <EmptyState title="暂无候选发现"/>}</Section>
      <Section title="安全测试矩阵"><Toolbar className="jwt-test-filters">
        <Field label="状态">{props => <Select {...props} options={[{ value: 'all', label: '全部状态' }, ...Object.entries(RESULTS).map(([value, [label]]) => ({ value, label }))]}
          value={s.filters.status} onValueChange={value => { if (value !== null) controller.filter({ status: value }); }}/>}</Field>
        <Field label="严重性">{props => <Select {...props} options={[{ value: 'all', label: '全部级别' }, ...Object.entries(SEVERITIES).map(([value, label]) => ({ value, label }))]}
          value={s.filters.severity} onValueChange={value => { if (value !== null) controller.filter({ severity: value }); }}/>}</Field>
        <Field label="算法">{props => <Select {...props} options={[{ value: 'all', label: '全部算法' }, ...[...algorithmValues].map(value => ({ value, label: value }))]}
          value={s.filters.algorithm} onValueChange={value => { if (value !== null) controller.filter({ algorithm: value }); }}/>}</Field>
        <Field label="CVE">{props => <Input {...props} type="search" placeholder="筛选 CVE" value={s.filters.cve} onChange={event => controller.filter({ cve: event.target.value })}/>}</Field>
      </Toolbar><p className="jwt-note" role="status">显示 {tests?.length ?? 0} / {job.tests.length} 项测试</p>
      {tests?.length ? <div className="jwt-table-scroll" role="region" aria-label="安全测试结果" tabIndex={0}><Table>
        <TableHead><TableRow>{['测试', 'CVE', '状态', '级别', '说明', '证据'].map(label => <TableHeader key={label}>{label}</TableHeader>)}</TableRow></TableHead>
        <TableBody>{tests.map(test => <TableRow key={`${test.token_fingerprint}:${test.test_id}`}>
          <TableCell className="jwt-test-id">{test.test_id}</TableCell><TableCell>{display(test.cve)}</TableCell>
          <TableCell><Badge tone={resultInfo(test.status)[1]}>{resultInfo(test.status)[0]}</Badge></TableCell>
          <TableCell>{SEVERITIES[test.severity] ?? test.severity}</TableCell><TableCell className="jwt-test-reason">{display(test.details.reason)}</TableCell>
          <TableCell>{test.evidence_id ? <ControlButton variant="ghost" aria-label={`查看 ${test.test_id} 的证据`} onClick={event => void controller.openDetail('evidence', test.evidence_id!, event.currentTarget)}>查看</ControlButton> : '—'}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div> : <EmptyState title={job.tests.length ? '没有符合筛选条件的测试' : '暂无安全测试结果'}/>}</Section>
      <Section title="任务阶段">{s.events.length ? <ol className="jwt-events">{s.events.map(event => <li key={event.sequence}><div><strong>{event.stage}</strong><Badge>{event.status}</Badge></div>
        <p>{event.message}</p><time dateTime={event.created_at}>{time(event.created_at)}</time></li>)}</ol> : <EmptyState title="暂无阶段记录"/>}
        {s.events.length === 200 ? <p className="jwt-note">当前显示前 200 条阶段记录。</p> : null}</Section>
    </div>}
    <Drawer open={Boolean(detail)} onOpenChange={open => { if (!open) controller.closeDetail(); }} title={detail?.kind === 'report' ? 'JWT 分析报告' : '分析证据'}
      className="jwt-detail-drawer" finalFocus={() => controller.detailFocus}>
      {detail?.loading ? <Spinner label="正在读取详情…"/> : detail?.error ? <Failure error={detail.error} title="详情未完成" action={<ControlButton onClick={() => controller.retryDetail()}>重新读取</ControlButton>}/> : detail?.kind === 'report' && typeof detail.content === 'string' ?
        <><ControlButton disabled={detail.downloading} onClick={() => void controller.downloadReport()}><Download size={16} aria-hidden="true"/>{detail.downloading ? '正在导出…' : '下载 Markdown'}</ControlButton>
          {detail.downloadLocation ? <p role="status">已导出：{detail.downloadLocation}</p> : null}<pre className="jwt-report" tabIndex={0}>{detail.content}</pre></> : detail?.content ?
        <Json value={detail.content} label="分析证据"/> : null}
    </Drawer>
  </main>;
}
export function SettingsView({ controller }: { controller: SettingsController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.snapshot), d = s.draft;
  const edit = <K extends keyof Draft>(key: K, value: Draft[K]) => controller.edit({ [key]: value });
  const disabled = s.saving || s.loading;
  const numbers: Array<[keyof Pick<Draft, 'rate' | 'timeout' | 'concurrency' | 'limit'>, string, number, number]> = [
    ['rate', '主动请求速率（每分钟）', 1, 60], ['timeout', '请求超时（秒）', 1, 60],
    ['concurrency', '最大并发任务', 1, 8], ['limit', '每任务主动请求上限', 1, 100],
  ];
  return <main className="jwt-settings"><PageHeader title="JWT 分析设置" description="设置保存在当前账号，运行状态在项目分析面板显示。"
    actions={<ControlButton disabled={disabled} onClick={() => void controller.read()}><RefreshCw size={16} aria-hidden="true"/>重新读取设置</ControlButton>}/>
    {s.error ? <Failure error={s.error} title="JWT 设置未完成" action={!d ? <ControlButton onClick={() => void controller.read()}>重新读取</ControlButton> : undefined}/> : null}
    {s.loading ? <Spinner label="正在读取账号设置…"/> : null}
    {d ? <div role="form" aria-label="JWT 分析设置" className="jwt-settings-form" onKeyDown={event => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); void controller.save(); }
    }}>
      <Section title="密钥字典"><Checkbox label="启用 jwt-common 字典" checked={d.common} disabled={disabled} onCheckedChange={value => edit('common', value)}/>
        <Checkbox label="启用 RockYou 字典" checked={d.rockyou} disabled={disabled} onCheckedChange={value => edit('rockyou', value)}/>
        <Field label="自定义字典路径" hint="每行一个本机可读的 UTF-8 文本文件路径。RockYou 压缩文件在分析时逐行读取。">{props =>
          <Textarea {...props} rows={4} value={d.paths} disabled={disabled} onChange={event => edit('paths', event.target.value)}/>}</Field>
      </Section>
      <Section title="请求与任务"><div className="jwt-setting-grid">{numbers.map(([key, label, min, max]) => <Field key={key} label={label} error={s.fields[key]} hint={`${min}–${max}`}>{props =>
        <Input {...props} type="number" min={min} max={max} step={1} value={d[key]} disabled={disabled} onChange={event => edit(key, event.target.value)}/>}</Field>)}</div>
        <Field label="重定向策略" error={s.fields.redirect}>{props => <Select {...props} options={[{ value: 'disabled', label: '不跟随' }, { value: 'same-origin', label: '仅跟随同源，最多 3 次' }]}
          value={d.redirect} disabled={disabled} onValueChange={value => { if (value !== null) edit('redirect', value); }}/>}</Field>
        <Switch label="验证 TLS 证书" checked={d.tls} disabled={disabled} onCheckedChange={value => edit('tls', value)}/>
      </Section>
      <Section title="证据与公钥"><Field label="证据脱敏" error={s.fields.redaction}>{props => <Select {...props} options={[{ value: 'strict', label: '严格' }, { value: 'standard', label: '标准' }, { value: 'none', label: '关闭' }]}
        value={d.redaction} disabled={disabled} onValueChange={value => { if (value !== null) edit('redaction', value); }}/>}</Field>
        <Field label="RS/HS 混淆测试公钥" hint="PEM 格式，可留空。" error={s.fields.publicKey}>{props => <Textarea {...props} rows={5} value={d.publicKey} disabled={disabled} onChange={event => edit('publicKey', event.target.value)}/>}</Field>
      </Section>
      <footer className="jwt-settings-footer"><ControlButton variant="primary" data-action="save-settings" disabled={disabled} onClick={() => void controller.save()}>{s.saving ? '正在保存…' : '保存设置'}</ControlButton>
        {s.saved ? <p role="status">已保存并确认账号设置。</p> : null}</footer>
    </div> : null}
  </main>;
}
