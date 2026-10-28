import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Req
} from '@nestjs/common';
import { createUserLlmClient } from '@designloop/agent-core';
import type { UserLlmConfig } from '@designloop/agent-core';
import type { AppConfig } from '@designloop/shared';
import type { Request } from 'express';
import { RunsService } from './runs.service';
import { LlmConfigError, parseUserLlm, redactSecrets } from './user-llm';

@Controller()
export class ConfigController {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly runs: RunsService) {}

  @Get('config')
  config(): AppConfig {
    return this.runs.publicConfig();
  }

  @Post('llm/test')
  async test(@Headers() headers: Record<string, string | string[] | undefined>, @Req() req: Request) {
    let user: UserLlmConfig | null;
    try {
      user = parseUserLlm(headers);
    } catch (error) {
      if (error instanceof LlmConfigError) throw new BadRequestException(error.message);
      throw error;
    }
    if (!user) throw new BadRequestException('Send the provider, key and model in the request headers.');
    this.limit(req.ip ?? 'unknown');

    const started = Date.now();
    try {
      const client = createUserLlmClient(user, { ...process.env, LLM_RETRIES: '0' });
      await client.complete({
        system: 'Reply with the single word OK.',
        parts: [{ type: 'text', text: 'Reply with OK.' }],
        maxTokens: 16
      });
      return { ok: true, model: user.model, latencyMs: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request failed.';
      return { ok: false, message: redactSecrets(message, user.apiKey).slice(0, 300) };
    }
  }

  private limit(ip: string) {
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter((time) => now - time < 3_600_000);
    if (recent.length >= 10) {
      throw new HttpException('Too many key checks. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(ip, recent);
  }
}
