import type {
  EvalHistoryPoint,
  EvalReportFile,
  Framework,
  MetricsView,
  ReviewDecision,
  RunPage,
  RunView
} from '@designloop/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const fileUrl = (id: string, name: string) => `${API_URL}/runs/${id}/files/${name}`;

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    return message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export function listRuns(params: { cursor?: string | null; framework?: string; status?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.framework) query.set('framework', params.framework);
  if (params.status) query.set('status', params.status);
  query.set('limit', String(params.limit ?? 20));
  return getJson<RunPage>(`/runs?${query.toString()}`);
}

export const getRun = (id: string) => getJson<RunView>(`/runs/${id}`);

export const listEvals = () => getJson<Pick<EvalReportFile, 'name' | 'meta' | 'summaries'>[]>('/evals');

export const getEvalHistory = () => getJson<EvalHistoryPoint[]>('/evals/history');

export async function getMetrics(token: string): Promise<MetricsView> {
  const res = await fetch(`${API_URL}/metrics`, {
    cache: 'no-store',
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'The admin token is missing or wrong.' : await readError(res));
  return res.json();
}

export async function reviewRun(id: string, decision: ReviewDecision): Promise<RunView> {
  const res = await fetch(`${API_URL}/runs/${id}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision })
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export const getEval = (name: string) => getJson<EvalReportFile>(`/evals/${encodeURIComponent(name)}`);

export async function createRun(file: File, hint: string, framework: Framework): Promise<RunView> {
  const form = new FormData();
  form.append('design', file);
  form.append('hint', hint);
  form.append('framework', framework);
  const res = await fetch(`${API_URL}/runs`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function reviseRun(id: string, instruction: string): Promise<RunView> {
  const res = await fetch(`${API_URL}/runs/${id}/revisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instruction })
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
