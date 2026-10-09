import { record, type Api, type Context } from './core';

export interface Host {
  context: Context;
  onTheme(callback: (theme: Record<string, string>) => void): { dispose(): void };
  request(method: string, params: Record<string, unknown>): Promise<unknown>;
}

// The JWT Sidecar returns one JSON text block for successful MCP tool calls.
export function mcpResult(value: unknown): Record<string, unknown> {
  if (!record(value) || typeof value.isError !== 'boolean' || !Array.isArray(value.content)
    || value.content.length !== 1 || !record(value.content[0])
    || value.content[0].type !== 'text' || typeof value.content[0].text !== 'string') {
    throw new Error('JWT 服务响应格式无效');
  }
  if (value.isError) throw new Error(value.content[0].text || 'JWT 服务调用失败');
  const result: unknown = JSON.parse(value.content[0].text);
  if (!record(result)) throw new Error('JWT 服务结果格式无效');
  return result;
}

export function hostApi(host: Host): Api {
  const tool = async (method: string, params: Record<string, unknown>) => mcpResult(await host.request(method, params));
  return {
    context: host.context,
    onTheme: callback => host.onTheme(callback),
    diagnostics: () => tool('xsec.jwt-analysis.diagnostics', {}),
    list: () => tool('xsec.jwt-analysis.jobs.list', { limit: 100 }),
    get: jobId => tool('xsec.jwt-analysis.jobs.get', { job_id: jobId }),
    events: jobId => tool('xsec.jwt-analysis.jobs.events', { job_id: jobId, cursor: 0 }),
    evidence: id => tool('xsec.jwt-analysis.evidence.get', { evidence_id: id }),
    report: jobId => tool('xsec.jwt-analysis.report', { job_id: jobId, format: 'markdown' }),
    download: jobId => host.request('xsec.jwt-analysis.report.download', { job_id: jobId }),
    readSettings: () => host.request('xsec.plugin.config.get', { key: 'analysis' }),
    writeSettings: value => host.request('xsec.plugin.config.set', { key: 'analysis', value }),
  };
}
