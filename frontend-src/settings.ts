import { draftErrors, failure, operation, parseSettings, record, saveSettings, settingsDraft,
  type Api, type Context, type Draft, type Settings, type UiError } from './core';

export interface SettingsState {
  current?: Settings; draft?: Draft; loading: boolean; saving: boolean; saved: boolean;
  error?: UiError; fields: Partial<Record<keyof Draft, string>>;
}
export class SettingsController {
  private state: SettingsState = { loading: true, saving: false, saved: false, fields: {} };
  private listeners = new Set<() => void>();
  private active = false;
  private version = 0;
  private writeSequence = 0;
  private queuedContext?: Context;
  constructor(private api: Api) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private set(change: Partial<SettingsState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  async begin(context: Context) {
    if (this.active) throw new Error('JWT 设置已经挂载');
    this.active = true;
    console.info('jwt.settings.mount', { operation_id: operation() });
    await this.update(context);
  }
  async update(context: Context) {
    if (!this.active) throw new Error('JWT 设置尚未挂载');
    this.version++;
    if (this.state.saving) { this.queuedContext = context; return; }
    await this.read();
  }
  async read() {
    if (!this.active || this.state.saving) return;
    const version = ++this.version, operationId = operation();
    this.set({ current: undefined, draft: undefined, loading: true, saved: false, error: undefined, fields: {} });
    try {
      const current = parseSettings(await this.api.readSettings());
      if (!this.active || version !== this.version) return;
      this.set({ current, draft: settingsDraft(current), loading: false });
    } catch (error) {
      if (!this.active || version !== this.version) return;
      this.set({ loading: false, error: failure('jwt.settings.read.failed', error, operationId) });
    }
  }
  edit(change: Partial<Draft>) {
    if (!this.active || this.state.saving || !this.state.draft) return;
    this.set({ draft: { ...this.state.draft, ...change }, fields: {}, saved: false, error: undefined });
  }
  async save() {
    if (!this.active || this.state.saving || !this.state.current || !this.state.draft) return;
    const fields = draftErrors(this.state.draft);
    if (Object.keys(fields).length) { this.set({ fields, saved: false }); return; }
    const value = saveSettings(this.state.current, this.state.draft), version = this.version,
      writeOwner = ++this.writeSequence, operationId = operation();
    this.set({ saving: true, saved: false, error: undefined, fields: {} });
    console.info('jwt.settings.save.started', { operation_id: operationId });
    try {
      const acknowledgement = await this.api.writeSettings(value);
      if (!record(acknowledgement) || acknowledgement.ok !== true) throw new Error('Host 未确认设置写入');
      if (!this.active || version !== this.version) return;
      // Read the persisted account value before showing a successful save.
      const current = parseSettings(await this.api.readSettings());
      if (!this.active || version !== this.version) return;
      if (JSON.stringify(settingsDraft(current)) !== JSON.stringify(settingsDraft(value))) throw new Error('设置写入后的读回值不一致');
      this.set({ current, draft: settingsDraft(current), saved: true });
      console.info('jwt.settings.save.completed', { operation_id: operationId, outcome: 'completed' });
    } catch (error) {
      if (this.active && version === this.version) this.set({ error: failure('jwt.settings.save.failed', error, operationId) });
    } finally {
      if (this.active && writeOwner === this.writeSequence) {
        this.set({ saving: false });
        if (this.queuedContext) { this.queuedContext = undefined; await this.read(); }
      }
    }
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    this.version++;
    this.writeSequence++;
    this.queuedContext = undefined;
    this.state = { loading: false, saving: false, saved: false, fields: {} };
    this.listeners.clear();
    console.debug('jwt.settings.dispose', { outcome: 'disposed' });
  }
}
