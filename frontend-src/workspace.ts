import { contextKey, emptyFilters, failure, operation, parseDiagnostics, parseEvents, parseEvidence, parseJob, parseJobs, parseReport,
  record, type Api, type Context, type Diagnostics, type EventRow, type Filters, type Job, type JobRow, type UiError } from './core';

export interface Detail {
  kind: 'evidence' | 'report'; id: string; jobId: string; loading: boolean;
  content?: Record<string, unknown> | string; error?: UiError;
  downloading?: boolean; downloadLocation?: string;
}
export interface WorkspaceState {
  jobs: JobRow[]; selected: string; job?: Job; events: EventRow[]; diagnostics?: Diagnostics;
  loading: boolean; error?: UiError; filters: Filters; detail?: Detail;
}
export class WorkspaceController {
  private state: WorkspaceState = { jobs: [], selected: '', events: [], loading: true, filters: emptyFilters() };
  private listeners = new Set<() => void>();
  private active = false;
  private key = '';
  private projectId = '';
  private version = 0;
  private detailVersion = 0;
  private timer?: number;
  detailFocus: HTMLElement | null = null;
  constructor(private api: Api) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private set(change: Partial<WorkspaceState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  private stopTimer() { if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined; } }
  private current(version: number) { return this.active && version === this.version; }
  async begin(context: Context) {
    if (this.active) throw new Error('JWT 工作区已经挂载');
    this.active = true;
    console.info('jwt.workspace.mount', { operation_id: operation() });
    this.set({ selected: new URLSearchParams(location.search).get('job') ?? '' });
    await this.update(context, true);
  }
  async update(context: Context, initial = false) {
    if (!this.active) throw new Error('JWT 工作区尚未挂载');
    try {
      const binding = contextKey(context);
      if (binding.key !== this.key) {
        this.version++;
        this.stopTimer();
        this.closeDetail();
        this.projectId = binding.projectId;
        this.key = binding.key;
        this.set({ jobs: [], selected: initial ? this.state.selected : '', job: undefined, events: [],
          diagnostics: undefined, error: undefined, loading: true, filters: emptyFilters() });
      }
    } catch (error) {
      this.version++;
      this.stopTimer();
      this.closeDetail();
      this.key = '';
      this.projectId = '';
      this.set({ jobs: [], job: undefined, events: [], diagnostics: undefined, loading: false,
        error: failure('jwt.context.failed', error, operation()) });
      return;
    }
    await this.refresh(false);
  }
  async refresh(manual = true) {
    if (!this.active || !this.projectId) return;
    this.stopTimer();
    const version = ++this.version, operationId = operation(), projectId = this.projectId;
    let selected = this.state.selected;
    this.set({ loading: true, error: undefined });
    if (manual) console.info('jwt.refresh.started', { operation_id: operationId });
    try {
      let diagnostics = this.state.diagnostics;
      let jobs: JobRow[];
      if (manual || !diagnostics) {
        const [jobResult, diagnosticResult] = await Promise.all([this.api.list(), this.api.diagnostics()]);
        jobs = parseJobs(jobResult);
        diagnostics = parseDiagnostics(diagnosticResult);
      } else jobs = parseJobs(await this.api.list());
      if (!this.current(version)) return;
      if (!selected && jobs.length) selected = jobs[0].job_id;
      let job: Job | undefined, events: EventRow[] = [];
      if (selected) {
        const [jobResult, eventResult] = await Promise.all([this.api.get(selected), this.api.events(selected)]);
        if (!this.current(version)) return;
        job = parseJob(jobResult, projectId, selected);
        events = parseEvents(eventResult);
      }
      if (!this.current(version)) return;
      const previousStatus = this.state.job?.status;
      this.set({ jobs, selected, job, events, diagnostics, loading: false, error: undefined });
      if (manual) console.info('jwt.refresh.completed', { operation_id: operationId, outcome: 'completed', count: jobs.length });
      else if (job && previousStatus !== job.status) console.info('jwt.job.state', { operation_id: operationId, status: job.status });
      this.timer = window.setTimeout(() => { this.timer = undefined; void this.refresh(false); }, 2500);
    } catch (error) {
      if (!this.current(version)) return;
      this.closeDetail();
      this.set({ jobs: [], job: undefined, events: [], diagnostics: undefined, loading: false,
        error: failure('jwt.refresh.failed', error, operationId) });
    }
  }
  select(id: string) {
    if (!this.active || id === this.state.selected) return;
    if (!this.state.jobs.some(job => job.job_id === id)) throw new Error('任务选择无效');
    this.version++;
    this.stopTimer();
    this.closeDetail();
    this.set({ selected: id, job: undefined, events: [], error: undefined });
    void this.refresh(false);
  }
  filter(change: Partial<Filters>) { this.set({ filters: { ...this.state.filters, ...change } }); }
  async openDetail(kind: Detail['kind'], id: string, trigger: HTMLElement | null) {
    const jobId = this.state.job?.job_id;
    if (!this.active || !jobId) return;
    this.detailFocus = trigger;
    const owner = ++this.detailVersion, context = this.key, operationId = operation();
    this.set({ detail: { kind, id, jobId, loading: true } });
    console.info('jwt.detail.started', { operation_id: operationId, kind });
    try {
      const response = await (kind === 'evidence' ? this.api.evidence(id) : this.api.report(jobId));
      if (!this.active || owner !== this.detailVersion || context !== this.key || this.state.job?.job_id !== jobId) return;
      const content = kind === 'evidence' ? parseEvidence(response, id, jobId) : parseReport(response);
      this.set({ detail: { kind, id, jobId, loading: false, content } });
      console.info('jwt.detail.completed', { operation_id: operationId, kind, outcome: 'completed' });
    } catch (error) {
      if (!this.active || owner !== this.detailVersion || context !== this.key || this.state.job?.job_id !== jobId) return;
      this.set({ detail: { kind, id, jobId, loading: false, error: failure('jwt.detail.failed', error, operationId) } });
    }
  }
  retryDetail() {
    const detail = this.state.detail;
    if (detail) void this.openDetail(detail.kind, detail.id, this.detailFocus);
  }
  closeDetail() {
    this.detailVersion++;
    this.set({ detail: undefined });
  }
  async downloadReport() {
    const detail = this.state.detail;
    if (!this.active || detail?.kind !== 'report' || typeof detail.content !== 'string') throw new Error('报告尚未读取完成');
    if (detail.downloading) return;
    const version = this.detailVersion;
    const operationId = operation();
    this.set({ detail: { ...detail, downloading: true, downloadLocation: undefined } });
    try {
      const receipt = await this.api.download(detail.jobId);
      if (!record(receipt) || receipt.count !== 1
        || (receipt.destination !== 'host' && receipt.destination !== 'download')) throw new Error('报告导出结果无效');
      const location = receipt.destination === 'host' ? receipt.path : receipt.name;
      if (typeof location !== 'string' || !location) throw new Error('报告导出位置无效');
      if (!this.active || version !== this.detailVersion) return;
      this.set({ detail: { ...detail, downloading: false, downloadLocation: location } });
      console.info('jwt.report.export.completed', { operation_id: operationId, outcome: 'completed', destination: receipt.destination });
    } catch (error) {
      if (!this.active || version !== this.detailVersion) return;
      this.set({ detail: { ...detail, downloading: false, error: failure('jwt.report.download.failed', error, operationId) } });
    }
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.version++;
    this.detailVersion++;
    this.stopTimer();
    this.detailFocus = null;
    this.state = { jobs: [], selected: '', events: [], loading: false, filters: emptyFilters() };
    this.listeners.clear();
    console.debug('jwt.workspace.dispose', { outcome: 'disposed' });
  }
}
