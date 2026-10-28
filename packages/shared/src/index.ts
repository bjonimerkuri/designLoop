export type Framework = 'react' | 'react-tailwind' | 'angular';

export const FRAMEWORKS: Framework[] = ['react', 'react-tailwind', 'angular'];

export type ReviewDecision = 'accepted' | 'rejected' | 'none';

export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'budget_exceeded' | 'error';

export const TERMINAL_STATUSES: RunStatus[] = ['passed', 'failed', 'budget_exceeded', 'error'];

export interface StepView {
  id: string;
  index: number;
  type: string;
  name: string;
  summary: string;
  iteration: number | null;
  data: unknown;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  durationMs: number;
}

export interface RunView {
  id: string;
  status: RunStatus;
  framework: Framework;
  parentId: string | null;
  instruction: string | null;
  review: 'accepted' | 'rejected' | null;
  hint: string | null;
  model: string;
  width: number;
  height: number;
  promptVersion: string;
  tsx: string | null;
  css: string | null;
  error: string | null;
  stopReason: string | null;
  similarity: number | null;
  a11yBlocking: number | null;
  compiled: boolean | null;
  iterations: number | null;
  bestIteration: number | null;
  totalCost: number | null;
  totalDurationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
  steps?: StepView[];
}

export type StreamEvent = { type: 'step'; step: StepView } | { type: 'done'; status: RunStatus };

export interface VerifyData {
  compiled: boolean;
  compileErrors: string[];
  typeErrors: string[];
  consoleErrors: string[];
  similarity: number | null;
  regions: string[];
  a11y: { id: string; impact: string; help: string; count: number }[];
  blocking: number;
  passed: boolean;
}

export interface EvalResultRecord {
  fixtureId: string;
  framework: Framework;
  repeat: number;
  status: string;
  stopReason: string | null;
  passed: boolean;
  similarity: number;
  a11yBlocking: number;
  compiled: boolean;
  consoleErrors: number;
  typeErrors: number;
  iterations: number;
  cost: number;
  durationMs: number;
  category: string | null;
  error?: string;
}

export interface EvalSummary {
  framework: Framework;
  designs: number;
  runs: number;
  passRate: number;
  meanSimilarity: number;
  medianSimilarity: number;
  meanIterations: number;
  meanIterationsToPass: number | null;
  meanCost: number;
  costPerPass: number | null;
  p50DurationMs: number;
  p95DurationMs: number;
  failures: Record<string, number>;
}

export interface EvalMeta {
  date: string;
  model: string;
  promptVersion: string;
  commit: string;
  similarityThreshold: number;
  a11yMaxBlocking: number;
  maxIterations: number;
  repeats: number;
}

export interface EvalReportFile {
  name?: string;
  meta: EvalMeta;
  results: EvalResultRecord[];
  summaries: EvalSummary[];
}

export interface EvalHistoryPoint {
  id: string;
  createdAt: string;
  meta: EvalMeta;
  summaries: EvalSummary[];
}

export interface MetricsView {
  windowHours: number;
  byStatus: Record<string, number>;
  passRate: number | null;
  meanCostUsd: number | null;
  meanDurationMs: number | null;
  meanSimilarity: number | null;
  totalCostUsd: number;
}

export interface RunPage {
  items: RunView[];
  nextCursor: string | null;
}

export type LlmProviderId = 'anthropic' | 'openai' | 'gemini';

export interface LlmProviderInfo {
  id: LlmProviderId;
  label: string;
  defaultModel: string;
  models: string[];
  keyHint: string;
}

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    keyHint: 'Keys start with sk-ant-'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini'],
    keyHint: 'Keys start with sk-'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-flash-lite-latest'],
    keyHint: 'Keys start with AIza'
  }
];

export interface AppConfig {
  serverKeyAvailable: boolean;
  personalKeysEnabled: boolean;
  demoMode: boolean;
}
