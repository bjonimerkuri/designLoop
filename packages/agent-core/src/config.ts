import type { AgentConfig } from './types';

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
};

export function loadAgentConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    maxIterations: num(env.AGENT_MAX_ITERATIONS, 5),
    maxCostUsd: num(env.AGENT_MAX_COST_USD, 0.5),
    maxSeconds: num(env.AGENT_MAX_SECONDS, 240),
    maxTokens: num(env.AGENT_MAX_TOKENS, 400000),
    similarityThreshold: num(env.SIMILARITY_THRESHOLD, 0.9),
    a11yMaxBlocking: num(env.A11Y_MAX_BLOCKING, 0)
  };
}
