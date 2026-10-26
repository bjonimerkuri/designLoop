import type { RunStatus } from '@designloop/shared';

export const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? '–' : `${(value * 100).toFixed(1)}%`;

export const usd = (value: number | null | undefined) =>
  value === null || value === undefined ? '–' : `$${value.toFixed(value < 0.1 ? 3 : 2)}`;

export const seconds = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(1)}s`;

export const statusLabel: Record<RunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  passed: 'Passed',
  failed: 'Did not pass',
  budget_exceeded: 'Budget reached',
  error: 'Error'
};

export const frameworkLabel = (framework: string) =>
  framework === 'angular' ? 'Angular' : framework === 'react-tailwind' ? 'React + Tailwind' : 'React';
