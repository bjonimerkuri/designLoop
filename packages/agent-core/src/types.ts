export type Framework = 'react' | 'react-tailwind' | 'angular';

export type StopReason =
  | 'passed'
  | 'max_iterations'
  | 'budget_cost'
  | 'budget_time'
  | 'budget_tokens'
  | 'no_progress';
export type FinalStatus = 'passed' | 'failed' | 'budget_exceeded';

export interface AgentConfig {
  maxIterations: number;
  maxCostUsd: number;
  maxSeconds: number;
  maxTokens: number;
  similarityThreshold: number;
  a11yMaxBlocking: number;
}

export type LlmPart = { type: 'text'; text: string } | { type: 'image'; png: Buffer };

export interface LlmRequest {
  system: string;
  parts: LlmPart[];
  json?: boolean;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LlmClient {
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export interface A11yIssue {
  id: string;
  impact: string;
  help: string;
  count: number;
}

export interface VerifyResult {
  compiled: boolean;
  compileErrors: string[];
  typeErrors: string[];
  consoleErrors: string[];
  a11y: A11yIssue[];
  renderPng?: Buffer;
}

export interface Comparison {
  similarity: number;
  diffPng: Buffer;
  regions: string[];
}

export interface GeneratedCode {
  tsx: string;
  css: string;
}

export interface StepRecord {
  index: number;
  type: 'analysis' | 'generate' | 'verify' | 'tool';
  name: string;
  summary: string;
  iteration?: number;
  data?: unknown;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  durationMs: number;
  artifacts?: { renderPng?: Buffer; diffPng?: Buffer };
}

export interface AgentInput {
  designPng: Buffer;
  width: number;
  height: number;
  framework: Framework;
  hint?: string;
  resume?: { tsx: string; css: string; instruction: string };
}

export interface Renderer {
  render(code: GeneratedCode, size: { width: number; height: number }): Promise<VerifyResult>;
  close(): Promise<void>;
}

export interface AgentMetrics {
  similarity: number;
  a11yBlocking: number;
  compiled: boolean;
  consoleErrors: number;
  typeErrors: number;
  iterations: number;
  bestIteration: number;
  totalCost: number;
  totalDurationMs: number;
}

export interface AgentResult {
  status: FinalStatus;
  stopReason: StopReason;
  tsx: string;
  css: string;
  metrics: AgentMetrics;
}

export interface DesignTokens {
  palette: string[];
  background: string;
}
