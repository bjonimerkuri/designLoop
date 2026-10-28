import { inspect } from 'node:util';
import type { UserLlmConfig } from '@designloop/agent-core';

interface Entry {
  config: UserLlmConfig;
  timer: ReturnType<typeof setTimeout>;
}

export class KeyVault {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly ttlMs = 30 * 60 * 1000) {}

  put(id: string, config: UserLlmConfig): void {
    this.drop(id);
    const timer = setTimeout(() => this.entries.delete(id), this.ttlMs);
    (timer as unknown as { unref?: () => void }).unref?.();
    this.entries.set(id, { config, timer });
  }

  take(id: string): UserLlmConfig | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    clearTimeout(entry.timer);
    this.entries.delete(id);
    return entry.config;
  }

  drop(id: string): void {
    const entry = this.entries.get(id);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(id);
  }

  get size(): number {
    return this.entries.size;
  }

  toJSON(): string {
    return '[redacted]';
  }

  [inspect.custom](): string {
    return 'KeyVault { [redacted] }';
  }
}
